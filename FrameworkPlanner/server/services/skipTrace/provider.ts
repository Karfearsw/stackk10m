import crypto from "node:crypto";
import { EnformionGOSkipTraceProvider } from "./enformiongo.js";

export type SkipTraceInput = {
  ownerName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

export type SkipTraceOutput =
  | {
      status: "success";
      phones: string[];
      emails: string[];
      costCents: number;
      raw: unknown;
    }
  | {
      status: "fail";
      phones: string[];
      emails: string[];
      costCents: number;
      raw: unknown;
      errorMessage: string;
    };

export interface SkipTraceProvider {
  name: string;
  skipTrace(input: SkipTraceInput): Promise<SkipTraceOutput>;
}

function parseMissRate(v: unknown): number {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function stableHash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function pickDigit(hex: string, index: number) {
  const c = hex[index % hex.length] || "0";
  const n = parseInt(c, 16);
  return Number.isFinite(n) ? n : 0;
}

export class MockSkipTraceProvider implements SkipTraceProvider {
  name = "mock";
  missRate = parseMissRate(process.env.SKIP_TRACE_MOCK_MISS_RATE);

  async skipTrace(input: SkipTraceInput): Promise<SkipTraceOutput> {
    const key = `${input.ownerName}|${input.address}|${input.city}|${input.state}|${input.zipCode}`.toLowerCase().trim();
    const h = stableHash(key);
    const r = pickDigit(h, 0) / 15;
    const costCents = 99;

    if (r < this.missRate) {
      return {
        status: "fail",
        phones: [],
        emails: [],
        costCents,
        raw: { provider: this.name, missRate: this.missRate },
        errorMessage: "No hits found",
      };
    }

    const area = 200 + pickDigit(h, 3) * 10 + pickDigit(h, 4);
    const exchange = 200 + pickDigit(h, 5) * 10 + pickDigit(h, 6);
    const line = 1000 + pickDigit(h, 7) * 100 + pickDigit(h, 8) * 10 + pickDigit(h, 9);
    const phone = `+1${area}${exchange}${line}`;

    const last = (input.ownerName.split(/\s+/).pop() || "owner").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const zip = input.zipCode.replace(/\D/g, "").slice(0, 5) || "00000";
    const email = `${last}.${zip}@example.com`;

    return {
      status: "success",
      phones: [phone],
      emails: [email],
      costCents,
      raw: { provider: this.name, hash: h },
    };
  }
}

export function getSkipTraceProvider(): SkipTraceProvider {
  const v = String(process.env.SKIP_TRACE_PROVIDER || "mock").trim().toLowerCase();
  if (v === "mock") return new MockSkipTraceProvider();
  if (v === "enformiongo" || v === "enformiongo" || v === "enformion") return new EnformionGOSkipTraceProvider();
  return new MockSkipTraceProvider();
}
