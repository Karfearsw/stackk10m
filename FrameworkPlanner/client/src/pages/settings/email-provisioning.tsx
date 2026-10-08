/**
 * Settings → Email Provisioning & Onboarding.
 *
 * Business email auto-provisioning through IONOS:
 *   - IONOS connection status (configured / what's missing)
 *   - Pending provisioning queue (users without a business email)
 *   - Provisioned emails list
 *   - Per-user onboarding checklist with live-lead access gate
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
  Mail, Server, AlertTriangle, CheckCircle2, XCircle, Clock,
  UserPlus, ShieldCheck, RefreshCw, Send, FileText,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type IonosStatus = {
  configured: boolean;
  missing: string[];
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasContractId: boolean;
};

type QueuedUser = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string | null;
  // from pendingProvisionQueue join
  email_address?: string;
  status?: string;
  error?: string | null;
  signup_email?: string;
};

type ProvisionedEmail = {
  id: number;
  user_id: number;
  email_address: string;
  ionos_mailbox_id: string | null;
  forwarding_to: string | null;
  status: "pending" | "active" | "failed";
  error: string | null;
  created_at: string;
  provisioned_at: string | null;
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
  { key: "email_provisioned", label: "Business email provisioned" },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" /> Active</Badge>;
  if (status === "failed")
    return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>;
  return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
}

export default function EmailProvisioningSettings() {
  const queryClient = useQueryClient();
  const [provisionTarget, setProvisionTarget] = useState<QueuedUser | null>(null);
  const [forwardingTo, setForwardingTo] = useState("");
  const [checklistUserId, setChecklistUserId] = useState<number | null>(null);

  const { data: ionos, isLoading: ionosLoading } = useQuery<IonosStatus>({
    queryKey: ["/api/onboarding/ionos-status"],
    queryFn: async () => (await apiRequest("GET", "/api/onboarding/ionos-status")).json(),
  });

  const { data: queueData, isLoading: queueLoading } = useQuery<{ pending: QueuedUser[]; needing: QueuedUser[] }>({
    queryKey: ["/api/onboarding/provision-queue"],
    queryFn: async () => (await apiRequest("GET", "/api/onboarding/provision-queue")).json(),
  });

  const { data: provisionedData, isLoading: provLoading } = useQuery<{ items: ProvisionedEmail[] }>({
    queryKey: ["/api/onboarding/provisioned-emails"],
    queryFn: async () => (await apiRequest("GET", "/api/onboarding/provisioned-emails")).json(),
  });

  const { data: checklistData, isLoading: checklistLoading } = useQuery<{ checklist: Checklist; complete: boolean; missing: string[] }>({
    queryKey: ["/api/onboarding/checklist", checklistUserId],
    queryFn: async () => (await apiRequest("GET", `/api/onboarding/checklist/${checklistUserId}`)).json(),
    enabled: checklistUserId !== null,
  });

  const provision = useMutation({
    mutationFn: async ({ userId, forwardingTo }: { userId: number; forwardingTo?: string }) =>
      (await apiRequest("POST", "/api/onboarding/provision-email", { userId, forwardingTo })).json(),
    onSuccess: (d: any) => {
      if (d.ok) {
        toast.success(`Provisioned ${d.email}`);
      } else {
        toast.error(d.message || "Provisioning failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/provision-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/provisioned-emails"] });
      setProvisionTarget(null);
      setForwardingTo("");
    },
    onError: (e: any) => toast.error(e?.message || "Provisioning failed"),
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

  const needing = queueData?.needing || [];
  const pending = queueData?.pending || [];
  const provisioned = provisionedData?.items || [];

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Email Provisioning & Onboarding</h1>
            <p className="text-muted-foreground">
              Auto-create @oceanluxe.org mailboxes through IONOS and track onboarding before granting live-lead access.
            </p>
          </div>
          <Button variant="outline" onClick={() => (window.location.href = "/settings/onboarding-docs")}>
            <FileText className="h-4 w-4 mr-2" /> Onboarding Documents
          </Button>
        </div>

        {/* IONOS status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" /> IONOS Connection
            </CardTitle>
            <CardDescription>
              Credentials live in env vars only — this page shows config state, never secrets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ionosLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : ionos?.configured ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Connected — automatic provisioning is enabled.</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">Not configured — provisioning will queue as pending.</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Set these env vars in Vercel to enable automatic IONOS mailbox creation:
                </p>
                <div className="flex flex-wrap gap-2">
                  {(ionos?.missing || []).map((v) => (
                    <Badge key={v} variant="outline" className="font-mono">{v}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Users needing email */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Users Needing a Business Email
              {needing.length > 0 && <Badge variant="secondary">{needing.length}</Badge>}
            </CardTitle>
            <CardDescription>Active users without an @oceanluxe.org address.</CardDescription>
          </CardHeader>
          <CardContent>
            {queueLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : needing.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone has a business email. 🎉</p>
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
                      <Button size="sm" onClick={() => setProvisionTarget(u)}>
                        <Mail className="h-4 w-4 mr-1" /> Provision
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending / failed queue */}
        {pending.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" /> Pending / Failed Provisions
                <Badge variant="secondary">{pending.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pending.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{p.first_name} {p.last_name}</p>
                      <p className="text-sm text-muted-foreground font-mono">{p.email_address}</p>
                      {p.error && <p className="text-xs text-destructive mt-1">{p.error}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={p.status} />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setProvisionTarget({ id: p.user_id, first_name: p.first_name, last_name: p.last_name, email: p.signup_email, role: null })}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" /> Retry
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Provisioned emails */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> Provisioned Emails
              {provisioned.length > 0 && <Badge variant="secondary">{provisioned.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {provLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : provisioned.length === 0 ? (
              <p className="text-sm text-muted-foreground">No business emails provisioned yet.</p>
            ) : (
              <div className="space-y-2">
                {provisioned.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-mono font-medium">{p.email_address}</p>
                      <p className="text-xs text-muted-foreground">
                        User #{p.user_id}
                        {p.forwarding_to && ` · forwards to ${p.forwarding_to}`}
                        {p.provisioned_at && ` · ${new Date(p.provisioned_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <StatusBadge status={p.status} />
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

        {/* Provision dialog */}
        <Dialog open={provisionTarget !== null} onOpenChange={(o) => !o && setProvisionTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Provision Business Email</DialogTitle>
            </DialogHeader>
            {provisionTarget && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This will generate an @oceanluxe.org address for{" "}
                  <span className="font-medium text-foreground">
                    {provisionTarget.first_name} {provisionTarget.last_name}
                  </span>{" "}
                  and create the mailbox through IONOS.
                </p>
                {!ionos?.configured && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    IONOS is not configured — the address will be reserved and queued as pending until IONOS is set up.
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="forwarding">Forward to (optional)</Label>
                  <Input
                    id="forwarding"
                    type="email"
                    placeholder="personal@gmail.com"
                    value={forwardingTo}
                    onChange={(e) => setForwardingTo(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    New mailbox mail will also forward to this personal address.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setProvisionTarget(null)}>Cancel</Button>
                  <Button
                    disabled={provision.isPending}
                    onClick={() =>
                      provision.mutate({
                        userId: provisionTarget.id,
                        forwardingTo: forwardingTo.trim() || undefined,
                      })
                    }
                  >
                    {provision.isPending ? "Provisioning…" : "Provision Email"}
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
