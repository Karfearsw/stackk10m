import type { SkipTraceInput, SkipTraceOutput, SkipTraceProvider } from "./provider.js";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`${name} is not configured`);
  return String(v).trim();
}

function parseCostCents(): number {
  const raw = process.env.ENFORMION_COST_CENTS;
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function splitName(full: string): { firstName: string; middleName: string; lastName: string } {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] || "", middleName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0] || "", middleName: "", lastName: parts[1] || "" };
  return { firstName: parts[0] || "", middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1] || "" };
}

type Leaf = { path: string[]; value: unknown };

function walkLeaves(node: unknown, path: string[], out: Leaf[]) {
  if (node === null || node === undefined) return;
  if (typeof node !== "object") {
    out.push({ path, value: node });
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) walkLeaves(node[i], [...path, String(i)], out);
    return;
  }
  for (const [k, v] of Object.entries(node as any)) walkLeaves(v, [...path, k], out);
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

function normalizePhone(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith("+")) {
    const digits = "+" + s.slice(1).replace(/\D/g, "");
    return digits.length >= 11 ? digits : null;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return `+${digits}`;
  return null;
}

function extractFromResponse(data: unknown): { emails: string[]; phones: string[] } {
  const leaves: Leaf[] = [];
  walkLeaves(data, [], leaves);

  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

  const emailsFromEmailKeys = leaves
    .filter((l) => l.path.some((p) => /email/i.test(p)) && typeof l.value === "string")
    .flatMap((l) => String(l.value).match(emailRe) || [])
    .map(normalizeEmail);

  const emailsFallback = leaves
    .filter((l) => typeof l.value === "string")
    .flatMap((l) => String(l.value).match(emailRe) || [])
    .map(normalizeEmail);

  const emails = uniq((emailsFromEmailKeys.length ? emailsFromEmailKeys : emailsFallback).filter(Boolean)).slice(0, 10);

  const phoneish = leaves
    .filter((l) => l.path.some((p) => /phone|mobile|cell/i.test(p)) && typeof l.value === "string")
    .map((l) => String(l.value));

  const phoneishFallback = leaves
    .filter((l) => typeof l.value === "string")
    .map((l) => String(l.value))
    .filter((s) => /\d{3}.*\d{3}.*\d{4}/.test(s));

  const phoneCandidates = phoneish.length ? phoneish : phoneishFallback;
  const phones = uniq(phoneCandidates.map(normalizePhone).filter((p): p is string => !!p)).slice(0, 10);

  return { emails, phones };
}

export class EnformionGOSkipTraceProvider implements SkipTraceProvider {
  name = "enformiongo";

  async skipTrace(input: SkipTraceInput): Promise<SkipTraceOutput> {
    const baseUrl = String(process.env.ENFORMION_API_BASE_URL || "https://devapi.enformion.com").trim().replace(/\/+$/, "");
    const apName = requireEnv("ENFORMION_AP_NAME");
    const apPassword = requireEnv("ENFORMION_AP_PASSWORD");

    const ownerName = String(input.ownerName || "").trim();
    const address = String(input.address || "").trim();
    const city = String(input.city || "").trim();
    const state = String(input.state || "").trim();
    const zipCode = String(input.zipCode || "").trim();

    const { firstName, middleName, lastName } = splitName(ownerName);
    const addressLine2 = [city, state, zipCode].filter(Boolean).join(", ").replace(/,\s*,/g, ",").trim();

    const body = {
      FirstName: firstName || undefined,
      MiddleName: middleName || undefined,
      LastName: lastName || undefined,
      Address: {
        addressLine1: address || undefined,
        addressLine2: addressLine2 || undefined,
      },
      Phone: "",
      Email: "",
    };

    const res = await fetch(`${baseUrl}/Contact/Enrich`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "galaxy-ap-name": apName,
        "galaxy-ap-password": apPassword,
        "galaxy-search-type": "DevAPIContactEnrich",
      },
      body: JSON.stringify(body),
    });

    const data: any = await res.json().catch(() => ({}));
    const costCents = parseCostCents();

    if (!res.ok) {
      const msg = typeof data?.message === "string" ? data.message : "Request failed";
      return { status: "fail", phones: [], emails: [], costCents, raw: data, errorMessage: msg };
    }

    const extracted = extractFromResponse(data);
    if (!extracted.phones.length && !extracted.emails.length) {
      return { status: "fail", phones: [], emails: [], costCents, raw: data, errorMessage: "No hits found" };
    }

    return { status: "success", phones: extracted.phones, emails: extracted.emails, costCents, raw: data };
  }
}

