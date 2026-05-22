type Primitive = string | number | boolean;

export type EntityType = "lead" | "opportunity" | "buyer" | "campaign";

function toStringValue(v: Primitive) {
  return typeof v === "string" ? v : String(v);
}

export function buildUrl(path: string, params?: Record<string, Primitive | null | undefined>) {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || typeof v === "undefined") continue;
    qs.set(k, toStringValue(v));
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

export function leadUrl(leadId: number) {
  return buildUrl("/leads", { leadId });
}

export function opportunityUrl(propertyId: number) {
  return `/opportunities/${propertyId}`;
}

export function dialerUrl(input: { number?: string | null; leadId?: number | null; propertyId?: number | null }) {
  return buildUrl("/dialer", { number: input.number || undefined, leadId: input.leadId || undefined, propertyId: input.propertyId || undefined });
}

export function phoneUrl(input: { tab?: string | null; number?: string | null; leadId?: number | null; propertyId?: number | null }) {
  return buildUrl("/phone", {
    tab: input.tab || undefined,
    number: input.number || undefined,
    leadId: input.leadId || undefined,
    propertyId: input.propertyId || undefined,
  });
}

export function playgroundUrl(input: { address?: string | null; leadId?: number | null; propertyId?: number | null; sessionId?: number | null }) {
  return buildUrl("/playground", {
    address: input.address || undefined,
    leadId: input.leadId || undefined,
    propertyId: input.propertyId || undefined,
    sessionId: input.sessionId || undefined,
  });
}

export function tasksUrl(input: { relatedEntityType: EntityType; relatedEntityId: number }) {
  return buildUrl("/tasks", { relatedEntityType: input.relatedEntityType, relatedEntityId: input.relatedEntityId });
}

export function calendarUrl(input: { relatedEntityType: EntityType; relatedEntityId: number }) {
  return buildUrl("/calendar", { relatedEntityType: input.relatedEntityType, relatedEntityId: input.relatedEntityId });
}

export function todayUrl(input: { relatedEntityType: EntityType; relatedEntityId: number }) {
  return buildUrl("/today", { relatedEntityType: input.relatedEntityType, relatedEntityId: input.relatedEntityId });
}

export function getEntityFilterFromLocation(): { relatedEntityType: EntityType | null; relatedEntityId: number | null } {
  if (typeof window === "undefined") return { relatedEntityType: null, relatedEntityId: null };
  const params = new URLSearchParams(window.location.search);
  const typeRaw = String(params.get("relatedEntityType") || "").trim().toLowerCase();
  const idRaw = params.get("relatedEntityId");
  const relatedEntityId = idRaw ? parseInt(idRaw, 10) : NaN;
  const relatedEntityType =
    typeRaw === "lead" || typeRaw === "opportunity" || typeRaw === "buyer" || typeRaw === "campaign" ? (typeRaw as EntityType) : null;
  return {
    relatedEntityType,
    relatedEntityId: Number.isFinite(relatedEntityId) && relatedEntityId > 0 ? relatedEntityId : null,
  };
}

