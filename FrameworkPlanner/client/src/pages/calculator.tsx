import { Layout } from "@/components/layout/Layout";
import { DealCalculator } from "@/components/deals/DealCalculator";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { computeRepairTotal, underwritingSchemaV1 } from "@shared/underwriting";

export default function Calculator() {
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const propertyIdRaw = params.get("propertyId");
  const propertyId = propertyIdRaw ? parseInt(propertyIdRaw, 10) : 0;
  const sessionIdRaw = params.get("sessionId");
  const sessionId = sessionIdRaw ? parseInt(sessionIdRaw, 10) : 0;
  const addressRaw = String(params.get("address") || "").trim();

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/opportunities", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${propertyId}`);
      if (!res.ok) throw new Error("Failed to fetch opportunity");
      return res.json();
    },
    enabled: propertyId > 0,
  });

  const property = data?.property;
  const num = (v: unknown) =>
    typeof v === "string" ? (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0) : typeof v === "number" ? (Number.isFinite(v) ? v : 0) : 0;

  const { data: session, isLoading: sessionLoading } = useQuery<any>({
    queryKey: ["/api/playground/session", sessionId || addressRaw || property?.address || ""],
    queryFn: async () => {
      if (sessionId > 0) {
        const res = await fetch(`/api/playground/sessions/${sessionId}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch session");
        return res.json();
      }
      const addr = addressRaw || String(property?.address || "").trim();
      if (!addr) return null;
      const res = await fetch(`/api/playground/sessions/open`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr, propertyId: propertyId > 0 ? propertyId : undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to open session");
      return json;
    },
    enabled: sessionId > 0 || Boolean(addressRaw) || (propertyId > 0 && Boolean(property?.address)),
  });

  const underwriting = (() => {
    try {
      return session?.underwritingJson ? JSON.parse(session.underwritingJson) : {};
    } catch {
      return {};
    }
  })();
  const underwritingV1 = underwritingSchemaV1.safeParse(underwriting);
  const sessionCalc =
    session && underwriting
      ? underwritingV1.success
        ? {
            arv: underwritingV1.data.arv.value ?? 0,
            purchasePrice: underwritingV1.data.dealMath.mao ?? 0,
            repairCosts: computeRepairTotal(underwritingV1.data.repairs) || 0,
          }
        : {
            arv: num((underwriting as any)?.arv),
            purchasePrice: num((underwriting as any)?.mao),
            repairCosts: num((underwriting as any)?.repairEstimate),
          }
      : null;

  return (
    <Layout>
      <div className="space-y-1 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Deal Calculator</h1>
        <p className="text-muted-foreground">Analyze deal profitability and ROI on potential properties.</p>
      </div>

      {propertyId > 0 && (
        <div className="mb-4">
          <Link href={`/opportunities/${propertyId}`} className="text-sm text-primary hover:underline">
            Back to Opportunity
          </Link>
        </div>
      )}

      {propertyId > 0 && isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : sessionLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <DealCalculator
          initialValues={
            (session && !sessionLoading) || (propertyId > 0 && !error)
              ? {
                  arv: sessionCalc ? num(sessionCalc.arv) : num(property?.arv),
                  purchasePrice: sessionCalc ? num(sessionCalc.purchasePrice) : num(property?.price),
                  repairCosts: sessionCalc ? num(sessionCalc.repairCosts) : num(property?.repairCost),
                }
              : undefined
          }
          onSave={async (values) => {
            try {
              if (session?.id) {
                const nextUw = underwritingV1.success
                  ? {
                      ...underwritingV1.data,
                      arv: { ...underwritingV1.data.arv, value: values.arv || null },
                      repairs: { ...underwritingV1.data.repairs, mode: "lite", liteEstimate: values.repairCosts || null },
                      dealMath: { ...underwritingV1.data.dealMath, mao: values.purchasePrice || null },
                      updatedAt: new Date().toISOString(),
                    }
                  : {
                      ...(underwriting && typeof underwriting === "object" ? underwriting : {}),
                      arv: values.arv,
                      mao: values.purchasePrice,
                      repairEstimate: values.repairCosts,
                    };
                const res = await fetch(`/api/playground/sessions/${session.id}`, {
                  method: "PATCH",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ underwritingJson: JSON.stringify(nextUw) }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.message || "Failed to save session");
              }
              if (propertyId > 0 && !error) {
                await fetch(`/api/opportunities/${propertyId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    arv: values.arv || null,
                    repairCost: values.repairCosts || null,
                    price: values.purchasePrice || null,
                  }),
                });
              }
              toast({ title: "Saved" });
            } catch (e: any) {
              toast({ title: "Save failed", description: e?.message || "Unknown error", variant: "destructive" });
            }
          }}
        />
      )}
    </Layout>
  );
}
