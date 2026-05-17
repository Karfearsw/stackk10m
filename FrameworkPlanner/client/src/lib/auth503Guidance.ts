type AuthGuidance = {
  title: string;
  description: string;
  steps?: string[];
};

function formatMissing(missing: string[] | undefined) {
  if (!missing?.length) return undefined;
  return missing.map((s) => String(s).replace(/^env:/i, "")).filter(Boolean);
}

export function getAuth503Guidance(code: string | undefined, missing?: string[]): AuthGuidance | null {
  const normalized = String(code || "").trim();
  const missingKeys = formatMissing(missing);

  if (normalized === "db_unavailable") {
    return {
      title: "Database temporarily unavailable",
      description: "The service can’t reach the database right now.",
      steps: [
        "Try again in 30–60 seconds.",
        "If this keeps happening, an operator should verify database uptime and networking.",
      ],
    };
  }

  if (normalized === "db_not_configured") {
    return {
      title: "Database not configured",
      description: "This environment is missing database configuration.",
      steps: [
        ...(missingKeys?.length ? [`Set: ${missingKeys.join(", ")}`] : ["Set the required DATABASE_URL environment variables."]),
        "After setting env vars, redeploy and run migrations.",
      ],
    };
  }

  if (normalized === "session_secret_missing") {
    return {
      title: "Server authentication not configured",
      description: "Sessions can’t be created because a required secret is missing.",
      steps: [
        ...(missingKeys?.length ? [`Set: ${missingKeys.join(", ")}`] : ["Set SESSION_SECRET in the server environment."]),
        "Redeploy after updating environment variables.",
      ],
    };
  }

  if (normalized === "signup_not_configured") {
    return {
      title: "Signup is disabled (configuration required)",
      description: "This environment isn’t configured to allow employee signup yet.",
      steps: [
        ...(missingKeys?.length
          ? [`Configure access codes: ${missingKeys.join(", ")}`]
          : ["Configure EMPLOYEE_ACCESS_CODE (legacy) or all required role code env vars."]),
        "Redeploy after updating environment variables.",
      ],
    };
  }

  if (normalized === "email_not_configured") {
    return {
      title: "Email sending not configured",
      description: "Magic links and password resets require an email provider configuration.",
      steps: [
        ...(missingKeys?.length ? [`Set: ${missingKeys.join(", ")}`] : ["Configure email provider env vars (e.g. RESEND_API_KEY, RESEND_FROM)."]),
        "Retry after configuration is applied.",
      ],
    };
  }

  return null;
}

