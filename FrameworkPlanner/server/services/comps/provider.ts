import crypto from "node:crypto";

export type CompRecord = {
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  soldDate: string;
  distance: number;
  status: "sold" | "active";
};

export interface CompProvider {
  name: string;
  getComps(input: { address: string; city: string; state: string; zipCode: string }): Promise<{ comps: CompRecord[]; raw: unknown }>;
}



// Comps come from the app's own properties table (real sold/rented records
// via /api/opportunities/:id/comps/pull); no external fabricator exists.
// The former MockCompProvider (hash-seeded fake prices) has been deleted.
export function getCompProvider(): CompProvider {
  throw new Error(
    "No external comps provider is configured. Comps are computed from real sold/rented properties in the database via POST /api/opportunities/:id/comps/pull.",
  );
}

