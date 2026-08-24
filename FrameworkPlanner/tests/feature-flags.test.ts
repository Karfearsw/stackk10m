import { describe, it, expect } from "vitest";
import { parseEnvBool } from "../server/featureFlags.js";

describe("parseEnvBool", () => {
  it("returns null for undefined/null/empty", () => {
    expect(parseEnvBool(undefined)).toBeNull();
    expect(parseEnvBool(null)).toBeNull();
    expect(parseEnvBool("")).toBeNull();
    expect(parseEnvBool("  ")).toBeNull();
  });

  it("returns true for truthy values", () => {
    expect(parseEnvBool("true")).toBe(true);
    expect(parseEnvBool("TRUE")).toBe(true);
    expect(parseEnvBool("1")).toBe(true);
    expect(parseEnvBool("yes")).toBe(true);
    expect(parseEnvBool("on")).toBe(true);
    expect(parseEnvBool("  true  ")).toBe(true);
  });

  it("returns false for falsy values", () => {
    expect(parseEnvBool("false")).toBe(false);
    expect(parseEnvBool("FALSE")).toBe(false);
    expect(parseEnvBool("0")).toBe(false);
    expect(parseEnvBool("no")).toBe(false);
    expect(parseEnvBool("off")).toBe(false);
  });

  it("returns null for unrecognized values", () => {
    expect(parseEnvBool("maybe")).toBeNull();
    expect(parseEnvBool("enabled")).toBeNull();
  });
});
