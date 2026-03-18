import crypto from "node:crypto";

export type RvmDropRequest = {
  audioAssetId: number;
  toNumbers: string[];
};

export type RvmDropStatus = "queued" | "sending" | "sent" | "failed";

export type RvmDropResult = {
  toNumber: string;
  status: RvmDropStatus;
  providerId?: string | null;
  error?: string | null;
};

export interface RvmProvider {
  name: string;
  requestDrops(input: RvmDropRequest): Promise<RvmDropResult[]>;
  pollStatuses(providerIds: string[]): Promise<Record<string, { status: RvmDropStatus; error?: string | null }>>;
}

function stableHash(v: string) {
  return crypto.createHash("sha256").update(v).digest("hex");
}

export class MockRvmProvider implements RvmProvider {
  name = "mock";

  async requestDrops(input: RvmDropRequest): Promise<RvmDropResult[]> {
    return input.toNumbers.map((toNumber) => {
      const h = stableHash(`${input.audioAssetId}|${toNumber}`);
      const providerId = `mock_${h.slice(0, 20)}`;
      return { toNumber, status: "sent", providerId };
    });
  }

  async pollStatuses(providerIds: string[]): Promise<Record<string, { status: RvmDropStatus; error?: string | null }>> {
    const out: Record<string, { status: RvmDropStatus; error?: string | null }> = {};
    for (const id of providerIds) out[id] = { status: "sent" };
    return out;
  }
}

export function getRvmProvider(): RvmProvider {
  const v = String(process.env.RVM_PROVIDER || "mock").trim().toLowerCase();
  if (v === "mock") return new MockRvmProvider();
  return new MockRvmProvider();
}

