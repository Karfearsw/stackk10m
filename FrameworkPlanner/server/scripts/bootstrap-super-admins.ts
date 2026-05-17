import { storage } from "../storage.js";

function parseEmails(raw: unknown): string[] {
  const value = typeof raw === "string" ? raw : "";
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function bootstrapSuperAdmins(): Promise<void> {
  if ((globalThis as any).__stackk_bootstrap_super_admins_ran) return;
  (globalThis as any).__stackk_bootstrap_super_admins_ran = true;

  const emails = parseEmails(process.env.BOOTSTRAP_SUPER_ADMIN_EMAILS);
  if (!emails.length) return;

  for (const email of emails) {
    try {
      const user = await storage.getUserByEmail(email);
      if (!user) {
        console.warn(`[Bootstrap] Super admin email not found: ${email}`);
        continue;
      }
      if (user.isSuperAdmin && String(user.role || "").toLowerCase() === "admin") continue;
      await storage.updateUser(user.id, { isSuperAdmin: true, role: "admin", isActive: true } as any);
      console.log(`[Bootstrap] Promoted to super admin: ${email}`);
    } catch (e: any) {
      console.error(`[Bootstrap] Super admin promotion failed for ${email}: ${String(e?.message || e)}`);
    }
  }
}

