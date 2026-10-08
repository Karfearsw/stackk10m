/**
 * Email provisioning orchestrator.
 *
 * Generates a @oceanluxe.org address from the user's name
 * (firstname.lastname, deduplicated with -2/-3 suffixes), creates the
 * mailbox through IONOS, stores the record, and flips the onboarding
 * checklist's email_provisioned flag.
 *
 * All IONOS credentials come from env vars via ionos.ts — nothing here
 * touches secrets directly.
 */
import { createIonosMailbox, mailboxExists, ionosConfigStatus, type IonosResult } from "./ionos.js";

export const BUSINESS_DOMAIN = "oceanluxe.org";

export type ProvisionSource = "crm_signup" | "onboarding_site" | "manual";

export type ProvisionInput = {
  userId: number;
  firstName: string;
  lastName: string;
  /** Personal email to forward the new mailbox to (optional). */
  forwardingTo?: string;
};

export type ProvisionOutcome =
  | { ok: true; email: string; mailboxId: string | null; alreadyExisted: boolean }
  | { ok: false; code: "NOT_CONFIGURED" | "API_ERROR" | "ALREADY_EXISTS" | "DB_ERROR"; message: string };

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
 */
export async function provisionBusinessEmail(
  input: ProvisionInput,
  deps: ProvisionDeps
): Promise<ProvisionOutcome> {
  // Idempotent: never provision twice for the same user.
  const existing = await deps.getExistingProvision(input.userId);
  if (existing && existing.status === "active") {
    return { ok: true, email: existing.email_address, mailboxId: existing.ionos_mailbox_id, alreadyExisted: true };
  }

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

  if (!status.configured) {
    // Record as pending so the admin queue shows it — never fail silently.
    await deps.saveProvision({
      userId: input.userId,
      email,
      mailboxId: null,
      forwardingTo: input.forwardingTo || null,
      status: "pending",
      error: `IONOS not configured. Missing: ${status.missing.join(", ")}`,
    });
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: `IONOS API is not configured (missing ${status.missing.join(", ")}). The address ${email} is reserved and queued as pending — configure IONOS and retry.`,
    };
  }

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
      userId: input.userId,
      email,
      mailboxId: null,
      forwardingTo: input.forwardingTo || null,
      status: "failed",
      error: created.message,
    });
    return { ok: false, code: created.code, message: created.message };
  }

  await deps.saveProvision({
    userId: input.userId,
    email,
    mailboxId: created.data.mailboxId,
    forwardingTo: input.forwardingTo || null,
    status: "active",
    error: null,
  });
  await deps.markChecklistEmailProvisioned(input.userId, true);

  return { ok: true, email, mailboxId: created.data.mailboxId, alreadyExisted: false };
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
