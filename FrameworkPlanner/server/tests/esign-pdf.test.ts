/**
 * server/tests/esign-pdf.test.ts — PDF engine: Chromium render + signature
 * overlays + Certificate of Completion + hash verification.
 *
 * Requires a Chromium executable (PLAYWRIGHT_BROWSERS_PATH or
 * ESIGN_CHROMIUM_PATH). Skipped gracefully when unavailable.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import {
  renderContractHtmlToPdf,
  buildSignedPacket,
  verifyFinalPdf,
  toPrintableHtml,
  isBrowserResolvable,
} from "../esign/pdf.js";

if (existsSync("/home/hatch/workspace/.pw-browsers") && !process.env.PLAYWRIGHT_BROWSERS_PATH && !process.env.ESIGN_CHROMIUM_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = "/home/hatch/workspace/.pw-browsers";
}

let hasBrowser = false;
beforeAll(() => {
  hasBrowser = isBrowserResolvable();
  if (!hasBrowser) console.warn("[esign-pdf.test] no Chromium resolvable — browser tests will skip");
});

describe("esign pdf engine", () => {
  it("renders contract HTML to a valid PDF via Chromium", async () => {
    if (!hasBrowser) return;
    const html = toPrintableHtml("Purchase Agreement", "This is a {{test}} agreement.\n\nSigned below.");
    const pdf = await renderContractHtmlToPdf(html);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.slice(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("builds a signed packet: signature pages + certificate + hashes", async () => {
    if (!hasBrowser) return;
    const drawnPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const packet = await buildSignedPacket({
      title: "Test Assignment Agreement",
      mergedContent: "Property: 123 Test St\n\nPrice: $100,000",
      signatures: [
        {
          signerName: "Jane Doe",
          signerEmail: "jane@example.com",
          role: "seller",
          signatureType: "typed",
          signatureText: "Jane Doe",
          signedAt: new Date("2026-10-07T12:00:00Z"),
          ip: "127.0.0.1",
          userAgent: "vitest",
          consentAt: new Date("2026-10-07T11:59:00Z"),
        },
        {
          signerName: "John Smith",
          signerEmail: "john@example.com",
          role: "buyer",
          signatureType: "drawn",
          signatureImageBase64: drawnPng,
          signedAt: new Date("2026-10-07T12:05:00Z"),
          ip: "127.0.0.1",
          userAgent: "vitest",
          consentAt: new Date("2026-10-07T12:04:00Z"),
        },
      ],
      certificate: {
        envelopeId: 123,
        title: "Test Assignment Agreement",
        documentSha256: null,
        auditChainHead: "abc123head",
        auditEventCount: 5,
        completedAt: new Date("2026-10-07T12:06:00Z"),
      },
    });

    expect(packet.documentSha256).toHaveLength(64);
    expect(packet.finalPdfSha256).toHaveLength(64);
    expect(packet.bytes.slice(0, 5).toString()).toBe("%PDF-");

    const doc = await PDFDocument.load(packet.bytes);
    // base doc (1 page) + 2 signature pages + 1 certificate = 4 pages
    expect(doc.getPageCount()).toBe(4);
    const keywords = doc.getKeywords() || "";
    expect(keywords).toContain(`document-sha256:${packet.documentSha256}`);

    // final hash verifies
    const check = verifyFinalPdf(packet.bytes, packet.finalPdfSha256);
    expect(check.ok).toBe(true);
    expect(check.finalHash).toBe(packet.finalPdfSha256);
  });

  it("detects a tampered final PDF", async () => {
    if (!hasBrowser) return;
    const packet = await buildSignedPacket({
      title: "T",
      mergedContent: "body",
      signatures: [],
      certificate: { envelopeId: 1, title: "T", documentSha256: null, auditChainHead: null, auditEventCount: 0, completedAt: new Date() },
    });
    const tampered = Buffer.from(packet.bytes);
    tampered[tampered.length - 20] ^= 0xff;
    const check = verifyFinalPdf(tampered, packet.finalPdfSha256);
    expect(check.ok).toBe(false);
  });

  it("toPrintableHtml escapes plain text and passes HTML through", () => {
    const plain = toPrintableHtml("T", "a < b & c");
    expect(plain).toContain("a &lt; b &amp; c");
    const html = toPrintableHtml("T", "<p>keep</p>");
    expect(html).toContain("<p>keep</p>");
  });
});
