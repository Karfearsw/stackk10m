/**
 * Ticket 02 — quarantine production test data (pure policy).
 *
 * Flags known test patterns by matching reviewed substrings against record
 * fields. This module only DECIDES what looks like test data; it never deletes
 * anything. The reversible flag/restore operations live in quarantine-service.ts.
 *
 * Patterns are matched case-insensitively after whitespace normalization.
 */

export const QUARANTINE_ENTITY_TYPES = ["lead", "opportunity", "contact", "buyer", "task", "user"] as const;
export type QuarantineEntityType = (typeof QUARANTINE_ENTITY_TYPES)[number];

export const QUARANTINE_FIELDS = [
  "address",
  "city",
  "ownerName",
  "name",
  "firstName",
  "lastName",
  "company",
  "email",
  "phone",
  "source",
  "notes",
] as const;
export type QuarantineField = (typeof QUARANTINE_FIELDS)[number];

export interface QuarantinePattern {
  /** Stable id used in audit records and the quarantine view. */
  id: string;
  /** Reviewed literal substring (normalized on use). */
  match: string;
  /** Human-readable reason shown in the quarantine list. */
  reason: string;
  /** Restrict matching to these fields; omit to match any scanned field. */
  fields?: QuarantineField[];
}

/**
 * Owner-reviewed pattern list from the ticket plus clearly-labelled test markers.
 * Uncertain matches remain visible for owner decision rather than being hidden.
 */
export const DEFAULT_TEST_PATTERNS: QuarantinePattern[] = [
  { id: "addr-123-test-st", match: "123 Test St", reason: "Known test address", fields: ["address"] },
  { id: "addr-999-test-way", match: "999 Test Way", reason: "Known test address", fields: ["address"] },
  { id: "name-e2e-uiaudit", match: "E2E UiAudit", reason: "E2E test artifact" },
  { id: "name-workflow-test", match: "Workflow Test", reason: "Workflow test artifact" },
  { id: "name-mike-asset", match: "Mike Asset", reason: "Seeded test record" },
  { id: "name-agent-ava", match: "Agent Ava", reason: "Seeded test record" },
  { id: "name-joe-homebuyer", match: "Joe Homebuyer", reason: "Seeded test buyer" },
];

export function normalizeForMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface QuarantineMatch {
  patternId: string;
  match: string;
  reason: string;
  field: QuarantineField | "any";
}

/**
 * Find every reviewed pattern that a record matches.
 * `record` is a loose bag of fields; only QUARANTINE_FIELDS are considered.
 */
export function scanRecordForTestPatterns(
  record: Record<string, unknown>,
  patterns: QuarantinePattern[] = DEFAULT_TEST_PATTERNS,
): QuarantineMatch[] {
  const matches: QuarantineMatch[] = [];
  for (const pattern of patterns) {
    const needle = normalizeForMatch(pattern.match);
    if (!needle) continue;
    const fields = pattern.fields && pattern.fields.length ? pattern.fields : QUARANTINE_FIELDS;
    for (const field of fields) {
      const haystack = normalizeForMatch(record[field]);
      if (!haystack) continue;
      if (haystack.includes(needle)) {
        matches.push({ patternId: pattern.id, match: pattern.match, reason: pattern.reason, field });
        break; // one match per pattern is enough
      }
    }
  }
  return matches;
}

export function isQuarantineCandidate(record: Record<string, unknown>, patterns?: QuarantinePattern[]): boolean {
  return scanRecordForTestPatterns(record, patterns).length > 0;
}

export interface QuarantineActionActor {
  id?: number | null;
  role?: string | null;
  isSuperAdmin?: boolean | null;
}

/** Restoring a false positive is an owner/authorized action. */
export function canRestoreQuarantine(user: QuarantineActionActor | null | undefined): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const role = String(user.role || "").trim().toLowerCase();
  return role === "owner" || role === "admin";
}
