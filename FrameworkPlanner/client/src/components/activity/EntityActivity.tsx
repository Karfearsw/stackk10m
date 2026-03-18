import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

type ActivityUser = {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  profilePicture?: string | null;
};

type ActivityItem = {
  id: number;
  userId: number;
  action: string;
  description?: string | null;
  metadata?: string | null;
  createdAt: string;
  user?: ActivityUser | null;
  metadataParsed?: any;
};

export function EntityActivity({
  leadId,
  propertyId,
  limit = 50,
}: {
  leadId?: number;
  propertyId?: number;
  limit?: number;
}) {
  const { data: items = [], isLoading, error } = useQuery<ActivityItem[]>({
    queryKey: ["/api/activity", leadId ? `lead:${leadId}` : `property:${propertyId}`, String(limit)],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (leadId) qs.set("leadId", String(leadId));
      if (propertyId) qs.set("propertyId", String(propertyId));
      qs.set("limit", String(limit));
      const res = await fetch(`/api/activity?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: Boolean(leadId || propertyId),
  });

  if (!leadId && !propertyId) return null;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading activity…</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive">Failed to load activity</div>;
  }

  if (!items.length) {
    return <div className="text-sm text-muted-foreground">No activity yet</div>;
  }

  return (
    <ScrollArea className="h-[420px] pr-3">
      <div className="space-y-2">
        {items.map((item) => {
          const name = [item.user?.firstName, item.user?.lastName].filter(Boolean).join(" ") || item.user?.email || `User ${item.userId}`;
          const when = item.createdAt ? new Date(item.createdAt).toLocaleString() : "";
          const meta: any = (item as any).metadataParsed || null;
          const audioUrl = meta?.audioUrl || meta?.recordingUrl || meta?.RecordingUrl || null;
          const body = typeof meta?.body === "string" ? meta.body : null;
          return (
            <Card key={item.id} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{item.action}</div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">{when}</div>
              </div>
              <div className="text-xs text-muted-foreground truncate">{name}</div>
              {item.description ? <div className="text-sm mt-2">{item.description}</div> : null}
              {!item.description && body ? <div className="text-sm mt-2">{body}</div> : null}
              {item.action === "sms_sent" && body ? <div className="text-sm mt-2">{body}</div> : null}
              {audioUrl ? <audio className="w-full mt-2" controls src={String(audioUrl)} /> : null}
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}
