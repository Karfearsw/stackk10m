import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, UploadCloud, X, RefreshCw, ImagePlus } from "lucide-react";
import { formatBytes, type MediaAsset } from "@/lib/media";

type UploadStatus = "queued" | "uploading" | "done" | "error" | "cancelled";

interface PendingUpload {
  key: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  asset?: MediaAsset;
}

const MAX_IMAGE = 25 * 1024 * 1024;
const MAX_VIDEO = 250 * 1024 * 1024;
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|mp4|3gp|3gpp|mov)$/i;

function fileKind(file: File): "image" | "video" | null {
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  if (/^image\/(jpeg|png|webp|gif)$/.test(mime)) return "image";
  if (/^video\/(mp4|3gpp|quicktime)$/.test(mime)) return "video";
  if (ALLOWED_EXT.test(file.name)) return /\.(jpe?g|png|webp|gif)$/i.test(file.name) ? "image" : "video";
  return null;
}

function validateFile(file: File): { ok: true } | { ok: false; error: string } {
  const kind = fileKind(file);
  if (!kind) {
    return { ok: false, error: `Unsupported file type "${file.type || "unknown"}" — allowed: images (JPEG, PNG, WebP, GIF) and video (MP4, 3GPP).` };
  }
  const limit = kind === "image" ? MAX_IMAGE : MAX_VIDEO;
  if (file.size > limit) {
    const mb = Math.round(limit / 1024 / 1024);
    return { ok: false, error: `${kind === "image" ? "Image" : "Video"} exceeds the ${mb} MB limit.` };
  }
  return { ok: true };
}

let uidCounter = 0;
function nextKey() {
  uidCounter += 1;
  return `up-${Date.now()}-${uidCounter}`;
}

interface MediaUploaderProps {
  entityType: string;
  entityId?: number | null;
  role?: string;
  multiple?: boolean;
  maxFiles?: number;
  compact?: boolean;
  autoUpload?: boolean;
  /** Upload without attaching to an entity (attach later via mediaIds). */
  deferAttach?: boolean;
  onUploaded?: (asset: MediaAsset) => void;
  onError?: (message: string) => void;
  label?: string;
  className?: string;
}

export function MediaUploader({
  entityType,
  entityId,
  role,
  multiple = true,
  maxFiles = 10,
  compact = false,
  autoUpload = true,
  deferAttach = false,
  onUploaded,
  onError,
  label = "Upload images or video",
  className = "",
}: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const uploading = pending.some((p) => p.status === "uploading");

  const updatePending = (key: string, patch: Partial<PendingUpload>) => {
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };

  const doUpload = useCallback(
    (item: PendingUpload) => {
      if (entityId === undefined || entityId === null) {
        updatePending(item.key, { status: "error", error: "No record selected to attach to." });
        onError?.("No record selected to attach to.");
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/media/upload");
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          updatePending(item.key, { status: "uploading", progress: Math.round((e.loaded / e.total) * 100) });
        }
      };
      xhr.onload = () => {
        let asset: MediaAsset | undefined;
        try {
          const json = JSON.parse(xhr.responseText || "{}");
          asset = json.asset;
        } catch {
          /* ignore parse */
        }
        if (xhr.status >= 200 && xhr.status < 300 && asset) {
          updatePending(item.key, { status: "done", progress: 100, asset });
          onUploaded?.(asset);
        } else {
          let message = "Upload failed";
          try {
            const json = JSON.parse(xhr.responseText || "{}");
            message = json.message || message;
          } catch {
            /* ignore */
          }
          updatePending(item.key, { status: "error", error: message });
          onError?.(message);
        }
      };
      xhr.onerror = () => {
        updatePending(item.key, { status: "error", error: "Network error — check your connection and retry." });
        onError?.("Upload failed — network error.");
      };
      const form = new FormData();
      form.append("file", item.file);
      if (!deferAttach) {
        form.append("entityType", entityType);
        form.append("entityId", String(entityId));
        if (role) form.append("role", role);
      }
      updatePending(item.key, { status: "uploading", progress: 0 });
      xhr.send(form);
    },
    [entityType, entityId, role, onUploaded, onError],
  );

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setPending((prev) => {
      const room = Math.max(0, maxFiles - prev.length);
      const accepted = list.slice(0, room || undefined);
      const newItems = accepted.map((file) => {
        const item: PendingUpload = { key: nextKey(), file, status: "queued", progress: 0 };
        const v = validateFile(file);
        if (!v.ok) {
          item.status = "error";
          item.error = v.error;
        }
        return item;
      });
      const merged = [...prev, ...newItems];
      if (room === 0 && list.length) {
        onError?.(`You can attach up to ${maxFiles} files.`);
      }
      queueMicrotask(() => {
        for (const item of newItems) {
          if (item.status === "queued" && autoUpload) doUpload(item);
        }
      });
      return merged;
    });
  };

  const retry = (item: PendingUpload) => {
    if (item.status === "error" || item.status === "cancelled") {
      updatePending(item.key, { status: "queued", error: undefined, progress: 0 });
      doUpload(item);
    }
  };

  const cancel = (item: PendingUpload) => {
    updatePending(item.key, { status: "cancelled", progress: 0 });
  };

  const remove = (key: string) => {
    setPending((prev) => prev.filter((p) => p.key !== key));
  };

  const doneCount = pending.filter((p) => p.status === "done").length;

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 text-sm transition-colors cursor-pointer ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
        } ${compact ? "py-2.5" : ""}`}
      >
        <ImagePlus className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">{label}</span>
        {uploading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/3gpp,video/quicktime"
          multiple={multiple}
          className="hidden"
          aria-hidden="true"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {pending.length > 0 && (
        <ul className="mt-2 space-y-1.5" aria-live="polite">
          {pending.map((p) => (
            <li key={p.key} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{p.file.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(p.file.size)}</span>
                </div>
                {p.status === "uploading" && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${p.progress}%` }} />
                  </div>
                )}
                {p.status === "done" && (
                  <p className="mt-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">Uploaded ✓</p>
                )}
                {p.status === "error" && <p className="mt-0.5 text-[10px] text-destructive">{p.error}</p>}
                {p.status === "cancelled" && <p className="mt-0.5 text-[10px] text-muted-foreground">Cancelled</p>}
                {p.status === "queued" && <p className="mt-0.5 text-[10px] text-muted-foreground">Waiting…</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {(p.status === "uploading" || p.status === "queued") && (
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => cancel(p)} aria-label="Cancel upload">
                    <X className="h-3 w-3" />
                  </Button>
                )}
                {(p.status === "error" || p.status === "cancelled") && (
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => retry(p)} aria-label="Retry upload">
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                )}
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(p.key)} aria-label="Remove file">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {doneCount > 0 && !pending.some((p) => p.status !== "done") && (
        <p className="mt-1 text-[10px] text-muted-foreground" aria-live="polite">
          {doneCount} file{doneCount === 1 ? "" : "s"} attached.
        </p>
      )}
    </div>
  );
}
