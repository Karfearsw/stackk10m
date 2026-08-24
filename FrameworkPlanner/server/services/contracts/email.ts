import { sendResendEmail } from "../messaging/resend.js";

export type SendContractEmailInput = {
  to: string;
  signerName: string;
  contractTitle: string;
  signingUrl: string;
  expiresAt?: Date | string | null;
  companyName?: string | null;
  from?: string | null;
};

export async function sendContractSigningEmail(input: SendContractEmailInput) {
  const from = input.from || process.env.RESEND_FROM || "";
  if (!from) throw new Error("RESEND_FROM is not configured");

  const subject = `Please sign: ${input.contractTitle}`;
  const expiryText = input.expiresAt ? `This link expires on ${new Date(input.expiresAt).toLocaleDateString()}.` : "";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">You're invited to sign a document</h2>
      <p>Hello ${input.signerName || ""},</p>
      <p>You have been requested to sign <strong>${input.contractTitle}</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${input.signingUrl}" style="background-color: #2563eb; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Sign Document</a>
      </p>
      <p style="color: #666; font-size: 14px;">${expiryText}</p>
      <p style="color: #666; font-size: 14px;">If the button above doesn't work, copy and paste this link into your browser:<br/>${input.signingUrl}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #999; font-size: 12px;">Sent via ${input.companyName || "OceanLuxe CRM"} • This is a legally binding electronic signature request.</p>
    </div>
  `;

  return sendResendEmail({
    to: input.to,
    subject,
    html,
    from,
  });
}

export async function sendContractReminderEmail(input: SendContractEmailInput) {
  const from = input.from || process.env.RESEND_FROM || "";
  if (!from) throw new Error("RESEND_FROM is not configured");

  const subject = `Reminder: Please sign ${input.contractTitle}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Reminder: Signing request pending</h2>
      <p>Hello ${input.signerName || ""},</p>
      <p>This is a friendly reminder that you still need to sign <strong>${input.contractTitle}</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${input.signingUrl}" style="background-color: #2563eb; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Sign Document</a>
      </p>
      <p style="color: #666; font-size: 14px;">If you have any questions, please contact us.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #999; font-size: 12px;">Sent via ${input.companyName || "OceanLuxe CRM"}</p>
    </div>
  `;

  return sendResendEmail({
    to: input.to,
    subject,
    html,
    from,
  });
}
