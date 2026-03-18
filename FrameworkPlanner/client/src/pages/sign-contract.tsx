import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";

export default function SignContractPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/sign/:token");
  const token = String(params?.token || "");

  const { data, refetch } = useQuery<any>({
    queryKey: ["/api/sign/envelopes", token],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(`/api/sign/envelopes/${token}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Not found");
      return json;
    },
    retry: false,
  });

  useEffect(() => {
    if (!token) return;
    fetch(`/api/sign/envelopes/${token}/viewed`, { method: "POST" }).catch(() => {});
  }, [token]);

  const envelope = data?.envelope;
  const document = data?.document;

  const [signatureType, setSignatureType] = useState<"typed" | "drawn">("typed");
  const [signatureText, setSignatureText] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }, []);

  const clearCanvas = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
  };

  const getCanvasBase64 = () => {
    const c = canvasRef.current;
    if (!c) return "";
    const dataUrl = c.toDataURL("image/png");
    return dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  };

  const signMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { signatureType };
      if (signatureType === "typed") payload.signatureText = signatureText;
      if (signatureType === "drawn") payload.signatureImageBase64 = getCanvasBase64();
      const res = await fetch(`/api/sign/envelopes/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Sign failed");
      return json;
    },
    onSuccess: async () => {
      toast({ title: "Signed" });
      await refetch();
    },
    onError: (e: any) => toast({ title: e?.message || "Sign failed", variant: "destructive" }),
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sign/envelopes/${token}/decline`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Decline failed");
      return json;
    },
    onSuccess: async () => {
      toast({ title: "Declined" });
      await refetch();
    },
    onError: (e: any) => toast({ title: e?.message || "Decline failed", variant: "destructive" }),
  });

  const status = String(envelope?.status || "");
  const canSign = status && status !== "signed" && status !== "declined";

  const signerLabel = useMemo(() => {
    const name = String(envelope?.signerName || "");
    const email = String(envelope?.signerEmail || "");
    if (name && email) return `${name} <${email}>`;
    return name || email || "";
  }, [envelope?.signerEmail, envelope?.signerName]);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 flex items-start justify-center">
      <div className="w-full max-w-3xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{String(document?.title || "Document")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Status: <span className="text-foreground">{status || "—"}</span>
              {signerLabel ? <span className="ml-2">Signer: <span className="text-foreground">{signerLabel}</span></span> : null}
            </div>
            <Textarea value={String(document?.content || "")} readOnly className="min-h-[260px]" />
            {status === "signed" && (
              <div className="flex gap-2">
                <Button asChild>
                  <a href={`/api/sign/envelopes/${token}/pdf`} target="_blank" rel="noreferrer">
                    View signed PDF
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Label>Signature type</Label>
              <Select value={signatureType} onValueChange={(v) => setSignatureType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="typed">Typed</SelectItem>
                  <SelectItem value="drawn">Drawn</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {signatureType === "typed" ? (
              <div className="grid gap-2">
                <Label>Type your name</Label>
                <Input value={signatureText} onChange={(e) => setSignatureText(e.target.value)} placeholder="Your full name" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Draw your signature</Label>
                <div className="border rounded-md overflow-hidden bg-white">
                  <canvas
                    ref={canvasRef}
                    width={900}
                    height={220}
                    className="w-full h-[140px]"
                    onPointerDown={(e) => {
                      const c = canvasRef.current;
                      const ctx = c?.getContext("2d");
                      if (!c || !ctx) return;
                      drawing.current = true;
                      const rect = c.getBoundingClientRect();
                      ctx.beginPath();
                      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                    }}
                    onPointerMove={(e) => {
                      if (!drawing.current) return;
                      const c = canvasRef.current;
                      const ctx = c?.getContext("2d");
                      if (!c || !ctx) return;
                      const rect = c.getBoundingClientRect();
                      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                      ctx.stroke();
                    }}
                    onPointerUp={() => {
                      drawing.current = false;
                    }}
                    onPointerLeave={() => {
                      drawing.current = false;
                    }}
                  />
                </div>
                <Button variant="secondary" onClick={clearCanvas}>
                  Clear
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={() => signMutation.mutate()} disabled={!canSign || signMutation.isPending}>
                Sign
              </Button>
              <Button variant="destructive" onClick={() => declineMutation.mutate()} disabled={!canSign || declineMutation.isPending}>
                Decline
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

