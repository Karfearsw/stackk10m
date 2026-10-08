/**
 * Ticket 12 — Lead assignment rule types.
 *
 * Rules are evaluated in priority_order (lowest first). Two kinds:
 *  - selectors: round_robin, territory — pick a candidate agent
 *  - guards: capacity_check, availability_check, market_eligibility — filter candidates
 *
 * A selector rule "fires" when it yields an eligible candidate after guards.
 * Every decision (including no-match) is recorded in assignment_log.
 */

export type AssignmentRuleType =
  | "round_robin"
  | "territory"
  | "capacity_check"
  | "availability_check"
  | "market_eligibility";

export const ASSIGNMENT_RULE_TYPES: AssignmentRuleType[] = [
  "round_robin",
  "territory",
  "capacity_check",
  "availability_check",
  "market_eligibility",
];

export const RULE_TYPE_LABELS: Record<AssignmentRuleType, string> = {
  round_robin: "Round Robin",
  territory: "Territory (State)",
  capacity_check: "Capacity Check",
  availability_check: "Availability Check",
  market_eligibility: "Market Eligibility",
};

export const RULE_TYPE_DESCRIPTIONS: Record<AssignmentRuleType, string> = {
  round_robin:
    "Cycles leads evenly across a list of agents. Deterministic: the agent with the fewest prior assignments from this rule is picked next.",
  territory:
    "Routes leads by state to the agents covering that territory. Falls through to the next rule when no territory matches.",
  capacity_check:
    "Guard — blocks assignment to agents at or above their max lead capacity. Never assigns over capacity.",
  availability_check:
    "Guard — blocks assignment to agents marked unavailable (PTO, off-shift).",
  market_eligibility:
    "Guard — blocks assignment when the lead's state is not in the agent's markets list. Empty markets = all markets.",
};

export interface RoundRobinConfig {
  /** Agent user ids in rotation order. */
  userIds: number[];
}

export interface TerritoryConfig {
  territories: Array<{
    name: string;
    /** Two-letter state codes, e.g. ["FL", "MI"]. */
    states: string[];
    /** Agent user ids covering this territory. */
    userIds: number[];
  }>;
}

/** Guards take no config; they read user_capacity + users.isActive. */
export type GuardConfig = Record<string, never>;

export type AssignmentRuleConfig = RoundRobinConfig | TerritoryConfig | GuardConfig;

export interface AssignmentRule {
  id: number;
  name: string;
  ruleType: AssignmentRuleType;
  config: AssignmentRuleConfig;
  priorityOrder: number;
  version: number;
  isActive: boolean;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignmentCandidate {
  userId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface AssignmentDecision {
  /** Null when no rule fired — lead stays unassigned. */
  assignedToUserId: number | null;
  ruleId: number | null;
  ruleName: string | null;
  reason: string;
  /** Every rule evaluated, in order, with its outcome — for test mode / audit. */
  trace: Array<{ ruleId: number; ruleName: string; ruleType: string; fired: boolean; detail: string }>;
}

export function validateRuleConfig(
  ruleType: AssignmentRuleType,
  config: unknown,
): { ok: boolean; error?: string } {
  if (!config || typeof config !== "object") {
    // Guards need no config; selectors do.
    if (ruleType === "round_robin" || ruleType === "territory") {
      return { ok: false, error: "config is required for this rule type" };
    }
    return { ok: true };
  }
  const c = config as Record<string, unknown>;
  if (ruleType === "round_robin") {
    if (!Array.isArray(c.userIds) || c.userIds.length === 0) {
      return { ok: false, error: "round_robin requires config.userIds (non-empty array of user ids)" };
    }
    if (!c.userIds.every((u) => Number.isInteger(u) && (u as number) > 0)) {
      return { ok: false, error: "config.userIds must be positive integers" };
    }
    return { ok: true };
  }
  if (ruleType === "territory") {
    if (!Array.isArray(c.territories) || c.territories.length === 0) {
      return { ok: false, error: "territory requires config.territories (non-empty array)" };
    }
    for (const t of c.territories as Array<Record<string, unknown>>) {
      if (!Array.isArray(t.states) || t.states.length === 0) {
        return { ok: false, error: "each territory needs a non-empty states array" };
      }
      if (!Array.isArray(t.userIds) || t.userIds.length === 0) {
        return { ok: false, error: "each territory needs a non-empty userIds array" };
      }
    }
    return { ok: true };
  }
  // Guards accept (and ignore) any config.
  return { ok: true };
}

export function normalizeState(state: unknown): string {
  return String(state || "").trim().toUpperCase();
}
