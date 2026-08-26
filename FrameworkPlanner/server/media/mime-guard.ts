import path from "node:path";

/**
 * Server-side file validation for media uploads. Never trust client MIME types
 * or extensions alone: declared type must match magic bytes, and only
 * allow-listed image/video formats are accepted by the media routes.
 */

export const MAGIC_SIGNATURES: { mime: string; patterns: [number, number[]][] }[] = [
  {
    mime: "application/pdf",
    patterns: [[0, [0x25, 0x50, 0x44, 0x46]]],
  },
  {
    mime: "image/png",
    patterns: [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
  },
  {
    mime: "image/jpeg",
    patterns: [[0, [0xff, 0xd8, 0xff]]],
  },
  {
    mime: "image/gif",
    patterns: [
      [0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]],
      [0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    ],
  },
  {
    mime: "image/webp",
    patterns: [[8, [0x57, 0x45, 0x42, 0x50]]],
  },
  {
    mime: "video/mp4",
    // ISO BMFF: 'ftyp' at offset 4. Brand at offset 8 decides 3gp vs mp4.
    patterns: [[4, [0x66, 0x74, 0x79, 0x70]]],
  },
  {
    mime: "application/zip",
    patterns: [
      [0, [0x50, 0x4b, 0x03, 0x04]],
      [0, [0x50, 0x4b, 0x05, 0x06]],
      [0, [0x50, 0x4b, 0x07, 0x08]],
    ],
  },
  {
    mime: "application/x-rar-compressed",
    patterns: [
      [0, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]],
      [0, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]],
    ],
  },
  {
    mime: "text/plain",
    patterns: [[0, [0xef, 0xbb, 0xbf]]],
  },
];

export function detectMimeFromMagic(buf: Buffer): string | null {
  for (const entry of MAGIC_SIGNATURES) {
    for (const [offset, bytes] of entry.patterns) {
      if (offset + bytes.length > buf.length) continue;
      if (bytes.length === 0) continue;
      let match = true;
      for (let i = 0; i < bytes.length; i++) {
        if (buf[offset + i] !== bytes[i]) {
          match = false;
          break;
        }
      }
      if (match) return entry.mime;
    }
  }
  return null;
}

/** Distinguish 3GPP (3gp/3gp4/3gp5/3gp6) from generic MP4 brands. */
export function detectVideoMime(buf: Buffer): "video/3gpp" | "video/mp4" | null {
  if (buf.length < 12) return null;
  // ISO BMFF box: size(4) + 'ftyp' at 4..8; brand at 8..12.
  if (buf[4] !== 0x66 || buf[5] !== 0x74 || buf[6] !== 0x79 || buf[7] !== 0x70) return null;
  const brand = buf.toString("latin1", 8, 12);
  if (/^3gp[456]$|^3g2[abc]$/.test(brand)) return "video/3gpp";
  return "video/mp4";
}

export const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/3gpp"]);

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".3gp", ".3gpp", ".mov"]);

/** Parse a byte-size env var: plain integer or suffixed (kb/mb/gb). */
export function parseBytesEnv(raw: string | undefined, fallback: number): number {
  if (!raw || !String(raw).trim()) return fallback;
  const s = String(raw).trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!m) return fallback;
  const n = parseFloat(m[1]);
  const unit = m[2] || "b";
  const mult = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 }[unit] as number;
  return Math.max(1, Math.floor(n * mult));
}

export function maxImageUploadBytes(): number {
  return parseBytesEnv(process.env.MAX_IMAGE_UPLOAD_BYTES, 25 * 1024 * 1024);
}
export function maxVideoUploadBytes(): number {
  return parseBytesEnv(process.env.MAX_VIDEO_UPLOAD_BYTES, 250 * 1024 * 1024);
}
export function maxMediaUploadBytes(): number {
  return parseBytesEnv(process.env.MAX_MEDIA_UPLOAD_BYTES, Math.max(maxImageUploadBytes(), maxVideoUploadBytes()));
}
export function mmsSafeMediaBytes(): number {
  return parseBytesEnv(process.env.MMS_SAFE_MEDIA_BYTES, 614400);
}
export function maxAttachmentsPerMessage(): number {
  return Math.min(10, Math.max(1, parseInt(String(process.env.MAX_MEDIA_ATTACHMENTS_PER_MESSAGE || "10"), 10) || 10));
}

export type MediaKind = "image" | "video";

export type MediaValidationResult =
  | { ok: true; mime: string; kind: MediaKind; sizeBytes: number }
  | { ok: false; error: string; code: string };

/** Validate an uploaded media file: size, declared MIME vs magic bytes, extension. */
export function validateMediaFile(input: {
  fileName: string;
  declaredMime: string;
  buffer: Buffer;
}): MediaValidationResult {
  const { fileName, declaredMime, buffer } = input;
  const sizeBytes = buffer.length;
  const cleanName = path.basename(fileName || "media");
  const ext = path.extname(cleanName).toLowerCase();

  const declared = String(declaredMime || "").split(";")[0].trim().toLowerCase();
  const isImageDeclared = IMAGE_MIME_TYPES.has(declared);
  const isVideoDeclared = VIDEO_MIME_TYPES.has(declared);

  if (!isImageDeclared && !isVideoDeclared) {
    return {
      ok: false,
      code: "UNSUPPORTED_MEDIA_TYPE",
      error: `Unsupported media type "${declared}". Allowed: images (JPEG, PNG, WebP, GIF) and video (MP4, 3GPP).`,
    };
  }

  const kind: MediaKind = isImageDeclared ? "image" : "video";

  if (kind === "image") {
    if (sizeBytes > maxImageUploadBytes()) {
      return { ok: false, code: "IMAGE_TOO_LARGE", error: `Image exceeds the ${Math.round(maxImageUploadBytes() / 1024 / 1024)} MB limit.` };
    }
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return { ok: false, code: "BAD_EXTENSION", error: `Extension "${ext || "(none)"}" is not allowed for images.` };
    }
  } else {
    if (sizeBytes > maxVideoUploadBytes()) {
      return { ok: false, code: "VIDEO_TOO_LARGE", error: `Video exceeds the ${Math.round(maxVideoUploadBytes() / 1024 / 1024)} MB limit.` };
    }
    if (!VIDEO_EXTENSIONS.has(ext)) {
      return { ok: false, code: "BAD_EXTENSION", error: `Extension "${ext || "(none)"}" is not allowed for video.` };
    }
  }

  const detected = detectMimeFromMagic(buffer);
  if (detected) {
    if (detected === "application/zip" || detected === "application/x-rar-compressed") {
      return { ok: false, code: "BLOCKED_ARCHIVE", error: "Archives are not allowed as media." };
    }
    const videoDetected = detectVideoMime(buffer);
    if (kind === "video") {
      const effective = videoDetected || detected;
      if (effective !== declared) {
        return { ok: false, code: "MIME_MISMATCH", error: `File content does not match declared type (declared ${declared}, detected ${effective}).` };
      }
    } else if (detected !== declared) {
      return { ok: false, code: "MIME_MISMATCH", error: `File content does not match declared type (declared ${declared}, detected ${detected}).` };
    }
  }

  return { ok: true, mime: declared, kind, sizeBytes };
}

/** Image dimension probe (no external deps). Returns null when unknown. */
export function probeImageDimensions(buf: Buffer): { width: number; height: number } | null {
  const d = detectMimeFromMagic(buf);
  if (d === "image/png" && buf.length >= 24) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (d === "image/gif" && buf.length >= 10) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (d === "image/jpeg" && buf.length > 4) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
      if (marker === 0x01 || marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) return null;
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  // WebP: 'VP8 ' (lossy) at 12, 'VP8L' (lossless) at 12, 'VP8X' at 12.
  if (d === "image/webp" && buf.length >= 30 && buf.toString("latin1", 12, 16) === "VP8 ") {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (d === "image/webp" && buf.length >= 30 && buf.toString("latin1", 12, 16) === "VP8L") {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (d === "image/webp" && buf.length >= 30 && buf.toString("latin1", 12, 16) === "VP8X") {
    return { width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
  }
  return null;
}
