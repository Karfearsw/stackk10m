/**
 * Manual comp entry — validation for user-entered comparable sales.
 *
 * Manual comps are REAL data the agent looked up themselves (MLS printout,
 * agent, Zillow/Redfin, county records). They are never fabricated: address,
 * at least one price signal, and the SOURCE are all required, and rows are
 * flagged is_manual so the UI can badge them and the internal pull never
 * overwrites them.
 */

export type ManualCompInput = {
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  soldPrice?: unknown;
  soldDate?: unknown;
  sqft?: unknown;
  beds?: unknown;
  baths?: unknown;
  rentPerMonth?: unknown;
  isRentalComp?: unknown;
  /** Where the number came from, e.g. "MLS", "listing agent", "Zillow". Required. */
  source?: unknown;
  notes?: unknown;
};

export type ManualCompValue = {
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  soldPrice: number | null;
  soldDate: string | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  rentPerMonth: number | null;
  isRentalComp: boolean;
  source: string;
  notes: string | null;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function validateManualCompInput(
  input: ManualCompInput,
): { ok: true; value: ManualCompValue } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const address = String(input.address || "").trim();
  if (!address) errors.push("Address is required — a comp must identify a real property.");

  const source = String(input.source || "").trim();
  if (!source) errors.push("Source is required — record where this comp came from (e.g. MLS, agent, Zillow, county records).");

  const soldPrice = num(input.soldPrice);
  const rentPerMonth = num(input.rentPerMonth);
  if (soldPrice !== null && soldPrice <= 0) errors.push("Sold price must be positive.");
  if (rentPerMonth !== null && rentPerMonth <= 0) errors.push("Monthly rent must be positive.");
  if (soldPrice === null && rentPerMonth === null) {
    errors.push("Provide at least a sold price or a monthly rent — a comp needs a price signal.");
  }

  let soldDate: string | null = null;
  const rawDate = String(input.soldDate || "").trim();
  if (rawDate) {
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) errors.push("Sold date is not a valid date.");
    else soldDate = d.toISOString().slice(0, 10);
  }

  const sqft = num(input.sqft);
  const beds = num(input.beds);
  const baths = num(input.baths);
  if (sqft !== null && (!Number.isInteger(sqft) || sqft <= 0)) errors.push("Sqft must be a positive whole number.");
  if (beds !== null && (!Number.isInteger(beds) || beds < 0)) errors.push("Beds must be a non-negative whole number.");
  if (baths !== null && baths < 0) errors.push("Baths must be non-negative.");

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      address,
      city: String(input.city || "").trim() || null,
      state: String(input.state || "").trim().toUpperCase().slice(0, 2) || null,
      zip: String(input.zip || "").trim() || null,
      soldPrice,
      soldDate,
      sqft,
      beds,
      baths,
      rentPerMonth,
      isRentalComp: input.isRentalComp === true || String(input.isRentalComp || "").toLowerCase() === "true",
      source,
      notes: String(input.notes || "").trim() || null,
    },
  };
}
