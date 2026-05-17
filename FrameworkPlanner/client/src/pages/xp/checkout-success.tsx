import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { XpPublicShell } from "@/components/xp/XpPublicShell";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "wouter";

export default function XpCheckoutSuccessPage() {
  const { isAuthenticated } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const sessionId = String(params.get("session_id") || "").trim();

  const summaryQuery = useQuery({
    queryKey: ["/api/xp/bookings/session", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const res = await fetch(`/api/xp/bookings/session/${encodeURIComponent(sessionId)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load booking");
      return json as any;
    },
  });

  const booking = summaryQuery.data?.booking;
  const experience = summaryQuery.data?.experience;
  const startAt = booking?.startAt ? new Date(booking.startAt) : null;
  const endAt = booking?.endAt ? new Date(booking.endAt) : null;

  return (
    <XpPublicShell>
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-3xl font-semibold tracking-tight">Booking confirmed</div>
            <div className="text-sm text-muted-foreground">Payment completed. Your concierge will follow up shortly.</div>
          </div>
          <Badge variant="secondary" className="bg-background/60 backdrop-blur">
            Confirmed
          </Badge>
        </div>

        <Card className="border-border/60 bg-background/70 backdrop-blur">
          <CardContent className="p-5 space-y-3">
            {sessionId ? (
              <div className="text-xs text-muted-foreground">Reference: {sessionId}</div>
            ) : null}

            {summaryQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading booking details…</div>
            ) : summaryQuery.error ? (
              <div className="text-sm text-muted-foreground">
                Booking details are loading in the background. You can return to Experiences.
              </div>
            ) : experience ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold">{experience.title}</div>
                {startAt && Number.isFinite(startAt.getTime()) ? (
                  <div className="text-sm text-muted-foreground">
                    {format(startAt, "EEE, MMM d, yyyy")}
                    {endAt && Number.isFinite(endAt.getTime()) ? ` · ${format(startAt, "h:mm a")} → ${format(endAt, "h:mm a")}` : ""}
                  </div>
                ) : null}
                {booking?.amountDueNow ? (
                  <div className="text-sm text-muted-foreground">
                    Paid: {booking.amountDueNow} {String(booking.currency || "USD").toUpperCase()}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-2">
              <Link href="/xp">
                <Button>Back to experiences</Button>
              </Link>
              {isAuthenticated ? (
                <Link href="/dashboard">
                  <Button variant="secondary">Open CRM</Button>
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </XpPublicShell>
  );
}
