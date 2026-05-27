import { createIsFeatureEnabled, parseEnvBool } from "../featureFlags.js";

describe("feature flags", () => {
  it("parseEnvBool returns correct tri-state", () => {
    expect(parseEnvBool(undefined)).toBe(null);
    expect(parseEnvBool(null)).toBe(null);
    expect(parseEnvBool("")).toBe(null);
    expect(parseEnvBool("  ")).toBe(null);
    expect(parseEnvBool("true")).toBe(true);
    expect(parseEnvBool("1")).toBe(true);
    expect(parseEnvBool("yes")).toBe(true);
    expect(parseEnvBool("on")).toBe(true);
    expect(parseEnvBool("false")).toBe(false);
    expect(parseEnvBool("0")).toBe(false);
    expect(parseEnvBool("no")).toBe(false);
    expect(parseEnvBool("off")).toBe(false);
    expect(parseEnvBool("maybe")).toBe(null);
  });

  it("createIsFeatureEnabled prefers env var override", async () => {
    const prev = process.env.FEATURE_VOICE_PLAYGROUND;
    try {
      const getUserFeatureFlag = vi.fn(async () => ({ enabled: false }));
      const isEnabled = createIsFeatureEnabled(getUserFeatureFlag);

      process.env.FEATURE_VOICE_PLAYGROUND = "true";
      await expect(isEnabled(1, "voice_playground")).resolves.toBe(true);
      expect(getUserFeatureFlag).not.toHaveBeenCalled();

      process.env.FEATURE_VOICE_PLAYGROUND = "false";
      await expect(isEnabled(1, "voice_playground")).resolves.toBe(false);
      expect(getUserFeatureFlag).not.toHaveBeenCalled();
    } finally {
      process.env.FEATURE_VOICE_PLAYGROUND = prev;
    }
  });

  it("createIsFeatureEnabled falls back to user flag when env is unset", async () => {
    const prev = process.env.FEATURE_VOICE_PLAYGROUND;
    try {
      delete process.env.FEATURE_VOICE_PLAYGROUND;

      const getUserFeatureFlag = vi.fn(async (_userId: number, _flag: string) => ({ enabled: true }));
      const isEnabled = createIsFeatureEnabled(getUserFeatureFlag);
      await expect(isEnabled(123, "voice_playground")).resolves.toBe(true);

      getUserFeatureFlag.mockImplementationOnce(async () => ({ enabled: false }));
      await expect(isEnabled(123, "voice_playground")).resolves.toBe(false);
    } finally {
      process.env.FEATURE_VOICE_PLAYGROUND = prev;
    }
  });
});

