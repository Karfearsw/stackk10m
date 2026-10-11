/**
 * Standalone media upload helper — same 3-step presigned flow the MediaUploader
 * uses (POST /api/media/upload-url → PUT → POST /api/media/upload-complete),
 * without the queue UI. Used by the in-chat video message recorder.
 */
import type { MediaAsset } from "./media";

export async function uploadMediaFile(
  file: File,
  opts: { entityType?: string; entityId?: number | null } = {},
): Promise<MediaAsset> {
  const presignRes = await fetch("/api/media/upload-url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || "video/webm",
      fileSizeBytes: file.size,
    }),
  });
  if (!presignRes.ok) {
    let message = "Could not start the upload";
    try { message = (await presignRes.json())?.message || message; } catch {}
    throw new Error(message);
  }
  const { uploadUrl, storageKey } = await presignRes.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "video/webm");
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });

  const completeRes = await fetch("/api/media/upload-complete", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || "video/webm",
      fileSizeBytes: file.size,
      storageKey,
      entityType: opts.entityType,
      entityId: opts.entityId ?? undefined,
    }),
  });
  if (!completeRes.ok) {
    let message = "Upload could not be finalized";
    try { message = (await completeRes.json())?.message || message; } catch {}
    throw new Error(message);
  }
  const { asset } = await completeRes.json();
  if (!asset) throw new Error("Upload finalized without an asset");
  return asset as MediaAsset;
}
