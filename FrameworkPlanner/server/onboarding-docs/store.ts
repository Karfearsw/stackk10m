/**
 * Database access for the onboarding document workflow.
 *
 * Uses the shared drizzle `db` handle with raw SQL — same pattern as
 * server/email-provisioning/store.ts. Tables are created by migration
 * 0092_onboarding_docs.sql.
 */
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import type { OnboardingDocType } from "./templates.js";

export type OnboardingDocumentRow = {
  id: number;
  user_id: number;
  doc_type: OnboardingDocType;
  status: "pending" | "sent" | "viewed" | "signed" | "completed";
  template_id: number | null;
  template_version: number;
  merge_data: Record<string, any>;
  form_data: Record<string, any>;
  rendered_body: string | null;
  signature_type: string | null;
  signature_data: string | null;
  signed_at: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  document_url: string | null;
  sent_by: number | null;
  sent_at: string | null;
  viewed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowsOf(r: any): any[] {
  return (r as any)?.rows ?? (r as any) ?? [];
}

function parseJson(v: any): Record<string, any> {
  if (!v) return {};
  if (typeof v === "object") return v;
  try { return JSON.parse(String(v)); } catch { return {}; }
}

function normalize(row: any): OnboardingDocumentRow {
  return {
    ...row,
    merge_data: parseJson(row.merge_data),
    form_data: parseJson(row.form_data),
  };
}

export async function listDocumentsForUser(userId: number): Promise<OnboardingDocumentRow[]> {
  const r = await db.execute(sql`SELECT * FROM onboarding_documents WHERE user_id = ${userId} ORDER BY created_at DESC`);
  return rowsOf(r).map(normalize);
}

export async function getDocument(id: number): Promise<OnboardingDocumentRow | null> {
  const r = await db.execute(sql`SELECT * FROM onboarding_documents WHERE id = ${id} LIMIT 1`);
  const row = rowsOf(r)[0];
  return row ? normalize(row) : null;
}

export async function getActiveDocument(userId: number, docType: OnboardingDocType): Promise<OnboardingDocumentRow | null> {
  const r = await db.execute(sql`
    SELECT * FROM onboarding_documents
    WHERE user_id = ${userId} AND doc_type = ${docType} AND status != 'completed'
    ORDER BY created_at DESC LIMIT 1
  `);
  const row = rowsOf(r)[0];
  return row ? normalize(row) : null;
}

export async function createDocument(input: {
  userId: number;
  docType: OnboardingDocType;
  templateId?: number | null;
  templateVersion?: number;
  mergeData?: Record<string, any>;
  renderedBody?: string | null;
  sentBy?: number | null;
}): Promise<OnboardingDocumentRow> {
  const r = await db.execute(sql`
    INSERT INTO onboarding_documents (user_id, doc_type, status, template_id, template_version, merge_data, rendered_body, sent_by, sent_at)
    VALUES (${input.userId}, ${input.docType}, 'sent', ${input.templateId ?? null}, ${input.templateVersion ?? 1},
            ${JSON.stringify(input.mergeData ?? {})}::jsonb, ${input.renderedBody ?? null}, ${input.sentBy ?? null}, now())
    RETURNING *
  `);
  const doc = normalize(rowsOf(r)[0]);
  await logEvent(doc.id, "created", input.sentBy ?? null, { doc_type: input.docType });
  await logEvent(doc.id, "sent", input.sentBy ?? null, {});
  return doc;
}

export async function markViewed(id: number): Promise<void> {
  await db.execute(sql`
    UPDATE onboarding_documents
    SET status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
        viewed_at = COALESCE(viewed_at, now()), updated_at = now()
    WHERE id = ${id}
  `);
  await logEvent(id, "viewed", null, {});
}

export async function markSigned(input: {
  id: number;
  signatureType: "typed" | "drawn" | "uploaded";
  signatureData: string;
  formData?: Record<string, any>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<OnboardingDocumentRow> {
  const r = await db.execute(sql`
    UPDATE onboarding_documents
    SET status = 'signed',
        signature_type = ${input.signatureType},
        signature_data = ${input.signatureData},
        form_data = COALESCE(${input.formData ? JSON.stringify(input.formData) : null}::jsonb, form_data),
        signed_at = now(), updated_at = now()
    WHERE id = ${input.id}
    RETURNING *
  `);
  // Best-effort IP/UA capture (columns exist; update separately to keep the main write simple).
  if (input.ip || input.userAgent) {
    await db.execute(sql`
      UPDATE onboarding_documents
      SET signer_ip = COALESCE(${input.ip ?? null}, signer_ip),
          signer_user_agent = COALESCE(${input.userAgent ?? null}, signer_user_agent)
      WHERE id = ${input.id}
    `);
  }
  const doc = normalize(rowsOf(r)[0]);
  await logEvent(input.id, "signed", null, { signature_type: input.signatureType });
  return doc;
}

export async function markCompleted(id: number, completedBy: number | null): Promise<OnboardingDocumentRow> {
  const r = await db.execute(sql`
    UPDATE onboarding_documents
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `);
  const doc = normalize(rowsOf(r)[0]);
  await logEvent(id, "completed", completedBy, {});
  // Auto-update the onboarding checklist.
  await syncChecklistFromDocument(doc);
  return doc;
}

/** Map a completed document to its checklist column and set it true. */
export async function syncChecklistFromDocument(doc: OnboardingDocumentRow): Promise<void> {
  const column =
    doc.doc_type === "offer_letter" ? "offer_letter_signed" :
    doc.doc_type === "ica" ? "ica_signed" :
    doc.doc_type === "w9" ? "w9_submitted" : null;
  if (!column) return;
  // Ensure a checklist row exists, then set the column.
  await db.execute(sql`
    INSERT INTO onboarding_checklist (user_id) VALUES (${doc.user_id})
    ON CONFLICT (user_id) DO NOTHING
  `);
  // Column name is allowlisted above — safe to interpolate.
  await db.execute(sql.raw(`UPDATE onboarding_checklist SET ${column} = TRUE, updated_at = now() WHERE user_id = ${Number(doc.user_id)}`));
}

export async function voidDocument(id: number, performedBy: number | null): Promise<void> {
  await db.execute(sql`UPDATE onboarding_documents SET status = 'pending', updated_at = now() WHERE id = ${id}`);
  await logEvent(id, "voided", performedBy, {});
}

async function logEvent(documentId: number, eventType: string, performedBy: number | null, metadata: Record<string, any>): Promise<void> {
  await db.execute(sql`
    INSERT INTO onboarding_document_events (document_id, event_type, performed_by, metadata)
    VALUES (${documentId}, ${eventType}, ${performedBy}, ${JSON.stringify(metadata)}::jsonb)
  `);
}

export async function getDocumentEvents(documentId: number) {
  const r = await db.execute(sql`
    SELECT * FROM onboarding_document_events WHERE document_id = ${documentId} ORDER BY created_at ASC
  `);
  return rowsOf(r);
}

/** Pending (sent/viewed, not signed) documents for the agent-facing "action needed" view. */
export async function getPendingForUser(userId: number): Promise<OnboardingDocumentRow[]> {
  const r = await db.execute(sql`
    SELECT * FROM onboarding_documents
    WHERE user_id = ${userId} AND status IN ('sent', 'viewed')
    ORDER BY created_at ASC
  `);
  return rowsOf(r).map(normalize);
}
