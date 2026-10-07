import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, ShieldCheck, Ban } from "lucide-react";

interface MatchedBuyer {
  buyerId: number;
  name: string;
  phone: string | null;
  email: string | null;
  score: number;
  smsConsent: boolean | null;
  emailConsent: boolean | null;
  doNotCall: boolean;
}

interface BlastResult {
  ok: boolean;
  channel: string;
  sentCount: number;
  sent: { buyerId: number; name: string }[];
  failed: { buyerId: number; name: string; error: string }[];
  suppressed: {
    buyerId: number;
    name: string;
    score: number;
    reasons: string[];
  }[];
  quietHours: { timeZone: string; withinWindow: boolean };
}

const REASON_LABELS: Record<string, string> = {
  do_not_call: "DNC — hard suppress",
  no_sms_consent: "no SMS consent",
  no_email_consent: "no email consent",
  no_phone: "no phone",
  no_email: "no email",
  quiet_hours: "quiet hours (8am–9pm recipient time)",
  below_score_threshold: "below score threshold",
  over_recipient_cap: "over 100-recipient cap",
};

export function BroadcastComposer({ dealId }: { dealId: number }) {
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [minScore, setMinScore] = useState(50);
  const [message, setMessage] = useState(
    "Hi {firstName}, new off-market deal: {address}, {city} — asking {price}. Reply INTERESTED for details.",
  );
  const [subject, setSubject] = useState("Off-market deal — reply for details");
  const [result, setResult] = useState<BlastResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading } = useQuery<{ matches: MatchedBuyer[] }>({
    queryKey: ["disposition-matches", dealId],
  });

  const blast = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/disposition/deals/${dealId}/blast`,
        { channel, message, subject, minScore },
      );
      return (await res.json()) as BlastResult;
    },
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ["disposition-metrics"] });
    },
    onError: (e: any) => {
      setError(e?.message ?? "Blast failed.");
      setConfirming(false);
    },
  });

  const matches = data?.matches ?? [];
  // Client-side estimate only — the server is the authority.
  const estimate = matches.filter((m) => {
    if (m.score < minScore) return false;
    if (m.doNotCall) return false;
    if (channel === "sms") return m.smsConsent === true && !!m.phone;
    return m.emailConsent === true && !!m.email;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-[#D4AF37]" />
        <span>
          Compliance gates run server-side: DNC hard-suppress, channel consent
          required, quiet hours 8am–9pm recipient time. Every send, failure, and
          suppression is logged.
        </span>
      </div>

      <div className="flex gap-2">
        {(["sms", "email"] as const).map((c) => (
          <Button
            key={c}
            variant={channel === c ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setChannel(c);
              setResult(null);
            }}
          >
            {c === "sms" ? "SMS" : "Email"}
          </Button>
        ))}
      </div>

      {channel === "email" && (
        <div>
          <Label htmlFor="blast-subject">Subject</Label>
          <Input
            id="blast-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
      )}

      <div>
        <Label htmlFor="blast-message">Message</Label>
        <Textarea
          id="blast-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
        />
        <div className="mt-1 text-[11px] text-muted-foreground">
          Tokens: {"{firstName} {name} {address} {city} {state} {zip} {price} {beds} {baths} {sqft}"}
        </div>
      </div>

      <div>
        <Label htmlFor="blast-minscore">
          Minimum match score: <strong>{minScore}</strong>
        </Label>
        <Input
          id="blast-minscore"
          type="range"
          min={0}
          max={100}
          step={5}
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
          className="mt-1"
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <div className="text-sm text-muted-foreground">
          Estimated recipients:{" "}
          <strong className="text-foreground">{estimate.length}</strong> of{" "}
          {matches.length} matched buyers
          {matches.some((m) => m.doNotCall) && (
            <span className="ml-2 inline-flex items-center gap-1 text-[11px]">
              <Ban className="h-3 w-3" /> DNC buyers auto-excluded
            </span>
          )}
        </div>
      )}

      {error && <div className="text-sm text-destructive">{error}</div>}

      {!confirming ? (
        <Button
          onClick={() => setConfirming(true)}
          disabled={!message.trim() || estimate.length === 0 || blast.isPending}
        >
          <Send className="mr-2 h-4 w-4" />
          Review & send to {estimate.length} buyer{estimate.length === 1 ? "" : "s"}
        </Button>
      ) : (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <div className="text-sm font-medium">
            Send {channel.toUpperCase()} to ~{estimate.length} buyers?
          </div>
          <div className="text-xs text-muted-foreground">
            The server re-checks consent, DNC, and quiet hours per recipient
            before sending. Suppressed buyers are logged, not messaged.
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={blast.isPending}
              onClick={() => blast.mutate()}
            >
              {blast.isPending ? "Sending…" : "Confirm send"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-lg border border-border/60 p-3 text-sm">
          <div className="font-medium">
            Blast result: {result.sentCount} sent · {result.failed.length}{" "}
            failed · {result.suppressed.length} suppressed
          </div>
          {!result.quietHours.withinWindow && (
            <div className="text-xs text-amber-600">
              Outside quiet-hours window ({result.quietHours.timeZone}) —
              recipients were suppressed for quiet hours.
            </div>
          )}
          {result.failed.length > 0 && (
            <div className="text-xs text-destructive">
              {result.failed.map((f) => (
                <div key={f.buyerId}>
                  {f.name}: {f.error}
                </div>
              ))}
            </div>
          )}
          {result.suppressed.length > 0 && (
            <div className="space-y-1">
              {result.suppressed.map((s) => (
                <div
                  key={s.buyerId}
                  className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
                >
                  <span className="font-medium text-foreground">{s.name}</span>
                  {s.reasons.map((r) => (
                    <Badge key={r} variant="outline" className="text-[10px]">
                      {REASON_LABELS[r] ?? r}
                    </Badge>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
