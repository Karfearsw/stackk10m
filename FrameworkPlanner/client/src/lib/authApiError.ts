export type AuthErrorBody = {
  code?: string;
  message?: string;
  missing?: string[];
  requestId?: string | null;
  kind?: string;
  howToFix?: string;
};

export class AuthApiError extends Error {
  status: number;
  code?: string;
  missing?: string[];
  requestId?: string | null;
  kind?: string;
  howToFix?: string;

  constructor(status: number, body: AuthErrorBody | null | undefined, fallbackMessage: string) {
    const msg = String(body?.message || "").trim() || fallbackMessage;
    super(msg);
    this.name = "AuthApiError";
    this.status = status;
    this.code = body?.code;
    this.missing = body?.missing;
    this.requestId = body?.requestId ?? null;
    this.kind = body?.kind;
    this.howToFix = body?.howToFix;
  }
}

