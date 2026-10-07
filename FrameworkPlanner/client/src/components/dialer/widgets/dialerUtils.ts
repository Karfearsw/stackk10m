/**
 * Shared formatting helpers for the dialer workspace widgets.
 * (Moved verbatim out of the old monolithic dialer-workspace page.)
 */

export function formatCurrencyRange(min: any, max: any): string {
  const fmt = (v: any) => {
    const n = parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n) : null;
  };
  const a = fmt(min);
  const b = fmt(max);
  if (!a && !b) return "—";
  return `${a || "?"} – ${b || "?"}`;
}

export function formatE164(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return "+1" + digits;
  return digits;
}

export function renderDialerScript(template: string, lead: any, fallback: any) {
  const ownerName = String(lead?.ownerName || fallback?.ownerName || "").trim();
  const parts = ownerName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
  const values: Record<string, string> = {
    ownerName,
    firstName,
    lastName,
    address: String(lead?.address || fallback?.address || ""),
    city: String(lead?.city || fallback?.city || ""),
    state: String(lead?.state || fallback?.state || ""),
    phone: String(lead?.ownerPhone || fallback?.ownerPhone || ""),
  };

  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const k = String(key || "");
    return typeof values[k] === "string" ? values[k] : "";
  });
}

export const DIALER_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
