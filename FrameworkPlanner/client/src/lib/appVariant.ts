export type AppVariant = "crm" | "xp";

export function getAppVariant(): AppVariant {
  const envVariant = String(import.meta.env.VITE_APP_VARIANT || "").trim().toLowerCase();
  if (envVariant === "xp") return "xp";
  if (envVariant === "crm") return "crm";

  if (typeof window !== "undefined") {
    const host = String(window.location.hostname || "").trim().toLowerCase();
    if (host === "xp.oceanluxe.org" || host.startsWith("xp.")) return "xp";
  }

  return "crm";
}

