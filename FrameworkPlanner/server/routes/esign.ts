/**
 * server/routes/esign.ts — HTTP layer for the self-built e-sign module (v2).
 *
 * Mounted from server/app.ts AFTER registerRoutes() (see the mount call site
 * there). All business logic lives in server/esign/*; this file is thin HTTP
 * glue. routes.ts is intentionally NOT touched (conflict avoidance).
 *
 * Agent routes (session auth + "esign" feature flag):
 *   POST /api/esign/envelopes            create from template + deal data
 *   GET  /api/esign/envelopes            list v2 envelopes
 *   GET  /api/esign/envelopes/:id        detail + audit trail + verification
 *   POST /api/esign/envelopes/:id/send   send -> signer links issued
 *   POST /api/esign/envelopes/:id/void   void envelope
 *   GET  /api/esign/envelopes/:id/verify hash-chain + PDF verification
 *   GET  /api/esign/envelopes/:id/certificate  certificate JSON
 *   GET  /api/esign/envelopes/:id/pdf    download completed packet
 *
 * Public signer routes (HMAC token auth, NO session):
 *   GET  /api/esign/sign/:token             signing context
 *   POST /api/esign/sign/:token/viewed      viewed event
 *   POST /api/esign/sign/:token/decline     decline
 *   POST /api/esign/sign/:token/sign        capture signature (draw/type/upload)
 *   GET  /api/esign/sign/:token/certificate certificate JSON (post-completion)
 *   GET  /api/esign/sign/:token/pdf         download packet (signers only)
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage.js";
import { createIsFeatureEnabled, isFeatureBypassUser } from "../featureFlags.js";
import {
  EsignError,
  buildCertificate,
  createEnvelopeFromTemplate,
  declineWithToken,
  expireStaleEnvelopes,
  getEnvelopeDetail,
  getFinalPdf,
  getFinalPdfByToken,
  getSignerContext,
  listEnvelopes,
  markSignerViewed,
  sendEnvelope,
  signWithToken,
  verifyEnvelope,
  voidEnvelope,
} from "../esign/envelopes.js";

const isFeatureEnabled = createIsFeatureEnabled(storage.getUserFeatureFlag.bind(storage));

async function requireAgent(req: Request, res: Response) {
  const userId = (req as any).session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  const user = await storage.getUserByIdWithoutProfilePicture(userId);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  if (!(await isFeatureEnabled(user.id, "esign", isFeatureBypassUser(user)))) {
    res.status(403).json({ message: "E-sign is not enabled for this account. Ask an administrator to enable the esign feature." });
    return null;
  }
  return user;
}

function reqMeta(req: Request) {
  return {
    ip: (req.ip || (req.headers["x-forwarded-for"] as string) || "").toString().slice(0, 50) || undefined,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500) || undefined,
  };
}

function handleError(res: Response, error: any) {
  if (error instanceof EsignError) {
    return res.status(error.http).json({ message: error.message, code: error.code, details: error.details ?? undefined });
  }
  if (error?.name === "ZodError" || error?.issues) {
    const issues = (error.issues || []).map((i: any) => `${i.path?.join(".") || "body"}: ${i.message}`);
    return res.status(400).json({ message: issues.join("; ") || "Invalid input", code: "validation" });
  }
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: "esign", kind: "route_error", message: String(error?.message || error) }));
  return res.status(500).json({ message: "E-sign request failed." });
}

export function registerEsignRoutes(app: Express) {
  // ---------------- Agent routes ----------------
  app.post("/api/esign/envelopes", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const out = await createEnvelopeFromTemplate(req.body, user.id);
      res.status(201).json(out);
    } catch (e: any) {
      handleError(res, e);
    }
  });

  app.get("/api/esign/envelopes", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      res.json(await listEnvelopes(Number(req.query.limit) || 50));
    } catch (e: any) {
      handleError(res, e);
    }
  });

  app.get("/api/esign/envelopes/:id", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      res.json(await getEnvelopeDetail(Number(req.params.id)));
    } catch (e: any) {
      handleError(res, e);
    }
  });

  app.post("/api/esign/envelopes/:id/send", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      res.json(await sendEnvelope(Number(req.params.id), user.id, baseUrl));
    } catch (e: any) {
      handleError(res, e);
    }
  });

  app.post("/api/esign/envelopes/:id/void", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
      res.json(await voidEnvelope(Number(req.params.id), user.id, reason));
    } catch (e: any) {
      handleError(res, e);
    }
  });

  app.get("/api/esign/envelopes/:id/verify", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      res.json(await verifyEnvelope(Number(req.params.id)));
    } catch (e: any) {
      handleError(res, e);
    }
  });

  app.get("/api/esign/envelopes/:id/certificate", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      res.json(await buildCertificate(Number(req.params.id)));
    } catch (e: any) {
      handleError(res, e);
    }
  });

  app.get("/api/esign/envelopes/:id/pdf", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const { bytes, filename } = await getFinalPdf(Number(req.params.id));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(bytes);
    } catch (e: any) {
      handleError(res, e);
    }
  });

  // ---------------- Public signer routes (token auth) ----------------
  app.get("/api/esign/sign/:token", async (req: Request, res: Response) => {
    try {
      res.json(await getSignerContext(req.params.token));
    } catch (e: any) {
      handleError(res, e);
    }
  });

  app.post("/api/esign/sign/:token/viewed", async (req: Request, res: Response) => {
    try {
      res.json(await markSignerViewed(req.params.token, reqMeta(req)));
    } catch (e: any) {
      handleError(res, e);
    }
  });

  app.post("/api/esign/sign/:token/decline", async (req: Request, res: Response) => {
    try {
      const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
      res.json(await declineWithToken(req.params.token, reason, reqMeta(req)));
    } catch (e: any) {
      handleError(res, e);
    }
  });

  app.post("/api/esign/sign/:token/sign", async (req: Request, res: Response) => {
    try {
      res.json(await signWithToken(req.params.token, req.body, reqMeta(req)));
    } catch (e: any) {
      handleError(res, e);
    }
  });

  app.get("/api/esign/sign/:token/certificate", async (req: Request, res: Response) => {
    try {
      const ctx = await getSignerContext(req.params.token);
      res.json(await buildCertificate(ctx.envelope.id));
    } catch (e: any) {
      handleError(res, e);
    }
  });

  app.get("/api/esign/sign/:token/pdf", async (req: Request, res: Response) => {
    try {
      const { bytes, filename } = await getFinalPdfByToken(req.params.token);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.send(bytes);
    } catch (e: any) {
      handleError(res, e);
    }
  });
}

/** Sweeper entrypoint for cron wiring (not auto-registered; wire where the
 *  app's other sweepers run). */
export async function sweepExpiredEsignEnvelopes() {
  return expireStaleEnvelopes();
}
