/**
 * Ticket 12 — Lead assignment engine.
 *
 * Deterministic rule evaluation: active rules are evaluated in priority_order
 * (lowest first). The first selector rule (round_robin / territory) that yields
 * an eligible candidate wins. Guards (capacity, availability, market) filter
 * candidates; a candidate failing any ACTIVE guard is skipped.
 *
 * Round-robin is deterministic without stored cursor state: among the
 * candidate pool, the agent with the fewest prior auto-assignments from that
 * rule (per assignment_log) is picked; ties break by lowest user id.
 *
 * Nothing here writes to the database — callers persist the decision.
 */
import { db } from "../db.js";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  assignmentLog,
  assignmentRules,
  leads,
  userCapacity,
  users,
} from "../shared-schema.js";
import {
  ASSIGNMENT_RULE_TYPES,
  normalizeState,
  validateRuleConfig,
  type AssignmentCandidate,
  type AssignmentDecision,
  type AssignmentRule,
  type AssignmentRuleType,
  type RoundRobinConfig,
  type TerritoryConfig,
} from "./rules.js";

export interface EngineLead {
  id: number;
  state: string | null;
  assignedTo: number | null;
}

interface GuardContext {
  capacities: Map<number, { maxLeads: number; isAvailable: boolean; markets: string[] }>;
  leadCounts: Map<number, number>;
  activeGuards: Set<AssignmentRuleType>;
}

async function loadActiveRules(): Promise<AssignmentRule[]> {
  const rows = await db
    .select()
    .from(assignmentRules)
    .where(eq(assignmentRules.isActive, true))
    .orderBy(asc(assignmentRules.priorityOrder), asc(assignmentRules.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ruleType: r.ruleType as AssignmentRuleType,
    config: (r.config || {}) as any,
    priorityOrder: r.priorityOrder,
    version: r.version,
    isActive: r.isActive,
    createdBy: r.createdBy,
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  }));
}

/** All users that could ever receive a lead: active accounts. */
async function loadAssignableUsers(): Promise<AssignmentCandidate[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.isActive, true));
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
  }));
}

async function loadGuardContext(userIds: number[], rules: AssignmentRule[]): Promise<GuardContext> {
  const capacities = new Map<number, { maxLeads: number; isAvailable: boolean; markets: string[] }>();
  if (userIds.length > 0) {
    const capRows = await db.select().from(userCapacity);
    for (const c of capRows) {
      capacities.set(c.userId, {
        maxLeads: c.maxLeads,
        isAvailable: c.isAvailable,
        markets: (c.markets || []).map((m) => String(m).toUpperCase()),
      });
    }
    // Current open-lead counts per user (leads table, not archived).
    const countRows = await db
      .select({
        userId: leads.assignedTo,
        count: sql<number>`count(*)::int`,
      })
      .from(leads)
      .where(and(sql`${leads.assignedTo} IS NOT NULL`, sql`${leads.archivedAt} IS NULL`))
      .groupBy(leads.assignedTo);
    const leadCounts = new Map<number, number>();
    for (const r of countRows) {
      if (r.userId != null) leadCounts.set(r.userId, Number(r.count) || 0);
    }
    const activeGuards = new Set<AssignmentRuleType>();
    for (const r of rules) {
      if (r.ruleType === "capacity_check" || r.ruleType === "availability_check" || r.ruleType === "market_eligibility") {
        activeGuards.add(r.ruleType);
      }
    }
    return { capacities, leadCounts, activeGuards };
  }
  return { capacities, leadCounts: new Map(), activeGuards: new Set() };
}

function candidateName(c: AssignmentCandidate): string {
  const n = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return n || c.email;
}

/** Apply active guards to a candidate list. Returns { eligible, skipped }. */
function applyGuards(
  candidates: AssignmentCandidate[],
  leadState: string,
  ctx: GuardContext,
): { eligible: AssignmentCandidate[]; skipped: Array<{ userId: number; reason: string }> } {
  const eligible: AssignmentCandidate[] = [];
  const skipped: Array<{ userId: number; reason: string }> = [];
  for (const c of candidates) {
    const cap = ctx.capacities.get(c.userId);
    if (ctx.activeGuards.has("availability_check")) {
      if (cap && !cap.isAvailable) {
        skipped.push({ userId: c.userId, reason: `${candidateName(c)} is marked unavailable` });
        continue;
      }
    }
    if (ctx.activeGuards.has("capacity_check")) {
      const max = cap?.maxLeads ?? 50;
      const current = ctx.leadCounts.get(c.userId) ?? 0;
      if (current >= max) {
        skipped.push({ userId: c.userId, reason: `${candidateName(c)} at capacity (${current}/${max})` });
        continue;
      }
    }
    if (ctx.activeGuards.has("market_eligibility") && leadState) {
      const markets = cap?.markets ?? [];
      if (markets.length > 0 && !markets.includes(leadState)) {
        skipped.push({ userId: c.userId, reason: `${candidateName(c)} does not cover ${leadState}` });
        continue;
      }
    }
    eligible.push(c);
  }
  return { eligible, skipped };
}

/** Deterministic pick: fewest prior auto-assignments from this rule, tie → lowest user id. */
async function pickRoundRobin(ruleId: number, pool: AssignmentCandidate[]): Promise<AssignmentCandidate> {
  if (pool.length === 1) return pool[0];
  const counts = new Map<number, number>();
  for (const c of pool) counts.set(c.userId, 0);
  const rows = await db
    .select({
      userId: assignmentLog.assignedToUserId,
      count: sql<number>`count(*)::int`,
    })
    .from(assignmentLog)
    .where(and(eq(assignmentLog.ruleId, ruleId), sql`${assignmentLog.assignedToUserId} IS NOT NULL`))
    .groupBy(assignmentLog.assignedToUserId);
  for (const r of rows) {
    if (r.userId != null && counts.has(r.userId)) counts.set(r.userId, Number(r.count) || 0);
  }
  let best = pool[0];
  let bestCount = counts.get(best.userId) ?? 0;
  for (const c of pool.slice(1)) {
    const n = counts.get(c.userId) ?? 0;
    if (n < bestCount || (n === bestCount && c.userId < best.userId)) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Evaluate rules for one lead. Pure decision — does not persist.
 * Set persist=false in dry-run/test mode.
 */
export async function evaluateAssignment(lead: EngineLead): Promise<AssignmentDecision> {
  const trace: AssignmentDecision["trace"] = [];
  const rules = await loadActiveRules();
  const selectors = rules.filter((r) => r.ruleType === "round_robin" || r.ruleType === "territory");

  if (selectors.length === 0) {
    return {
      assignedToUserId: null,
      ruleId: null,
      ruleName: null,
      reason: "No active selector rules (round_robin / territory). Lead left unassigned.",
      trace,
    };
  }

  const allUsers = await loadAssignableUsers();
  const byId = new Map(allUsers.map((u) => [u.userId, u]));
  const ctx = await loadGuardContext(allUsers.map((u) => u.userId), rules);
  const leadState = normalizeState(lead.state);

  for (const rule of selectors) {
    const validation = validateRuleConfig(rule.ruleType, rule.config);
    if (!validation.ok) {
      trace.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        fired: false,
        detail: `Invalid config: ${validation.error}`,
      });
      continue;
    }

    let pool: AssignmentCandidate[] = [];
    let poolDetail = "";

    if (rule.ruleType === "round_robin") {
      const cfg = rule.config as RoundRobinConfig;
      pool = cfg.userIds.map((id) => byId.get(id)).filter((u): u is AssignmentCandidate => !!u);
      poolDetail = `rotation over ${pool.length} agent(s)`;
    } else {
      // territory
      const cfg = rule.config as TerritoryConfig;
      const match = (cfg.territories || []).find((t) =>
        (t.states || []).map((s) => normalizeState(s)).includes(leadState),
      );
      if (!match) {
        trace.push({
          ruleId: rule.id,
          ruleName: rule.name,
          ruleType: rule.ruleType,
          fired: false,
          detail: `No territory covers state "${leadState || "?"}"`,
        });
        continue;
      }
      pool = (match.userIds || []).map((id) => byId.get(id)).filter((u): u is AssignmentCandidate => !!u);
      poolDetail = `territory "${match.name}" (${pool.length} agent(s))`;
    }

    if (pool.length === 0) {
      trace.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        fired: false,
        detail: `No active agents in ${poolDetail}`,
      });
      continue;
    }

    const { eligible, skipped } = applyGuards(pool, leadState, ctx);
    if (eligible.length === 0) {
      trace.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        fired: false,
        detail: `All ${pool.length} candidate(s) blocked by guards: ${skipped.map((s) => s.reason).join("; ")}`,
      });
      continue;
    }

    const winner = await pickRoundRobin(rule.id, eligible);
    const detail = `Assigned to ${candidateName(winner)} via ${poolDetail}` +
      (skipped.length > 0 ? ` (${skipped.length} blocked by guards)` : "");
    trace.push({ ruleId: rule.id, ruleName: rule.name, ruleType: rule.ruleType, fired: true, detail });
    return {
      assignedToUserId: winner.userId,
      ruleId: rule.id,
      ruleName: rule.name,
      reason: detail,
      trace,
    };
  }

  return {
    assignedToUserId: null,
    ruleId: null,
    ruleName: null,
    reason: "No selector rule produced an eligible candidate. Lead left unassigned.",
    trace,
  };
}

/** Persist an assignment decision: update lead + append to assignment_log (history preserved). */
export async function persistAssignment(
  leadId: number,
  decision: AssignmentDecision,
  assignedBy: number | null,
): Promise<void> {
  if (decision.assignedToUserId != null) {
    await db.update(leads).set({ assignedTo: decision.assignedToUserId }).where(eq(leads.id, leadId));
  }
  await db.insert(assignmentLog).values({
    leadId,
    assignedToUserId: decision.assignedToUserId,
    ruleId: decision.ruleId,
    ruleName: decision.ruleName,
    reason: assignedBy == null ? decision.reason : `Manual assignment: ${decision.reason}`,
    assignedBy,
  });
}

/** Fetch unassigned, non-archived leads (optionally limited). */
export async function getUnassignedLeads(limit = 200): Promise<EngineLead[]> {
  const rows = await db
    .select({ id: leads.id, state: leads.state, assignedTo: leads.assignedTo })
    .from(leads)
    .where(and(isNull(leads.assignedTo), isNull(leads.archivedAt)))
    .orderBy(asc(leads.id))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, state: r.state, assignedTo: r.assignedTo }));
}

export { ASSIGNMENT_RULE_TYPES };
