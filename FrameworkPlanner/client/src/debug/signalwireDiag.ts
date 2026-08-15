export async function runTelnyxDiagnostics(sampleNumber: string = "+15555550123") {
  const log = (...args: any[]) => console.log("[Telnyx-Diag]", ...args)
  const err = (...args: any[]) => console.error("[Telnyx-Diag]", ...args)
  try {
    log("Checking Telnyx health...");
    const res = await fetch("/api/telephony/health", { credentials: "include" });
    log("Health status:", res.status);
    if (!res.ok) {
      err("Health fetch failed:", await res.text());
      return;
    }
    const health = await res.json();
    log("Health data:", health);

    log("Testing outbound dispatch with sample number:", sampleNumber);
    const dispatchRes = await fetch("/api/telephony/outbound/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ toNumber: sampleNumber }),
    });
    log("Dispatch status:", dispatchRes.status);
    if (!dispatchRes.ok) {
      err("Dispatch failed:", await dispatchRes.text());
      return;
    }
    const dispatchData = await dispatchRes.json();
    log("Dispatch response:", dispatchData);
  } catch (e: any) {
    err("Diagnostics error:", e?.message || e)
  }
}

;(window as any).runTelnyxDiagnostics = runTelnyxDiagnostics

