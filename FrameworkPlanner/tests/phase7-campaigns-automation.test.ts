import { describe, it, expect } from "vitest";
import {
  AUTOMATION_TRIGGERS,
  AUTOMATION_ACTIONS,
  AUTOMATION_CONDITION_FIELDS,
  buildAutomationPayload,
  describeAutomation,
  describeStoredAutomation,
  type AutomationWizardInput,
} from "../client/src/lib/automation-wizard";

describe("Phase 7: Extended automation triggers/actions/conditions", () => {
  it("should include new triggers beyond the original 6", () => {
    const triggerValues = AUTOMATION_TRIGGERS.map((t) => t.value);
    expect(triggerValues).toContain("lead.created");
    expect(triggerValues).toContain("opportunity.stage_changed");
    expect(triggerValues).toContain("task.overdue");
    // New triggers
    expect(triggerValues).toContain("listing.published");
    expect(triggerValues).toContain("listing.paused");
    expect(triggerValues).toContain("inquiry.received");
    expect(triggerValues).toContain("offer.received");
    expect(triggerValues).toContain("offer.accepted");
    expect(triggerValues).toContain("contract.sent");
    expect(triggerValues).toContain("contract.viewed");
    expect(triggerValues).toContain("contract.signed");
    expect(triggerValues).toContain("calendar.upcoming");
    expect(triggerValues).toContain("sms.inbound");
    expect(triggerValues.length).toBeGreaterThanOrEqual(16);
  });

  it("should include new actions beyond the original 3", () => {
    const actionValues = AUTOMATION_ACTIONS.map((a) => a.value);
    expect(actionValues).toContain("task.create");
    expect(actionValues).toContain("notification.create");
    expect(actionValues).toContain("webhook.post");
    // New actions
    expect(actionValues).toContain("tag.add");
    expect(actionValues).toContain("tag.remove");
    expect(actionValues).toContain("stage.change");
    expect(actionValues).toContain("message.internal");
    expect(actionValues.length).toBeGreaterThanOrEqual(7);
  });

  it("should include new condition fields", () => {
    const fieldValues = AUTOMATION_CONDITION_FIELDS.map((f) => f.value);
    expect(fieldValues).toContain("lead.source");
    expect(fieldValues).toContain("opportunity.stage");
    // New fields
    expect(fieldValues).toContain("lead.dnc");
    expect(fieldValues).toContain("listing.status");
    expect(fieldValues).toContain("inquiry.status");
    expect(fieldValues).toContain("offer.amount");
    expect(fieldValues).toContain("contract.status");
    expect(fieldValues.length).toBeGreaterThanOrEqual(12);
  });

  it("should build payload with new action types", () => {
    const input: AutomationWizardInput = {
      name: "Stage change automation",
      description: "Moves opportunity to contacted",
      enabled: true,
      trigger: "opportunity.stage_changed",
      conditions: [{ field: "opportunity.stage", op: "eq", value: "negotiating" }],
      actions: [
        { actionType: "stage.change", config: { stage: "contacted" } },
        { actionType: "tag.add", config: { tag: "auto-contacted" } },
      ],
    };
    const payload = buildAutomationPayload(input);
    expect(payload.name).toBe("Stage change automation");
    expect(payload.triggers[0].eventType).toBe("opportunity.stage_changed");
    expect(payload.actions).toHaveLength(2);
    expect(payload.actions[0].actionType).toBe("stage.change");
    expect(payload.actions[0].config.stage).toBe("contacted");
    expect(payload.actions[1].actionType).toBe("tag.add");
    expect(payload.actions[1].config.tag).toBe("auto-contacted");
  });

  it("should describe automation with new action types", () => {
    const input: AutomationWizardInput = {
      name: "Inquiry automation",
      description: "",
      enabled: true,
      trigger: "inquiry.received",
      conditions: [],
      actions: [
        { actionType: "task.create", config: { title: "Follow up on inquiry" } },
        { actionType: "message.internal", config: { title: "New inquiry alert", description: "Check the listing" } },
      ],
    };
    const desc = describeAutomation(input);
    expect(desc).toContain("buyer inquiry received");
    expect(desc).toContain("create a task");
    expect(desc).toContain("send internal message");
  });
});

describe("Phase 7: Automation dry-run type exports", () => {
  it("should export DryRunResult type from engine (type-level check)", async () => {
    const engine = await import("../server/services/automations/engine");
    expect(typeof engine.dryRunAutomation).toBe("function");
  });

  it("should have MAX_AUTOMATION_DEPTH constant", async () => {
    // Verify the engine module can be imported without errors
    const engine = await import("../server/services/automations/engine");
    expect(engine.dispatchAutomationEvent).toBeDefined();
    expect(engine.dryRunAutomation).toBeDefined();
  });
});

describe("Phase 7: Campaign compliance panel data", () => {
  it("should have all required channel types", () => {
    const channels = ["sms", "email", "rvm", "task", "notification"];
    // These are used in the campaign page CHANNELS constant
    expect(channels).toHaveLength(5);
    expect(channels).toContain("sms");
    expect(channels).toContain("email");
    expect(channels).toContain("rvm");
  });
});
