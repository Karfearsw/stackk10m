import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Download, Trash2, ImageOff, Film } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/queryClient";
import {
  formatBytes,
  isImageAsset,
  isVideoAsset,
  mediaDownloadUrl,
  mediaPreviewUrl,
  type MediaAsset,
} from "@/lib/media";
import { MediaUploader } from "./MediaUploader";

interface MediaGalleryProps {
  entityType: string;
  entityId: number;
  role?: string;
  canManage?: boolean;
  allowUpload?: boolean;
  title?: string;
  emptyText?: string;
}

export function MediaGallery({
  entityType,
  entityId,
  role,
  canManage = true,
  allowUpload = true,
  title = "Media",
  emptyText = "No media attached yet.",
}: MediaGalleryProps) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<MediaAsset | null>(null);

  const key = ["/api/media", entityType, entityId, role || ""];
  const { data, isLoading, isError, refetch } = useQuery<{ assets: MediaAsset[] }>({
    queryKey: key,
    queryFn: async () => {
      const q = new URLSearchParams({ entityType, entityId: String(entityId) });
      if (role) q.set("role", role);
      const res = await apiRequest("GET", `/api/media?${q.toString()}`);
      return res.json();
    },
  });

  const assets = data?.assets || [];

  const removeAsset = async (asset: MediaAsset) => {
    if (!window.confirm(`Delete "${asset.originalFilename}"? This can't be undone.`)) return;
    try {
      await apiRequest("DELETE", `/api/media/${asset.id}`);
      toast.success("Media deleted");
      queryClient.invalidateQueries({ queryKey: key });
      if (preview?.id === asset.id) setPreview(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete media");
    }
  };

  const copyShareLink = async (asset: MediaAsset) => {
    try {
      const res = await apiRequest("POST", `/api/media/${asset.id}/share-link`);
      const json = await res.json();
      await navigator.clipboard.writeText(json.url).catch(() => {});
      toast.success("Secure link copied (expires in 7 days)");
    } catch (e: any) {
      toast.error(e?.message || "Failed to create share link");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {allowUpload && canManage && (
        <MediaUploader
          entityType={entityType}
          entityId={entityId}
          role={role}
          compact
          label="Drop images/videos here or click to upload"
          onUploaded={() => queryClient.invalidateQueries({ queryKey: key })}
          onError={(m) => toast.error(m)}
        />
      )}

      {isError ? (
        <p className="text-xs text-destructive">Couldn't load media.</p>
      ) : !isLoading && assets.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => setPreview(asset)}
              className="group relative aspect-square overflow-hidden rounded-md border bg-muted/40"
              aria-label={`View ${asset.originalFilename}`}
            >
              {isImageAsset(asset) ? (
                <img
                  src={mediaPreviewUrl(asset.id)}
                  alt={asset.originalFilename}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : isVideoAsset(asset) ? (
                <>
                  <video
                    src={mediaPreviewUrl(asset.id)}
                    preload="metadata"
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="h-8 w-8 text-white" fill="currentColor" />
                  </span>
                </>
              ) : (
                <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Film className="h-6 w-6" />
                </span>
              )}
              <span className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-1.5 py-0.5 text-left text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {asset.originalFilename}
              </span>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        {preview && (
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="truncate pr-8 text-base">{preview.originalFilename}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {isImageAsset(preview) ? (
                <img
                  src={mediaPreviewUrl(preview.id)}
                  alt={preview.originalFilename}
                  className="mx-auto max-h-[60vh] w-auto rounded-md"
                />
              ) : isVideoAsset(preview) ? (
                <video src={mediaPreviewUrl(preview.id)} controls playsInline className="mx-auto max-h-[60vh] w-full rounded-md" />
              ) : (
                <div className="flex h-40 items-center justify-center text-muted-foreground">
                  <ImageOff className="h-8 w-8" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{preview.mimeType}</Badge>
                <span>{formatBytes(preview.fileSizeBytes)}</span>
                {preview.width && preview.height ? (
                  <span>
                    {preview.width}×{preview.height}
                  </span>
                ) : null}
                <span>{new Date(preview.createdAt).toLocaleString()}</span>
                {preview.deliveryMode === "mms" && <Badge variant="secondary">Sent as MMS</Badge>}
                {preview.deliveryMode === "link_fallback" && <Badge variant="secondary">Sent as secure link</Badge>}
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={mediaDownloadUrl(preview.id)} download>
                      <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => copyShareLink(preview)}>
                    Copy secure link
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => removeAsset(preview)}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
