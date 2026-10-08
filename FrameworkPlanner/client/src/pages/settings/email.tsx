/**
 * Settings → Email (Ticket 10).
 *
 * Business email delivery configuration:
 *   - Provider status (SMTP / Resend / Telnyx) — credentials live in env vars,
 *     this page shows config state only, never secrets.
 *   - Sending identities management (per-user from-addresses).
 *   - Global suppression list viewer (admin can add/remove).
 *   - Delivery stats.
 */
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, Plus, Trash2, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Send, Ban } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type Readiness = {
  configured: boolean;
  provider: string | null;
  from: string | null;
  devGuard: boolean;
  blocker: { code: string; message: string } | null;
};

type Identity = {
  id: number; user_id: number; email: string; name: string | null; is_default: boolean;
  spf_pass: boolean | null; dkim_pass: boolean | null; dmarc_status: string | null;
  verified_at: string | null; created_at: string;
};

type Stats = {
  sent: number; failed: number; suppressed: number;
  delivered: number; bounced: number; complained: number; replied: number;
  suppressionCount: number;
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${tone || ""}`}>{value.toLocaleString()}</p>
    </div>
  );
}

export default function EmailSettings() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newDefault, setNewDefault] = useState(false);
  const [suppressEmail, setSuppressEmail] = useState("");
  const [suppressReason, setSuppressReason] = useState("optout");

  const { data: readiness, isLoading: rLoading } = useQuery<Readiness>({
    queryKey: ["/api/email/readiness"],
    queryFn: async () => (await apiRequest("GET", "/api/email/readiness")).json(),
  });
  const { data: identitiesData, isLoading: iLoading } = useQuery<{ items: Identity[] }>({
    queryKey: ["/api/email/identities"],
    queryFn: async () => (await apiRequest("GET", "/api/email/identities")).json(),
  });
  const { data: stats, isLoading: sLoading } = useQuery<Stats>({
    queryKey: ["/api/email/stats"],
    queryFn: async () => (await apiRequest("GET", "/api/email/stats")).json(),
  });
  const { data: suppressionsData, isLoading: supLoading } = useQuery<{ items: { id: number; email: string; reason: string; created_at: string }[]; total: number }>({
    queryKey: ["/api/email/suppressions"],
    queryFn: async () => (await apiRequest("GET", "/api/email/suppressions?limit=100")).json(),
  });

  const addIdentity = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/email/identities", { email: newEmail, name: newName || null, is_default: newDefault })).json(),
    onSuccess: () => {
      toast.success("Sending identity added");
      setShowAdd(false); setNewEmail(""); setNewName(""); setNewDefault(false);
      queryClient.invalidateQueries({ queryKey: ["/api/email/identities"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add identity"),
  });

  const deleteIdentity = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/email/identities/${id}`)).json(),
    onSuccess: () => { toast.success("Identity removed"); queryClient.invalidateQueries({ queryKey: ["/api/email/identities"] }); },
    onError: (e: any) => toast.error(e?.message || "Failed to remove identity"),
  });

  const addSuppression = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/email/suppressions", { email: suppressEmail, reason: suppressReason })).json(),
    onSuccess: () => {
      toast.success("Address suppressed");
      setSuppressEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/email/suppressions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/stats"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to suppress address"),
  });

  const removeSuppression = useMutation({
    mutationFn: async (email: string) => (await apiRequest("DELETE", `/api/email/suppressions?email=${encodeURIComponent(email)}`)).json(),
    onSuccess: () => {
      toast.success("Address removed from suppression list");
      queryClient.invalidateQueries({ queryKey: ["/api/email/suppressions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/stats"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to remove suppression"),
  });

  return (
    <Layout>
      <div className="space-y-6 p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <Mail className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-semibold">Email Delivery</h1>
            <p className="text-sm text-muted-foreground">Business email sending, identities, suppression, and delivery stats.</p>
          </div>
        </div>

        {/* Provider status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider</CardTitle>
            <CardDescription>Credentials are configured via environment variables — never stored here.</CardDescription>
          </CardHeader>
          <CardContent>
            {rLoading ? <Skeleton className="h-16 w-full" /> : readiness ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {readiness.configured
                    ? <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" /> Configured</Badge>
                    : <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Not configured</Badge>}
                  {readiness.provider && <Badge variant="outline" className="capitalize">{readiness.provider}</Badge>}
                  {readiness.devGuard && <Badge variant="secondary"><ShieldAlert className="h-3 w-3 mr-1" /> Dev guard active</Badge>}
                </div>
                {readiness.from && <p className="text-sm">Default from: <span className="font-medium">{readiness.from}</span></p>}
                {readiness.blocker && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div><p className="font-medium">{readiness.blocker.code}</p><p className="text-muted-foreground">{readiness.blocker.message}</p></div>
                  </div>
                )}
                {readiness.devGuard && (
                  <p className="text-xs text-muted-foreground">Non-production: sends are only delivered to addresses in <code>EMAIL_DEV_ALLOWLIST</code>.</p>
                )}
                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                  <p className="font-medium text-foreground">Environment variables</p>
                  <p><code>EMAIL_PROVIDER</code>=smtp → <code>SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, SMTP_FROM</code></p>
                  <p><code>EMAIL_PROVIDER</code>=resend → <code>RESEND_API_KEY, RESEND_FROM</code></p>
                  <p><code>EMAIL_PROVIDER</code>=telnyx → <code>TELNYX_API_KEY, EMAIL_FROM_ADDRESS</code></p>
                  <p><code>EMAIL_DEV_ALLOWLIST</code> (comma-separated test recipients) · <code>EMAIL_WEBHOOK_SECRET</code> (delivery webhook auth)</p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Delivery stats */}
        <Card>
          <CardHeader><CardTitle className="text-base">Delivery stats</CardTitle></CardHeader>
          <CardContent>
            {sLoading ? <Skeleton className="h-20 w-full" /> : stats ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Sent" value={stats.sent} tone="text-green-600" />
                <Stat label="Delivered" value={stats.delivered} />
                <Stat label="Failed" value={stats.failed} tone="text-red-600" />
                <Stat label="Suppressed sends" value={stats.suppressed} tone="text-amber-600" />
                <Stat label="Bounced" value={stats.bounced} tone="text-red-600" />
                <Stat label="Complaints" value={stats.complained} tone="text-red-600" />
                <Stat label="Replies" value={stats.replied} tone="text-green-600" />
                <Stat label="Suppression list" value={stats.suppressionCount} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Identities */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div><CardTitle className="text-base">Sending identities</CardTitle>
              <CardDescription>From-addresses you can send as. SPF/DKIM/DMARC are verified at the DNS/provider level.</CardDescription></div>
              <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Add</Button>
            </div>
          </CardHeader>
          <CardContent>
            {iLoading ? <Skeleton className="h-20 w-full" /> : (
              <div className="space-y-2">
                {(identitiesData?.items || []).length === 0 && <p className="text-sm text-muted-foreground">No identities yet. Add your sending address above.</p>}
                {(identitiesData?.items || []).map((idn) => (
                  <div key={idn.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">{idn.email}</p>
                      <div className="flex gap-1 mt-1">
                        {idn.is_default && <Badge variant="secondary" className="text-xs">Default</Badge>}
                        {idn.name && <span className="text-xs text-muted-foreground">{idn.name}</span>}
                        {idn.spf_pass != null && <Badge variant={idn.spf_pass ? "default" : "destructive"} className="text-xs">SPF {idn.spf_pass ? "pass" : "fail"}</Badge>}
                        {idn.dkim_pass != null && <Badge variant={idn.dkim_pass ? "default" : "destructive"} className="text-xs">DKIM {idn.dkim_pass ? "pass" : "fail"}</Badge>}
                        {idn.dmarc_status && <Badge variant="outline" className="text-xs">DMARC {idn.dmarc_status}</Badge>}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => deleteIdentity.mutate(idn.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Suppression list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Ban className="h-4 w-4" /> Suppression list</CardTitle>
            <CardDescription>Hard bounces, spam complaints, and opt-outs. Sends to these addresses are blocked automatically.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="email@example.com" value={suppressEmail} onChange={(e) => setSuppressEmail(e.target.value)} className="flex-1" />
              <select value={suppressReason} onChange={(e) => setSuppressReason(e.target.value)} className="rounded-md border bg-background px-2 text-sm">
                <option value="optout">Opt-out</option>
                <option value="bounce">Bounce</option>
                <option value="complaint">Complaint</option>
              </select>
              <Button size="sm" onClick={() => suppressEmail.trim() && addSuppression.mutate()} disabled={!suppressEmail.trim() || addSuppression.isPending}>
                <Send className="h-4 w-4 mr-1" /> Suppress
              </Button>
            </div>
            {supLoading ? <Skeleton className="h-20 w-full" /> : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {(suppressionsData?.items || []).length === 0 && <p className="text-sm text-muted-foreground">No suppressed addresses.</p>}
                {(suppressionsData?.items || []).map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{s.email}</span>
                      <Badge variant={s.reason === "complaint" ? "destructive" : "secondary"} className="text-xs capitalize">{s.reason}</Badge>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeSuppression.mutate(s.email)} title="Remove from suppression list"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
            {suppressionsData && suppressionsData.total > 100 && <p className="text-xs text-muted-foreground">Showing 100 of {suppressionsData.total}.</p>}
          </CardContent>
        </Card>

        {/* Add identity dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add sending identity</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Email address</Label><Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@oceanluxe.org" /></div>
              <div><Label>Display name (optional)</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Benjamin Jelleh" /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newDefault} onChange={(e) => setNewDefault(e.target.checked)} /> Set as default from-address</label>
              <Button onClick={() => newEmail.trim() && addIdentity.mutate()} disabled={!newEmail.trim() || addIdentity.isPending} className="w-full">Add identity</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
