export const featureEnvVars = {
  skip_trace: "FEATURE_SKIP_TRACE",
  campaigns: "FEATURE_CAMPAIGNS",
  rvm: "FEATURE_RVM",
  esign: "FEATURE_ESIGN",
  field_mode: "FEATURE_FIELD_MODE",
  comps: "FEATURE_COMPS",
  buyer_match: "FEATURE_BUYER_MATCH",
  voice_playground: "FEATURE_VOICE_PLAYGROUND",
} as const;

export type FeatureFlagKey = keyof typeof featureEnvVars;

export function parseEnvBool(v: unknown): boolean | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return null;
}

export function createIsFeatureEnabled(
  getUserFeatureFlag: (userId: number, flag: string) => Promise<{ enabled?: unknown } | undefined>,
) {
  return async (userId: number, flag: FeatureFlagKey): Promise<boolean> => {
    const envKey = featureEnvVars[flag];
    const envDecision = parseEnvBool(process.env[envKey]);
    if (envDecision !== null) return envDecision;
    try {
      const row = await getUserFeatureFlag(userId, flag);
      return !!row?.enabled;
    } catch {
      return false;
    }
  };
}



/**
 * Structured FEATURE_DISABLED error response (Phase 7).
 * Returns a consistent JSON shape so the frontend can render a setup card
 * instead of a generic QueryError.
 */
export function featureDisabledResponse(
  res: any,
  feature: string,
  label: string,
  action?: string,
) {
  res.status(403).json({
    code: 'FEATURE_DISABLED',
    feature,
    message: `${label} is not enabled in this environment.`,
    action: action || `Enable the ${feature} feature flag and restart the server.`,
  });
}

/**
 * Middleware that blocks a route if a feature flag is disabled.
 * Usage: app.post('/api/campaigns', requireFeature('campaigns', 'Campaigns'), handler)
 */
export function requireFeature(flag: FeatureFlagKey, label: string, action?: string) {
  const envKey = featureEnvVars[flag];
  return (req: any, res: any, next: any) => {
    const enabled = parseEnvBool(process.env[envKey]);
    if (enabled === false || enabled === null) {
      return featureDisabledResponse(res, flag, label, action);
    }
    next();
  };
}
