import assert from "node:assert";

async function get(url: string) {
  const res = await fetch(url);
  const json = await res.json();
  return { status: res.status, json };
}

async function run() {
  const base = process.env.TEST_BASE_URL || "http://localhost:4000";
  const list = await get(`${base}/api/opportunities`);
  assert.equal(list.status, 200);
  const items = list.json as any[];
  if (!items.length) {
    console.log("no opportunities to test");
    return;
  }
  const id = items[0].id;
  const detail = await get(`${base}/api/opportunities/${id}`);
  assert.equal(detail.status, 200);
  assert.ok(detail.json && detail.json.property && typeof detail.json.property.id === "number");
  console.log("opportunity detail ok", { id, hasLead: !!detail.json.lead });
}

run().catch((e) => { console.error(e); process.exit(1); });

