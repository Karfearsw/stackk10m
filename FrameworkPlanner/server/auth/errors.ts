export type AuthErrorBody = {
  code: string;
  message: string;
  missing?: string[];
  requestId?: string | null;
};

export function getRequestIdFromRes(res: any): string | null {
  const v = (res?.locals as any)?.requestId;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export function sendAuthError(res: any, status: number, body: Omit<AuthErrorBody, "requestId">) {
  const requestId = getRequestIdFromRes(res);
  const payload: AuthErrorBody = requestId ? { ...body, requestId } : body;
  return res.status(status).json(payload);
}

export function isEmailNotConfiguredError(err: any): boolean {
  const msg = String(err?.message || "").trim().toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("resend_api_key is not configured") ||
    msg.includes("resend_from is not configured") ||
    msg.includes("email is not configured")
  );
}

