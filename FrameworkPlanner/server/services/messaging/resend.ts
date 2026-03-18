export type SendEmailInput = {
  to: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  from?: string | null;
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`${name} is not configured`);
  return String(v).trim();
}

export async function sendResendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = String(input.from || process.env.RESEND_FROM || "").trim();
  if (!from) throw new Error("RESEND_FROM is not configured");

  const to = String(input.to || "").trim();
  if (!to) throw new Error("Missing recipient");

  const subject = String(input.subject || "").trim();
  if (!subject) throw new Error("Missing subject");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text: input.text || undefined,
      html: input.html || undefined,
    }),
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.message === "string" ? data.message : "Email send failed";
    throw new Error(msg);
  }

  const id = String(data?.id || "").trim();
  return { id };
}

