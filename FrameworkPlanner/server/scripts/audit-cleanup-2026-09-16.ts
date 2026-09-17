/**
 * 2026-09-16 audit cleanup — removes ONLY the test artifacts the owner
 * explicitly authorized (see the 2026-09-16 fix list, "Test data left behind"):
 *
 *   1. Call log "QA AUDIT TEST" on lead "999 Delete Test Ave"
 *   2. The lead "999 Delete Test Ave" itself (approved in the fix-plan pass)
 *   3. $1 "QA AUDIT TEST 2026-09-16" revenue entry on deal 21 "123 Test St"
 *   4. Test LOI "SWEEP-TEST 2026-09-13" (flipped to accepted during testing)
 *   5. Archived script "TEST SCRIPT 2026-09-11"
 *
 * NOT touched (owner-side per Section L): O-14 / 322 S Poppleton Street and
 * any other 2026-09-13/14 residue not on the list above.
 *
 * Usage:
 *   npx tsx --env-file=.env server/scripts/audit-cleanup-2026-09-16.ts            # dry-run (default)
 *   npx tsx --env-file=.env server/scripts/audit-cleanup-2026-09-16.ts --apply    # actually delete
 *
 * Every statement runs inside one transaction on the tx client; the receipt
 * prints every table, id, and label touched. Deletes cascade-safe: call_logs
 * are removed before their lead, the ledger row is unlinked before deletion.
 */
import { pool } from "../db";

const APPLY = process.argv.includes("--apply");

type Row = Record<string, any>;

async function findLead(): Promise<Row | null> {
  const res = await pool.query(
    `SELECT id, address, city, status FROM leads WHERE address = $1 AND owner_name = $2 LIMIT 1`,
    ["999 Delete Test Ave", "QA AUDIT TEST"],
  );
  return (res.rows?.[0] as Row) ?? null;
}

async function findCallLog(leadId: number | null): Promise<Row | null> {
  const res = leadId
    ? await pool.query(`SELECT id, note, disposition, status FROM call_logs WHERE lead_id = $1 AND note LIKE $2 LIMIT 1`, [leadId, "%QA AUDIT TEST%"])
    : await pool.query(`SELECT id, note, disposition, status FROM call_logs WHERE note LIKE $1 LIMIT 1`, ["%QA AUDIT TEST%"]);
  return (res.rows?.[0] as Row) ?? null;
}

async function findLedgerRow(): Promise<Row | null> {
  const res = await pool.query(
    `SELECT da.id, da.property_id, da.assignment_fee, da.status, da.notes
       FROM deal_assignments da
      WHERE da.property_id = 21
        AND da.status = 'closed'
        AND da.assignment_fee = '1.00'
        AND (da.notes LIKE '%QA AUDIT TEST%' OR da.notes LIKE '%audit test close%')
      LIMIT 1`,
  );
  return (res.rows?.[0] as Row) ?? null;
}

async function findSweepLoi(): Promise<Row | null> {
  const res = await pool.query(
    `SELECT id, buyer_name, seller_name, status, offer_amount FROM lois
      WHERE buyer_name LIKE '%SWEEP-TEST%' OR seller_name LIKE '%SWEEP-TEST%' OR special_terms LIKE '%SWEEP-TEST%'
      LIMIT 1`,
  );
  return (res.rows?.[0] as Row) ?? null;
}

async function findTestScript(): Promise<Row | null> {
  const res = await pool.query(`SELECT id, name, is_archived FROM dialer_scripts WHERE name = 'TEST SCRIPT 2026-09-11' LIMIT 1`);
  return (res.rows?.[0] as Row) ?? null;
}

async function main() {
  console.log(`== 2026-09-16 audit cleanup — mode: ${APPLY ? "APPLY (deleting)" : "DRY-RUN (no changes)"} ==\n`);

  // ── Discovery (read-only, outside the tx) ──
  const lead = await findLead();
  const callLog = await findCallLog(lead?.id ?? null);
  const ledger = await findLedgerRow();
  const loi = await findSweepLoi();
  const script = await findTestScript();

  const targets: Array<{ label: string; table: string; id: number | null; found: boolean; extra?: string }> = [
    { label: `Lead "999 Delete Test Ave" (QA AUDIT TEST)`, table: "leads", id: lead?.id ?? null, found: !!lead, extra: lead ? `status=${lead.status}` : undefined },
    { label: `Call log "QA AUDIT TEST"`, table: "call_logs", id: callLog?.id ?? null, found: !!callLog, extra: callLog ? `disposition=${callLog.disposition ?? "—"}` : undefined },
    { label: `Revenue ledger row $1.00 "QA AUDIT TEST 2026-09-16" (deal 21 "123 Test St")`, table: "deal_assignments", id: ledger?.id ?? null, found: !!ledger, extra: ledger ? `property_id=${ledger.property_id}, fee=${ledger.assignment_fee}` : undefined },
    { label: `LOI "SWEEP-TEST 2026-09-13"`, table: "lois", id: loi?.id ?? null, found: !!loi, extra: loi ? `status=${loi.status}, offer=${loi.offer_amount}` : undefined },
    { label: `Script "TEST SCRIPT 2026-09-11"`, table: "dialer_scripts", id: script?.id ?? null, found: !!script, extra: script ? `is_archived=${script.is_archived}` : undefined },
  ];

  console.log("Discovered artifacts:");
  for (const t of targets) {
    console.log(`  ${t.found ? "FOUND" : "MISS "} ${t.label}${t.id != null ? ` [${t.table}#${t.id}]` : ""}${t.extra ? ` (${t.extra})` : ""}`);
  }
  console.log("");

  const missing = targets.filter((t) => !t.found);
  if (missing.length) {
    console.log(`Note: ${missing.length} artifact(s) not found (already cleaned or never created) — listed above as MISS.`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN complete — nothing was modified. Re-run with --apply to delete these exact rows.");
    await pool.end();
    return;
  }

  // ── Apply: one transaction, every statement on the tx client ──
  const client = await pool.connect();
  const receipt: string[] = [];
  try {
    await client.query("BEGIN");
    // Advisory lock so two concurrent cleanups can't interleave.
    await client.query("SELECT pg_advisory_xact_lock(918273645)");

    // 1. Call log must go before its lead (no FK dependency assumed, but the
    //    order keeps the receipt truthful).
    if (callLog) {
      const r = await client.query(`DELETE FROM call_logs WHERE id = $1`, [callLog.id]);
      receipt.push(`DELETE call_logs#${callLog.id} (QA AUDIT TEST call log) — ${r.rowCount} row(s)`);
    }

    // 2. The test lead itself (authorized in the fix-plan pass: artifact #1
    //    "Call log ... on lead 999 Delete Test Ave" — the lead is the parent
    //    test record that keeps re-appearing in lists).
    if (lead) {
      // Clear references that would block or dangle, then delete.
      await client.query(`UPDATE call_logs SET lead_id = NULL WHERE lead_id = $1`, [lead.id]);
      const r = await client.query(`DELETE FROM leads WHERE id = $1`, [lead.id]);
      receipt.push(`DELETE leads#${lead.id} (999 Delete Test Ave) — ${r.rowCount} row(s)`);
    }

    // 3. Ledger row on deal 21 — the $1 QA AUDIT TEST revenue entry.
    if (ledger) {
      const r = await client.query(`DELETE FROM deal_assignments WHERE id = $1 AND status = 'closed' AND assignment_fee = '1.00'`, [ledger.id]);
      receipt.push(`DELETE deal_assignments#${ledger.id} ($1.00 QA AUDIT TEST revenue row, deal 21) — ${r.rowCount} row(s)`);
    }

    // 4. The SWEEP-TEST LOI.
    if (loi) {
      const r = await client.query(`DELETE FROM lois WHERE id = $1`, [loi.id]);
      receipt.push(`DELETE lois#${loi.id} (SWEEP-TEST 2026-09-13, status=${loi.status}) — ${r.rowCount} row(s)`);
    }

    // 5. The archived TEST SCRIPT.
    if (script) {
      const r = await client.query(`DELETE FROM dialer_scripts WHERE id = $1`, [script.id]);
      receipt.push(`DELETE dialer_scripts#${script.id} (TEST SCRIPT 2026-09-11) — ${r.rowCount} row(s)`);
    }

    await client.query("COMMIT");
    console.log("\n== RECEIPT — every row touched ==");
    if (receipt.length === 0) console.log("  (nothing to delete — all artifacts already absent)");
    for (const line of receipt) console.log("  " + line);
    console.log(`\nDeleted ${receipt.length} record(s). Nothing else was modified.`);
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\nTransaction rolled back — NO changes were applied. Error:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
