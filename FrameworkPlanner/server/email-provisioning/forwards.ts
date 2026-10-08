/**
 * Email forward management — manual workflow with CRM tracking.
 *
 * IONOS has no email API and the account has no real mailboxes — only
 * forwards (all @oceanluxe.org → Gmail targets). There is no way to
 * programmatically create mailboxes or forwards, so this module tracks
 * forward requests through a manual creation workflow:
 *
 *   requested → pending_creation → active
 *                                   ↘ failed
 *
 * Flow:
 *  1. Manager (or signup hook) requests a forward → CRM generates the
 *     @oceanluxe.org address and records it as `requested`.
 *  2. Manager opens IONOS Control Panel → Email → creates the forward
 *     manually (copy-paste friendly values are surfaced in the UI).
 *  3. Manager clicks "Mark Active" in the CRM → status flips to `active`,
 *     the onboarding checklist's email_provisioned flag is set.
 *
 * No credentials, no API calls, no secrets — this is pure tracking.
 * Dedup is enforced at the database level (UNIQUE on forward_address)
 * and checked in code before creating a request.
 */

export const BUSINESS_DOMAIN = "oceanluxe.org";

/** Forward lifecycle states. */
export type ForwardStatus = "requested" | "pending_creation" | "active" | "failed";

/** Where the forward request originated. */
export type ForwardSource = "crm_signup" | "onboarding_site" | "manual";

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
 * request flow would try them (base, base-2, base-3, ...). Used by the
 * dedup check so both the CRM and the onboarding site can ask "does this
 * person already have an address?" without knowing which suffix was used.
 */
export function candidateForwardAddresses(firstName: string, lastName: string, max = 6): string[] {
  const first = slug(firstName) || "agent";
  const last = slug(lastName) || "oceanluxe";
  const base = `${first}.${last}`;
  const out = [`${base}@${BUSINESS_DOMAIN}`];
  for (let n = 2; n <= max; n++) out.push(`${base}-${n}@${BUSINESS_DOMAIN}`);
  return out;
}

/**
 * Generate a unique @oceanluxe.org forward address. `addressTaken` is a
 * callback the caller wires to the database so this stays
 * storage-agnostic.
 */
export async function generateForwardAddress(
  firstName: string,
  lastName: string,
  addressTaken: (address: string) => Promise<boolean>
): Promise<string> {
  const first = slug(firstName) || "agent";
  const last = slug(lastName) || "oceanluxe";
  const base = `${first}.${last}`;
  let candidate = `${base}@${BUSINESS_DOMAIN}`;
  let n = 2;
  while (await addressTaken(candidate)) {
    candidate = `${base}-${n}@${BUSINESS_DOMAIN}`;
    n += 1;
    if (n > 99) throw new Error("Could not generate a unique forward address.");
  }
  return candidate;
}

/**
 * Human-readable IONOS instructions for creating a forward manually.
 * Shown in the CRM UI next to each pending forward.
 */
export const IONOS_FORWARD_STEPS = [
  "Sign in to the IONOS Control Panel",
  "Go to Email in the main navigation",
  "Click \"Set up a new email address\" → choose \"Forward\"",
  "Paste the forward address and target email below",
  "Save, then click \"Mark Active\" in the CRM",
] as const;
