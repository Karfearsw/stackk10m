import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, ArrowRight, ArrowLeft, Phone, MessageSquare, Webhook, Rocket, Copy, ExternalLink } from "lucide-react";

type StepStatus = "pending" | "testing" | "passed" | "failed";

interface ValidationResult {
  ok: boolean;
  status: string;
  message: string;
  hint?: string;
  [key: string]: any;
}

const STEPS = [
  { id: "apikey", label: "API Key", icon: Rocket, description: "Authenticate with Telnyx" },
  { id: "connection", label: "Connection ID", icon: Phone, description: "Call Control Application" },
  { id: "messaging", label: "Messaging Profile", icon: MessageSquare, description: "SMS configuration" },
  { id: "webhook", label: "Webhook URL", icon: Webhook, description: "Event delivery" },
] as const;

export function TelnyxOnboardingWizard({ onComplete }: { onComplete?: () => void }) {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({});
  const [results, setResults] = useState<Record<string, ValidationResult>>({});

  const setStepStatus = (s: string, status: StepStatus) => setStatuses((p) => ({ ...p, [s]: status }));
  const setStepResult = (s: string, result: ValidationResult) => setResults((p) => ({ ...p, [s]: result }));

  const validateApiKey = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/telnyx/validate/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apiKey }),
      });
      return res.json();
    },
    onMutate: () => { setStepStatus("apikey", "testing"); },
    onSuccess: (data: ValidationResult) => {
      setStepResult("apikey", data);
      setStepStatus("apikey", data.ok ? "passed" : "failed");
      if (data.ok) toast.success("API key verified!");
      else toast.error(data.message || "API key validation failed");
    },
    onError: (err: any) => {
      setStepResult("apikey", { ok: false, status: "error", message: err?.message || "Request failed" });
      setStepStatus("apikey", "failed");
    },
  });

  const validateConnection = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/telnyx/validate/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apiKey, connectionId }),
      });
      return res.json();
    },
    onMutate: () => { setStepStatus("connection", "testing"); },
    onSuccess: (data: ValidationResult) => {
      setStepResult("connection", data);
      setStepStatus("connection", data.ok ? "passed" : "failed");
      if (data.ok) toast.success("Connection verified!");
      else toast.error(data.message || "Connection validation failed");
    },
    onError: (err: any) => {
      setStepResult("connection", { ok: false, status: "error", message: err?.message || "Request failed" });
      setStepStatus("connection", "failed");
    },
  });

  const validateMessaging = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/telnyx/validate/messaging-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apiKey, profileId, fromNumber }),
      });
      return res.json();
    },
    onMutate: () => { setStepStatus("messaging", "testing"); },
    onSuccess: (data: ValidationResult) => {
      setStepResult("messaging", data);
      setStepStatus("messaging", data.ok ? "passed" : "failed");
      if (data.ok) toast.success("Messaging profile verified!");
      else toast.error(data.message || "Messaging validation failed");
    },
    onError: (err: any) => {
      setStepResult("messaging", { ok: false, status: "error", message: err?.message || "Request failed" });
      setStepStatus("messaging", "failed");
    },
  });

  const allPassed = Object.keys(statuses).length > 0 && Object.values(statuses).every((s) => s === "passed");
  const current = STEPS[step];
  const currentStatus = statuses[current.id];
  const currentResult = results[current.id];

  function renderStatusBadge(s?: StepStatus) {
    if (!s || s === "pending") return null;
    if (s === "testing") return <span className="flex items-center gap-1 text-xs text-blue-600"><Loader2 className="w-3 h-3 animate-spin" /> Testing...</span>;
    if (s === "passed") return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3 h-3" /> Verified</span>;
    return <span className="flex items-center gap-1 text-xs text-red-600"><XCircle className="w-3 h-3" /> Failed</span>;
  }

  function renderResult(r?: ValidationResult) {
    if (!r) return null;
    return (
      <div className={`rounded-md border p-3 mt-3 text-sm ${r.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
        <p className="font-medium">{r.message}</p>
        {r.hint && <p className="text-xs mt-1 opacity-80">{r.hint}</p>}
        {r.typeWarning && <p className="text-xs mt-1 text-amber-700 font-medium">⚠ {r.typeWarning}</p>}
        {r.connections && r.connections.length > 0 && (
          <div className="mt-2 text-xs">
            <p className="font-medium mb-1">Available connections:</p>
            {r.connections.slice(0, 5).map((c: any) => (
              <div key={c.id} className="flex items-center gap-2">
                <code className="bg-white px-1 rounded">{c.id}</code>
                <span>{c.name || "unnamed"}</span>
                <span className={`px-1 rounded ${c.state === "active" ? "bg-green-100" : "bg-gray-100"}`}>{c.state}</span>
              </div>
            ))}
          </div>
        )}
        {r.numberCheck && (
          <div className={`mt-2 text-xs ${r.numberCheck.valid ? "text-green-700" : "text-amber-700"}`}>
            {r.numberCheck.valid ? "✓" : "⚠"} {r.numberCheck.message}
          </div>
        )}
        {r.numbers && r.numbers.length > 0 && (
          <div className="mt-2 text-xs">
            <p className="font-medium">Profile numbers:</p>
            <div className="flex flex-wrap gap-1 mt-1">{r.numbers.map((n: string) => <code key={n} className="bg-white px-1 rounded">{n}</code>)}</div>
          </div>
        )}
      </div>
    );
  }

  function renderStepContent() {
    switch (current.id) {
      case "apikey":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="apikey-input">Telnyx V2 API Key</Label>
              <Input id="apikey-input" type="password" placeholder="KEY019..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1 font-mono" data-testid="input-telnyx-api-key" />
              <p className="text-xs text-muted-foreground mt-1">Find this in Telnyx Portal → Account → API Keys. Must start with KEY019.</p>
            </div>
            <Button onClick={() => validateApiKey.mutate()} disabled={!apiKey.trim() || validateApiKey.isPending} className="bg-primary text-white" data-testid="button-test-api-key">
              {validateApiKey.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
              Test API Key
            </Button>
            {renderResult(currentResult)}
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
              <p className="font-medium">Where to find it:</p>
              <ol className="list-decimal list-inside mt-1 space-y-0.5">
                <li>Log in to <a href="https://portal.telnyx.com" target="_blank" rel="noopener" className="underline">portal.telnyx.com</a></li>
                <li>Go to Account → API Keys</li>
                <li>Click "Create API Key" or copy an existing V2 key</li>
                <li>Paste it above and click Test</li>
              </ol>
            </div>
          </div>
        );
      case "connection":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="connection-input">Call Control Application ID</Label>
              <Input id="connection-input" placeholder="e.g. 3027149000869414740" value={connectionId} onChange={(e) => setConnectionId(e.target.value)} className="mt-1 font-mono" data-testid="input-telnyx-connection-id" />
              <p className="text-xs text-muted-foreground mt-1">Must be numeric — this is a Call Control Application ID, NOT a SIP Credential Connection.</p>
            </div>
            <Button onClick={() => validateConnection.mutate()} disabled={!apiKey.trim() || !connectionId.trim() || validateConnection.isPending} className="bg-primary text-white" data-testid="button-test-connection">
              {validateConnection.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Phone className="w-4 h-4 mr-2" />}
              Test Connection
            </Button>
            {renderResult(currentResult)}
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
              <p className="font-medium">Where to find it:</p>
              <ol className="list-decimal list-inside mt-1 space-y-0.5">
                <li>Go to Telnyx Portal → Voice → Call Control Applications</li>
                <li>Create a new app or select an existing one</li>
                <li>Set the webhook URL to: <code className="bg-white px-1 rounded">https://your-domain.com/api/v1/telecom/webhooks/telnyx</code></li>
                <li>Assign at least one voice-capable phone number</li>
                <li>Copy the numeric Connection ID</li>
              </ol>
              <p className="mt-1 font-medium text-amber-700">⚠ Do NOT use a SIP Credential Connection ID — it won't work for outbound calling.</p>
            </div>
          </div>
        );
      case "messaging":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="profile-input">Messaging Profile ID</Label>
              <Input id="profile-input" placeholder="e.g. 40019fa5-7405-4b6a-b7ce-c220cfaa145e" value={profileId} onChange={(e) => setProfileId(e.target.value)} className="mt-1 font-mono" data-testid="input-telnyx-profile-id" />
              <p className="text-xs text-muted-foreground mt-1">UUID format from Telnyx Portal → Messaging → Profiles.</p>
            </div>
            <div>
              <Label htmlFor="from-input">Default From Number (optional)</Label>
              <Input id="from-input" placeholder="+15551234567" value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} className="mt-1 font-mono" data-testid="input-telnyx-from-number" />
              <p className="text-xs text-muted-foreground mt-1">E.164 format. We'll verify it's assigned to the profile.</p>
            </div>
            <Button onClick={() => validateMessaging.mutate()} disabled={!apiKey.trim() || !profileId.trim() || validateMessaging.isPending} className="bg-primary text-white" data-testid="button-test-messaging">
              {validateMessaging.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
              Test Messaging Profile
            </Button>
            {renderResult(currentResult)}
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
              <p className="font-medium">Where to find it:</p>
              <ol className="list-decimal list-inside mt-1 space-y-0.5">
                <li>Go to Telnyx Portal → Messaging → Profiles</li>
                <li>Create a new profile or select an existing one</li>
                <li>Assign at least one phone number to the profile</li>
                <li>Copy the Profile ID (UUID format)</li>
              </ol>
            </div>
          </div>
        );
      case "webhook":
        return (
          <div className="space-y-4">
            <div className="rounded-md bg-green-50 border border-green-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="font-medium text-green-800">Webhook URL</p>
              </div>
              <p className="text-sm text-green-700 mb-2">Your webhook endpoint is already configured:</p>
              <div className="flex items-center gap-2">
                <code className="bg-white px-2 py-1 rounded text-xs font-mono break-all">https://your-domain.com/api/v1/telecom/webhooks/telnyx</code>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText("https://your-domain.com/api/v1/telecom/webhooks/telnyx"); toast.success("Copied!"); }}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
              <p className="font-medium">Setup steps:</p>
              <ol className="list-decimal list-inside mt-1 space-y-0.5">
                <li>In Telnyx Portal, open your Call Control Application</li>
                <li>Paste the webhook URL into the Webhook URL field</li>
                <li>Set a failover webhook URL if desired</li>
                <li>Save - Telnyx will send call and message events here</li>
              </ol>
            </div>
          </div>
        );
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-primary" />
          Telnyx Setup Wizard
        </CardTitle>
        <CardDescription>Walk through each step to connect your Telnyx account. Each value is tested live before you save.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isComplete = statuses[s.id] === "passed";
            return (
              <div key={s.id} className="flex items-center">
                <button
                  onClick={() => setStep(i)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${isActive ? "bg-primary text-white" : isComplete ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                  data-testid={`step-${s.id}`}
                >
                  {isComplete ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                  <span className="hidden sm:inline">{s.label}</span>
                  {renderStatusBadge(statuses[s.id])}
                </button>
                {i < STEPS.length - 1 && <ArrowRight className="w-3 h-3 text-gray-300 mx-1" />}
              </div>
            );
          })}
        </div>

        <div className="min-h-[200px]">
          <h3 className="text-lg font-semibold mb-1">{current.label}</h3>
          <p className="text-sm text-muted-foreground mb-4">{current.description}</p>
          {renderStepContent()}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} data-testid="button-wizard-back">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={currentStatus !== "passed" && current.id !== "webhook"} className="bg-primary text-white" data-testid="button-wizard-next">
              Next <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={onComplete} className="bg-green-600 text-white hover:bg-green-700" data-testid="button-wizard-done">
              <CheckCircle2 className="w-4 h-4 mr-1" /> Done
            </Button>
          )}
        </div>

        {allPassed && (
          <div className="rounded-md bg-green-50 border border-green-200 p-4 text-sm text-green-800">
            <p className="font-medium">All resources verified!</p>
            <p className="text-xs mt-1">Copy these values into your .env file and restart the server.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
