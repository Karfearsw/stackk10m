import { IMAGE_MIME_TYPES, VIDEO_MIME_TYPES, maxAttachmentsPerMessage, mmsSafeMediaBytes } from "./mime-guard.js";

// ── MMS delivery planning ──────────────────────────────────────────────────
// Decides how SMS attachments are delivered:
//   mms           → total size within the safe carrier threshold and every
//                   file type MMS-capable; Telnyx fetches public media_urls.
//   link_fallback → media too large or unsupported for MMS; send a plain SMS
//                   with a short-lived secure link instead.
// Telnyx MMS guidance: images (JPEG/PNG/GIF/BMP/TIFF/WebP), video (MP4/3GP),
// up to 10 media URLs per message, ~600 KB safe max across US carriers.

const MMS_IMAGE_TYPES = new Set([...IMAGE_MIME_TYPES]);
const MMS_VIDEO_TYPES = new Set([...VIDEO_MIME_TYPES, "video/mov"]);

export type DeliveryPlan = {
  mode: "mms" | "link_fallback";
  mediaUrls: string[];
  totalBytes: number;
  count: number;
  safeBytes: number;
  oversized: boolean;
  unsupportedMimes: string[];
  reason: string;
};

export function planMessageDelivery(input: {
  assets: { id: number; mimeType: string; fileSizeBytes: number }[];
  makeMediaUrl: (id: number) => string;
  safeBytes?: number;
  maxAttachments?: number;
}): DeliveryPlan {
  const safeBytes = input.safeBytes ?? mmsSafeMediaBytes();
  const maxCount = input.maxAttachments ?? maxAttachmentsPerMessage();
  const totalBytes = input.assets.reduce((sum, a) => sum + (Number(a.fileSizeBytes) || 0), 0);
  const unsupportedMimes = [
    ...new Set(
      input.assets
        .map((a) => String(a.mimeType || "").split(";")[0].trim().toLowerCase())
        .filter((m) => m && !MMS_IMAGE_TYPES.has(m) && !MMS_VIDEO_TYPES.has(m)),
    ),
  ];
  const oversized = totalBytes > safeBytes || input.assets.some((a) => Number(a.fileSizeBytes) > safeBytes);
  const tooMany = input.assets.length > maxCount;

  const mediaUrls = input.assets.map((a) => input.makeMediaUrl(a.id));

  if (input.assets.length === 0) {
    return { mode: "mms", mediaUrls: [], totalBytes: 0, count: 0, safeBytes, oversized: false, unsupportedMimes: [], reason: "no_attachments" };
  }
  if (tooMany) {
    return { mode: "link_fallback", mediaUrls, totalBytes, count: input.assets.length, safeBytes, oversized, unsupportedMimes, reason: `too_many_attachments_${input.assets.length}_max_${maxCount}` };
  }
  if (oversized) {
    return { mode: "link_fallback", mediaUrls, totalBytes, count: input.assets.length, safeBytes, oversized, unsupportedMimes, reason: `total_bytes_${totalBytes}_exceeds_safe_${safeBytes}` };
  }
  if (unsupportedMimes.length > 0) {
    return { mode: "link_fallback", mediaUrls, totalBytes, count: input.assets.length, safeBytes, oversized, unsupportedMimes, reason: `unsupported_types_${unsupportedMimes.join(",")}` };
  }
  return { mode: "mms", mediaUrls, totalBytes, count: input.assets.length, safeBytes, oversized: false, unsupportedMimes: [], reason: "mms_ok" };
}

/** Suggested SMS body suffix for the link fallback path. */
export function linkFallbackText(plan: DeliveryPlan, baseText: string): string {
  const links = plan.mediaUrls;
  const note =
    plan.count > 1
      ? `\nMedia (${plan.count} files — too large for MMS, sent as secure links):\n${links.join("\n")}`
      : links[0]
        ? `\nView media: ${links[0]}`
        : "";
  return `${baseText}${note}`;
}
