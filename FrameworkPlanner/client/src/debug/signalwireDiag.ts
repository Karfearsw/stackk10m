export async function runSignalWireDiagnostics(sampleNumber: string = "+15555550123") {
  const log = (...args: any[]) => console.log("[SW-Diag]", ...args)
  const err = (...args: any[]) => console.error("[SW-Diag]", ...args)
  try {
    const SW: any = await import("@signalwire/js")
    log("Module keys:", Object.keys(SW))
    log("typeof SignalWire:", typeof (SW as any)?.SignalWire)
    log("typeof createClient:", typeof (SW as any)?.createClient)
    const res = await fetch("/api/telephony/signalwire/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: sampleNumber })
    })
    log("Token status:", res.status)
    if (!res.ok) {
      err("Token fetch failed:", await res.text())
      return
    }
    const tokenData = await res.json()
    log("Token fields:", Object.keys(tokenData))
    log("Space:", tokenData.space, "Project:", tokenData.project, "From:", tokenData.from)
    let client: any
    const createClient = (SW as any)?.createClient
    const SignalWire = (SW as any)?.SignalWire
    if (typeof createClient === "function") {
      client = await createClient({ token: tokenData.token, host: tokenData.space })
    } else if (typeof SignalWire === "function") {
      client = await SignalWire({ token: tokenData.token })
    } else {
      err("No supported client factory found")
      return
    }
    log("Client keys:", Object.keys(client || {}))
    log("voice.dialPhone:", typeof client?.voice?.dialPhone)
    log("calling.dialPhone:", typeof client?.calling?.dialPhone)
    log("dial:", typeof client?.dial)
  } catch (e: any) {
    err("Diagnostics error:", e?.message || e)
  }
}

;(window as any).runSignalWireDiagnostics = runSignalWireDiagnostics

