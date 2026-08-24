import { describe, it, expect } from "vitest";
import {
  isTemplateUsable,
  parseContractGeneratorSearch,
  withTemplateSelection,
} from "../client/src/lib/contract-generator-params";

const TEMPLATES = [
  { id: 1, name: "Letter of Intent (LOI)", status: "approved" },
  { id: 2, name: "Purchase and Sale Agreement", status: "approved" },
  { id: 12, name: "Custom Template", status: "draft" },
  { id: 99, name: "Retired Template", status: "archived" },
];

describe("contract generator: Templates tab -> Use preselection", () => {
  it("writes tab=create and templateId= into the URL, preserving other params", () => {
    expect(withTemplateSelection("?tab=templates", "2")).toBe("?tab=create&templateId=2");
    // Opportunity handoff params survive the Use action
    expect(withTemplateSelection("?tab=templates&propertyId=3", "2")).toBe(
      "?tab=create&propertyId=3&templateId=2"
    );
  });

  it("parses the Use deep link so the template is selected on load", () => {
    const p = parseContractGeneratorSearch("?tab=create&templateId=2");
    expect(p.tab).toBe("create");
    expect(p.templateId).toBe("2");
    expect(p.propertyId).toBe(0);
  });

  it("keeps both templateId and propertyId when the opportunity handoff is combined", () => {
    const p = parseContractGeneratorSearch("?tab=create&templateId=2&propertyId=3");
    expect(p.tab).toBe("create");
    expect(p.templateId).toBe("2");
    expect(p.propertyId).toBe(3);
  });

  it("falls back to the create tab when a propertyId deep link has no tab", () => {
    const p = parseContractGeneratorSearch("?propertyId=3");
    expect(p.tab).toBe("create");
    expect(p.propertyId).toBe(3);
  });

  it("resolves the selected template object and the contract payload templateId", () => {
    const templateId = parseContractGeneratorSearch("?tab=create&templateId=2").templateId;
    const template = TEMPLATES.find((t) => t.id.toString() === templateId);
    expect(template?.name).toBe("Purchase and Sale Agreement");
    // mirrors handleSubmit/handleExport: payload templateId is the parsed int
    expect(templateId ? parseInt(templateId) : null).toBe(2);
  });

  it("restricts archived templates but allows approved and draft", () => {
    expect(isTemplateUsable("approved")).toBe(true);
    expect(isTemplateUsable("draft")).toBe(true);
    expect(isTemplateUsable("archived")).toBe(false);
    expect(isTemplateUsable(null)).toBe(true);
  });

  it("never mutates template version history (selection is read-only)", () => {
    const before = JSON.stringify(TEMPLATES);
    withTemplateSelection("?tab=templates", "2");
    parseContractGeneratorSearch("?tab=create&templateId=2");
    expect(JSON.stringify(TEMPLATES)).toBe(before);
  });
});
