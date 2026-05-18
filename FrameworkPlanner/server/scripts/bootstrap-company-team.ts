import crypto from "node:crypto";
import { storage } from "../storage.js";

function envEnabled(key: string): boolean {
  const v = String(process.env[key] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function normalizeName(v: unknown): string {
  return String(v || "").trim().toLowerCase();
}

function parseEmails(raw: unknown): string[] {
  const value = typeof raw === "string" ? raw : "";
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function makeInviteCode() {
  return crypto.randomBytes(6).toString("hex");
}

function desiredCompanyRole(user: any): "owner" | "admin" | "member" {
  if (user?.isSuperAdmin) return "owner";
  const role = String(user?.role || "").trim().toLowerCase();
  if (role === "admin" || role === "manager" || role === "owner") return "admin";
  return "member";
}

export async function bootstrapCompanyTeam(): Promise<void> {
  if ((globalThis as any).__stackk_bootstrap_company_team_ran) return;
  (globalThis as any).__stackk_bootstrap_company_team_ran = true;

  if (!envEnabled("COMPANY_TEAM_AUTO_ENROLL")) return;

  const teamName = String(process.env.COMPANY_TEAM_NAME || "").trim();
  if (!teamName) return;

  const dryRun = envEnabled("COMPANY_TEAM_AUTO_ENROLL_DRY_RUN");
  const ownerEmailRaw =
    String(process.env.COMPANY_TEAM_OWNER_EMAIL || "").trim().toLowerCase() ||
    parseEmails(process.env.BOOTSTRAP_SUPER_ADMIN_EMAILS)[0] ||
    "";
  if (!ownerEmailRaw) return;

  const ownerUser = await storage.getUserByEmail(ownerEmailRaw);
  if (!ownerUser) {
    console.warn(`[CompanyTeam] Owner email not found: ${ownerEmailRaw}`);
    return;
  }

  const teams = await storage.getTeams();
  let team = teams.find((t: any) => normalizeName(t?.name) === normalizeName(teamName));

  let createdTeam = false;
  if (!team && !dryRun) {
    team = await storage.createTeam({
      name: teamName,
      description: null as any,
      ownerId: ownerUser.id,
      inviteCode: makeInviteCode(),
      isActive: true,
    } as any);
    createdTeam = true;
  }
  if (!team) return;

  const teamId = Number((team as any).id);
  if (!Number.isFinite(teamId)) return;

  if (createdTeam) {
    await storage.createTeamMember({
      teamId,
      userId: ownerUser.id,
      role: "owner",
      permissions: null as any,
      invitedBy: ownerUser.id,
      joinedAt: new Date(),
      status: "active",
    } as any);
    await storage.createTeamActivityLog({
      teamId,
      userId: ownerUser.id,
      action: "team_created",
      description: `${ownerUser.email} created team ${teamName}`,
      metadata: JSON.stringify({ teamId, source: "bootstrap" }),
    } as any);
  }

  const limit = 500;
  let offset = 0;
  let ensured = 0;
  let reactivated = 0;
  let roleUpdated = 0;

  while (true) {
    const users = await storage.getUsers(limit, offset);
    if (!users.length) break;

    for (const u of users as any[]) {
      if (!u?.isActive) continue;
      const userId = Number(u.id);
      if (!Number.isFinite(userId)) continue;

      const desiredRole = desiredCompanyRole(u);
      const existing = await storage.getTeamMemberByTeamAndUser(teamId, userId);

      if (!existing) {
        ensured += 1;
        if (!dryRun) {
          await storage.createTeamMember({
            teamId,
            userId,
            role: desiredRole,
            permissions: null as any,
            invitedBy: ownerUser.id,
            joinedAt: new Date(),
            status: "active",
          } as any);
        }
        continue;
      }

      const status = String((existing as any).status || "").toLowerCase();
      const currentRole = String((existing as any).role || "").toLowerCase();

      if (status !== "active") {
        reactivated += 1;
        if (!dryRun) {
          await storage.updateTeamMember(Number((existing as any).id), { status: "active", joinedAt: new Date() } as any);
        }
      }

      if (currentRole !== desiredRole) {
        roleUpdated += 1;
        if (!dryRun) {
          await storage.updateTeamMember(Number((existing as any).id), { role: desiredRole } as any);
        }
      }
    }

    if (users.length < limit) break;
    offset += limit;
  }

  const changed = ensured + reactivated + roleUpdated;
  if (changed && !dryRun) {
    await storage.createTeamActivityLog({
      teamId,
      userId: ownerUser.id,
      action: "bulk_enroll",
      description: `Company team enrollment updated`,
      metadata: JSON.stringify({ teamId, ensured, reactivated, roleUpdated }),
    } as any);
  }

  if (changed) {
    const mode = dryRun ? "dry_run" : "enforced";
    console.log(`[CompanyTeam] mode=${mode} teamId=${teamId} ensured=${ensured} reactivated=${reactivated} roleUpdated=${roleUpdated}`);
  }
}

