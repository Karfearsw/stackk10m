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
<<<<<<< HEAD
import { createIonosMailbox, mailboxExists, ionosConfigStatus, type IonosResult } from "./ionos.js";

export const BUSINESS_DOMAIN = "oceanluxe.org";

export type ProvisionSource = "crm_signup" | "onboarding_site" | "manual";

export type ProvisionInput = {
=======
import {
  generateForwardAddress,
  candidateForwardAddresses,
  type ForwardSource,
} from "./forwards.js";

export type ForwardRequestInput = {
>>>>>>> d4b2c77270ac3c11b2266c659729b0b8a2e01cae
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

<<<<<<< HEAD
function slug(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30);
}

/**
 * Candidate @oceanluxe.org addresses for a name, in the order the
 * provisioner would try them (base, base-2, base-3, ...). Used by the
 * cross-system dedup check so both the CRM and the onboarding site can
 * ask "does this person already have an address?" without knowing which
 * suffix was used.
 */
export function candidateEmails(firstName: string, lastName: string, max = 6): string[] {
  const first = slug(firstName) || "agent";
  const last = slug(lastName) || "oceanluxe";
  const base = `${first}.${last}`;
  const out = [`${base}@${BUSINESS_DOMAIN}`];
  for (let n = 2; n <= max; n++) out.push(`${base}-${n}@${BUSINESS_DOMAIN}`);
  return out;
}

/**
 * Generate a unique @oceanluxe.org address. `emailTaken` is a callback
 * the caller wires to the database so this stays storage-agnostic.
 */
export async function generateBusinessEmail(
  firstName: string,
  lastName: string,
  emailTaken: (email: string) => Promise<boolean>
): Promise<string> {
  const first = slug(firstName) || "agent";
  const last = slug(lastName) || "oceanluxe";
  const base = `${first}.${last}`;
  let candidate = `${base}@${BUSINESS_DOMAIN}`;
  let n = 2;
  while (await emailTaken(candidate)) {
    candidate = `${base}-${n}@${BUSINESS_DOMAIN}`;
    n += 1;
    if (n > 99) throw new Error("Could not generate a unique business email address.");
  }
  return candidate;
}

/** Generate a strong random mailbox password (shown once to the admin). */
export function generateMailboxPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  const buf = new Uint32Array(16);
  // Node 20+: crypto.getRandomValues is available globally.
  crypto.getRandomValues(buf);
  for (const v of buf) out += chars[v % chars.length];
  return out;
}

export type ProvisionDeps = {
  emailTaken: (email: string) => Promise<boolean>;
  getExistingProvision: (userId: number) => Promise<{ email_address: string; status: string; ionos_mailbox_id: string | null } | null>;
  getProvisionByEmail: (email: string) => Promise<{ email_address: string; status: string; ionos_mailbox_id: string | null } | null>;
  saveProvision: (row: {
    userId: number;
    email: string;
    mailboxId: string | null;
    forwardingTo: string | null;
    status: "pending" | "active" | "failed";
    error?: string | null;
  }) => Promise<void>;
  /** Link a mailbox that already exists in IONOS (e.g. created via the onboarding site). */
  linkExternalProvision: (row: {
    userId: number;
    email: string;
    mailboxId: string | null;
    forwardingTo: string | null;
    source: ProvisionSource;
  }) => Promise<void>;
=======
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
>>>>>>> d4b2c77270ac3c11b2266c659729b0b8a2e01cae
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
<<<<<<< HEAD
 * Cross-system dedup check for a single address. Consults the local
 * provisioned_emails table first, then IONOS directly (the onboarding
 * site can create mailboxes outside the CRM). Never throws — an
 * unreachable IONOS API is treated as "unknown", not "absent", so a
 * failed read never causes a duplicate write.
 */
export async function checkExistingMailbox(
  email: string,
  deps: Pick<ProvisionDeps, "getProvisionByEmail">
): Promise<ExistingCheck> {
  const key = String(email || "").toLowerCase().trim();
  if (!key) return { found: false, source: null, email: null, mailboxId: null };
  const local = await deps.getProvisionByEmail(key);
  if (local) {
    return { found: true, source: "local", email: local.email_address, mailboxId: local.ionos_mailbox_id };
  }
  const status = ionosConfigStatus();
  if (!status.configured) {
    return { found: false, source: null, email: null, mailboxId: null };
  }
  const r = await mailboxExists(key);
  if (!r.ok || !r.data.exists) {
    return { found: false, source: null, email: null, mailboxId: null };
  }
  return { found: true, source: "ionos", email: key, mailboxId: r.data.mailboxId };
}

/**
 * Full provisioning flow. Safe to retry and safe across systems:
 * - If a provisioned_emails row already exists for the user, the existing
 *   address is returned without creating a duplicate mailbox.
 * - If the generated address already exists in IONOS (e.g. created via
 *   the onboarding site), the existing mailbox is linked instead of
 *   creating a duplicate.
 * - If IONOS reports ALREADY_EXISTS on create (race), the existing
 *   mailbox is linked rather than failing.
=======
 * Request a forward for a user. Idempotent per user — if a forward
 * already exists (any status), the existing address is returned without
 * creating a duplicate request.
>>>>>>> d4b2c77270ac3c11b2266c659729b0b8a2e01cae
 */
export async function requestEmailForward(
  input: ForwardRequestInput,
  deps: ForwardDeps
): Promise<ForwardRequestOutcome> {
  const targetEmail = String(input.targetEmail || "").trim().toLowerCase();
  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return { ok: false, code: "INVALID_INPUT", message: "A valid target email address is required." };
  }

<<<<<<< HEAD
  const email = existing?.email_address || (await generateBusinessEmail(input.firstName, input.lastName, deps.emailTaken));

  // Cross-system dedup: the mailbox may already exist in IONOS without a
  // local record (created via the onboarding site). Link it instead of
  // creating a duplicate.
  const crossCheck = await checkExistingMailbox(email, deps);
  if (crossCheck.found && crossCheck.source === "ionos") {
    await deps.linkExternalProvision({
      userId: input.userId,
      email: crossCheck.email!,
      mailboxId: crossCheck.mailboxId,
      forwardingTo: input.forwardingTo || null,
      source: "onboarding_site",
    });
    await deps.markChecklistEmailProvisioned(input.userId, true);
    return { ok: true, email: crossCheck.email!, mailboxId: crossCheck.mailboxId, alreadyExisted: true };
  }

  const status = ionosConfigStatus();
=======
  // Idempotent: never create a second forward for the same user.
  const existing = await deps.getForwardByUser(input.userId);
  if (existing) {
    return { ok: true, forwardId: existing.id, address: existing.forward_address, alreadyExisted: true };
  }
>>>>>>> d4b2c77270ac3c11b2266c659729b0b8a2e01cae

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

<<<<<<< HEAD
  const password = generateMailboxPassword();
  const created: IonosResult<{ mailboxId: string; email: string }> = await createIonosMailbox({
    email,
    password,
    firstName: input.firstName,
    lastName: input.lastName,
    forwardingTo: input.forwardingTo,
  });

  if (!created.ok) {
    // Race safety: if IONOS says the mailbox already exists (created
    // concurrently, e.g. by the onboarding site), link it instead of
    // failing or creating a duplicate.
    if (created.code === "ALREADY_EXISTS") {
      const recheck = await mailboxExists(email);
      const mailboxId = recheck.ok && recheck.data.exists ? recheck.data.mailboxId : null;
      await deps.linkExternalProvision({
        userId: input.userId,
        email,
        mailboxId,
        forwardingTo: input.forwardingTo || null,
        source: "onboarding_site",
      });
      await deps.markChecklistEmailProvisioned(input.userId, true);
      return { ok: true, email, mailboxId, alreadyExisted: true };
    }
    await deps.saveProvision({
=======
  try {
    const row = await deps.createForwardRequest({
>>>>>>> d4b2c77270ac3c11b2266c659729b0b8a2e01cae
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
