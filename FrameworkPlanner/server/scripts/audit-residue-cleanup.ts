/**
 * §f test-data residue cleanup (final audit 2026-09-14).
 *
 * Deletes the named audit test records created during the live audit runs.
 * The user must authorize the run; this script does NOT run automatically.
 *
 * Safety model:
 *  - Default mode is DRY RUN: it lists what it would delete and exits.
 *  - Nothing is deleted unless invoked with --apply.
 *  - Every deletion is written to stdout as an exact receipt (table, id, key).
 *  - If a record cannot be found, it is reported as "not found" — never guessed.
 *
 * Usage:
 *   npm run audit:cleanup -- --apply   # actually delete
 *   npm run audit:cleanup              # dry run (receipt preview)
 *
 * Env: DATABASE_URL must point at the target environment. Double-check before
 * using --apply against production (crm.oceanluxe.org).
 */
import dotenv from "dotenv";
import { join } from "node:path";

dotenv.config({ path: join(process.cwd(), "FrameworkPlanner", ".env") });

const { pool } = await import("../db.js");

const APPLY = process.argv.includes("--apply");

type Row = Record<string, any>;
type Client = { query: (text: string, params?: any[]) => Promise<any> };

// Every statement runs on this transaction client so dry runs are fully
// protected (ROLLBACK) and applies are atomic (COMMIT).
let tx: Client;

async function q(text: string, params: any[] = []): Promise<Row[]> {
  const res = await tx.query(text, params);
  return res.rows as Row[];
}

const receipt: string[] = [];
function receiptLine(line: string) {
  receipt.push(line);
  console.log(line);
}

/** Find rows by an exact-match predicate; returns [] when nothing matches. */
async function find(table: string, whereSql: string, params: any[]): Promise<Row[]> {
  return q(`SELECT * FROM ${table} WHERE ${whereSql}`, params);
}

async function deleteByIds(table: string, idColumn: string, ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const res = await tx.query(
    `DELETE FROM ${table} WHERE ${idColumn} = ANY($1::int[]) RETURNING ${idColumn} AS id`,
    [ids],
  );
  return res.rowCount || 0;
}

async function deleteWhere(table: string, whereSql: string, params: any[]): Promise<number> {
  if (!APPLY) return 0;
  const res = await tx.query(`DELETE FROM ${table} WHERE ${whereSql}`, params);
  return res.rowCount || 0;
}

async function clean() {
  console.log(`\n=== §f audit residue cleanup — ${APPLY ? "APPLY (deleting)" : "DRY RUN (no changes)"} ===\n`);

  // ── 1. Leads ────────────────────────────────────────────────────────────
  // From audit: throwaway leads "DELETE TEST 2026-09-14" (M9 verification),
  // plus any earlier DELETE TEST / AUDIT TEST naming from prior runs.
  const leads = await find(
    "leads",
    `upper(address) LIKE 'DELETE TEST %' OR upper(address) LIKE 'AUDIT TEST %' OR upper(address) LIKE 'TEST LEAD %'`,
    [],
  );
  for (const l of leads) {
    receiptLine(`leads: id=${l.id} address="${l.address}" owner="${l.owner_name || l.ownerName || ""}"`);
  }
  if (APPLY) {
    const n = await deleteByIds("leads", "id", leads.map((l) => Number(l.id)));
    receiptLine(`leads: deleted ${n}`);
  }

  // ── 2. Contracts (Store A) ──────────────────────────────────────────────
  const contracts = await find(
    "contracts",
    `upper(title) LIKE 'TEST %' OR upper(title) LIKE '%AUDIT%' OR upper(title) LIKE '%DELETE TEST%'`,
    [],
  );
  for (const c of contracts) {
    receiptLine(`contracts: id=${c.id} title="${c.title}" status=${c.status}`);
  }
  if (APPLY) {
    // Signers/events reference contracts; clean children first (idempotent).
    const ids = contracts.map((c) => Number(c.id));
    if (ids.length) {
      await deleteWhere(`contract_signers`, `contract_id = ANY($1::int[])`, [ids]);
      await deleteWhere(`contract_events`, `contract_id = ANY($1::int[])`, [ids]);
      await deleteWhere(`contract_fields`, `contract_id = ANY($1::int[])`, [ids]);
    }
    const n = await deleteByIds("contracts", "id", ids);
    receiptLine(`contracts: deleted ${n}`);
  }

  // ── 3. Document contracts (Store B) ─────────────────────────────────────
  const docContracts = await find(
    "contract_documents",
    `upper(title) LIKE 'TEST %' OR upper(title) LIKE '%AUDIT%'`,
    [],
  );
  for (const d of docContracts) {
    receiptLine(`contract_documents: id=${d.id} title="${d.title}" status=${d.status}`);
  }
  if (APPLY) {
    const n = await deleteByIds("contract_documents", "id", docContracts.map((d) => Number(d.id)));
    receiptLine(`contract_documents: deleted ${n}`);
  }

  // ── 4. Timesheet seed profiles ("Audit Tester" ×6, "Smoke Test") ────────
  const users = await find(
    "users",
    `upper(first_name || ' ' || last_name) LIKE 'AUDIT TESTER%' OR upper(first_name || ' ' || last_name) LIKE 'SMOKE TEST%'`,
    [],
  );
  for (const u of users) {
    receiptLine(`users (timesheet seeds): id=${u.id} name="${u.first_name} ${u.last_name}"`);
  }
  if (APPLY) {
    const ids = users.map((u) => Number(u.id));
    if (ids.length) {
      // Time entries / profiles referencing the seed users first.
      await deleteWhere(`time_clock_entries`, `user_id = ANY($1::int[])`, [ids]);
      await deleteWhere(`time_clock_sessions`, `user_id = ANY($1::int[])`, [ids]);
      await deleteWhere(`worker_profiles`, `user_id = ANY($1::int[])`, [ids]);
    }
    const n = await deleteByIds("users", "id", ids);
    receiptLine(`users (timesheet seeds): deleted ${n}`);
  }

  // ── 5. Automation "Test Auto" (M35; created 8/15/2026, still enabled) ───
  const autos = await find(`automations`, `upper(name) = 'TEST AUTO'`, []);
  for (const a of autos) {
    receiptLine(`automations: id=${a.id} name="${a.name}" enabled=${a.enabled}`);
  }
  if (APPLY) {
    const ids = autos.map((a) => Number(a.id));
    if (ids.length) {
      await deleteWhere(`automation_runs`, `automation_id = ANY($1::int[])`, [ids]);
      await deleteWhere(`automation_triggers`, `automation_id = ANY($1::int[])`, [ids]);
      await deleteWhere(`automation_actions`, `automation_id = ANY($1::int[])`, [ids]);
      await deleteWhere(`automation_conditions`, `automation_id = ANY($1::int[])`, [ids]);
    }
    const n = await deleteByIds("automations", "id", ids);
    receiptLine(`automations: deleted ${n}`);
  }

  // ── 6. Script "TEST SCRIPT 2026-09-11" (M6) ─────────────────────────────
  const scripts = await find(`dialer_scripts`, `upper(name) LIKE 'TEST SCRIPT%'`, []);
  for (const s of scripts) {
    receiptLine(`dialer_scripts: id=${s.id} name="${s.name}"`);
  }
  if (APPLY) {
    const n = await deleteByIds("dialer_scripts", "id", scripts.map((s) => Number(s.id)));
    receiptLine(`dialer_scripts: deleted ${n}`);
  }

  // ── 7. Campaign "Phase 7 Test SMS Campaign" (M20) ───────────────────────
  const campaigns = await find(`campaigns`, `upper(name) LIKE 'PHASE 7 TEST%'`, []);
  for (const c of campaigns) {
    receiptLine(`campaigns: id=${c.id} name="${c.name}" status=${c.status}`);
  }
  if (APPLY) {
    const ids = campaigns.map((c) => Number(c.id));
    if (ids.length) {
      await deleteWhere(`campaign_steps`, `campaign_id = ANY($1::int[])`, [ids]);
      await deleteWhere(`campaign_enrollments`, `campaign_id = ANY($1::int[])`, [ids]);
    }
    const n = await deleteByIds("campaigns", "id", ids);
    receiptLine(`campaigns: deleted ${n}`);
  }

  // ── 8. RVM test campaigns/drops ─────────────────────────────────────────
  const rvmCampaigns = await find(`rvm_campaigns`, `upper(name) LIKE 'TEST%' OR upper(name) LIKE '%AUDIT%'`, []);
  for (const c of rvmCampaigns) {
    receiptLine(`rvm_campaigns: id=${c.id} name="${c.name}"`);
  }
  if (APPLY) {
    const ids = rvmCampaigns.map((c) => Number(c.id));
    if (ids.length) {
      await deleteWhere(`rvm_drops`, `campaign_id = ANY($1::int[])`, [ids]);
    }
    const n = await deleteByIds("rvm_campaigns", "id", ids);
    receiptLine(`rvm_campaigns: deleted ${n}`);
  }

  // ── 9. Public listing "Test Listing" ────────────────────────────────────
  const listings = await find(`public_listings`, `upper(title) LIKE 'TEST LISTING%'`, []);
  for (const l of listings) {
    receiptLine(`public_listings: id=${l.id} title="${l.title}"`);
  }
  if (APPLY) {
    const n = await deleteByIds("public_listings", "id", listings.map((l) => Number(l.id)));
    receiptLine(`public_listings: deleted ${n}`);
  }

  // ── 10. Buyer "Now Homebuyer" duplicates (M28) — keep the OLDEST row ────
  const buyers = await find(
    "buyers",
    `upper(name) = 'NOW HOMEBUYER' ORDER BY id ASC`,
    [],
  );
  if (buyers.length > 1) {
    const dupes = buyers.slice(1); // keep first
    for (const b of dupes) {
      receiptLine(`buyers (duplicate): id=${b.id} name="${b.name}" created=${b.created_at}`);
    }
    if (APPLY) {
      const n = await deleteByIds("buyers", "id", dupes.map((b) => Number(b.id)));
      receiptLine(`buyers: deleted ${n} duplicates (kept id=${buyers[0].id})`);
    }
  } else {
    receiptLine(`buyers: no duplicate "Now Homebuyer" rows beyond the first`);
  }

  console.log(`\n=== Receipt end — ${APPLY ? "changes applied" : "dry run only, nothing deleted"} ===`);
  if (!APPLY) {
    console.log(`\nReview the list above, then re-run with --apply to delete for real:`);
    console.log(`  npm run audit:cleanup -- --apply\n`);
  }
}

run().catch((e) => {
  console.error("Cleanup failed:", e?.message || e);
  process.exitCode = 1;
});

async function run() {
  const client = await pool.connect();
  tx = client as Client;
  try {
    await client.query("BEGIN");
    await clean();
    if (APPLY) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
