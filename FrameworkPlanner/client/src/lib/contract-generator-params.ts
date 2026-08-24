/**
 * Pure helpers for the Contract Generator (Document Management) route.
 * Keeping the URL/selection logic here lets it be unit-tested in a node
 * environment and keeps the page component deterministic.
 */

export type GeneratorParams = {
  tab: string;
  propertyId: number;
  statusIn: string[];
  templateId: string;
};

const VALID_TABS = ["list", "create", "closing", "templates", "lois"];

export function parseContractGeneratorSearch(search: string): GeneratorParams {
  const params = new URLSearchParams(search);
  const tab = params.get("tab") || "";
  const propertyIdRaw = params.get("propertyId") || "";
  const propertyId = propertyIdRaw ? parseInt(propertyIdRaw, 10) : 0;
  const status = String(params.get("status") || "").trim();
  const statusInRaw = String(params.get("statusIn") || "").trim();
  const statusIn = statusInRaw
    ? statusInRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10)
    : (status ? [status] : []);
  const templateId = String(params.get("templateId") || "").trim();
  const validTab = tab && VALID_TABS.includes(tab) ? tab : propertyId ? "create" : "";
  return {
    tab: validTab,
    propertyId: Number.isFinite(propertyId) ? propertyId : 0,
    statusIn,
    templateId,
  };
}

/**
 * Returns the search string produced by the Templates tab "Use" action:
 * the create tab is selected and the template id is persisted so the
 * selection survives a refresh and stays deep-linkable. Other params
 * (e.g. propertyId) are preserved.
 */
/**
 * Whether a template may be selected for contract generation.
 * Drafts remain usable (they carry an attorney-review warning); archived
 * templates are excluded from generation flows.
 */
export function isTemplateUsable(status: string | null | undefined): boolean {
  return String(status || "").trim().toLowerCase() !== "archived";
}

export function withTemplateSelection(search: string, templateId: string): string {
  const params = new URLSearchParams(search);
  params.set("tab", "create");
  params.set("templateId", templateId);
  return `?${params.toString()}`;
}
