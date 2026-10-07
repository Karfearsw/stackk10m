import { describe, expect, it } from "vitest";
import {
  IMPORT_SOURCES,
  canApproveImports,
  computeImportSignature,
  evaluateImportGate,
  isKnownImportSource,
  isTrustedImportSource,
} from "../server/crm/import-approval";

describe("import source identity", () => {
  it("recognizes only known sources", () => {
    for (const s of IMPORT_SOURCES) expect(isKnownImportSource(s)).toBe(true);
    expect(isKnownImportSource("sneaky_csv")).toBe(false);
    expect(isKnownImportSource("")).toBe(false);
    expect(isKnownImportSource(undefined)).toBe(false);
  });

  it("treats machine integrations as trusted", () => {
    expect(isTrustedImportSource("integration")).toBe(true);
    expect(isTrustedImportSource("system")).toBe(true);
    expect(isTrustedImportSource("manual_upload")).toBe(false);
  });
});

describe("canApproveImports", () => {
  it("allows admin/owner/manager/team_leader and super admins", () => {
    for (const role of ["admin", "owner", "manager", "team_leader"]) {
      expect(canApproveImports({ role })).toBe(true);
    }
    expect(canApproveImports({ role: "agent" })).toBe(false);
    expect(canApproveImports({ role: "agent", isSuperAdmin: true })).toBe(true);
    expect(canApproveImports(null)).toBe(false);
  });
});

describe("evaluateImportGate", () => {
  it("rejects an unknown source outright", () => {
    const r = evaluateImportGate({ source: "mystery", actor: { id: 1, role: "admin" } });
    expect(r.allowed).toBe(false);
    expect(r.approvalStatus).toBe("rejected");
    expect(r.reason).toMatch(/Unknown import source/i);
  });

  it("runs trusted integration sources without human approval", () => {
    const r = evaluateImportGate({ source: "integration", actor: null });
    expect(r.allowed).toBe(true);
    expect(r.approvalStatus).toBe("not_required");
  });

  it("blocks a manual bulk import from a non-approver", () => {
    const r = evaluateImportGate({ source: "manual_upload", actor: { id: 7, role: "agent" } });
    expect(r.allowed).toBe(false);
    expect(r.approvalStatus).toBe("pending");
    expect(r.requiresApproval).toBe(true);
  });

  it("defaults a missing source to a gated manual import", () => {
    expect(evaluateImportGate({ actor: { id: 7, role: "agent" } }).approvalStatus).toBe("pending");
    expect(evaluateImportGate({}).approvalStatus).toBe("pending");
  });

  it("lets a permitted user self-approve with the approver recorded", () => {
    const r = evaluateImportGate({ source: "crm_ui", actor: { id: 3, role: "manager" } });
    expect(r.allowed).toBe(true);
    expect(r.approvalStatus).toBe("approved");
  });
});

describe("computeImportSignature", () => {
  const base = { entityType: "lead", fileBase64: "Zm9v", mapping: { a: "A", b: "B" }, options: { onDuplicate: "merge" } };

  it("is deterministic and order-independent for mapping", () => {
    const a = computeImportSignature(base);
    const b = computeImportSignature({ ...base, mapping: { b: "B", a: "A" } });
    expect(a).toBe(b);
  });

  it("changes when the file, entity, or mapping changes", () => {
    const a = computeImportSignature(base);
    expect(computeImportSignature({ ...base, fileBase64: "YmFy" })).not.toBe(a);
    expect(computeImportSignature({ ...base, entityType: "buyer" })).not.toBe(a);
    expect(computeImportSignature({ ...base, mapping: { a: "A", b: "C" } })).not.toBe(a);
  });
});
