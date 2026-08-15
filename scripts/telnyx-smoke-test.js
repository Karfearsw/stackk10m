/**
 * Local Telnyx smoke test.
 *
 * Usage:
 *   cd FrameworkPlanner
 *   node ../scripts/telnyx-smoke-test.js
 *
 * Requirements:
 * - Dev server running on http://localhost:3000
 * - Logged-in session cookie present in browser, OR set TEST_COOKIE=...
 *
 * This script never prints full secrets. It only reports redacted diagnostics.
 */

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
      ...(process.env.TEST_COOKIE ? { cookie: process.env.TEST_COOKIE } : {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text };
}

function redactKey(key) {
  if (!key || typeof key !== "string") return null;
  if (key.length <= 6) return "***";
  return `${key.slice(0, 6)}...`;
}

async function main() {
  console.log(`[smoke] Base URL: ${BASE}`);

  // 1) Health
  console.log("[smoke] GET /api/telephony/health");
  const health = await request("/api/telephony/health");
  console.log(`[smoke] health status=${health.status}`);

  const telnyx = health.data?.telnyx || {};
  const diag = health.data?.telnyxDiag || {};

  console.log(`[smoke] telnyx.status=${telnyx.status} httpStatus=${telnyx.httpStatus ?? telnyx.code ?? "-"}`);
  console.log(`[smoke] telnyx.message=${telnyx.message || "-"}`);
  console.log(`[smoke] telnyxConfigured=${diag.telnyxConfigured} apiKeyPrefix=${redactKey(diag.apiKeyPrefix)} usedPublicKey=${diag.usedPublicKey}`);
  console.log(`[smoke] connectionId=${diag.connectionId ?? "-"} messagingProfileId=${diag.messagingProfileId ?? "-"} defaultFrom=${diag.defaultFrom ?? "-"}`);
  console.log(`[smoke] webhookUrl=${diag.webhookUrl ?? "-"}`);

  if (telnyx.status !== "reachable") {
    console.error("[smoke] ABORT: Telnyx is not reachable. Fix credentials before testing calls/SMS.");
    process.exitCode = 1;
    return;
  }

  // 2) Outbound dispatch
  const testTo = process.env.TEST_PHONE_NUMBER || "+15551234567";
  console.log(`[smoke] POST /api/telephony/outbound/dispatch to=${testTo}`);
  const dispatch = await request("/api/telephony/outbound/dispatch", {
    method: "POST",
    body: JSON.stringify({ toNumber: testTo }),
  });
  console.log(`[smoke] dispatch status=${dispatch.status} body=${JSON.stringify(dispatch.data)}`);

  if (dispatch.status === 201 && dispatch.data?.callControlId) {
    const callControlId = dispatch.data.callControlId;
    console.log(`[smoke] callControlId=${callControlId}`);

    // 3) Hangup
    console.log(`[smoke] POST /api/telephony/outbound/${callControlId}/hangup`);
    const hangup = await request(`/api/telephony/outbound/${encodeURIComponent(callControlId)}/hangup`, {
      method: "POST",
    });
    console.log(`[smoke] hangup status=${hangup.status} body=${JSON.stringify(hangup.data)}`);
  }

  // 4) SMS
  console.log(`[smoke] POST /api/telephony/sms to=${testTo}`);
  const sms = await request("/api/telephony/sms", {
    method: "POST",
    body: JSON.stringify({ to: testTo, body: "Local smoke test from FrameworkPlanner" }),
  });
  console.log(`[smoke] sms status=${sms.status} body=${JSON.stringify(sms.data)}`);

  console.log("[smoke] Done.");
}

main().catch((err) => {
  console.error("[smoke] Fatal:", err);
  process.exit(1);
});
