/**
 * Email forward request orchestrator — manual workflow with CRM tracking.
 *
 * IONOS has no email API and the account holds only forwards (no real
 * mailboxes), so there is nothing to call programmatically. Instead:
 *
 *  1. The CRM generates a unique firstname.lastname@oceanluxe.org
 *     address and records a forward *request* (status: requested).
 *  2. A manager creates the forward manually in the IONOS Control
 *     Panel (Email → new address → Forward), using the copy-paste
 *     values the CRM UI surfaces.
 *  3. The manager clicks "Mark Active" in the CRM. The onboarding
 *     checklist's email_provisioned flag flips to true.
 *
 * Dedup: the forward_address column is UNIQUE at the DB level, and
 * generateForwardAddress probes existing addresses before picking one.
 * The check-email endpoint consults both email_forwards and the legacy
 * provisioned_emails table so cross-system duplicates are caught.
 */
import {
  generateForwardAddress,
  candidateForwardAddresses,
  type ForwardSource,
} from "./forwards.js";

export type ForwardRequestInput = {
  userId: number;
  firstName: string;
  lastName: string;
  /** Personal email the forward should target (e.g. Gmail). Required. */
  targetEmail: string;
  source?: ForwardSource;
};

export type ForwardRequestOutcome =
  | { ok: true; forwardId: number; address: string; alreadyExisted: boolean }
  | { ok: false; code: "ALREADY_EXISTS" | "DB_ERROR" | "INVALID_INPUT"; message: string };

export type ForwardDeps = {
  addressTaken: (address: string) => Promise<boolean>;
  getForwardByUser: (userId: number) => Promise<{ id: number; forward_address: string; status: string } | null>;
  getForwardByAddress: (address: string) => Promise<{ id: number; forward_address: string; status: string } | null>;
  createForwardRequest: (row: {
    userId: number;
    address: string;
    targetEmail: string;
    source: ForwardSource;
  }) => Promise<{ id: number; forward_address: string }>;
  markChecklistEmailProvisioned: (userId: number, provisioned: boolean) => Promise<void>;
};

export type ExistingCheck = {
  found: boolean;
  /** Where the existing mailbox was found. */
  source: "local" | "ionos" | null;
  email: string | null;
  mailboxId: string | null;
};

/**
 * Request a forward for a user. Idempotent per user — if a forward
 * already exists (any status), the existing address is returned without
 * creating a duplicate request.
 */
export async function requestEmailForward(
  input: ForwardRequestInput,
  deps: ForwardDeps
): Promise<ForwardRequestOutcome> {
  const targetEmail = String(input.targetEmail || "").trim().toLowerCase();
  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return { ok: false, code: "INVALID_INPUT", message: "A valid target email address is required." };
  }

  // Idempotent: never create a second forward for the same user.
  const existing = await deps.getForwardByUser(input.userId);
  if (existing) {
    return { ok: true, forwardId: existing.id, address: existing.forward_address, alreadyExisted: true };
  }

  const address = await generateForwardAddress(input.firstName, input.lastName, deps.addressTaken);

  // Final dedup guard (race safety — UNIQUE constraint is the backstop).
  const clash = await deps.getForwardByAddress(address);
  if (clash) {
    return {
      ok: false,
      code: "ALREADY_EXISTS",
      message: `The address ${address} is already assigned. Please retry.`,
    };
  }

  try {
    const row = await deps.createForwardRequest({
      userId: input.userId,
      address,
      targetEmail,
      source: input.source || "manual",
    });
    return { ok: true, forwardId: row.id, address: row.forward_address, alreadyExisted: false };
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/unique|duplicate|already exists/i.test(msg)) {
      return {
        ok: false,
        code: "ALREADY_EXISTS",
        message: `The address ${address} is already assigned. Please retry.`,
      };
    }
    return { ok: false, code: "DB_ERROR", message: `Could not create the forward request: ${msg}` };
  }
}

/** Checklist items that must ALL be true before live-lead access. */
export const CHECKLIST_ITEMS = [
  "offer_letter_signed",
  "ica_signed",
  "w9_submitted",
  "id_verified",
  "payout_setup",
  "training_completed",
  "email_provisioned",
] as const;

export type ChecklistRow = Record<(typeof CHECKLIST_ITEMS)[number], boolean> & {
  live_lead_access_granted: boolean;
};

export function checklistComplete(row: ChecklistRow): { complete: boolean; missing: string[] } {
  const missing = CHECKLIST_ITEMS.filter((k) => !row[k]);
  return { complete: missing.length === 0, missing: missing as string[] };
}

// Re-export for the dedup endpoint, which probes candidate addresses.
export { candidateForwardAddresses };
