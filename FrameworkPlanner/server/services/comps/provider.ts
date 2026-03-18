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

function stableHash(v: string) {
  return crypto.createHash("sha256").update(v).digest("hex");
}

function pick(hex: string, i: number) {
  const c = hex[i % hex.length] || "0";
  const n = parseInt(c, 16);
  return Number.isFinite(n) ? n : 0;
}

export class MockCompProvider implements CompProvider {
  name = "mock";

  async getComps(input: { address: string; city: string; state: string; zipCode: string }) {
    const key = `${input.address}|${input.city}|${input.state}|${input.zipCode}`.toLowerCase().trim();
    const h = stableHash(key);
    const basePrice = 180000 + pick(h, 0) * 5000 + pick(h, 1) * 1000;
    const baseBeds = 2 + (pick(h, 2) % 4);
    const baseBaths = 1 + (pick(h, 3) % 3);
    const baseSqft = 900 + pick(h, 4) * 100 + pick(h, 5) * 10;

    const comps: CompRecord[] = [];
    for (let i = 0; i < 8; i++) {
      const delta = (pick(h, 6 + i) - 7) * 3000;
      const price = Math.max(50000, basePrice + delta);
      const beds = Math.max(1, baseBeds + ((pick(h, 10 + i) % 3) - 1));
      const baths = Math.max(1, baseBaths + ((pick(h, 14 + i) % 3) - 1));
      const sqft = Math.max(500, baseSqft + ((pick(h, 18 + i) - 7) * 30));
      const distance = Math.round((0.2 + (pick(h, 22 + i) / 15) * 1.8) * 100) / 100;
      const soldDate = new Date(Date.now() - (i + 1) * 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10);
      const status: any = i < 6 ? "sold" : "active";
      comps.push({ price, beds, baths, sqft, distance, soldDate, status });
    }
    return { comps, raw: { provider: this.name, hash: h } };
  }
}

export function getCompProvider(): CompProvider {
  const v = String(process.env.COMP_PROVIDER || "mock").trim().toLowerCase();
  if (v === "mock") return new MockCompProvider();
  return new MockCompProvider();
}

