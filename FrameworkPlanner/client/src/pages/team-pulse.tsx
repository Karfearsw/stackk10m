import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { UsersRound, Flame, MoonStar } from "lucide-react";

// TEAM PULSE — the simplified standup that replaced the noisy activity feed.
// One card per teammate ("who's in the mix today"), a short highlights strip
// (grouped one-liners), and a quiet list so nobody fades out unnoticed.

interface PulseCard {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  hasProfilePicture: boolean;
  avatarUrl: string | null;
  isActiveTeammate: boolean;
  counts: { leads: number; tasks: number; calls: number; contracts: number };
  total: number;
  lastActiveAt: string | null;
}

interface Highlight {
  id: number;
  userId: number;
  action: string;
  description: string | null;
  createdAt: string | null;
  groupCount: number;
  user: { id: number; firstName: string; lastName: string; email: string } | null;
}

interface TeamPulse {
  since: string;
  hours: number;
  totalActive: number;
  totalTeammates: number;
  active: PulseCard[];
  quiet: PulseCard[];
  orphans: PulseCard[];
  highlights: Highlight[];
}

function displayName(p: PulseCard): string {
  const name = `${String(p.firstName || "").trim()} ${String(p.lastName || "").trim()}`.trim();
  return name || p.email || "Removed user";
}

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return "—";
  const ms = new Date(dateString).getTime();
  if (!Number.isFinite(ms)) return "—";
  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// Intensity dots: 5 dots, filled by activity volume in the window.
function intensityDots(total: number): number {
  if (total <= 0) return 0;
  if (total <= 5) return 1;
  if (total <= 15) return 2;
  if (total <= 30) return 3;
  if (total <= 60) return 4;
  return 5;
}

function digestLine(counts: PulseCard["counts"]): string {
  const parts: string[] = [];
  if (counts.leads) parts.push(`${counts.leads} lead${counts.leads === 1 ? "" : "s"}`);
  if (counts.tasks) parts.push(`${counts.tasks} task${counts.tasks === 1 ? "" : "s"}`);
  if (counts.calls) parts.push(`${counts.calls} call${counts.calls === 1 ? "" : "s"}`);
  if (counts.contracts) parts.push(`${counts.contracts} contract${counts.contracts === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : "Active in the CRM";
}

function PulseCardView({ p, tone }: { p: PulseCard; tone: "active" | "quiet" | "ghost" }) {
  const dots = intensityDots(p.total);
  const initial = (p.firstName?.[0] || p.email?.[0] || "U").toUpperCase();
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
        tone === "quiet" ? "border-border/60 bg-muted/30" : "hover:bg-muted/40"
      }`}
      data-testid={`pulse-card-${p.userId}`}
    >
      <Avatar className={`h-10 w-10 border ${tone === "quiet" ? "opacity-60" : ""}`}>
        {(p.hasProfilePicture || p.avatarUrl) && (
          <AvatarImage src={p.avatarUrl || `/api/users/${p.userId}/avatar`} />
        )}
        <AvatarFallback className="text-xs bg-primary/10 text-primary">{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate text-sm font-medium ${tone === "quiet" ? "text-muted-foreground" : ""}`}>
            {displayName(p)}
          </span>
          {tone === "ghost" && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">ghost</Badge>
          )}
        </div>
        <p className={`truncate text-xs ${tone === "quiet" ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
          {tone === "quiet" ? "No activity in this window" : digestLine(p.counts)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-xs text-muted-foreground">{formatTimeAgo(p.lastActiveAt)}</span>
        {tone !== "quiet" && (
          <div className="flex items-center gap-0.5" aria-label={`activity level ${dots} of 5`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i < dots ? "bg-primary" : "bg-muted-foreground/25"}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TeamPulsePage() {
  const { data, isLoading } = useQuery<TeamPulse>({
    queryKey: ["/api/team-pulse?hours=24"],
    refetchInterval: 30000,
  });

  const hours = data?.hours ?? 24;
  const windowLabel = hours === 24 ? "last 24 hours" : `last ${hours} hours`;
  const highlights = data?.highlights ?? [];

  return (
    <Layout>
      <div className="space-y-6" data-testid="team-pulse-page">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
            <UsersRound className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Team Pulse</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? (
                "Loading the standup…"
              ) : data && data.totalActive > 0 ? (
                <>
                  <span className="font-medium text-foreground">{data.totalActive}</span> of{" "}
                  {data.totalTeammates} teammates active in the {windowLabel}
                </>
              ) : (
                <>The whole team has been quiet in the {windowLabel}</>
              )}
            </p>
          </div>
        </div>

        {/* Pulse cards — one per teammate with activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-5 w-5 text-primary" />
              In the mix
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (data?.active.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <UsersRound className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-muted-foreground">No teammate activity yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cards appear here as the team works — leads, tasks, calls, contracts.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data!.active.map((p) => (
                  <PulseCardView key={p.userId} p={p} tone="active" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Short storyline strip — grouped one-liners, no wall of events */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Today's highlights</CardTitle>
            </CardHeader>
            <CardContent>
              {highlights.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing noteworthy yet — highlights appear as the team works.
                </p>
              ) : (
                <ScrollArea className="max-h-[320px] pr-3">
                  <div className="space-y-2.5">
                    {highlights.map((h) => {
                      const who = h.user
                        ? `${h.user.firstName || ""} ${h.user.lastName || ""}`.trim() || h.user.email
                        : "System";
                      return (
                        <div key={h.id} className="flex items-start gap-2 text-sm" data-testid={`highlight-${h.id}`}>
                          <span className="font-medium">{who}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {h.description || h.action}
                          </span>
                          {h.groupCount > 1 && (
                            <Badge variant="secondary" className="shrink-0">×{h.groupCount}</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Quiet strip — who's blending out; ghost accounts surface here too */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MoonStar className="h-5 w-5 text-muted-foreground" />
                Quiet lately
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-20 w-full rounded-lg" />
              ) : ((data?.quiet.length ?? 0) === 0 && (data?.orphans.length ?? 0) === 0) ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Everyone is in the mix — nicely blended.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {data!.quiet.map((p) => (
                    <PulseCardView key={`q-${p.userId}`} p={p} tone="quiet" />
                  ))}
                  {data!.orphans.map((p) => (
                    <PulseCardView key={`o-${p.userId}`} p={p} tone="ghost" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
