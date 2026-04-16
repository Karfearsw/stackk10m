import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  computeBuyerDedupeKey,
  computeContactDedupeKey,
  computeLeadDedupeKey,
  computeOpportunityDedupeKey,
  mapAndValidateRow,
  suggestMapping,
  verifyExportToken,
} from "../server/crm/import-export";

describe("CRM import/export helpers", () => {
  it("computes stable lead dedupe keys", () => {
    const key = computeLeadDedupeKey({
      address: "  123  Main St ",
      city: " Tampa ",
      state: "fl",
      zipCode: "33602",
      ownerName: "  Jane   Smith ",
    });
    expect(key).toBe("123 main st|tampa|fl|33602|jane smith");
  });

  it("computes stable opportunity dedupe keys (includes apn)", () => {
    const key = computeOpportunityDedupeKey({
      apn: "  01-23-45-678  ",
      address: "123 Main St",
      city: "Tampa",
      state: "FL",
      zipCode: "33602",
    });
    expect(key).toBe("01-23-45-678|123 main st|tampa|fl|33602");
  });

  it("computes stable contact and buyer dedupe keys", () => {
    expect(computeContactDedupeKey({ name: " Jane  Smith ", email: "Jane@Example.com", phone: " 555-1234 " })).toBe(
      "jane@example.com|555-1234|jane smith",
    );
    expect(computeBuyerDedupeKey({ name: " ACME Capital ", company: " ACME ", email: null, phone: "(555) 999-0000" })).toBe(
      "|(555) 999-0000|acme capital|acme",
    );
  });

  it("suggests mapping based on common header synonyms", () => {
    const suggested = suggestMapping("lead", ["Owner Email (Primary)", "Street Address", "Zip", "State", "City", "Owner Name"]);
    expect(suggested.address).toBe("Street Address");
    expect(suggested.ownerEmail).toBe("Owner Email (Primary)");
    expect(suggested.zipCode).toBe("Zip");
  });

  it("derives city/state/zip from Full Address when mapped", () => {
    const row = { "Full Address": "123 Main St, Tampa, FL 33602", "Owner Name": "Jane Smith", Source: "Cold Call" };
    const mapping = {
      fullAddress: "Full Address",
      ownerName: "Owner Name",
      source: "Source",
    };
    const r = mapAndValidateRow("lead", row, mapping);
    expect(r.ok).toBe(true);
    expect((r as any).data.address).toBe("123 Main St");
    expect((r as any).data.city).toBe("Tampa");
    expect((r as any).data.state).toBe("FL");
    expect((r as any).data.zipCode).toBe("33602");
  });

  it("returns row-level errors when Full Address cannot be parsed", () => {
    const row = { "Full Address": "123 Main St Tampa Florida", "Owner Name": "Jane Smith", Source: "Cold Call" };
    const mapping = {
      fullAddress: "Full Address",
      ownerName: "Owner Name",
      source: "Source",
    };
    const r = mapAndValidateRow("lead", row, mapping);
    expect(r.ok).toBe(false);
    const messages = (r as any).errors.map((e: any) => `${e.field}:${e.message}`).join("|");
    expect(messages).toContain("city:Unable to parse from Full Address");
    expect(messages).toContain("state:Unable to parse from Full Address");
    expect(messages).toContain("zipCode:Unable to parse from Full Address");
  });

  it("validates required fields and formats with row-level errors", () => {
    const row = { "Street Address": "123 Main St", City: "Tampa", State: "Florida", Zip: "ABC", "Owner Name": "", Source: "" };
    const mapping = {
      address: "Street Address",
      city: "City",
      state: "State",
      zipCode: "Zip",
      ownerName: "Owner Name",
      source: "Source",
    };
    const r = mapAndValidateRow("lead", row, mapping);
    expect(r.ok).toBe(false);
    const messages = (r as any).errors.map((e: any) => `${e.field}:${e.message}`).join("|");
    expect(messages).not.toContain("state:State must be 2 letters");
    expect(messages).toContain("zipCode:Zip Code must be 5 digits (or ZIP+4)");
    expect(messages).toContain("ownerName:Required");
    expect(messages).toContain("source:Required");
  });

  it("normalizes full state names and common variants", () => {
    const row = { "Street Address": "123 Main St", City: "Tampa", State: "Florida", Zip: "33602", "Owner Name": "Jane Smith", Source: "Cold Call" };
    const mapping = {
      address: "Street Address",
      city: "City",
      state: "State",
      zipCode: "Zip",
      ownerName: "Owner Name",
      source: "Source",
    };
    const r = mapAndValidateRow("lead", row, mapping);
    expect(r.ok).toBe(true);
    expect((r as any).data.state).toBe("FL");

    const row2 = { Address: "123 Main St", City: "Tampa", State: "Fla.", "Zip Code": "33602", "Owner Name": "Jane Smith", Source: "Cold Call" };
    const mapping2 = { address: "Address", city: "City", state: "State", zipCode: "Zip Code", ownerName: "Owner Name", source: "Source" };
    const r2 = mapAndValidateRow("lead", row2 as any, mapping2);
    expect(r2.ok).toBe(true);
    expect((r2 as any).data.state).toBe("FL");
  });

  it("auto-fills source and derives state from ZIP when configured", () => {
    const row = { Address: "671 Metacom Ave Unit 29", City: "Bristol", ZipCode: "02809", "Owner Name": "Jared" };
    const mapping = { address: "Address", city: "City", zipCode: "ZipCode", ownerName: "Owner Name" };
    const r = mapAndValidateRow("lead", row as any, mapping, { defaultLeadSource: "Import", deriveStateFromZip: true });
    expect(r.ok).toBe(true);
    expect((r as any).data.source).toBe("Import");
    expect((r as any).data.state).toBe("RI");
  });

  it("parses estimated value currency and k/m suffixes", () => {
    const mapping = { address: "Address", city: "City", zipCode: "ZipCode", ownerName: "Owner Name", source: "Source", state: "State", estimatedValue: "Estimated" };

    const r1 = mapAndValidateRow(
      "lead",
      { Address: "123 Main St", City: "Tampa", State: "FL", ZipCode: "33602", "Owner Name": "Jane", Source: "Import", Estimated: "$250,000" } as any,
      mapping,
    );
    expect(r1.ok).toBe(true);
    expect((r1 as any).data.estimatedValue).toBe("250000.00");

    const r2 = mapAndValidateRow(
      "lead",
      { Address: "123 Main St", City: "Tampa", State: "FL", ZipCode: "33602", "Owner Name": "Jane", Source: "Import", Estimated: "250k" } as any,
      mapping,
    );
    expect(r2.ok).toBe(true);
    expect((r2 as any).data.estimatedValue).toBe("250000.00");

    const r3 = mapAndValidateRow(
      "lead",
      { Address: "123 Main St", City: "Tampa", State: "FL", ZipCode: "33602", "Owner Name": "Jane", Source: "Import", Estimated: "1.2m" } as any,
      mapping,
    );
    expect(r3.ok).toBe(true);
    expect((r3 as any).data.estimatedValue).toBe("1200000.00");

    const r4 = mapAndValidateRow(
      "lead",
      { Address: "123 Main St", City: "Tampa", State: "FL", ZipCode: "33602", "Owner Name": "Jane", Source: "Import", Estimated: "N/A" } as any,
      mapping,
    );
    expect(r4.ok).toBe(true);
    expect((r4 as any).data.estimatedValue).toBe(null);
  });

  it("derives state from ZIP when state is missing", () => {
    const row = { Address: "671 Metacom Ave Unit 29", City: "Bristol", ZipCode: "02809", "Owner Name": "Jared", Source: "Cold Call" };
    const mapping = { address: "Address", city: "City", zipCode: "ZipCode", ownerName: "Owner Name", source: "Source" };
    const r = mapAndValidateRow("lead", row as any, mapping);
    expect(r.ok).toBe(true);
    expect((r as any).data.state).toBe("RI");
  });

  it("repairs ZIP mapped into state when zipCode is missing", () => {
    const row = { Address: "671 Metacom Ave Unit 29", City: "Bristol", ZipCode: "02809", "Owner Name": "Jared", Source: "Cold Call" };
    const mapping = { address: "Address", city: "City", state: "ZipCode", ownerName: "Owner Name", source: "Source" };
    const r = mapAndValidateRow("lead", row as any, mapping);
    expect(r.ok).toBe(true);
    expect((r as any).data.zipCode).toBe("02809");
    expect((r as any).data.state).toBe("RI");
  });

  it("parses buyer arrays and booleans", () => {
    const row = {
      Name: "Bob Buyer",
      Email: "bob@example.com",
      "Preferred Areas": "Tampa; Orlando",
      Tags: "vip, proofed",
      VIP: "yes",
    };
    const mapping = {
      name: "Name",
      email: "Email",
      preferredAreas: "Preferred Areas",
      tags: "Tags",
      isVip: "VIP",
    };
    const r = mapAndValidateRow("buyer", row, mapping);
    expect(r.ok).toBe(true);
    expect((r as any).data.preferredAreas).toEqual(["Tampa", "Orlando"]);
    expect((r as any).data.tags).toEqual(["vip", "proofed"]);
    expect((r as any).data.isVip).toBe(true);
  });

  it("verifies export tokens using a stored hash", () => {
    const token = "test-token";
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    expect(verifyExportToken({ tokenHash, expiresAt: new Date(Date.now() + 60_000) } as any, token)).toBe(true);
    expect(verifyExportToken({ tokenHash, expiresAt: new Date(Date.now() + 60_000).toISOString() } as any, token)).toBe(true);
    expect(verifyExportToken({ tokenHash, expiresAt: new Date(Date.now() - 60_000) } as any, token)).toBe(false);
    expect(verifyExportToken({ tokenHash, expiresAt: new Date(Date.now() + 60_000) } as any, "nope")).toBe(false);
  });
});
