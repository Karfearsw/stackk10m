function getPathValue(obj: any, path: string) {
  const parts = String(path || "").split(".").map((p) => p.trim()).filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return "";
  }
  if (cur === null || cur === undefined) return "";
  if (typeof cur === "string" || typeof cur === "number" || typeof cur === "boolean") return String(cur);
  return "";
}

export function mergeTemplate(content: string, mergeData: any) {
  const text = String(content || "");
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, key) => getPathValue(mergeData, String(key || "")));
}

