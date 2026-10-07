/**
 * server/esign/types.ts — Self-built e-sign (v2) shared types & validation.
 *
 * Owner decision (Oct 7, 2026): NO DocuSign / HelloSign API. This module is the
 * native signing ceremony + audit backbone.
 *
 * Envelope lifecycle (single source of truth):
 *   draft -> sent -> viewed -> signed -> completed
 *                            \-> expired / voided
 * "signed" = at least one signature captured but more signers pending
 *            (multi-signer envelopes); "completed" = all signers done and the
 * final signed PDF + Certificate of Completion have been generated.
 *
 * ATTORNEY REVIEW REQUIRED BEFORE PRODUCTION USE. This is not legal advice.
 */
import { z } from "zod";

export const ENVELOPE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "signed",
  "completed",
  "expired",
  "voided",
] as const;
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number];

export const SIGNER_STATUSES = [
  "pending",
  "sent",
  "viewed",
  "signed",
  "declined",
  "expired",
] as const;
export type SignerStatus = (typeof SIGNER_STATUSES)[number];

export const SIGNATURE_TYPES = ["drawn", "typed", "uploaded"] as const;
export type SignatureType = (typeof SIGNATURE_TYPES)[number];

export const ESIGN_CONSENT_TEXT =
  "I agree to use electronic records and signatures for this transaction. " +
  "I consent to do business electronically with Ocean Luxe, and I understand that " +
  "my electronic signature below is legally binding and equivalent to a handwritten signature.";

export const signerInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(50).optional().nullable(),
  role: z.string().trim().max(50).default("signer"),
  order: z.number().int().min(0).default(0),
});

export const createEnvelopeSchema = z.object({
  templateId: z.number().int().positive(),
  // Deal/merge data applied to the template's {{placeholders}}.
  mergeData: z.record(z.string(), z.unknown()).default({}),
  contractId: z.number().int().positive().optional().nullable(),
  title: z.string().trim().max(255).optional(),
  signers: z.array(signerInputSchema).min(1).max(10),
  signingMode: z.enum(["sequential", "parallel"]).default("sequential"),
  expiresInDays: z.number().int().min(1).max(120).default(14),
  message: z.string().trim().max(2000).optional().nullable(),
});

export const signEnvelopeSchema = z.object({
  signatureType: z.enum(SIGNATURE_TYPES),
  // typed: the typed name; drawn/uploaded: PNG/JPEG data URL or raw base64
  signatureText: z.string().trim().max(255).optional().nullable(),
  signatureImageBase64: z.string().trim().max(5_000_000).optional().nullable(),
  signatureSvg: z.string().trim().max(1_000_000).optional().nullable(),
  legalName: z.string().trim().min(1).max(255),
  consent: z.literal(true, {
    errorMap: () => ({ message: "Electronic consent is required before signing." }),
  }),
});

export type CreateEnvelopeInput = z.infer<typeof createEnvelopeSchema>;
export type SignEnvelopeInput = z.infer<typeof signEnvelopeSchema>;

export interface AuditActor {
  type: "agent" | "signer" | "system";
  userId?: number | null;
  signerId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CertificateInfo {
  envelopeId: number;
  title: string;
  status: string;
  documentSha256: string | null;
  finalPdfSha256: string | null;
  completedAt: string | null;
  signers: Array<{
    name: string;
    email: string | null;
    role: string;
    signatureType: string | null;
    signedAt: string | null;
    ip: string | null;
    userAgent: string | null;
    consentAt: string | null;
  }>;
  auditChainHead: string | null;
  auditEvents: number;
}
