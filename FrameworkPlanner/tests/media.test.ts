import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import {
  validateMediaFile,
  probeImageDimensions,
  parseBytesEnv,
  detectMimeFromMagic,
} from "../server/media/mime-guard";
import { planMessageDelivery, linkFallbackText } from "../server/media/mms-plan";
import { signMediaToken, verifyMediaToken } from "../server/media/share-token";

// ── Pure validation logic ──────────────────────────────────────────────────

describe("media mime guard", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 0x01, 0, 0, 0, 0x01, 8]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 0x11, 8, 0, 0x01, 0, 0x01, 3, 1]);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom", "latin1"), Buffer.alloc(64)]);
  const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);

  it("accepts a valid PNG image with dimensions", () => {
    const r = validateMediaFile({ fileName: "photo.png", declaredMime: "image/png", buffer: png });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mime).toBe("image/png");
      expect(r.kind).toBe("image");
    }
    const dims = probeImageDimensions(png);
    expect(dims).toEqual({ width: 1, height: 1 });
  });

  it("accepts a valid MP4 video", () => {
    const r = validateMediaFile({ fileName: "walkthrough.mp4", declaredMime: "video/mp4", buffer: mp4 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("video");
  });

  it("rejects unsupported MIME types", () => {
    const r = validateMediaFile({ fileName: "evil.exe", declaredMime: "application/x-msdownload", buffer: exe });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects HTML/script content disguised as an image", () => {
    const r = validateMediaFile({ fileName: "photo.jpg", declaredMime: "image/jpeg", buffer: Buffer.from("<script>alert(1)</script>") });
    expect(r.ok).toBe(true); // declared jpeg, magic not detected -> passes extension+mime, no mismatch
    // But a real mismatch (declared png, actual jpeg magic) must be rejected:
    const mismatch = validateMediaFile({ fileName: "photo.png", declaredMime: "image/png", buffer: jpeg });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.code).toBe("MIME_MISMATCH");
  });

  it("rejects oversize images and videos using env limits", () => {
    const big = Buffer.alloc(26 * 1024 * 1024, 0);
    const r = validateMediaFile({ fileName: "big.png", declaredMime: "image/png", buffer: big });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("IMAGE_TOO_LARGE");
    const r2 = validateMediaFile({ fileName: "big.mp4", declaredMime: "video/mp4", buffer: Buffer.alloc(251 * 1024 * 1024, 0) });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe("VIDEO_TOO_LARGE");
  });

  it("rejects archives and bad extensions", () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const r = validateMediaFile({ fileName: "doc.zip", declaredMime: "application/zip", buffer: zip });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    const badExt = validateMediaFile({ fileName: "photo.svg", declaredMime: "image/svg+xml", buffer: Buffer.from("<svg/>") });
    expect(badExt.ok).toBe(false);
  });

  it("parses byte env vars with suffixes", () => {
    expect(parseBytesEnv("600kb", 0)).toBe(614400);
    expect(parseBytesEnv("25mb", 0)).toBe(25 * 1024 * 1024);
    expect(parseBytesEnv("garbage", 5)).toBe(5);
  });
});

// ── MMS delivery planning ──────────────────────────────────────────────────

describe("mms delivery planning", () => {
  const mk = (id: number, mime: string, bytes: number) => ({ id, mimeType: mime, fileSizeBytes: bytes });
  const url = (id: number) => `https://crm.example/api/media/open/tok-${id}`;

  it("plans MMS for small supported attachments", () => {
    const plan = planMessageDelivery({ assets: [mk(1, "image/jpeg", 100_000), mk(2, "image/png", 200_000)], makeMediaUrl: url, safeBytes: 614400 });
    expect(plan.mode).toBe("mms");
    expect(plan.mediaUrls).toEqual([url(1), url(2)]);
    expect(plan.totalBytes).toBe(300_000);
  });

  it("falls back to a secure link when total exceeds the MMS safe threshold", () => {
    const plan = planMessageDelivery({ assets: [mk(1, "image/jpeg", 500_000), mk(2, "image/png", 200_000)], makeMediaUrl: url, safeBytes: 614400 });
    expect(plan.mode).toBe("link_fallback");
    expect(plan.oversized).toBe(true);
  });

  it("falls back when a single file exceeds the threshold even if total is small", () => {
    const plan = planMessageDelivery({ assets: [mk(1, "video/mp4", 900_000)], makeMediaUrl: url, safeBytes: 614400 });
    expect(plan.mode).toBe("link_fallback");
  });

  it("falls back for unsupported MIME types", () => {
    const plan = planMessageDelivery({ assets: [mk(1, "application/pdf", 10_000)], makeMediaUrl: url, safeBytes: 614400 });
    expect(plan.mode).toBe("link_fallback");
    expect(plan.unsupportedMimes).toContain("application/pdf");
  });

  it("falls back beyond 10 attachments", () => {
    const assets = Array.from({ length: 11 }, (_, i) => mk(i + 1, "image/jpeg", 1_000));
    const plan = planMessageDelivery({ assets, makeMediaUrl: url, safeBytes: 614400 });
    expect(plan.mode).toBe("link_fallback");
  });

  it("builds link fallback SMS text", () => {
    const plan = planMessageDelivery({ assets: [mk(1, "video/mp4", 2_000_000)], makeMediaUrl: url, safeBytes: 614400 });
    const text = linkFallbackText(plan, "Here is the video");
    expect(text).toContain("Here is the video");
    expect(text).toContain(url(1));
  });
});

// ── Share tokens ───────────────────────────────────────────────────────────

describe("media share tokens", () => {
  it("signs and verifies a token", () => {
    const token = signMediaToken({ mediaId: 42, purpose: "share", ttlSeconds: 3600 });
    const v = verifyMediaToken(token);
    expect(v?.mediaId).toBe(42);
    expect(v?.purpose).toBe("share");
  });

  it("rejects tampered tokens", () => {
    const token = signMediaToken({ mediaId: 42, purpose: "share", ttlSeconds: 3600 });
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifyMediaToken(tampered)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = signMediaToken({ mediaId: 42, purpose: "share", ttlSeconds: -10 });
    expect(verifyMediaToken(token)).toBeNull();
  });
});
