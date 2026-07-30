import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchJson } from "@/lib/fetchJson";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { AgentDetailPanel } from "@/components/ops/AgentDetailPanel";
import { HeartbeatHistoryList } from "@/components/ops/HeartbeatHistoryList";
import type { OpsAgentDetailResponse } from "@/components/ops/types";

export default function OpsAgentDetailPage() {
  const [, params] = useRoute("/ops/agents/:slug");
  const slug = String(params?.slug || "").trim();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rotatingSecret, setRotatingSecret] = useState(false);
  const [latestSecret, setLatestSecret] = useState<string | null>(null);

  const detailQuery = useQuery<OpsAgentDetailResponse>({
    queryKey: ["/api/ops/agents", slug],
    queryFn: () => fetchJson<OpsAgentDetailResponse>(`/api/ops/agents/${slug}`),
    enabled: Boolean(slug),
    refetchInterval: 30000,
  });

  async function rotateSecret() {
    if (!detailQuery.data?.agent?.id) return;
    if (!window.confirm("Rotate the heartbeat secret for this VPS agent?")) return;
    setRotatingSecret(true);
    try {
      const result = await fetchJson<{ heartbeatSecret: string }>(`/api/ops/agents/${detailQuery.data.agent.id}/rotate-secret`, {
        method: "POST",
      });
      setLatestSecret(result.heartbeatSecret);
      try {
        await navigator.clipboard.writeText(result.heartbeatSecret);
        toast({ title: "Secret rotated and copied" });
      } catch {
        toast({ title: "Secret rotated" });
      }
    } catch (error: any) {
      toast({ title: "Rotate failed", description: String(error?.message || error), variant: "destructive" });
    } finally {
      setRotatingSecret(false);
    }
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Link href="/ops/agents">
          <Button variant="ghost" className="pl-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to fleet
          </Button>
        </Link>

        {detailQuery.isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : detailQuery.error ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">
              {String((detailQuery.error as Error)?.message || "Failed to load agent detail")}
            </CardContent>
          </Card>
        ) : detailQuery.data?.agent ? (
          <div className="space-y-6">
            <AgentDetailPanel
              agent={detailQuery.data.agent}
              canRotateSecret={Boolean(user?.isSuperAdmin)}
              onRotateSecret={rotateSecret}
              rotatingSecret={rotatingSecret}
              latestSecret={latestSecret}
            />
            <HeartbeatHistoryList heartbeats={detailQuery.data.recentHeartbeats || []} />
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Agent not found.
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
