/**
 * Public signer page for the self-built e-sign module (v2).
 * Route: /esign/:token — token-gated, NO session auth.
 *
 * Ceremony: review document -> e-consent -> signature capture (draw / type /
 * upload) -> intent confirmation (type full legal name) -> submit -> success +
 * Certificate of Completion view.
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";

type Phase = "review" | "consent" | "capture" | "intent" | "done";

export default function EsignSignPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/esign/:token");
  const token = String(params?.token || "");

  const [phase, setPhase] = useState<Phase>("review");
  const [consented, setConsented] = useState(false);
  const [sigMode, setSigMode] = useState<"drawn" | "typed" | "uploaded">("drawn");
  const [typedName, setTypedName] = useState("");
  const [uploadDataUrl, setUploadDataUrl] = useState<string | null>(null);
  const [legalName, setLegalName] = useState("");
  const [certificate, setCertificate] = useState<any>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [ctx, setCtx] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/esign/sign/${token}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || "Link not found");
        setCtx(json);
      } catch (e: any) {
        setLoadError(e?.message || "Failed to load");
      }
    })();
    fetch(`/api/esign/sign/${token}/viewed`, { method: "POST" }).catch(() => {});
  }, [token]);

  const envelope = ctx?.envelope;
  const signer = ctx?.signer;
  const document = ctx?.document;

  const signerDone = useMemo(() => ["signed", "declined"].includes(String(signer?.status || "")), [signer?.status]);
  const envelopeDone = useMemo(() => ["completed", "voided", "expired"].includes(String(envelope?.status || "")), [envelope?.status]);

  useEffect(() => {
    if (signerDone || envelopeDone) setPhase("done");
  }, [signerDone, envelopeDone]);

  // canvas setup
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx2 = c.getContext("2d");
    if (!ctx2) return;
    ctx2.lineWidth = 2.4;
    ctx2.lineCap = "round";
    ctx2.lineJoin = "round";
    ctx2.strokeStyle = "#1a1a2e";
  }, [phase]);

  const toCanvasCoords = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * c.width, y: ((e.clientY - rect.top) / rect.height) * c.height };
  };

  const clearCanvas = () => {
    const c = canvasRef.current;
    const ctx2 = c?.getContext("2d");
    if (c && ctx2) ctx2.clearRect(0, 0, c.width, c.height);
    hasDrawn.current = false;
  };

  const getCanvasDataUrl = () => {
    const c = canvasRef.current;
    if (!c || !hasDrawn.current) return null;
    return c.toDataURL("image/png");
  };

  const onFileUpload = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      toast({ title: "Please upload a PNG or JPEG image", variant: "destructive" });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "Image must be under 4 MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setUploadDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const signaturePayload = (): { signatureType: string; signatureText?: string; signatureImageBase64?: string } | null => {
    if (sigMode === "typed") {
      const t = typedName.trim();
      if (!t) return null;
      return { signatureType: "typed", signatureText: t };
    }
    if (sigMode === "drawn") {
      const url = getCanvasDataUrl();
      if (!url) return null;
      return { signatureType: "drawn", signatureImageBase64: url };
    }
    if (!uploadDataUrl) return null;
    return { signatureType: "uploaded", signatureImageBase64: uploadDataUrl };
  };

  const submitSignature = async () => {
    const payload = signaturePayload();
    if (!payload) {
      toast({ title: "Capture your signature first", variant: "destructive" });
      return;
    }
    if (!legalName.trim()) {
      toast({ title: "Type your full legal name to confirm intent", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/esign/sign/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, legalName: legalName.trim(), consent: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Signing failed");
      setCertificate(json.certificate || null);
      setPhase("done");
      toast({ title: "Document signed" });
    } catch (e: any) {
      toast({ title: e?.message || "Signing failed", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const submitDecline = async () => {
    try {
      const res = await fetch(`/api/esign/sign/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: declineReason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Decline failed");
      setPhase("done");
    } catch (e: any) {
      toast({ title: e?.message || "Decline failed", variant: "destructive" });
    }
  };

  const loadCertificate = async () => {
    try {
      const res = await fetch(`/api/esign/sign/${token}/certificate`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) setCertificate(json);
    } catch {}
  };

  useEffect(() => {
    if (phase === "done" && !certificate) loadCertificate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 p-6">
        <Card className="max-w-md w-full bg-neutral-900 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-amber-400">Link unavailable</CardTitle>
            <CardDescription className="text-neutral-400">{loadError}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-neutral-400">
            This signing link is invalid, expired, or has already been used. Contact Ocean Luxe for a new link.
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100">
        <p className="text-neutral-400 animate-pulse">Loading document…</p>
      </div>
    );
  }

  const stepLabel = { review: "1 · Review", consent: "2 · E-Consent", capture: "3 · Sign", intent: "4 · Confirm", done: "Done" }[phase];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.25em] text-amber-400 font-semibold">OCEAN LUXE</p>
            <h1 className="text-lg font-serif">{String(document?.title || "Document")}</h1>
          </div>
          <span className="text-xs text-neutral-400 border border-neutral-700 rounded-full px-3 py-1">{stepLabel}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {phase === "review" && (
          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle className="text-neutral-100">Review the document</CardTitle>
              <CardDescription className="text-neutral-400">
                Signing as <span className="text-neutral-200 font-medium">{signer?.name}</span>
                {signer?.email ? ` <${signer.email}>` : ""} · expires{" "}
                {envelope?.expiresAt ? new Date(envelope.expiresAt).toLocaleString() : "—"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-white text-neutral-900 rounded-md p-6 max-h-[55vh] overflow-y-auto prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: String(document?.content || "") }} />
              <div className="flex gap-2">
                <Button className="bg-amber-400 text-black hover:bg-amber-300" onClick={() => setPhase("consent")}>
                  Continue
                </Button>
                <Button variant="ghost" className="text-neutral-400" onClick={() => setShowDecline(true)}>
                  Decline to sign
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "consent" && (
          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle className="text-neutral-100">Electronic consent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-neutral-300 leading-relaxed">{ctx.consentText}</p>
              <label className="flex items-start gap-3 text-sm text-neutral-300 cursor-pointer">
                <Checkbox checked={consented} onCheckedChange={(v) => setConsented(Boolean(v))} className="mt-0.5" />
                <span>I have read and agree to the electronic consent above.</span>
              </label>
              <div className="flex gap-2">
                <Button variant="ghost" className="text-neutral-400" onClick={() => setPhase("review")}>Back</Button>
                <Button className="bg-amber-400 text-black hover:bg-amber-300" disabled={!consented} onClick={() => setPhase("capture")}>
                  I agree — continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "capture" && (
          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle className="text-neutral-100">Capture your signature</CardTitle>
              <CardDescription className="text-neutral-400">Draw, type, or upload — all three are legally equivalent here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={sigMode} onValueChange={(v) => setSigMode(v as any)}>
                <TabsList className="bg-neutral-800">
                  <TabsTrigger value="drawn">Draw</TabsTrigger>
                  <TabsTrigger value="typed">Type</TabsTrigger>
                  <TabsTrigger value="uploaded">Upload</TabsTrigger>
                </TabsList>
                <TabsContent value="drawn" className="space-y-2">
                  <div className="border border-neutral-700 rounded-md overflow-hidden bg-white">
                    <canvas
                      ref={canvasRef}
                      width={900}
                      height={220}
                      className="w-full h-[150px] touch-none cursor-crosshair"
                      onPointerDown={(e) => {
                        (e.target as HTMLElement).setPointerCapture(e.pointerId);
                        drawing.current = true;
                        hasDrawn.current = true;
                        const ctx2 = canvasRef.current?.getContext("2d");
                        const p = toCanvasCoords(e);
                        ctx2?.beginPath();
                        ctx2?.moveTo(p.x, p.y);
                      }}
                      onPointerMove={(e) => {
                        if (!drawing.current) return;
                        const ctx2 = canvasRef.current?.getContext("2d");
                        const p = toCanvasCoords(e);
                        ctx2?.lineTo(p.x, p.y);
                        ctx2?.stroke();
                      }}
                      onPointerUp={() => { drawing.current = false; }}
                      onPointerCancel={() => { drawing.current = false; }}
                    />
                  </div>
                  <Button variant="secondary" size="sm" onClick={clearCanvas}>Clear</Button>
                </TabsContent>
                <TabsContent value="typed" className="space-y-2">
                  <Label className="text-neutral-300">Type your full name</Label>
                  <Input
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="e.g. Jane A. Doe"
                    className="bg-neutral-800 border-neutral-700 text-2xl font-serif italic"
                  />
                </TabsContent>
                <TabsContent value="uploaded" className="space-y-2">
                  <Label className="text-neutral-300">Upload a PNG/JPEG of your signature</Label>
                  <Input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="bg-neutral-800 border-neutral-700"
                    onChange={(e) => onFileUpload(e.target.files?.[0])}
                  />
                  {uploadDataUrl && (
                    <img src={uploadDataUrl} alt="Uploaded signature" className="bg-white rounded-md max-h-28 border border-neutral-700" />
                  )}
                </TabsContent>
              </Tabs>
              <div className="flex gap-2">
                <Button variant="ghost" className="text-neutral-400" onClick={() => setPhase("consent")}>Back</Button>
                <Button
                  className="bg-amber-400 text-black hover:bg-amber-300"
                  disabled={!signaturePayload()}
                  onClick={() => setPhase("intent")}
                >
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "intent" && (
          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle className="text-neutral-100">Confirm your intent to sign</CardTitle>
              <CardDescription className="text-neutral-400">
                Type your full legal name exactly. This, together with your captured signature and
                e-consent, constitutes your binding electronic signature.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label className="text-neutral-300">Full legal name</Label>
                <Input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Your full legal name"
                  className="bg-neutral-800 border-neutral-700"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" className="text-neutral-400" onClick={() => setPhase("capture")}>Back</Button>
                <Button
                  className="bg-amber-400 text-black hover:bg-amber-300"
                  disabled={!legalName.trim() || submitting}
                  onClick={submitSignature}
                >
                  {submitting ? "Signing…" : "Sign document"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "done" && (
          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle className="text-amber-400">
                {String(signer?.status) === "declined" ? "You declined to sign" : "Signed"}
              </CardTitle>
              <CardDescription className="text-neutral-400">
                {envelope?.status === "completed"
                  ? "All signers have completed. The signed packet and Certificate of Completion are below."
                  : "Your signature has been recorded. You'll be notified when all signers complete."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {envelope?.status === "completed" && (
                <Button asChild className="bg-amber-400 text-black hover:bg-amber-300">
                  <a href={`/api/esign/sign/${token}/pdf`} target="_blank" rel="noreferrer">
                    Download signed PDF
                  </a>
                </Button>
              )}
              {certificate && (
                <div className="border border-neutral-700 rounded-md p-4 space-y-2 text-sm">
                  <p className="font-semibold text-neutral-100 tracking-wide">CERTIFICATE OF COMPLETION</p>
                  <dl className="grid grid-cols-[160px_1fr] gap-y-1 text-neutral-300">
                    <dt className="text-neutral-500">Envelope</dt><dd>#{certificate.envelopeId}</dd>
                    <dt className="text-neutral-500">Document</dt><dd>{certificate.title}</dd>
                    <dt className="text-neutral-500">Status</dt><dd>{certificate.status}</dd>
                    <dt className="text-neutral-500">Completed</dt><dd>{certificate.completedAt || "—"}</dd>
                    <dt className="text-neutral-500">Document SHA-256</dt>
                    <dd className="break-all font-mono text-xs">{certificate.documentSha256 || "—"}</dd>
                    <dt className="text-neutral-500">Audit chain head</dt>
                    <dd className="break-all font-mono text-xs">{certificate.auditChainHead || "—"}</dd>
                  </dl>
                  <div className="pt-2">
                    <p className="text-neutral-500 text-xs mb-1">SIGNERS</p>
                    {certificate.signers?.map((s: any, i: number) => (
                      <p key={i} className="text-neutral-300 text-xs">
                        {s.name}{s.email ? ` <${s.email}>` : ""} — {s.signatureType || "—"} — {s.signedAt || "pending"}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {showDecline && (
          <Card className="bg-neutral-900 border-red-900">
            <CardHeader>
              <CardTitle className="text-red-400">Decline to sign</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label className="text-neutral-300">Reason (optional)</Label>
              <Input
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="bg-neutral-800 border-neutral-700"
                placeholder="Why are you declining?"
              />
              <div className="flex gap-2">
                <Button variant="ghost" className="text-neutral-400" onClick={() => setShowDecline(false)}>Cancel</Button>
                <Button variant="destructive" onClick={submitDecline}>Confirm decline</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-4 pb-8 text-xs text-neutral-500">
        Every action on this page is logged with a timestamp, IP address, and device information,
        and sealed into a tamper-evident audit trail.
      </footer>
    </div>
  );
}
