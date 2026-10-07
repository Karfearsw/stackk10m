/**
 * server/esign/audit.ts — SHA-256 hash-chain audit trail over contract_events.
 *
 * Each event stores:
 *   event_hash = sha256(prev_hash || canonical_json({event_type, payload, created_at}))
 *   prev_hash  = event_hash of the previous event for this contract (or "GENESIS")
 *
 * Any tampering (edit, delete, reorder, re-insert) breaks the chain and is
 * detected by verifyAuditChain(). The chain is append-only: this module never
 * updates or deletes rows.
 */
import crypto from "node:crypto";

export interface AuditRow {
  id: number;
  contractId: number;
  eventType: string;
  payloadJson: string;
  ip: string | null;
  userAgent: string | null;
  actorType: string;
  actorUserId: number | null;
  actorContactId: number | null;
  createdAt: Date;
  eventHash: string | null;
  prevHash: string | null;
}

export interface AuditStore {
  /** Latest event (highest id) for the contract, or null. */
  latest(contractId: number): Promise<AuditRow | null>;
  /** All events for the contract in id order. */
  all(contractId: number): Promise<AuditRow[]>;
  /** Insert a new event row. The store MUST persist createdAt exactly as given
   *  (the hash covers it); returns the row with id populated. */
  insert(row: {
    contractId: number;
    eventType: string;
    payloadJson: string;
    ip: string | null;
    userAgent: string | null;
    actorType: string;
    actorUserId: number | null;
    actorContactId: number | null;
    eventHash: string;
    prevHash: string;
    createdAt: Date;
  }): Promise<AuditRow>;
}

export const GENESIS = "GENESIS";

/** Stable canonical JSON: sorted keys, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashEvent(prevHash: string, eventType: string, payloadJson: string, createdAtIso: string): string {
  return crypto
    .createHash("sha256")
    .update(`${prevHash}|${eventType}|${payloadJson}|${createdAtIso}`, "utf8")
    .digest("hex");
}

export async function appendAuditEvent(
  store: AuditStore,
  contractId: number,
  eventType: string,
  payload: unknown,
  opts: {
    actorType?: string;
    actorUserId?: number | null;
    actorContactId?: number | null;
    ip?: string | null;
    userAgent?: string | null;
  } = {}
): Promise<AuditRow> {
  const latest = await store.latest(contractId);
  const prevHash = latest?.eventHash || GENESIS;
  const payloadJson = canonicalJson(payload ?? {});
  // createdAt is chosen here and persisted verbatim by the store so the hash
  // covers the exact timestamp stored in the row.
  const createdAt = new Date();
  const eventHash = hashEvent(prevHash, eventType, payloadJson, createdAt.toISOString());
  return store.insert({
    contractId,
    eventType,
    payloadJson,
    ip: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
    actorType: opts.actorType ?? "system",
    actorUserId: opts.actorUserId ?? null,
    actorContactId: opts.actorContactId ?? null,
    eventHash,
    prevHash,
    createdAt,
  });
}

export interface ChainVerification {
  ok: boolean;
  events: number;
  head: string | null;
  /** id of the first event that fails verification, when tampering is found */
  brokenAtId?: number;
  reason?: string;
}

export async function verifyAuditChain(store: AuditStore, contractId: number): Promise<ChainVerification> {
  const events = await store.all(contractId);
  // Only chained (v2) rows participate; legacy rows without hashes are skipped
  // but counted, so a mixed history still verifies its chained tail.
  const chained = events.filter((e) => e.eventHash);
  let prev = GENESIS;
  for (const e of chained) {
    if (e.prevHash !== prev) {
      return { ok: false, events: events.length, head: chainedHead(chained), brokenAtId: e.id, reason: "prev_hash_mismatch" };
    }
    const recomputed = hashEvent(e.prevHash!, e.eventType, e.payloadJson, toIso(e.createdAt));
    if (recomputed !== e.eventHash) {
      return { ok: false, events: events.length, head: chainedHead(chained), brokenAtId: e.id, reason: "event_hash_mismatch" };
    }
    prev = e.eventHash!;
  }
  return { ok: true, events: events.length, head: chained.length ? chained[chained.length - 1].eventHash! : null };
}

function chainedHead(chained: AuditRow[]): string | null {
  return chained.length ? chained[chained.length - 1].eventHash! : null;
}

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
