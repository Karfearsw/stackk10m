import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Paperclip, X, MessageSquareText, Link2 } from "lucide-react";
import { formatBytes, planClientDelivery, type MediaAsset } from "@/lib/media";
import { MediaUploader } from "./MediaUploader";

interface SmsAttachmentPickerProps {
  /** Entity the uploaded media attaches to (lead id or thread phone). */
  entityType: "lead" | "sms_thread";
  entityId?: number | null;
  attachments: MediaAsset[];
  onAdd: (assets: MediaAsset[]) => void;
  onRemove: (id: number) => void;
  disabled?: boolean;
}

export function SmsAttachmentPicker({
  entityType,
  entityId,
  attachments,
  onAdd,
  onRemove,
  disabled = false,
}: SmsAttachmentPickerProps) {
  const [adding, setAdding] = useState(false);
  const plan = planClientDelivery(attachments);

  return (
    <div className="space-y-2">
      {attachments.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
                title={a.originalFilename}
              >
                <span className="max-w-[140px] truncate">{a.originalFilename}</span>
                <span className="text-muted-foreground">{formatBytes(a.fileSizeBytes)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${a.originalFilename}`}
                  disabled={disabled}
                  onClick={() => onRemove(a.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-[11px]">
            {plan.mode === "mms" ? (
              <>
                <MessageSquareText className="h-3 w-3 text-primary" />
                <span className="text-muted-foreground">{plan.reason}</span>
              </>
            ) : (
              <>
                <Link2 className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                <span className="text-amber-700 dark:text-amber-400">{plan.reason}</span>
              </>
            )}
          </p>
        </>
      )}
      {!adding ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || entityId === undefined || entityId === null}
          onClick={() => setAdding(true)}
        >
          <Paperclip className="mr-1.5 h-3.5 w-3.5" /> Attach media
        </Button>
      ) : (
        <div className="space-y-2 rounded-md border p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Add photos or video</span>
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setAdding(false)}>
              Done
            </Button>
          </div>
          <MediaUploader
            entityType={entityType}
            entityId={entityId}
            role="mms_attachment"
            compact
            maxFiles={10}
            label="Drop files here or click to browse"
            onUploaded={(asset) => onAdd([asset])}
          />
        </div>
      )}
    </div>
  );
}
