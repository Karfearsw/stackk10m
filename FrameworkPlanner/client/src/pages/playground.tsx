import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UnderwriteDealWorkspace } from "@/components/underwriting/UnderwriteDealWorkspace";
import { useToast } from "@/hooks/use-toast";
import { Lightbulb, MapPin, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

type PlaygroundContext = {
  address: string;
  leadId: number | null;
  propertyId: number | null;
  sessionId: number | null;
};

function parseContextFromLocation(): PlaygroundContext {
  const params = new URLSearchParams(window.location.search);
  const address = String(params.get("address") || "").trim();
  const leadIdRaw = params.get("leadId");
  const propertyIdRaw = params.get("propertyId");
  const sessionIdRaw = params.get("sessionId");
  const leadId = leadIdRaw ? parseInt(leadIdRaw, 10) : 0;
  const propertyId = propertyIdRaw ? parseInt(propertyIdRaw, 10) : 0;
  const sessionId = sessionIdRaw ? parseInt(sessionIdRaw, 10) : 0;
  return {
    address,
    leadId: leadId > 0 ? leadId : null,
    propertyId: propertyId > 0 ? propertyId : null,
    sessionId: sessionId > 0 ? sessionId : null,
  };
}

export default function Playground() {
  const { toast } = useToast();
  const [context, setContext] = useState<PlaygroundContext>(() => parseContextFromLocation());
  const [addressInput, setAddressInput] = useState(context.address);
  const [resolvedAddress, setResolvedAddress] = useState(context.address);

  useEffect(() => {
    const hydrate = async () => {
      if (context.address) {
        setResolvedAddress(context.address);
        return;
      }
      if (context.propertyId) {
        const res = await fetch(`/api/opportunities/${context.propertyId}`, { credentials: "include" });
        if (!res.ok) return;
        const json = await res.json();
        const addr = String(json?.property?.address || "").trim();
        if (addr) setResolvedAddress(addr);
        return;
      }
      if (context.leadId) {
        const res = await fetch(`/api/leads/${context.leadId}`, { credentials: "include" });
        if (!res.ok) return;
        const json = await res.json();
        const addr = String(json?.address || "").trim();
        if (addr) setResolvedAddress(addr);
      }
    };
    hydrate();
  }, [context.address, context.leadId, context.propertyId]);

  return (
    <Layout>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="page-title">
            <Lightbulb className="h-8 w-8 text-primary" />
            Property Playground
          </h1>
          <div className="text-sm text-muted-foreground">Research hub for zoning, suppliers, comps, and deal ideas.</div>
        </div>
        <Badge variant="secondary" className="h-6">
          {context.sessionId ? `Session ${context.sessionId}` : "Live"}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Context
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[240px]">
                <Input value={addressInput} onChange={(e) => setAddressInput(e.target.value)} placeholder="Address" />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  const nextAddr = addressInput.trim();
                  setContext((c) => ({ ...c, address: nextAddr, sessionId: null }));
                  setResolvedAddress(nextAddr);
                  toast({ title: "Context updated", description: nextAddr || "—" });
                }}
              >
                Apply
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setContext((c) => ({ ...c, sessionId: null }));
                  toast({ title: "Session will reopen on next load" });
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reopen session
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">{resolvedAddress ? `Resolved: ${resolvedAddress}` : "Enter an address to start"}</div>
          </div>
        </CardContent>
      </Card>

      {resolvedAddress ? (
        <UnderwriteDealWorkspace address={resolvedAddress} propertyId={context.propertyId} leadId={context.leadId} sessionId={context.sessionId} />
      ) : (
        <div className="text-sm text-muted-foreground py-10 text-center">Enter an address to start underwriting.</div>
      )}
    </Layout>
  );
}
