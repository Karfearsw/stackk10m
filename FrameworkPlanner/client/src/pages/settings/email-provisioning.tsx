/**
 * Settings → Email Forwards & Onboarding.
 *
 * IONOS has no email API — forwards are created manually in the IONOS
 * Control Panel and tracked here:
 *
 *   requested → pending_creation → active
 *                                    ↘ failed
 *
 *   - Forward Management card explains the manual workflow.
 *   - Creation queue shows pending forwards with copy-paste values and
 *     step-by-step IONOS instructions.
 *   - Per-user onboarding checklist with live-lead access gate.
 */
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Mail, Info, AlertTriangle, CheckCircle2, XCircle, Clock,
  UserPlus, ShieldCheck, Copy, Check, Send, FileText, ExternalLink,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type ForwardInfo = {
  workflow: string;
  domain: string;
  steps: string[];
  note: string;
};

type QueuedForward = {
  id: number;
  user_id: number;
  forward_address: string;
  target_email: string;
  status: "requested" | "pending_creation" | "active" | "failed";
  notes: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  signup_email: string;
};

type NeedingUser = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string | null;
};

type EmailForward = {
  id: number;
  user_id: number;
  forward_address: string;
  target_email: string;
  status: "requested" | "pending_creation" | "active" | "failed";
  notes: string | null;
  created_at: string;
  created_in_ionos_at: string | null;
};

type Checklist = {
  user_id: number;
  offer_letter_signed: boolean;
  ica_signed: boolean;
  w9_submitted: boolean;
  id_verified: boolean;
  payout_setup: boolean;
  training_completed: boolean;
  email_provisioned: boolean;
  live_lead_access_granted: boolean;
  live_lead_access_granted_at: string | null;
};

const CHECKLIST_LABELS: Array<{ key: keyof Checklist; label: string }> = [
  { key: "offer_letter_signed", label: "Offer letter signed" },
  { key: "ica_signed", label: "ICA signed" },
  { key: "w9_submitted", label: "W-9 submitted" },
  { key: "id_verified", label: "ID verified" },
  { key: "payout_setup", label: "Payout method set up" },
  { key: "training_completed", label: "Training completed" },
  { key: "email_provisioned", label: "Business email forward active" },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" /> Active</Badge>;
  if (status === "failed")
    return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>;
  if (status === "pending_creation")
    return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending creation</Badge>;
  return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" /> Requested</Badge>;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 px-2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Could not copy to clipboard");
        }
      }}
      title={`Copy ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="ml-1 text-xs">{label}</span>
    </Button>
  );
}

export default function EmailProvisioningSettings() {
  const queryClient = useQueryClient();
  const [requestTarget, setRequestTarget] = useState<NeedingUser | null>(null);
  const [targetEmail, setTargetEmail] = useState("");
  const [checklistUserId, setChecklistUserId] = useState<number | null>(null);
  const [failTarget, setFailTarget] = useState<EmailForward | null>(null);
  const [failReason, setFailReason] = useState("");

  const { data: info } = useQuery<ForwardInfo>({
    queryKey: ["/api/onboarding/forward-info"],
    queryFn: async () => (await apiRequest("GET", "/api/onboarding/forward-info")).json(),
  });

  const { data: queueData, isLoading: queueLoading } = useQuery<{ queue: QueuedForward[]; needing: NeedingUser[] }>({
    queryKey: ["/api/onboarding/forward-queue"],
    queryFn: async () => (await apiRequest("GET", "/api/onboarding/forward-queue")).json(),
  });

  const { data: forwardsData, isLoading: fwLoading } = useQuery<{ items: EmailForward[] }>({
    queryKey: ["/api/onboarding/forwards"],
    queryFn: async () => (await apiRequest("GET", "/api/onboarding/forwards")).json(),
  });

  const { data: checklistData, isLoading: checklistLoading } = useQuery<{ checklist: Checklist; complete: boolean; missing: string[] }>({
    queryKey: ["/api/onboarding/checklist", checklistUserId],
    queryFn: async () => (await apiRequest("GET", `/api/onboarding/checklist/${checklistUserId}`)).json(),
    enabled: checklistUserId !== null,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/onboarding/forward-queue"] });
    queryClient.invalidateQueries({ queryKey: ["/api/onboarding/forwards"] });
  };

  const requestForward = useMutation({
    mutationFn: async ({ userId, targetEmail }: { userId: number; targetEmail: string }) =>
      (await apiRequest("POST", "/api/onboarding/request-forward", { userId, targetEmail })).json(),
    onSuccess: (d: any) => {
      if (d.ok) {
        toast.success(d.alreadyExisted ? `Forward already exists: ${d.address}` : `Forward requested: ${d.address}`);
      } else {
        toast.error(d.message || "Request failed");
      }
      invalidate();
      setRequestTarget(null);
      setTargetEmail("");
    },
    onError: (e: any) => toast.error(e?.message || "Request failed"),
  });

  const markActive = useMutation({
    mutationFn: async (id: number) =>
      (await apiRequest("POST", `/api/onboarding/forwards/${id}/mark-active`, {})).json(),
    onSuccess: () => {
      toast.success("Forward marked active — checklist updated");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const markFailed = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) =>
      (await apiRequest("POST", `/api/onboarding/forwards/${id}/mark-failed`, { reason })).json(),
    onSuccess: () => {
      toast.success("Forward marked failed");
      invalidate();
      setFailTarget(null);
      setFailReason("");
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const updateChecklist = useMutation({
    mutationFn: async ({ userId, item, value }: { userId: number; item: string; value: boolean }) =>
      (await apiRequest("PUT", `/api/onboarding/checklist/${userId}`, { item, value })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/checklist"] });
      toast.success("Checklist updated");
    },
    onError: () => toast.error("Failed to update checklist"),
  });

  const grantAccess = useMutation({
    mutationFn: async (userId: number) =>
      (await apiRequest("POST", `/api/onboarding/grant-lead-access/${userId}`)).json(),
    onSuccess: (d: any) => {
      if (d.ok) {
        toast.success("Live-lead access granted");
      } else {
        toast.error(d.message || "Cannot grant access", {
          description: d.missing ? `Missing: ${d.missing.join(", ")}` : undefined,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/checklist"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const queue = queueData?.queue || [];
  const needing = queueData?.needing || [];
  const forwards = forwardsData?.items || [];
  const activeForwards = forwards.filter((f) => f.status === "active");

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Email Forwards & Onboarding</h1>
            <p className="text-muted-foreground">
              Manage @oceanluxe.org email forwards and track onboarding before granting live-lead access.
            </p>
          </div>
          <Button variant="outline" onClick={() => (window.location.href = "/settings/onboarding-docs")}>
            <FileText className="h-4 w-4 mr-2" /> Onboarding Documents
          </Button>
        </div>

        {/* Forward workflow explainer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" /> Forward Management
            </CardTitle>
            <CardDescription>
              IONOS has no email API — each forward is created manually in the IONOS Control Panel, then tracked here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-1.5 text-sm">
              {(info?.steps || [
                "Sign in to the IONOS Control Panel",
                "Go to Email in the main navigation",
                'Click "Set up a new email address" → choose "Forward"',
                "Paste the forward address and target email below",
                'Save, then click "Mark Active" in the CRM',
              ]).map((step, i) => (
                <li key={i} className="text-muted-foreground">{step}</li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {info?.note || "Create each forward in IONOS first — the CRM only tracks, it cannot create forwards automatically."}
            </p>
          </CardContent>
        </Card>

        {/* Users needing a forward */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Users Needing a Business Email
              {needing.length > 0 && <Badge variant="secondary">{needing.length}</Badge>}
            </CardTitle>
            <CardDescription>Active users without an @oceanluxe.org forward.</CardDescription>
          </CardHeader>
          <CardContent>
            {queueLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : needing.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone has a business email forward. 🎉</p>
            ) : (
              <div className="space-y-2">
                {needing.map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{u.first_name} {u.last_name}</p>
                      <p className="text-sm text-muted-foreground">{u.email} · {u.role}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setChecklistUserId(u.id)}>
                        Checklist
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setRequestTarget(u);
                          setTargetEmail(u.email || "");
                        }}
                      >
                        <Mail className="h-4 w-4 mr-1" /> Request Forward
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Creation queue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" /> Forward Creation Queue
              {queue.length > 0 && <Badge variant="secondary">{queue.length}</Badge>}
            </CardTitle>
            <CardDescription>
              Create each of these in the IONOS Control Panel (Email → new address → Forward), then mark active.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {queueLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : queue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Queue is clear — nothing waiting for IONOS creation.</p>
            ) : (
              <div className="space-y-3">
                {queue.map((q) => (
                  <div key={q.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{q.first_name} {q.last_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Requested {new Date(q.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <StatusBadge status={q.status} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-md bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground mb-1">Forward address (paste into IONOS)</p>
                        <div className="flex items-center justify-between gap-2">
                          <code className="text-sm font-mono break-all">{q.forward_address}</code>
                          <CopyButton value={q.forward_address} label="Copy" />
                        </div>
                      </div>
                      <div className="rounded-md bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground mb-1">Forward target</p>
                        <div className="flex items-center justify-between gap-2">
                          <code className="text-sm font-mono break-all">{q.target_email}</code>
                          <CopyButton value={q.target_email} label="Copy" />
                        </div>
                      </div>
                    </div>
                    {q.notes && <p className="text-xs text-destructive">{q.notes}</p>}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => markActive.mutate(q.id)}
                        disabled={markActive.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Active
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setFailTarget({ id: q.id, user_id: q.user_id, forward_address: q.forward_address, target_email: q.target_email, status: q.status, notes: q.notes, created_at: q.created_at, created_in_ionos_at: null })}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Mark Failed
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <a href="https://www.ionos.com/login" target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4 mr-1" /> Open IONOS
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active forwards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> Active Forwards
              {activeForwards.length > 0 && <Badge variant="secondary">{activeForwards.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fwLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : activeForwards.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active forwards yet.</p>
            ) : (
              <div className="space-y-2">
                {activeForwards.map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-mono font-medium text-sm">{f.forward_address}</p>
                      <p className="text-xs text-muted-foreground">
                        → {f.target_email}
                        {f.created_in_ionos_at && ` · active since ${new Date(f.created_in_ionos_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CopyButton value={f.forward_address} label="Copy" />
                      <StatusBadge status={f.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Checklist dialog */}
        <Dialog open={checklistUserId !== null} onOpenChange={(o) => !o && setChecklistUserId(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Onboarding Checklist
              </DialogTitle>
            </DialogHeader>
            {checklistLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : checklistData ? (
              <div className="space-y-3">
                {CHECKLIST_LABELS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                    <Checkbox
                      checked={Boolean((checklistData.checklist as any)[key])}
                      onCheckedChange={(v) =>
                        checklistUserId !== null &&
                        updateChecklist.mutate({ userId: checklistUserId, item: key, value: Boolean(v) })
                      }
                    />
                    <span className="text-sm font-medium">{label}</span>
                    {(checklistData.checklist as any)[key] && (
                      <CheckCircle2 className="h-4 w-4 ml-auto text-green-600" />
                    )}
                  </label>
                ))}
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Live-lead access</span>
                    {checklistData.checklist.live_lead_access_granted ? (
                      <Badge className="bg-green-600 text-white">Granted</Badge>
                    ) : (
                      <Badge variant="secondary">Not granted</Badge>
                    )}
                  </div>
                  {!checklistData.complete && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Missing: {checklistData.missing.join(", ")}
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    disabled={!checklistData.complete || checklistData.checklist.live_lead_access_granted || grantAccess.isPending}
                    onClick={() => checklistUserId !== null && grantAccess.mutate(checklistUserId)}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Grant Live-Lead Access
                  </Button>
                </DialogFooter>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Request forward dialog */}
        <Dialog open={requestTarget !== null} onOpenChange={(o) => !o && setRequestTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Request Email Forward</DialogTitle>
            </DialogHeader>
            {requestTarget && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This will generate an @oceanluxe.org forward address for{" "}
                  <span className="font-medium text-foreground">
                    {requestTarget.first_name} {requestTarget.last_name}
                  </span>
                  . You'll create it manually in the IONOS Control Panel, then mark it active here.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="target">Forward target (personal email)</Label>
                  <Input
                    id="target"
                    type="email"
                    placeholder="personal@gmail.com"
                    value={targetEmail}
                    onChange={(e) => setTargetEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Mail to the new @oceanluxe.org address will forward to this inbox.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRequestTarget(null)}>Cancel</Button>
                  <Button
                    disabled={requestForward.isPending || !targetEmail.trim()}
                    onClick={() =>
                      requestForward.mutate({ userId: requestTarget.id, targetEmail: targetEmail.trim() })
                    }
                  >
                    {requestForward.isPending ? "Requesting…" : "Request Forward"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Mark failed dialog */}
        <Dialog open={failTarget !== null} onOpenChange={(o) => !o && setFailTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Mark Forward Failed</DialogTitle>
            </DialogHeader>
            {failTarget && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Marking <code className="font-mono">{failTarget.forward_address}</code> as failed.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Input
                    id="reason"
                    placeholder="e.g. Address already exists in IONOS"
                    value={failReason}
                    onChange={(e) => setFailReason(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFailTarget(null)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    disabled={markFailed.isPending}
                    onClick={() => markFailed.mutate({ id: failTarget.id, reason: failReason.trim() || "No reason given" })}
                  >
                    Mark Failed
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
