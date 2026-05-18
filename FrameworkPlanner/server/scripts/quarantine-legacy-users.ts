import { storage } from "../storage.js";

function envEnabled(key: string): boolean {
  const v = String(process.env[key] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

const allowedRoles = new Set(["user", "employee", "manager", "admin", "owner"]);

export async function quarantineLegacyUsers(): Promise<void> {
  if ((globalThis as any).__stackk_quarantine_legacy_users_ran) return;
  (globalThis as any).__stackk_quarantine_legacy_users_ran = true;

  if (!envEnabled("ARCHIVE_NONSTANDARD_ROLE_USERS")) return;
  const dryRun = envEnabled("ARCHIVE_NONSTANDARD_ROLE_USERS_DRY_RUN");

  const limit = 500;
  let offset = 0;
  let matched = 0;
  let disabled = 0;

  while (true) {
    const rows = await storage.getUsers(limit, offset);
    if (!rows.length) break;

    for (const u of rows as any[]) {
      if (u?.isSuperAdmin) continue;
      const role = String(u?.role || "").trim().toLowerCase();
      if (!allowedRoles.has(role)) {
        matched += 1;
        if (!dryRun && u?.isActive !== false) {
          await storage.updateUser(Number(u.id), { isActive: false } as any);
          disabled += 1;
        }
      }
    }

    if (rows.length < limit) break;
    offset += limit;
  }

  if (matched) {
    const mode = dryRun ? "dry_run" : "enforced";
    console.log(`[Quarantine] mode=${mode} matched=${matched} disabled=${disabled}`);
  }
}

