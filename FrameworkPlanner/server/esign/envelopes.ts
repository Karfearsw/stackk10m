/**
 * server/esign/envelopes.ts — Self-built e-sign (v2) envelope orchestration.
 *
 * Uses the EXISTING tables (contract_envelopes / contract_signers /
 * contract_events / contract_documents / contracts) extended by migration
 * 0081_esign_selfbuilt.sql. The SHA-256 hash-chained audit trail lives in
 * contract_events; signer links are HMAC-signed single-use tokens.
 *
 * All signing decisions route through ceremony.ts guards so the HTTP layer
 * cannot bypass them.
 *
 * ATTORNEY REVIEW REQUIRED BEFORE PRODUCTION USE. Not legal advice.
 */
import crypto from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db.js";
import {
  contractDocuments,
  contractEnvelopes,
  contractEvents,
  contractSigners,
  contractTemplates,
  contracts,
} from "../shared-schema.js";
import { mergeTemplate } from "../services/esign/merge.js";
import {
  appendAuditEvent,
  verifyAuditChain,
  type AuditRow,
  type AuditStore,
} from "./audit.js";
import { buildSignedPacket, verifyFinalPdf, EsignPdfError } from "./pdf.js";
import { issueSignerToken, verifySignerToken, type SignerTokenClaims } from "./tokens.js";
import { sendCompletionNotice, sendSignerInvitation } from "./notify.js";
import {
  canAccessSignerLink,
  canSignerSign,
  statusAfterSign,
} from "./ceremony.js";
import {
  ESIGN_CONSENT_TEXT,
  createEnvelopeSchema,
  signEnvelopeSchema,
  type CertificateInfo,
  type CreateEnvelopeInput,
  type SignEnvelopeInput,
} from "./types.js";

export class EsignError extends Error {
  code: string;
  http: number;
  details?: unknown;
  constructor(code: string, message: string, http = 400, details?: unknown) {
    super(message);
    this.name = "EsignError";
    this.code = code;
    this.http = http;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Audit store over drizzle
// ---------------------------------------------------------------------------
function toAuditRow(r: any): AuditRow {
  return {
    id: r.id,
    contractId: r.contractId,
    eventType: r.eventType,
    payloadJson: String(r.payloadJson ?? "{}"),
    ip: r.ip ?? null,
    userAgent: r.userAgent ?? null,
    actorType: r.actorType ?? "system",
    actorUserId: r.actorUserId ?? null,
    actorContactId: r.actorContactId ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
    eventHash: r.eventHash ?? null,
    prevHash: r.prevHash ?? null,
  };
}

export function drizzleAuditStore(): AuditStore {
  return {
    async latest(contractId: number) {
      const rows = await db
        .select()
        .from(contractEvents)
        .where(eq(contractEvents.contractId, contractId))
        .orderBy(desc(contractEvents.id))
        .limit(1);
      return rows[0] ? toAuditRow(rows[0]) : null;
    },
    async all(contractId: number) {
      const rows = await db
        .select()
        .from(contractEvents)
        .where(eq(contractEvents.contractId, contractId))
        .orderBy(asc(contractEvents.id));
      return rows.map(toAuditRow);
    },
    async insert(row) {
      const [inserted] = await db
        .insert(contractEvents)
        .values({
          contractId: row.contractId,
          eventType: row.eventType,
          payloadJson: row.payloadJson,
          ip: row.ip,
          userAgent: row.userAgent,
          actorType: row.actorType,
          actorUserId: row.actorUserId,
          actorContactId: row.actorContactId,
          eventHash: row.eventHash,
          prevHash: row.prevHash,
          createdAt: row.createdAt,
        })
        .returning();
      return toAuditRow(inserted);
    },
  };
}

async function audit(
  contractId: number,
  eventType: string,
  payload: unknown,
  opts: { actorType?: string; actorUserId?: number | null; ip?: string | null; userAgent?: string | null } = {}
): Promise<AuditRow> {
  return appendAuditEvent(drizzleAuditStore(), contractId, eventType, payload, opts);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function dataUrlToBase64(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  const m = s.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  const b64 = m ? m[2] : s;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new EsignError("bad_signature_image", "Signature image must be base64 or a PNG/JPEG data URL.");
  return b64.replace(/\s+/g, "");
}

async function getEnvelopeOrThrow(id: number) {
  const rows = await db.select().from(contractEnvelopes).where(eq(contractEnvelopes.id, id)).limit(1);
  if (!rows[0]) throw new EsignError("not_found", "Envelope not found.", 404);
  return rows[0];
}

async function getSigners(envelopeId: number) {
  return db
    .select()
    .from(contractSigners)
    .where(eq(contractSigners.envelopeId, envelopeId))
    .orderBy(asc(contractSigners.signingOrder), asc(contractSigners.id));
}

function parseNotificationLog(raw: unknown): unknown[] {
  try {
    const v = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function appendNotificationLog(envelopeId: number, entry: unknown) {
  const env = await getEnvelopeOrThrow(envelopeId);
  const log = parseNotificationLog((env as any).notificationLog);
  log.push({ at: new Date().toISOString(), ...(entry as object) });
  await db.update(contractEnvelopes).set({ notificationLog: JSON.stringify(log) }).where(eq(contractEnvelopes.id, envelopeId));
}

/** Atomically consume a signer token (single-use). Returns false if already used. */
async function consumeSignerToken(signerId: number): Promise<boolean> {
  const res: any = await db
    .update(contractSigners)
    .set({ tokenUsedAt: new Date() })
    .where(and(eq(contractSigners.id, signerId), isNull(contractSigners.tokenUsedAt)));
  const affected = Number(res?.rowCount ?? res?.length ?? 0);
  return affected > 0;
}

/** Resolve the token to (envelope, signer, claims), enforcing HMAC + nonce. */
async function resolveToken(token: string): Promise<{ env: any; signer: any; claims: SignerTokenClaims }> {
  const v = verifySignerToken(String(token || "").trim());
  if (!v.ok) {
    throw new EsignError("bad_token", v.reason === "expired" ? "This signing link has expired." : "Invalid signing link.", v.reason === "expired" ? 410 : 404);
  }
  const env = await getEnvelopeOrThrow(v.claims.envelopeId);
  const rows = await db.select().from(contractSigners).where(eq(contractSigners.id, v.claims.signerId)).limit(1);
  const signer = rows[0];
  if (!signer || Number((signer as any).envelopeId) !== env.id) {
    throw new EsignError("bad_token", "Invalid signing link.", 404);
  }
  return { env, signer, claims: v.claims };
}

function publicSigner(s: any) {
  return {
    id: s.id, name: s.name, email: s.email, role: s.role,
    status: s.status, signingOrder: s.signingOrder,
    sentAt: s.sentAt, viewedAt: s.viewedAt, signedAt: s.signedAt, expiresAt: s.expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export async function createEnvelopeFromTemplate(rawInput: unknown, createdByUserId: number) {
  const input: CreateEnvelopeInput = createEnvelopeSchema.parse(rawInput);

  const tRows = await db.select().from(contractTemplates).where(eq(contractTemplates.id, input.templateId)).limit(1);
  const template = tRows[0];
  if (!template) throw new EsignError("template_not_found", "Contract template not found.", 404);
  if ((template as any).isActive === false) throw new EsignError("template_inactive", "Contract template is inactive.", 400);

  const merged = mergeTemplate(String((template as any).content || ""), input.mergeData ?? {});

  // Audit-trail anchor: a real contract row (optional for standalone envelopes).
  let contractId: number | null = input.contractId ?? null;
  if (!contractId) {
    const md: any = input.mergeData ?? {};
    const propertyId = Number(md.propertyId ?? md.property_id);
    if (Number.isInteger(propertyId) && propertyId > 0) {
      const [c] = await db
        .insert(contracts)
        .values({
          propertyId,
          title: input.title || (template as any).name || "E-sign contract",
          status: "pending",
          templateId: template.id,
          templateVersion: (template as any).version ?? 1,
          mergeDataSnapshot: input.mergeData as any,
          ownerUserId: createdByUserId,
        })
        .returning({ id: contracts.id });
      contractId = c.id;
    }
    // Standalone envelopes allowed without contract anchor (contractId stays null).
  } else {
    const cRows = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.id, contractId)).limit(1);
    if (!cRows[0]) throw new EsignError("contract_not_found", "Contract not found.", 404);
  }

  const [doc] = await db
    .insert(contractDocuments)
    .values({
      templateId: template.id,
      propertyId: null,
      title: input.title || (template as any).name || "E-sign document",
      documentType: "contract",
      status: "draft",
      content: merged,
      mergeData: JSON.stringify(input.mergeData ?? {}),
      createdBy: `user:${createdByUserId}`,
    })
    .returning();

  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  // Legacy NOT NULL column on the envelope; v2 stores per-signer HMAC tokens on
  // contract_signers.token_nonce. This is an opaque envelope reference.
  const envelopeRefHash = crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");

  const [env] = await db
    .insert(contractEnvelopes)
    .values({
      documentId: doc.id,
      contractId,
      status: "draft",
      signingMode: input.signingMode,
      tokenHash: envelopeRefHash,
      expiresAt,
      esignVersion: 2,
      notificationLog: "[]",
    } as any)
    .returning();

  const signersOut: Array<{ signer: any; token: string; nonce: string }> = [];
  for (const s of input.signers) {
    const [signer] = await db
      .insert(contractSigners)
      .values({
        contractId,
        envelopeId: env.id,
        name: s.name,
        email: s.email,
        phone: s.phone ?? null,
        role: s.role,
        signingOrder: s.order,
        status: "pending",
        expiresAt,
      } as any)
      .returning();
    const { token, nonce } = issueSignerToken({ envelopeId: env.id, signerId: signer.id, expiresAt });
    await db.update(contractSigners).set({ tokenNonce: nonce } as any).where(eq(contractSigners.id, signer.id));
    signersOut.push({ signer: { ...signer, tokenNonce: nonce }, token, nonce });
  }

  // Skip audit for standalone envelopes (no contract anchor).
  if (contractId) {
    await audit(contractId, "esign.envelope_created", {
    envelopeId: env.id,
    documentId: doc.id,
    templateId: template.id,
    templateVersion: (template as any).version ?? 1,
    signingMode: input.signingMode,
    signerCount: signersOut.length,
    signers: signersOut.map((x) => ({ id: x.signer.id, name: x.signer.name, email: x.signer.email, order: x.signer.signingOrder })),
  }, { actorType: "agent", actorUserId: createdByUserId });
  }

  return {
    envelope: env,
    documentId: doc.id,
    contractId,
    signers: signersOut.map((x) => ({ ...publicSigner(x.signer), token: x.token })),
  };
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------
export async function sendEnvelope(envelopeId: number, userId: number, baseUrl: string) {
  const env = await getEnvelopeOrThrow(envelopeId);
  if (env.status !== "draft") throw new EsignError("bad_state", `Envelope cannot be sent from status "${env.status}".`, 409);
  const signers = await getSigners(envelopeId);
  if (!signers.length) throw new EsignError("no_signers", "Envelope has no signers.", 400);

  const expiresAt = (env as any).expiresAt ? new Date((env as any).expiresAt) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const now = new Date();
  await db.update(contractEnvelopes).set({ status: "sent", sentAt: now, expiresAt } as any).where(eq(contractEnvelopes.id, envelopeId));

  const doc = (await db.select().from(contractDocuments).where(eq(contractDocuments.id, (env as any).documentId)).limit(1))[0];
  await db.update(contractDocuments).set({ status: "sent" }).where(eq(contractDocuments.id, (env as any).documentId));

  const base = String(baseUrl || "").replace(/\/$/, "");
  const links: Array<{ signerId: number; name: string; email: string | null; signerUrl: string }> = [];
  for (const s of signers) {
    await db.update(contractSigners).set({ status: "sent", sentAt: now, expiresAt } as any).where(eq(contractSigners.id, s.id));
    // Re-issue the token bound to the (possibly extended) expiry.
    const { token, nonce } = issueSignerToken({ envelopeId, signerId: s.id, expiresAt });
    await db.update(contractSigners).set({ tokenNonce: nonce, tokenUsedAt: null } as any).where(eq(contractSigners.id, s.id));
    const signerUrl = `${base}/esign/${token}`;
    links.push({ signerId: s.id, name: s.name, email: (s as any).email, signerUrl });

    const notify = await sendSignerInvitation({
      envelopeId,
      signerName: s.name,
      signerEmail: (s as any).email,
      signerPhone: (s as any).phone,
      signerUrl,
      documentTitle: String((doc as any)?.title || "Document"),
      expiresAt,
    });
    await appendNotificationLog(envelopeId, { kind: "invitation", signerId: s.id, ...notify });
  }

  await audit((env as any).contractId, "esign.envelope_sent", {
    envelopeId,
    signerCount: signers.length,
    expiresAt: expiresAt.toISOString(),
  }, { actorType: "agent", actorUserId: userId });

  return { envelopeId, status: "sent" as const, expiresAt: expiresAt.toISOString(), links };
}

// ---------------------------------------------------------------------------
// Public signer context
// ---------------------------------------------------------------------------
export async function getSignerContext(token: string) {
  const { env, signer, claims } = await resolveToken(token);
  const access = canAccessSignerLink(env as any, signer as any, claims);
  if (!access.ok) {
    throw new EsignError(
      access.code === "link_expired" ? "link_expired" : "bad_token",
      access.code === "link_expired" ? "This signing link has expired." : "This signing link is no longer valid.",
      access.code === "link_expired" ? 410 : 404
    );
  }
  const doc = (await db.select().from(contractDocuments).where(eq(contractDocuments.id, (env as any).documentId)).limit(1))[0];
  const allSigners = await getSigners(env.id);
  return {
    envelope: {
      id: env.id,
      status: env.status,
      title: (doc as any)?.title || "Document",
      expiresAt: (env as any).expiresAt,
      signingMode: (env as any).signingMode,
      sentAt: (env as any).sentAt,
    },
    signer: publicSigner(signer),
    signers: allSigners.map((s) => ({ id: s.id, name: s.name, role: s.role, status: s.status, signingOrder: s.signingOrder })),
    document: { id: (doc as any)?.id, title: (doc as any)?.title, content: String((doc as any)?.content || "") },
    consentText: ESIGN_CONSENT_TEXT,
  };
}

export async function markSignerViewed(token: string, reqMeta: { ip?: string; userAgent?: string }) {
  const { env, signer, claims } = await resolveToken(token);
  const access = canAccessSignerLink(env as any, signer as any, claims);
  if (!access.ok) throw new EsignError("bad_token", "This signing link is no longer valid.", 404);

  const updates: any = { viewedAt: (signer as any).viewedAt || new Date() };
  if (signer.status === "sent") updates.status = "viewed";
  await db.update(contractSigners).set(updates).where(eq(contractSigners.id, signer.id));
  if (env.status === "sent") {
    await db.update(contractEnvelopes).set({ status: "viewed", viewedAt: (env as any).viewedAt || new Date() } as any).where(eq(contractEnvelopes.id, env.id));
  }
  await audit((env as any).contractId, "esign.viewed", { envelopeId: env.id, signerId: signer.id }, {
    actorType: "signer", ip: reqMeta.ip ?? null, userAgent: reqMeta.userAgent ?? null,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sign
// ---------------------------------------------------------------------------
export async function signWithToken(token: string, rawInput: unknown, reqMeta: { ip?: string; userAgent?: string }) {
  // Validate the payload BEFORE touching the token: a malformed signature
  // submission must not consume the single-use link.
  const input: SignEnvelopeInput = signEnvelopeSchema.parse(rawInput);
  if (input.signatureType === "typed" && !String(input.signatureText || "").trim()) {
    throw new EsignError("bad_input", "Typed signature text is required.", 400);
  }
  if (input.signatureType !== "typed" && !dataUrlToBase64(input.signatureImageBase64)) {
    throw new EsignError("bad_input", "A signature image is required (draw or upload).", 400);
  }
  const { env, signer, claims } = await resolveToken(token);
  const allSigners = await getSigners(env.id);
  const guard = canSignerSign(env as any, signer as any, allSigners as any, claims);
  if (!guard.ok) {
    const map: Record<string, { http: number; message: string }> = {
      link_expired: { http: 410, message: "This signing link has expired." },
      envelope_not_signable: { http: 409, message: `Envelope is ${(guard as any).status} and can no longer be signed.` },
      signer_not_signable: { http: 409, message: `This signer already ${(guard as any).status}.` },
      token_reused: { http: 409, message: "This signing link has already been used." },
      token_nonce_mismatch: { http: 404, message: "Invalid signing link." },
      out_of_order: { http: 409, message: "Other signers must sign first (sequential order)." },
    };
    const m = map[guard.code];
    throw new EsignError(guard.code, m.message, m.http, guard);
  }

  // Consume the token FIRST (single-use), atomically — a replay racing this
  // request loses the UPDATE ... WHERE token_used_at IS NULL.
  const consumed = await consumeSignerToken(signer.id);
  if (!consumed) throw new EsignError("token_reused", "This signing link has already been used.", 409);

  let imageBase64: string | null = null;
  let signatureText: string | null = null;
  if (input.signatureType === "typed") {
    signatureText = String(input.signatureText || "").trim();
  } else {
    // Already validated above (pre-consumption); the non-null assertion is safe.
    imageBase64 = dataUrlToBase64(input.signatureImageBase64)!;
  }

  const now = new Date();
  await db.update(contractSigners).set({
    status: "signed",
    signedAt: now,
    consentAt: now,
    consentText: ESIGN_CONSENT_TEXT,
    signatureImageBase64: imageBase64,
    signatureSvg: input.signatureSvg ?? null,
    signatureMetadataJson: JSON.stringify({
      signatureType: input.signatureType,
      signatureText: input.signatureType === "typed" ? signatureText : null,
      legalName: input.legalName,
      ip: reqMeta.ip ?? null,
      userAgent: reqMeta.userAgent ?? null,
    }),
  } as any).where(eq(contractSigners.id, signer.id));

  await audit((env as any).contractId, "esign.signer_signed", {
    envelopeId: env.id,
    signerId: signer.id,
    name: signer.name,
    signatureType: input.signatureType,
    legalName: input.legalName,
  }, { actorType: "signer", ip: reqMeta.ip ?? null, userAgent: reqMeta.userAgent ?? null });

  const refreshed = await getSigners(env.id);
  const nextStatus = statusAfterSign(refreshed.map((s) => s.status));
  await db.update(contractEnvelopes).set({ status: nextStatus, signedAt: now } as any).where(eq(contractEnvelopes.id, env.id));

  let certificate: CertificateInfo | null = null;
  if (nextStatus === "completed") {
    certificate = await finalizeEnvelope(env.id, reqMeta);
  } else {
    // Partially signed: still notify remaining signers (log-only stub).
    for (const s of refreshed) {
      if (s.status !== "signed") {
        const n = await sendSignerInvitation({
          envelopeId: env.id,
          signerName: s.name,
          signerEmail: (s as any).email,
          signerPhone: (s as any).phone,
          signerUrl: "(token-gated link — see envelope detail)",
          documentTitle: "Document",
          expiresAt: new Date((env as any).expiresAt),
        });
        await appendNotificationLog(env.id, { kind: "reminder_next_signer", signerId: s.id, ...n });
      }
    }
  }

  return { ok: true, envelopeId: env.id, status: nextStatus, certificate };
}

// ---------------------------------------------------------------------------
// Finalize: render PDF, overlay signatures, certificate, hashes
// ---------------------------------------------------------------------------
async function finalizeEnvelope(envelopeId: number, reqMeta: { ip?: string; userAgent?: string }): Promise<CertificateInfo> {
  const env = await getEnvelopeOrThrow(envelopeId);
  const signers = await getSigners(envelopeId);
  const doc = (await db.select().from(contractDocuments).where(eq(contractDocuments.id, (env as any).documentId)).limit(1))[0];
  const title = String((doc as any)?.title || "Document");
  const content = String((doc as any)?.content || "");

  const signatures = signers.map((s: any) => {
    let meta: any = {};
    try { meta = JSON.parse(String(s.signatureMetadataJson || "{}")); } catch {}
    return {
      signerName: s.name,
      signerEmail: s.email ?? null,
      role: s.role || "signer",
      signatureType: (meta.signatureType || "drawn") as "drawn" | "typed" | "uploaded",
      signatureText: meta.signatureText ?? null,
      signatureImageBase64: s.signatureImageBase64 ?? null,
      signedAt: s.signedAt ? new Date(s.signedAt) : new Date(),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      consentAt: s.consentAt ? new Date(s.consentAt) : null,
    };
  });

  // Chain state before we append the finalization events (the certificate
  // carries the chain head as of completion).
  const preVerify = await verifyAuditChain(drizzleAuditStore(), (env as any).contractId);
  if (!preVerify.ok) {
    throw new EsignError("audit_chain_broken", "Audit chain failed verification before finalization — refusing to complete.", 500, preVerify);
  }

  let packet;
  try {
    packet = await buildSignedPacket({
      title,
      mergedContent: content,
      signatures,
      certificate: {
        envelopeId,
        title,
        documentSha256: null, // computed inside buildSignedPacket from the rendered base PDF
        auditChainHead: preVerify.head,
        auditEventCount: preVerify.events,
        completedAt: new Date(),
      },
    });
  } catch (e: any) {
    if (e instanceof EsignPdfError) throw new EsignError("pdf_failed", e.message, 500, { code: e.code });
    throw e;
  }
  // Rebuild certificate hash reference: the document hash is stable; patch it
  // into the stored record (the PDF already embeds it in metadata + cert page).
  const completedAt = new Date();
  await db.update(contractEnvelopes).set({
    signedPdfBase64: packet.bytes.toString("base64"),
    documentSha256: packet.documentSha256,
    finalPdfSha256: packet.finalPdfSha256,
    completedAt,
    status: "completed",
  } as any).where(eq(contractEnvelopes.id, envelopeId));

  await audit((env as any).contractId, "esign.document_finalized", {
    envelopeId,
    documentSha256: packet.documentSha256,
    signerCount: signers.length,
  }, { actorType: "system", ip: reqMeta.ip ?? null, userAgent: reqMeta.userAgent ?? null });

  const completed = await audit((env as any).contractId, "esign.envelope_completed", {
    envelopeId,
    finalPdfSha256: packet.finalPdfSha256,
    signers: signers.map((s: any) => ({ id: s.id, name: s.name, email: s.email })),
  }, { actorType: "system", ip: reqMeta.ip ?? null, userAgent: reqMeta.userAgent ?? null });

  for (const s of signers) {
    const n = await sendCompletionNotice({
      envelopeId, signerName: s.name, signerEmail: (s as any).email, documentTitle: title,
    });
    await appendNotificationLog(envelopeId, { kind: "completion", signerId: s.id, ...n });
  }

  await db.update(contracts).set({ status: "executed", executedAt: completedAt } as any)
    .where(eq(contracts.id, (env as any).contractId));

  return buildCertificate(envelopeId);
}

// ---------------------------------------------------------------------------
// Decline / void / expire
// ---------------------------------------------------------------------------
export async function declineWithToken(token: string, reason: string | undefined, reqMeta: { ip?: string; userAgent?: string }) {
  const { env, signer, claims } = await resolveToken(token);
  const access = canAccessSignerLink(env as any, signer as any, claims);
  if (!access.ok) throw new EsignError("bad_token", "This signing link is no longer valid.", 404);
  if (signer.status === "signed") throw new EsignError("already_signed", "This signer has already signed.", 409);
  if (signer.status === "declined") throw new EsignError("already_declined", "Already declined.", 409);

  await db.update(contractSigners).set({
    status: "declined", declinedAt: new Date(), declineReason: String(reason || "").slice(0, 1000) || null,
  } as any).where(eq(contractSigners.id, signer.id));

  await audit((env as any).contractId, "esign.signer_declined", {
    envelopeId: env.id, signerId: signer.id, name: signer.name, reason: reason || null,
  }, { actorType: "signer", ip: reqMeta.ip ?? null, userAgent: reqMeta.userAgent ?? null });

  // If no signable signers remain, void the envelope.
  const remaining = (await getSigners(env.id)).filter((s) => ["pending", "sent", "viewed"].includes(s.status));
  if (!remaining.length && !["completed", "voided", "expired"].includes(env.status)) {
    await db.update(contractEnvelopes).set({ status: "voided", voidedAt: new Date() } as any).where(eq(contractEnvelopes.id, env.id));
    await audit((env as any).contractId, "esign.envelope_voided", { envelopeId: env.id, reason: "all signers declined" }, { actorType: "system" });
  }
  return { ok: true };
}

export async function voidEnvelope(envelopeId: number, userId: number, reason?: string) {
  const env = await getEnvelopeOrThrow(envelopeId);
  if (["completed", "voided", "expired"].includes(env.status)) {
    throw new EsignError("bad_state", `Envelope is already ${env.status}.`, 409);
  }
  await db.update(contractEnvelopes).set({ status: "voided", voidedAt: new Date() } as any).where(eq(contractEnvelopes.id, envelopeId));
  for (const s of await getSigners(envelopeId)) {
    if (["pending", "sent", "viewed"].includes(s.status)) {
      await db.update(contractSigners).set({ status: "expired" }).where(eq(contractSigners.id, s.id));
    }
  }
  await audit((env as any).contractId, "esign.envelope_voided", { envelopeId, reason: reason || null }, { actorType: "agent", actorUserId: userId });
  return { ok: true, status: "voided" as const };
}

export async function expireStaleEnvelopes(): Promise<{ expired: number }> {
  const now = new Date();
  const stale = await db
    .select()
    .from(contractEnvelopes)
    .where(and(
      // only v2 envelopes carry esignVersion 2; legacy envelopes keep their own sweeper
      eq(contractEnvelopes.esignVersion, 2)
    ));
  let expired = 0;
  for (const env of stale as any[]) {
    if (!["sent", "viewed", "signed"].includes(env.status)) continue;
    if (!env.expiresAt || new Date(env.expiresAt).getTime() > now.getTime()) continue;
    await db.update(contractEnvelopes).set({ status: "expired" }).where(eq(contractEnvelopes.id, env.id));
    for (const s of await getSigners(env.id)) {
      if (["pending", "sent", "viewed"].includes(s.status)) {
        await db.update(contractSigners).set({ status: "expired" }).where(eq(contractSigners.id, s.id));
      }
    }
    await audit(env.contractId, "esign.envelope_expired", { envelopeId: env.id }, { actorType: "system" });
    expired++;
  }
  return { expired };
}

// ---------------------------------------------------------------------------
// Detail / verify / certificate / pdf download (agent + signer use)
// ---------------------------------------------------------------------------
export async function getEnvelopeDetail(envelopeId: number) {
  const env = await getEnvelopeOrThrow(envelopeId);
  const signers = await getSigners(envelopeId);
  const doc = (await db.select().from(contractDocuments).where(eq(contractDocuments.id, (env as any).documentId)).limit(1))[0];
  const verify = await verifyEnvelope(envelopeId);
  const events = await drizzleAuditStore().all((env as any).contractId);
  return {
    envelope: {
      ...env,
      tokenHash: undefined,
      signedPdfBase64: undefined,
      signers: signers.map((s: any) => ({ ...publicSigner(s), tokenNonce: undefined, signatureImageBase64: undefined })),
    },
    document: { id: (doc as any)?.id, title: (doc as any)?.title, status: (doc as any)?.status },
    verification: verify,
    auditTrail: events.map((e) => ({
      id: e.id, eventType: e.eventType, payload: JSON.parse(e.payloadJson),
      actorType: e.actorType, ip: e.ip, createdAt: e.createdAt,
      eventHash: e.eventHash, prevHash: e.prevHash,
    })),
  };
}

export async function listEnvelopes(limit = 50) {
  const rows = await db
    .select()
    .from(contractEnvelopes)
    .where(eq(contractEnvelopes.esignVersion, 2))
    .orderBy(desc(contractEnvelopes.id))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((e: any) => ({ ...e, tokenHash: undefined, signedPdfBase64: undefined }));
}

export async function verifyEnvelope(envelopeId: number) {
  const env = await getEnvelopeOrThrow(envelopeId);
  const chain = await verifyAuditChain(drizzleAuditStore(), (env as any).contractId);
  let pdf: { finalHash: string; ok: boolean | null } | null = null;
  if ((env as any).signedPdfBase64) {
    pdf = verifyFinalPdf(Buffer.from(String((env as any).signedPdfBase64), "base64"), (env as any).finalPdfSha256 ?? null);
  }
  return {
    envelopeId,
    status: env.status,
    auditChain: chain,
    finalPdf: pdf,
    documentSha256: (env as any).documentSha256 ?? null,
    tampered: !chain.ok || (pdf ? pdf.ok === false : false),
  };
}

export async function buildCertificate(envelopeId: number): Promise<CertificateInfo> {
  const env = await getEnvelopeOrThrow(envelopeId);
  const signers = await getSigners(envelopeId);
  const doc = (await db.select().from(contractDocuments).where(eq(contractDocuments.id, (env as any).documentId)).limit(1))[0];
  const chain = await verifyAuditChain(drizzleAuditStore(), (env as any).contractId);
  return {
    envelopeId,
    title: String((doc as any)?.title || "Document"),
    status: env.status,
    documentSha256: (env as any).documentSha256 ?? null,
    finalPdfSha256: (env as any).finalPdfSha256 ?? null,
    completedAt: (env as any).completedAt ? new Date((env as any).completedAt).toISOString() : null,
    signers: signers.map((s: any) => {
      let meta: any = {};
      try { meta = JSON.parse(String(s.signatureMetadataJson || "{}")); } catch {}
      return {
        name: s.name,
        email: s.email ?? null,
        role: s.role || "signer",
        signatureType: meta.signatureType ?? null,
        signedAt: s.signedAt ? new Date(s.signedAt).toISOString() : null,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        consentAt: s.consentAt ? new Date(s.consentAt).toISOString() : null,
      };
    }),
    auditChainHead: chain.head,
    auditEvents: chain.events,
  };
}

export async function getFinalPdf(envelopeId: number): Promise<{ bytes: Buffer; filename: string }> {
  const env = await getEnvelopeOrThrow(envelopeId);
  if (!(env as any).signedPdfBase64) throw new EsignError("not_ready", "Final PDF is not available yet.", 404);
  const check = verifyFinalPdf(Buffer.from(String((env as any).signedPdfBase64), "base64"), (env as any).finalPdfSha256 ?? null);
  if (check.ok === false) throw new EsignError("tampered", "Stored PDF failed hash verification — possible tampering.", 500);
  return { bytes: Buffer.from(String((env as any).signedPdfBase64), "base64"), filename: `signed-envelope-${envelopeId}.pdf` };
}

/** Public: signer downloads the completed packet via their (consumed or live) token. */
export async function getFinalPdfByToken(token: string): Promise<{ bytes: Buffer; filename: string }> {
  const { env, signer } = await resolveToken(token);
  if (env.status !== "completed") throw new EsignError("not_ready", "The signed document is not ready yet.", 404);
  if (signer.status !== "signed") throw new EsignError("forbidden", "Only signers of this envelope may download it.", 403);
  return getFinalPdf(env.id);
}
