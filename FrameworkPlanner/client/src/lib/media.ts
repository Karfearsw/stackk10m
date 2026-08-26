// Shared media types + URL helpers for the media upload/gallery components.

export interface MediaAsset {
  id: number;
  teamId: number;
  uploadedByUserId: number;
  storageMode: string;
  storageKey: string | null;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  processingStatus: string;
  deliveryMode: string | null;
  createdAt: string;
}

export const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const VIDEO_MIME = new Set(["video/mp4", "video/3gpp", "video/mov"]);

export function isImageAsset(a: MediaAsset): boolean {
  return IMAGE_MIME.has(String(a.mimeType || "").split(";")[0].trim().toLowerCase());
}

export function isVideoAsset(a: MediaAsset): boolean {
  return VIDEO_MIME.has(String(a.mimeType || "").split(";")[0].trim().toLowerCase());
}

export function mediaPreviewUrl(id: number): string {
  return `/api/media/${id}/preview`;
}

export function mediaDownloadUrl(id: number): string {
  return `/api/media/${id}/download`;
}

export function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** MMS safe threshold mirroring the server default (600 KB). */
export const MMS_SAFE_BYTES = 614400;

/** Client-side preview of MMS vs secure-link fallback. */
export function planClientDelivery(assets: { fileSizeBytes: number; mimeType: string }[]): {
  mode: "none" | "mms" | "link_fallback";
  totalBytes: number;
  reason: string;
} {
  if (!assets.length) return { mode: "none", totalBytes: 0, reason: "no_attachments" };
  const totalBytes = assets.reduce((s, a) => s + (Number(a.fileSizeBytes) || 0), 0);
  const unsupported = assets.filter(
    (a) => !IMAGE_MIME.has(String(a.mimeType || "").split(";")[0].trim().toLowerCase()) &&
            !VIDEO_MIME.has(String(a.mimeType || "").split(";")[0].trim().toLowerCase()),
  );
  const oversized = totalBytes > MMS_SAFE_BYTES || assets.some((a) => Number(a.fileSizeBytes) > MMS_SAFE_BYTES);
  if (oversized) return { mode: "link_fallback", totalBytes, reason: "Media is too large for standard MMS delivery, so it will be sent as a secure link instead." };
  if (unsupported.length) return { mode: "link_fallback", totalBytes, reason: "One or more files can't be delivered as MMS, so they will be sent as secure links." };
  return { mode: "mms", totalBytes, reason: "Will be sent as an MMS." };
}
