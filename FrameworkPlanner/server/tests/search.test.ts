import assert from "node:assert";
import { setTimeout as delay } from "node:timers/promises";

async function get(url: string) {
  const res = await fetch(url);
  const json = await res.json();
  return { status: res.status, json };
}

async function run() {
  const base = process.env.TEST_BASE_URL || "http://localhost:3000";
  const q = "st";
  const { status, json } = await get(`${base}/api/search?q=${encodeURIComponent(q)}&limit=10`);
  assert.equal(status, 200);
  assert.ok(json && typeof json === "object");
  assert.ok(Array.isArray(json.results));
  assert.ok(json.counts && typeof json.counts.total === "number");
  console.log("/api/search ok", { total: json.counts.total, sample: json.results[0] });
}

run().catch((e) => {
  console.error("search test failed", e);
  process.exit(1);
});

