import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PhoneCall, Mail, MessageSquare, Users, CalendarClock, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export const QUAL_STAGES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "responded", label: "Responded" },
  { value: "qualified", label: "Qualified" },
  { value: "deal_ready", label: "Deal Ready" },
  { value: "inactive", label: "Inactive" },
] as const;

const STAGE_COLORS: Record<string, string> = {
  new: "bg-slate-500",
  contacted: "bg-blue-500",
  responded: "bg-amber-500",
  qualified: "bg-emerald-500",
  deal_ready: "bg-primary",
  inactive: "bg-zinc-400",
};

const CHANNELS = [
  { value: "call", label: "Call", icon: PhoneCall },
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "email", label: "Email", icon: Mail },
  { value: "meeting", label: "Meeting", icon: Users },
] as const;

interface Props {
  buyerId: number;
}

export function BuyerQualificationPanel({ buyerId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [logOpen, setLogOpen] = useState(false);
  const [logChannel, setLogChannel] = useState<string>("call");
  const [logOutcome, setLogOutcome] = useState("");
  const [logNotes, setLogNotes] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/buyers/${buyerId}/qualification`],
    queryFn: async () => {
      const res = await fetch(`/api/buyers/${buyerId}/qualification`, { credentials: "include" });
      if (!res.ok) throw new Error("qualification failed");
      return res.json();
    },
    enabled: !!buyerId,
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) return [];
      const j = await res.json();
      return Array.isArray(j) ? j : j.users ?? [];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/buyers/${buyerId}/qualification`] });
    queryClient.invalidateQueries({ queryKey: ["buyer-qual-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
  };

  const qualify = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/buyers/${buyerId}/qualify`, body),
    onSuccess: () => { invalidate(); toast({ title: "Qualification updated" }); },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const assignOwner = useMutation({
    mutationFn: (owner_user_id: number | null) =>
      apiRequest("POST", `/api/buyers/${buyerId}/assign-owner`, { owner_user_id }),
    onSuccess: () => { invalidate(); toast({ title: "Owner assigned" }); },
    onError: (e: any) => toast({ title: "Assign failed", description: e.message, variant: "destructive" }),
  });

  const logOutreach = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/buyers/${buyerId}/log-outreach`, body),
    onSuccess: () => {
      invalidate();
      setLogOpen(false); setLogOutcome(""); setLogNotes("");
      toast({ title: "Outreach logged" });
    },
    onError: (e: any) => toast({ title: "Log failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const q = data?.qualification ?? {};
  const bb = data?.buybox ?? {};
  const log: any[] = data?.outreachLog ?? [];
  const stage = q.relationship_stage ?? "new";

  return (
    <div className="space-y-4">
      {/* Stage + owner row */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">Relationship stage</Label>
          <div className="mt-1 flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", STAGE_COLORS[stage] ?? "bg-slate-500")} />
            <Select
              value={stage}
              onValueChange={(v) => qualify.mutate({ relationship_stage: v })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUAL_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Owner</Label>
          <Select
            value={q.owner_user_id ? String(q.owner_user_id) : "__none"}
            onValueChange={(v) => assignOwner.mutate(v === "__none" ? null : parseInt(v))}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Assign owner…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Unassigned</SelectItem>
              {(users ?? []).filter((u: any) => u.isActive !== false).map((u: any) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Next action */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">Next action</Label>
          <Input
            className="mt-1"
            placeholder="e.g. Call to confirm buy-box"
            defaultValue={q.next_action ?? ""}
            key={`na-${q.updated_at ?? "x"}`}
            onBlur={(e) => {
              if (e.target.value !== (q.next_action ?? "")) {
                qualify.mutate({ next_action: e.target.value });
              }
            }}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Due by</Label>
          <Input
            type="datetime-local"
            className="mt-1"
            defaultValue={q.next_action_at ? new Date(q.next_action_at).toISOString().slice(0, 16) : ""}
            key={`nad-${q.updated_at ?? "x"}`}
            onBlur={(e) => {
              qualify.mutate({ next_action_at: e.target.value ? new Date(e.target.value).toISOString() : null });
            }}
          />
        </div>
      </div>
      {q.last_contact_at && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarClock className="h-3 w-3" />
          Last contact: {new Date(q.last_contact_at).toLocaleString()}
        </p>
      )}

      {/* Buy-box editor */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            Buy-box
            {bb.buybox_confirmed && <Badge>Confirmed</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Markets (comma-separated)</Label>
              <Input
                className="mt-1"
                placeholder="Detroit, MI"
                defaultValue={(bb.markets ?? []).join(", ")}
                key={`mkt-${bb.updated_at ?? "x"}`}
                onBlur={(e) =>
                  qualify.mutate({
                    buybox: {
                      markets: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    },
                  })
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Asset types (comma-separated)</Label>
              <Input
                className="mt-1"
                placeholder="SFR, Duplex"
                defaultValue={(bb.asset_types ?? []).join(", ")}
                key={`at-${bb.updated_at ?? "x"}`}
                onBlur={(e) =>
                  qualify.mutate({
                    buybox: {
                      asset_types: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    },
                  })
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Min price</Label>
              <Input
                type="number"
                className="mt-1"
                placeholder="50000"
                defaultValue={bb.min_price ?? ""}
                key={`minp-${bb.updated_at ?? "x"}`}
                onBlur={(e) =>
                  qualify.mutate({ buybox: { min_price: e.target.value ? Number(e.target.value) : null } })
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Max price</Label>
              <Input
                type="number"
                className="mt-1"
                placeholder="250000"
                defaultValue={bb.max_price ?? ""}
                key={`maxp-${bb.updated_at ?? "x"}`}
                onBlur={(e) =>
                  qualify.mutate({ buybox: { max_price: e.target.value ? Number(e.target.value) : null } })
                }
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Strategy</Label>
            <Select
              value={bb.strategy ?? "__none"}
              onValueChange={(v) => qualify.mutate({ buybox: { strategy: v === "__none" ? null : v } })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Not set</SelectItem>
                {["fix-and-flip", "buy-and-hold", "wholesale", "brrrr", "land"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={!!bb.buybox_confirmed}
                onCheckedChange={(c) => qualify.mutate({ buybox: { buybox_confirmed: c === true } })}
              />
              Buy-box confirmed
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={!!bb.proof_of_funds_verified}
                onCheckedChange={(c) => qualify.mutate({ buybox: { proof_of_funds_verified: c === true } })}
              />
              Proof of funds verified
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Only buyers with a confirmed buy-box appear in Deal-Ready and receive deal alerts.
          </p>
        </CardContent>
      </Card>

      {/* Outreach log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            Outreach log
            <Button size="sm" variant="outline" onClick={() => setLogOpen((v) => !v)}>
              <Plus className="mr-1 h-3 w-3" /> Log attempt
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {logOpen && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex gap-2">
                {CHANNELS.map((c) => (
                  <Button
                    key={c.value}
                    size="sm"
                    variant={logChannel === c.value ? "default" : "outline"}
                    onClick={() => setLogChannel(c.value)}
                  >
                    <c.icon className="mr-1 h-3 w-3" /> {c.label}
                  </Button>
                ))}
              </div>
              <Input
                placeholder="Outcome (e.g. no answer, interested, asked for details)"
                value={logOutcome}
                onChange={(e) => setLogOutcome(e.target.value)}
              />
              <Textarea
                placeholder="Notes…"
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                className="min-h-[60px]"
              />
              <Button
                size="sm"
                disabled={logOutreach.isPending}
                onClick={() => logOutreach.mutate({ channel: logChannel, outcome: logOutcome || undefined, notes: logNotes || undefined })}
              >
                Save
              </Button>
            </div>
          )}
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {log.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No outreach logged yet — this buyer is cold.
                </p>
              ) : (
                log.map((o: any) => (
                  <div key={o.id} className="rounded-lg border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs capitalize">{o.channel}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(o.occurred_at).toLocaleString()}
                        {o.first_name ? ` · ${o.first_name} ${o.last_name ?? ""}`.trim() : ""}
                      </span>
                    </div>
                    {o.outcome && <p className="mt-1 font-medium">{o.outcome}</p>}
                    {o.notes && <p className="text-muted-foreground">{o.notes}</p>}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
