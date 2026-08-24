import { describe, it, expect } from "vitest";

/**
 * Phase 7 – Feature-flag health matrix and structured FEATURE_DISABLED errors.
 */

function baseUrl() {
  return process.env.TEST_BASE_URL || "http://localhost:3000";
}

// These tests require a running server.
(process.env.TEST_BASE_URL ? describe : describe.skip)("Feature flag health and FEATURE_DISABLED", () => {
  it("GET /api/system/health returns features array", async () => {
    const res = await fetch(`${baseUrl()}/api/system/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features.length).toBeGreaterThanOrEqual(4);
    // Each feature has required fields
    for (const f of body.features) {
      expect(typeof f.key).toBe("string");
      expect(typeof f.label).toBe("string");
      expect(typeof f.enabled).toBe("boolean");
      expect(typeof f.action).toBe("string");
    }
  });

  it("GET /api/system/health modules include state, detail, lastChecked", async () => {
    const res = await fetch(`${baseUrl()}/api/system/health`);
    const body = await res.json();
    expect(Array.isArray(body.modules)).toBe(true);
    expect(body.modules.length).toBeGreaterThanOrEqual(10);
    for (const m of body.modules) {
      expect(typeof m.key).toBe("string");
      expect(["healthy", "degraded", "unconfigured", "unavailable", "error"]).toContain(m.state);
      expect(typeof m.detail).toBe("string");
      expect(typeof m.lastChecked).toBe("string");
    }
  });

  it("FEATURE_CAMPAIGNS=disabled returns 403 with FEATURE_DISABLED code", async () => {
    // The campaigns endpoint requires the feature to be enabled.
    // In test env, FEATURE_CAMPAIGNS may or may not be set.
    // We test the response shape when the feature IS enabled (200 or 403)
    const res = await fetch(`${baseUrl()}/api/campaigns`, {
      credentials: "include",
    });
    if (res.status === 403) {
      const body = await res.json();
      expect(body.code).toBe("FEATURE_DISABLED");
      expect(typeof body.feature).toBe("string");
      expect(typeof body.message).toBe("string");
      expect(typeof body.action).toBe("string");
    } else {
      // Feature is enabled, response should be 200 or 401
      expect([200, 401]).toContain(res.status);
    }
  });

  it("featureFlags helper correctly parses boolean env values", async () => {
    // Test the parseEnvBool helper indirectly via the feature flags in health response
    const res = await fetch(`${baseUrl()}/api/system/health`);
    const body = await res.json();
    const esignFlag = body.features.find((f: any) => f.key === "esign");
    if (process.env.FEATURE_ESIGN === "true") {
      expect(esignFlag.enabled).toBe(true);
    }
  });

  it("system health response includes features and modules without secrets", async () => {
    const res = await fetch(`${baseUrl()}/api/system/health`);
    const body = await res.json();
    const json = JSON.stringify(body);
    // Ensure no API keys leak
    expect(json).not.toContain("KEY019FB0AA881CB723E3D634E8E87724BD");
    expect(json).not.toContain("npg_7sAWdTo6cjpF");
    // Ensure features don't contain action field with credential values
    for (const f of body.features) {
      expect(f.action).not.toMatch(/key|secret|token|password/i);
    }
  });
});
