/**
 * server/tests/esign-audit.test.ts — SHA-256 hash-chain audit trail.
 * In-memory AuditStore; proves append -> verify, plus tamper detection
 * (payload edit, event deletion, reorder).
 */
import { describe, it, expect } from "vitest";
import {
  appendAuditEvent,
  verifyAuditChain,
  canonicalJson,
  GENESIS,
  type AuditRow,
  type AuditStore,
} from "../esign/audit.js";

function memoryStore(): AuditStore & { rows: AuditRow[] } {
  const rows: AuditRow[] = [];
  let nextId = 1;
  const store: AuditStore & { rows: AuditRow[] } = {
    rows,
    async latest(contractId: number) {
      const mine = rows.filter((r) => r.contractId === contractId);
      return mine.length ? mine[mine.length - 1] : null;
    },
    async all(contractId: number) {
      return rows.filter((r) => r.contractId === contractId);
    },
    async insert(row) {
      const full: AuditRow = { id: nextId++, ...row, createdAt: row.createdAt };
      rows.push(full);
      return full;
    },
  };
  return store;
}

describe("esign audit hash chain", () => {
  it("appends events and verifies a clean chain", async () => {
    const store = memoryStore();
    await appendAuditEvent(store, 1, "esign.envelope_created", { envelopeId: 9 });
    await appendAuditEvent(store, 1, "esign.envelope_sent", { envelopeId: 9 });
    await appendAuditEvent(store, 1, "esign.signer_signed", { envelopeId: 9, signerId: 3 });
    await appendAuditEvent(store, 1, "esign.envelope_completed", { envelopeId: 9 });

    const v = await verifyAuditChain(store, 1);
    expect(v.ok).toBe(true);
    expect(v.events).toBe(4);
    expect(v.head).toHaveLength(64);
    // chain linkage: each prev_hash equals the previous event_hash
    expect(store.rows[1].prevHash).toBe(store.rows[0].eventHash);
    expect(store.rows[3].prevHash).toBe(store.rows[2].eventHash);
    expect(store.rows[0].prevHash).toBe(GENESIS);
  });

  it("detects a tampered payload", async () => {
    const store = memoryStore();
    await appendAuditEvent(store, 2, "esign.envelope_created", { envelopeId: 9 });
    await appendAuditEvent(store, 2, "esign.signer_signed", { envelopeId: 9, signerId: 3 });

    // Attacker edits the payload of the first event in place.
    store.rows[0].payloadJson = canonicalJson({ envelopeId: 9999 });

    const v = await verifyAuditChain(store, 2);
    expect(v.ok).toBe(false);
    expect(v.brokenAtId).toBe(store.rows[0].id);
    expect(v.reason).toBe("event_hash_mismatch");
  });

  it("detects a deleted middle event", async () => {
    const store = memoryStore();
    await appendAuditEvent(store, 3, "esign.envelope_created", { envelopeId: 9 });
    await appendAuditEvent(store, 3, "esign.envelope_sent", { envelopeId: 9 });
    await appendAuditEvent(store, 3, "esign.signer_signed", { envelopeId: 9, signerId: 3 });

    // Attacker removes the middle event; the survivor's prev_hash dangles.
    store.rows.splice(1, 1);

    const v = await verifyAuditChain(store, 3);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("prev_hash_mismatch");
  });

  it("detects a reordered event", async () => {
    const store = memoryStore();
    await appendAuditEvent(store, 4, "esign.envelope_created", { envelopeId: 9 });
    await appendAuditEvent(store, 4, "esign.envelope_sent", { envelopeId: 9 });

    // Attacker swaps the two rows' positions.
    store.rows.reverse();

    const v = await verifyAuditChain(store, 4);
    expect(v.ok).toBe(false);
  });

  it("keeps chains isolated per contract", async () => {
    const store = memoryStore();
    await appendAuditEvent(store, 10, "esign.envelope_created", { a: 1 });
    await appendAuditEvent(store, 11, "esign.envelope_created", { a: 1 });
    expect((await verifyAuditChain(store, 10)).ok).toBe(true);
    expect((await verifyAuditChain(store, 11)).ok).toBe(true);
  });

  it("canonicalJson is key-order stable", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
});
