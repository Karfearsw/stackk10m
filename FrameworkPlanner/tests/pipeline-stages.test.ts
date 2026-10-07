import { describe, it, expect } from "vitest";
import {
  LEAD_STAGES,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_CONFIG,
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGE_GROUPS,
  DEFAULT_PIPELINE_COLUMNS,
  CANONICAL_STAGES,
  normalizeStage,
  isCanonicalStage,
  isValidStage,
  validatePipelineColumns,
  canTransitionOpportunityStage,
  canTransitionStage,
} from "../shared/pipeline-stages";

describe("canonical pipeline taxonomy", () => {
  it("defines a label + expectation for every opportunity stage", () => {
    for (const stage of OPPORTUNITY_STAGES) {
      expect(OPPORTUNITY_STAGE_CONFIG[stage]?.label).toBeTruthy();
      expect(OPPORTUNITY_STAGE_LABELS[stage]).toBe(OPPORTUNITY_STAGE_CONFIG[stage].label);
      expect(Array.isArray(OPPORTUNITY_STAGE_CONFIG[stage].expects)).toBe(true);
    }
  });

  it("default pipeline columns cover every canonical stage, in order", () => {
    expect(DEFAULT_PIPELINE_COLUMNS.lead.map((c) => c.value)).toEqual([...LEAD_STAGES]);
    expect(DEFAULT_PIPELINE_COLUMNS.opportunity.map((c) => c.value)).toEqual([...OPPORTUNITY_STAGES]);
  });

  it("groups partition the opportunity stages exactly once", () => {
    const seen: string[] = [];
    for (const group of OPPORTUNITY_STAGE_GROUPS) {
      for (const stage of group.stages) {
        expect(OPPORTUNITY_STAGES).toContain(stage);
        seen.push(stage);
      }
    }
    expect(seen.sort()).toEqual([...OPPORTUNITY_STAGES].sort());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("exposes canonical membership helpers", () => {
    expect(isCanonicalStage("opportunity", "negotiating")).toBe(true);
    expect(isCanonicalStage("opportunity", "negotiation")).toBe(false);
    expect(isValidStage("reserved")).toBe(true);
    expect(isValidStage("not_a_stage")).toBe(false);
    expect(CANONICAL_STAGES.lead).toBe(LEAD_STAGES);
  });
});

describe("normalizeStage", () => {
  it("leaves canonical values unchanged", () => {
    expect(normalizeStage("opportunity", "under_contract")).toBe("under_contract");
    expect(normalizeStage("lead", "qualified")).toBe("qualified");
  });

  it("maps known legacy aliases to canonical ids", () => {
    expect(normalizeStage("opportunity", "negotiation")).toBe("negotiating");
    expect(normalizeStage("opportunity", "active")).toBe("lead");
    expect(normalizeStage("opportunity", "pending")).toBe("in_disposition");
    expect(normalizeStage("opportunity", "withdrawn")).toBe("dead");
    expect(normalizeStage("lead", "dead")).toBe("lost");
    expect(normalizeStage("lead", "negotiating")).toBe("negotiation");
  });

  it("trims whitespace and passes through unknown values for reporting", () => {
    expect(normalizeStage("lead", "  new  ")).toBe("new");
    expect(normalizeStage("opportunity", "mystery")).toBe("mystery");
  });
});

describe("validatePipelineColumns", () => {
  it("normalizes legacy values, dedupes, and drops malformed rows", () => {
    const { columns, rejected } = validatePipelineColumns("opportunity", [
      { value: "active", label: "Lead" },
      { value: "lead", label: "Lead" }, // duplicate after normalization
      { value: "negotiation", label: "Negotiating" },
      { value: "", label: "Empty" },
      { value: "sold" }, // missing label
      { value: "closed", label: "Closed" },
    ]);
    expect(columns.map((c) => c.value)).toEqual(["lead", "negotiating", "closed"]);
    expect(rejected).toEqual([]);
  });

  it("reports stages that are neither canonical nor known legacy aliases", () => {
    const { columns, rejected } = validatePipelineColumns("lead", [
      { value: "new", label: "New" },
      { value: "mystery", label: "Mystery" },
    ]);
    expect(columns.map((c) => c.value)).toEqual(["new"]);
    expect(rejected).toEqual([{ value: "mystery", label: "Mystery" }]);
  });

  it("returns an empty result for non-array input", () => {
    expect(validatePipelineColumns("lead", null)).toEqual({ columns: [], rejected: [] });
  });
});

describe("stage transitions", () => {
  it("allows staying on a stage and every forward move", () => {
    expect(canTransitionOpportunityStage("lead", "lead")).toBe(true);
    expect(canTransitionOpportunityStage("lead", "under_contract")).toBe(true);
    expect(canTransitionOpportunityStage("closed", "sold")).toBe(true);
    expect(canTransitionOpportunityStage("sold", "closed")).toBe(true);
  });

  it("treats dead/voided as terminal", () => {
    expect(canTransitionOpportunityStage("dead", "lead")).toBe(false);
    expect(canTransitionOpportunityStage("voided", "negotiating")).toBe(false);
    expect(canTransitionOpportunityStage("lead", "dead")).toBe(true);
    expect(canTransitionOpportunityStage("dead", "voided")).toBe(true);
  });

  it("keeps the back-compat alias wired to the same rule", () => {
    expect(canTransitionStage("dead", "lead")).toBe(false);
    expect(canTransitionStage("lead", "contacted")).toBe(true);
  });
});
