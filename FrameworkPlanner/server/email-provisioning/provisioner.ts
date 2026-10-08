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
import { createIonosMailbox, ionosConfigStatus, type IonosResult } from "./ionos.js";

export const BUSINESS_DOMAIN = "oceanluxe.org";

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
  saveProvision: (row: {
    userId: number;
    email: string;
    mailboxId: string | null;
    forwardingTo: string | null;
    status: "pending" | "active" | "failed";
    error?: string | null;
  }) => Promise<void>;
  markChecklistEmailProvisioned: (userId: number, provisioned: boolean) => Promise<void>;
};

/**
 * Full provisioning flow. Safe to retry — if a provisioned_emails row
 * already exists for the user, it returns the existing address without
 * creating a duplicate mailbox.
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
