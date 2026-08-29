/**
 * WebRTC browser softphone configuration.
 *
 * The Telnyx WebRTC SDK (@telnyx/webrtc) authenticates with one of:
 *   - a short-lived JWT (`login_token`) — recommended,
 *   - SIP credentials (`login` + `password`) from a Telnyx SIP Credential
 *     Connection, or
 *   - an anonymous login (AI assistants only — not for agent softphone).
 *
 * The TELNYX_API_KEY must NEVER reach the browser. This module only reports
 * readiness and returns the WebRTC auth payload to an already-authenticated
 * CRM user, so secrets stay server-side except for the specific SIP cred the
 * SDK is designed to hold.
 */

function readEnv(name: string): string {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : "";
}

export type WebRtcAuthMode = "login_token" | "credentials" | null;

export type WebRtcReadiness = {
  enabled: boolean;
  mode: WebRtcAuthMode;
  defaultFromNumber: string | null;
  /** True when either a login_token or login/password pair is configured. */
  authReady: boolean;
  blocker?: string;
};

export type WebRtcClientConfig = {
  enabled: boolean;
  mode: WebRtcAuthMode;
  defaultFromNumber: string | null;
  /** Short-lived JWT for the SDK (mode === "login_token"). */
  loginToken?: string;
  /** SIP username (mode === "credentials"). */
  login?: string;
  /** SIP password (mode === "credentials"). */
  password?: string;
  /** Human-facing explanation for the provider/setup blocker. */
  message?: string;
};

function readAuthMode(): { mode: WebRtcAuthMode; reason?: string } {
  const enabled = readEnv("TELNYX_WEBRTC_ENABLED");
  const token = readEnv("TELNYX_WEBRTC_LOGIN_TOKEN");
  const login = readEnv("TELNYX_WEBRTC_SIP_USER");
  const password = readEnv("TELNYX_WEBRTC_SIP_PASSWORD");

  if (!isTruthy(enabled)) {
    return { mode: null, reason: "TELNYX_WEBRTC_ENABLED is off or unset." };
  }
  if (token) return { mode: "login_token" };
  if (login && password) return { mode: "credentials" };
  if (login && !password) {
    return { mode: null, reason: "TELNYX_WEBRTC_SIP_PASSWORD is missing." };
  }
  if (!login && password) {
    return { mode: null, reason: "TELNYX_WEBRTC_SIP_USER is missing." };
  }
  return { mode: null, reason: "Configure a login_token or SIP credentials for WebRTC." };
}

function isTruthy(val: string): boolean {
  const s = val.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export function getWebRtcReadiness(): WebRtcReadiness {
  const { mode, reason } = readAuthMode();
  const enabled = mode !== null;
  const defaultFromNumber = readEnv("TELNYX_DEFAULT_FROM_NUMBER") || null;

  const readiness: WebRtcReadiness = {
    enabled,
    mode,
    defaultFromNumber,
    authReady: mode !== null,
  };

  if (!enabled) {
    readiness.blocker =
      reason + " Set TELNYX_WEBRTC_ENABLED=true plus a login token or SIP credentials in Settings → System.";
  }
  return readiness;
}

/**
 * Build the exact payload the browser SDK needs. Called only after requireAuth.
 * login_token JWTs are passed through as configured; SIP credentials are the
 * per-connection user/password Telnyx expects.
 */
export function getWebRtcClientConfig(): WebRtcClientConfig {
  const readiness = getWebRtcReadiness();
  const base: WebRtcClientConfig = {
    enabled: readiness.enabled,
    mode: readiness.mode,
    defaultFromNumber: readiness.defaultFromNumber,
    message: readiness.blocker,
  };

  if (!readiness.enabled || !readiness.mode) {
    return base;
  }

  if (readiness.mode === "login_token") {
    base.loginToken = readEnv("TELNYX_WEBRTC_LOGIN_TOKEN");
  } else {
    base.login = readEnv("TELNYX_WEBRTC_SIP_USER");
    base.password = readEnv("TELNYX_WEBRTC_SIP_PASSWORD");
  }
  return base;
}
