import { describe, it, expect } from "vitest";
import {
  buildAutomationPayload,
  describeAutomation,
  describeStoredAutomation,
} from "../client/src/lib/automation-wizard";

describe("automation wizard: guided builder payload + plain-language summary", () => {
  const input = {
    name: "  Follow up new leads  ",
    description: "  Auto follow-up  ",
    enabled: true,
    trigger: "lead.created",
    conditions: [
      { field: "lead.source", op: "eq" as const, value: "  Zillow  " },
      { field: "lead.score", op: "gte" as const, value: "60" },
      { field: "", op: "eq" as const, value: "" }, // empty -> filtered out
    ],
    actions: [
      { actionType: "task.create", config: { title: "Follow up", dueInMinutes: 60, assignTo: "actor" } },
      { actionType: "notification.create", config: { title: "Action needed", description: "", toUserId: "actor" } },
    ],
  };

  it("builds the exact POST /api/automations payload shape", () => {
    const p = buildAutomationPayload(input);
    expect(p.name).toBe("Follow up new leads");
    expect(p.description).toBe("Auto follow-up");
    expect(p.triggers).toEqual([{ eventType: "lead.created", config: {} }]);
    expect(p.condition).toEqual({
      op: "and",
      rules: [
        { field: "lead.source", op: "eq", value: "Zillow" },
        { field: "lead.score", op: "gte", value: "60" },
      ],
    });
    expect(p.actions).toHaveLength(2);
    expect(p.actions[0]).toMatchObject({ actionType: "task.create", sortOrder: 0 });
    expect(p.actions[0].config.title).toBe("Follow up");
  });

  it("trims values and filters blank conditions/actions", () => {
    const p = buildAutomationPayload({ ...input, actions: [] });
    expect(p.condition.rules).toHaveLength(2);
    expect(p.actions).toHaveLength(0);
  });

  it("produces the plain-language summary in When / if / then form", () => {
    const s = describeAutomation(input);
    expect(s).toContain("When lead created happens");
    expect(s).toContain("Lead source is “Zillow”");
    expect(s).toContain("Lead score is at least “60”");
    expect(s).toContain("then create a task “Follow up”, notify someone");
  });

  it("summarizes stored automation records (server shape) without throwing on missing fields", () => {
    const s = describeStoredAutomation({
      triggers: [{ eventType: "opportunity.stage_changed" }],
      condition: { rules: [{ field: "opportunity.stage", op: "eq", value: "under_contract" }] },
      actions: [{ actionType: "task.create", config: { title: "Run checklist" } }],
    });
    expect(s).toContain("When opportunity stage changed happens");
    expect(s).toContain("Opportunity stage is “under_contract”");
    expect(s).toContain("then create a task “Run checklist”");
    expect(describeStoredAutomation({})).toContain("When an event happens");
  });

  it("parses the stored server shape (configJson/conditionJson strings)", () => {
    const s = describeStoredAutomation({
      triggers: [{ eventType: "opportunity.stage_changed" }],
      condition: {
        configJson: JSON.stringify({
          op: "and",
          rules: [{ field: "opportunity.stage", op: "eq", value: "under_contract" }],
        }),
      },
      actions: [
        {
          actionType: "task.create",
          configJson: JSON.stringify({ title: "QA follow-up task", dueInMinutes: 60, assignTo: "actor" }),
        },
        { actionType: "notification.create", configJson: JSON.stringify({ title: "Action needed", toUserId: "actor" }) },
      ],
    });
    expect(s).toContain("Opportunity stage is “under_contract”");
    expect(s).toContain("create a task “QA follow-up task”");
    expect(s).toContain("notify someone “Action needed”");
  });

  it("does not claim external webhook safety: webhook actions are summarized distinctly", () => {
    const s = describeAutomation({
      ...input,
      actions: [{ actionType: "webhook.post", config: { url: "https://example.com/hook", timeoutMs: 5000 } }],
    });
    expect(s).toContain("call a webhook");
  });
});
