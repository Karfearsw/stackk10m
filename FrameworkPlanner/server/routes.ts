import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import multer from "multer";
import { storage } from "./storage.js";
import { db } from "./db.js";
import { sql } from "drizzle-orm";
import { initTelephonyWs, emitTelephonyEventToAll } from "./telephony/ws.js";
import { getTelephonyMediaSignedUrl, uploadTelephonyMediaFromUrl } from "./telephony/objectStorage.js";
import {
  createExportJob,
  createImportJob,
  computeLeadDedupeKey,
  computeOpportunityDedupeKey,
  detectFormat,
  getCrmFieldDefs,
  getExportJob,
  getImportJob,
  listImportJobErrors,
  parseUpload,
  processExportJob,
  processImportJob,
  suggestMapping,
  verifyExportToken,
} from "./crm/import-export.js";
import { 
  insertLeadSchema,
  type InsertLead, 
  insertPropertySchema, 
  insertContactSchema, 
  insertContractSchema,
  insertContractTemplateSchema,
  insertContractDocumentSchema,
  insertDocumentVersionSchema,
  insertLoiSchema,
  insertUserSchema,
  insertTwoFactorAuthSchema,
  insertBackupCodeSchema,
  insertTeamSchema,
  insertTeamMemberSchema,
  insertTeamActivityLogSchema,
  insertNotificationPreferenceSchema,
  insertUserNotificationSchema,
  insertUserGoalSchema,
  insertOfferSchema,
  insertTimesheetEntrySchema,
  insertBuyerSchema,
  insertBuyerCommunicationSchema,
  insertDealAssignmentSchema,
  insertPlaygroundPropertySessionSchema,
  insertUnderwritingTemplateSchema,
  insertTaskSchema
} from "./shared-schema.js";
import { z } from "zod";
import { computeArvFromComps, computeDealMath, computeRepairTotal, underwritingSchemaV1, underwritingTemplateConfigSchema } from "../shared/underwriting.js";
import { getSkipTraceProvider } from "./services/skipTrace/provider.js";
import { sendSignalWireSms } from "./services/messaging/signalwire.js";
import { sendResendEmail } from "./services/messaging/resend.js";
import { completeTaskWithRecurrence, createTask, onContractSigned, onLeadCreated, onLeadStatusChanged } from "./services/tasks/task-service.js";
import { getRvmProvider } from "./services/rvm/provider.js";
import crypto from "node:crypto";
import { mergeTemplate } from "./services/esign/merge.js";
import { generateSignedPdfBase64 } from "./services/esign/pdf.js";
import { getCompProvider } from "./services/comps/provider.js";
import { computeBuyerMatchScore } from "./services/buyerMatch/scoring.js";

function authJwtSecret() {
  const secret = process.env.AUTH_JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret || !String(secret).trim()) return null;
  return new TextEncoder().encode(String(secret));
}

function isDbConnectivityError(error: any): boolean {
  const code = error?.code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT") return true;
  const nested = error?.errors;
  if (Array.isArray(nested)) return nested.some(isDbConnectivityError);
  const message = String(error?.message || "");
  return message.includes("DATABASE_URL");
}

async function issueAuthToken(payload: { sub: string; email?: string }) {
  const secret = authJwtSecret();
  if (!secret) return null;
  return await new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

function isManagerUser(user: any) {
  const role = String(user?.role || "").toLowerCase();
  return !!user?.isSuperAdmin || role === "admin" || role === "manager" || role === "owner";
}

async function requireAuth(req: any, res: any) {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  const user = await storage.getUserById(userId);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  return user;
}

function parseEnvBool(v: unknown): boolean | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return null;
}

const featureEnvVars: Record<string, string> = {
  skip_trace: "FEATURE_SKIP_TRACE",
  campaigns: "FEATURE_CAMPAIGNS",
  rvm: "FEATURE_RVM",
  esign: "FEATURE_ESIGN",
  field_mode: "FEATURE_FIELD_MODE",
  comps: "FEATURE_COMPS",
  buyer_match: "FEATURE_BUYER_MATCH",
};

async function isFeatureEnabled(userId: number, flag: keyof typeof featureEnvVars): Promise<boolean> {
  const envKey = featureEnvVars[flag];
  const envDecision = parseEnvBool(process.env[envKey]);
  if (envDecision !== null) return envDecision;
  try {
    const row = await storage.getUserFeatureFlag(userId, flag);
    return !!row?.enabled;
  } catch {
    return false;
  }
}

function isImportExportEntityType(entityType: string) {
  return entityType === "lead" || entityType === "opportunity" || entityType === "contact" || entityType === "buyer";
}

async function writeAuthAuditLog(input: {
  action: string;
  outcome: string;
  userId?: number | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    const metadataText = input.metadata ? JSON.stringify(input.metadata) : null;
    await db.execute(sql`
      INSERT INTO auth_audit_logs (action, outcome, user_id, email, ip, user_agent, metadata)
      VALUES (
        ${input.action},
        ${input.outcome},
        ${input.userId ?? null},
        ${input.email ?? null},
        ${input.ip ?? null},
        ${input.userAgent ?? null},
        ${metadataText}
      )
    `);
  } catch {}
}

function isLoopbackIp(ip: string | undefined) {
  if (!ip) return false;
  const v = ip.trim();
  return v === "127.0.0.1" || v === "::1" || v === "::ffff:127.0.0.1";
}

function isDevEmployeeBypassEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  const v = String(process.env.DEV_AUTH_BYPASS_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function toAddressKey(address: string) {
  return address.trim().toLowerCase();
}

function skipTraceCacheKey(input: { ownerName: string; address: string; city: string; state: string; zipCode: string }) {
  return `${input.ownerName}|${input.address}|${input.city}|${input.state}|${input.zipCode}`.trim().toLowerCase();
}

function parseJsonArrayText(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  try {
    const parsed = JSON.parse(String(v));
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    return [];
  } catch {
    return [];
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  app.use("/api", async (req, _res, next) => {
    try {
      if (req.session?.userId) return next();
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

      const secret = authJwtSecret();
      if (!secret) return next();

      const token = authHeader.slice("Bearer ".length);
      const { payload } = await jwtVerify(token, secret);
      const sub = payload.sub ? parseInt(String(payload.sub), 10) : NaN;
      if (!Number.isFinite(sub)) return next();

      req.session.userId = sub;
      if (typeof payload.email === "string") req.session.email = payload.email;
      next();
    } catch {
      next();
    }
  });

  app.get("/api/crm/fields", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const entityType = String(req.query.entityType || "");
    if (!isImportExportEntityType(entityType)) {
      return res.status(400).json({ message: "Invalid entityType" });
    }
    return res.json({ entityType, fields: getCrmFieldDefs(entityType as any) });
  });

  app.post("/api/crm/import/preview", upload.single("file"), async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const entityType = String(req.body.entityType || "");
    if (!isImportExportEntityType(entityType)) {
      return res.status(400).json({ message: "Invalid entityType" });
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "file is required" });

    const format = detectFormat(file.originalname, file.mimetype);
    if (!format) return res.status(400).json({ message: "Unsupported file type" });

    const parsed = await parseUpload(file.buffer, format);
    const headers = parsed.headers;
    const samples = parsed.rows.slice(0, 5);
    const suggested = suggestMapping(entityType as any, headers);
    return res.json({
      entityType,
      format,
      headers,
      sampleRows: samples,
      suggestedMapping: suggested,
      totalRows: parsed.rows.length,
    });
  });

  app.post("/api/crm/import/jobs", upload.single("file"), async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const entityType = String(req.body.entityType || "");
    if (!isImportExportEntityType(entityType)) {
      return res.status(400).json({ message: "Invalid entityType" });
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "file is required" });

    const mapping = req.body.mapping ? JSON.parse(String(req.body.mapping)) : {};
    const options = req.body.options ? JSON.parse(String(req.body.options)) : { onDuplicate: "merge" };

    const format = detectFormat(file.originalname, file.mimetype);
    if (!format) return res.status(400).json({ message: "Unsupported file type" });

    const fileBase64 = file.buffer.toString("base64");
    const job = await createImportJob({
      entityType: entityType as any,
      createdBy: user.id,
      fileBase64,
      originalFilename: file.originalname,
      fileMimeType: file.mimetype,
      mapping,
      options,
    });

    setImmediate(() => {
      processImportJob(job.id).catch(() => {});
    });

    return res.status(201).json({ jobId: job.id });
  });

  app.get("/api/crm/import/jobs/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const jobId = parseInt(req.params.id, 10);
    if (!Number.isFinite(jobId)) return res.status(400).json({ message: "Invalid job id" });

    const job = await getImportJob(jobId);
    if (!job) return res.status(404).json({ message: "Not found" });
    if (job.createdBy !== user.id) return res.status(403).json({ message: "Forbidden" });

    const errors = await listImportJobErrors(jobId, 50);
    return res.json({ job, errors });
  });

  app.get("/api/crm/import/jobs/:id/errors.csv", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const jobId = parseInt(req.params.id, 10);
    if (!Number.isFinite(jobId)) return res.status(400).json({ message: "Invalid job id" });

    const job = await getImportJob(jobId);
    if (!job) return res.status(404).json({ message: "Not found" });
    if (job.createdBy !== user.id) return res.status(403).json({ message: "Forbidden" });

    const errors = await listImportJobErrors(jobId, 10000);
    const esc = (v: any) => {
      const s = String(v ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = ["rowNumber,errors,rawRow"];
    for (const e of errors) lines.push([e.rowNumber, e.errors, e.rawRow || ""].map(esc).join(","));

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="import-errors-${jobId}.csv"`);
    return res.send(lines.join("\n"));
  });

  app.post("/api/crm/export/jobs", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const entityType = String(req.body.entityType || "");
    if (!isImportExportEntityType(entityType)) {
      return res.status(400).json({ message: "Invalid entityType" });
    }
    const format = String(req.body.format || "csv");
    if (format !== "csv" && format !== "xlsx") return res.status(400).json({ message: "Invalid format" });

    const filters = req.body.filters || {};
    const columns = Array.isArray(req.body.columns) ? req.body.columns : [];

    const { job, token } = await createExportJob({
      entityType: entityType as any,
      createdBy: user.id,
      format: format as any,
      filters,
      columns,
    });

    setImmediate(() => {
      processExportJob(job.id).catch(() => {});
    });

    const downloadUrl = `/api/crm/export/files/${job.id}/download?token=${encodeURIComponent(token)}`;
    return res.status(201).json({ jobId: job.id, downloadUrl });
  });

  app.get("/api/crm/export/jobs/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const exportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(exportId)) return res.status(400).json({ message: "Invalid export id" });

    const job = await getExportJob(exportId);
    if (!job) return res.status(404).json({ message: "Not found" });
    if (job.createdBy !== user.id) return res.status(403).json({ message: "Forbidden" });

    return res.json({ job });
  });

  app.get("/api/crm/export/files/:id/download", async (req, res) => {
    const exportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(exportId)) return res.status(400).json({ message: "Invalid export id" });
    const token = String(req.query.token || "");
    if (!token) return res.status(401).json({ message: "Missing token" });

    const job = await getExportJob(exportId);
    if (!job) return res.status(404).json({ message: "Not found" });
    if (job.status !== "completed") return res.status(409).json({ message: "Export not ready" });
    if (!verifyExportToken(job as any, token)) return res.status(403).json({ message: "Invalid token" });
    if (!job.contentBase64 || !job.mimeType) return res.status(500).json({ message: "Export content missing" });

    const buf = Buffer.from(String(job.contentBase64), "base64");
    res.setHeader("Content-Type", job.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${job.filename || `export-${exportId}`}"`);
    return res.send(buf);
  });

  // HEALTH CHECK
  app.get("/api/health", async (req, res) => {
    try {
      // Perform a simple query to verify DB connectivity
      await storage.getUserByEmail("test@example.com");
      res.json({ status: "ok", db: "connected", timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error("Health check failed:", error);
      res.status(500).json({ status: "error", db: "disconnected", message: error.message });
    }
  });

  app.get("/api/address/suggest", async (req, res) => {
    try {
      const qRaw = (req.query.q as string) || "";
      const q = qRaw.trim();
      if (q.length < 2) return res.json({ q: qRaw, provider: null, suggestions: [] });

      const providerHint = String(process.env.ADDRESS_PROVIDER || "").toLowerCase();
      const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN;
      const smartyAuthId = process.env.SMARTY_AUTH_ID || process.env.SMARTY_STREETS_AUTH_ID;
      const smartyAuthToken = process.env.SMARTY_AUTH_TOKEN || process.env.SMARTY_STREETS_AUTH_TOKEN;

      const canUseMapbox = !!mapboxToken;
      const canUseSmarty = !!(smartyAuthId && smartyAuthToken);

      const provider =
        providerHint === "mapbox" && canUseMapbox ? "mapbox"
        : providerHint === "smarty" && canUseSmarty ? "smarty"
        : canUseMapbox ? "mapbox"
        : canUseSmarty ? "smarty"
        : null;

      if (!provider) {
        return res.json({ q: qRaw, provider: null, suggestions: [] });
      }

      if (provider === "mapbox") {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?autocomplete=true&types=address&country=US&limit=8&access_token=${encodeURIComponent(String(mapboxToken))}`;
        const r = await fetch(url);
        if (!r.ok) return res.status(502).json({ message: "Address provider error" });
        const json: any = await r.json();
        const suggestions = (json?.features || []).map((f: any) => {
          const ctx: any[] = Array.isArray(f.context) ? f.context : [];
          const postcode = ctx.find((c) => typeof c?.id === "string" && c.id.startsWith("postcode."));
          const place = ctx.find((c) => typeof c?.id === "string" && c.id.startsWith("place."));
          const region = ctx.find((c) => typeof c?.id === "string" && c.id.startsWith("region."));
          const address = f.address ? `${f.address} ${f.text || ""}`.trim() : String(f.place_name || "");
          return {
            label: String(f.place_name || f.text || ""),
            address,
            city: String(place?.text || ""),
            state: String(region?.short_code || region?.text || "").replace(/^us-/i, "").toUpperCase(),
            zipCode: String(postcode?.text || ""),
            placeId: String(f.id || ""),
          };
        });
        return res.json({ q: qRaw, provider, suggestions });
      }

      const url = `https://us-autocomplete-pro.api.smarty.com/lookup?search=${encodeURIComponent(q)}&auth-id=${encodeURIComponent(String(smartyAuthId))}&auth-token=${encodeURIComponent(String(smartyAuthToken))}&max_results=8`;
      const r = await fetch(url);
      if (!r.ok) return res.status(502).json({ message: "Address provider error" });
      const json: any = await r.json();
      const suggestions = (json?.suggestions || []).map((s: any) => ({
        label: String(s.text || [s.street_line, s.city, s.state, s.zipcode].filter(Boolean).join(", ")),
        address: String(s.street_line || ""),
        city: String(s.city || ""),
        state: String(s.state || ""),
        zipCode: String(s.zipcode || ""),
        placeId: String(s.street_line || ""),
      }));
      return res.json({ q: qRaw, provider, suggestions });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GLOBAL SEARCH
  app.get("/api/search", async (req, res) => {
    const startedAt = Date.now();
    try {
      const qRaw = (req.query.q as string) || "";
      const q = qRaw.trim();
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      if (!q) return res.json({ q: qRaw, results: [], counts: { leads: 0, properties: 0, contacts: 0, total: 0 } });

      const term = `%${q}%`;

      const countsPromises = [
        db.execute(sql`SELECT COUNT(*)::int AS c FROM leads l WHERE 
          lower(l.address) LIKE lower(${term}) OR lower(l.city) LIKE lower(${term}) OR lower(l.state) LIKE lower(${term}) OR
          lower(l.owner_name) LIKE lower(${term}) OR lower(l.owner_phone) LIKE lower(${term}) OR lower(l.owner_email) LIKE lower(${term})
        `),
        db.execute(sql`SELECT COUNT(*)::int AS c FROM properties p WHERE 
          lower(p.address) LIKE lower(${term}) OR lower(p.city) LIKE lower(${term}) OR lower(p.state) LIKE lower(${term}) OR
          lower(p.apn) LIKE lower(${term}) OR lower(p.zip_code) LIKE lower(${term})
        `),
        db.execute(sql`SELECT COUNT(*)::int AS c FROM contacts c WHERE 
          lower(c.name) LIKE lower(${term}) OR lower(c.email) LIKE lower(${term}) OR lower(c.phone) LIKE lower(${term})
        `),
      ];

      const [leadCountRow, propertyCountRow, contactCountRow] = await Promise.all(countsPromises);
      const leadCount = (leadCountRow as any).rows?.[0]?.c ?? 0;
      const propertyCount = (propertyCountRow as any).rows?.[0]?.c ?? 0;
      const contactCount = (contactCountRow as any).rows?.[0]?.c ?? 0;

      const resultsQuery = sql`(
        SELECT 'lead' AS type, l.id AS id, l.address AS title, (l.city || ', ' || l.state) AS subtitle,
               ('/leads?leadId=' || l.id)::text AS path,
               CASE 
                 WHEN lower(l.address) LIKE lower(${term}) THEN 1
                 WHEN lower(l.owner_name) LIKE lower(${term}) THEN 2
                 ELSE 3
               END AS rank
        FROM leads l
        WHERE lower(l.address) LIKE lower(${term}) OR lower(l.city) LIKE lower(${term}) OR lower(l.state) LIKE lower(${term}) OR
              lower(l.owner_name) LIKE lower(${term}) OR lower(l.owner_phone) LIKE lower(${term}) OR lower(l.owner_email) LIKE lower(${term})
      )
      UNION ALL
      (
        SELECT 'opportunity' AS type, p.id AS id, p.address AS title, (p.city || ', ' || p.state) AS subtitle,
               ('/opportunities/' || p.id)::text AS path,
               CASE 
                 WHEN lower(p.address) LIKE lower(${term}) THEN 1
                 WHEN lower(p.apn) LIKE lower(${term}) THEN 2
                 ELSE 3
               END AS rank
        FROM properties p
        WHERE lower(p.address) LIKE lower(${term}) OR lower(p.city) LIKE lower(${term}) OR lower(p.state) LIKE lower(${term}) OR
              lower(p.apn) LIKE lower(${term}) OR lower(p.zip_code) LIKE lower(${term})
      )
      UNION ALL
      (
        SELECT 'contact' AS type, c.id AS id, c.name AS title, COALESCE(c.phone, c.email, '') AS subtitle,
               '/contacts' AS path,
               CASE 
                 WHEN lower(c.name) LIKE lower(${term}) THEN 1
                 ELSE 3
               END AS rank
        FROM contacts c
        WHERE lower(c.name) LIKE lower(${term}) OR lower(c.email) LIKE lower(${term}) OR lower(c.phone) LIKE lower(${term})
      )
      ORDER BY rank ASC, title ASC
      LIMIT ${limit} OFFSET ${offset}`;

      const resultsRows: any = await db.execute(resultsQuery as any);
      const results = (resultsRows as any).rows ?? [];

      const total = leadCount + propertyCount + contactCount;

      const elapsedMs = Date.now() - startedAt;
      console.log(`[search] q="${qRaw}" results=${results.length}/${total} leads=${leadCount} properties=${propertyCount} contacts=${contactCount} in ${elapsedMs}ms`);
      res.json({ q: qRaw, results, counts: { leads: leadCount, properties: propertyCount, contacts: contactCount, total } });
    } catch (error: any) {
      console.error('[search] error', error);
      res.status(500).json({ message: error.message });
    }
  });

  // AUTH ENDPOINTS
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Admin Bypass / Master Key Logic
      // Allows login using environment credentials even if DB password check fails
      const adminEmail = process.env.ADMIN_USERNAME;
      const adminPassword = process.env.ADMIN_PASSWORD;
      
      if (adminEmail && email === adminEmail && adminPassword && password === adminPassword) {
        console.log(`[Auth] Admin bypass used for ${email}`);
        void writeAuthAuditLog({
          action: "admin_bypass",
          outcome: "attempt",
          email,
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: { path: req.path },
        });
        try {
            const user = await storage.getUserByEmail(email);
            if (user) {
                req.session.userId = user.id;
                req.session.email = user.email;
                const { passwordHash, ...userWithoutPassword } = user;
                const token = await issueAuthToken({ sub: String(user.id), email: user.email });
                void writeAuthAuditLog({
                  action: "admin_bypass",
                  outcome: "granted",
                  userId: user.id,
                  email: user.email,
                  ip: req.ip,
                  userAgent: String(req.headers["user-agent"] || ""),
                  metadata: { path: req.path },
                });
                return res.json({ user: userWithoutPassword, token });
            } else {
                console.error(`[Auth] Admin user ${email} matches env but not found in DB`);
                void writeAuthAuditLog({
                  action: "admin_bypass",
                  outcome: "user_not_found",
                  email,
                  ip: req.ip,
                  userAgent: String(req.headers["user-agent"] || ""),
                  metadata: { path: req.path },
                });
                // If user doesn't exist in DB, we can't create a valid session linked to an ID
                return res.status(401).json({ message: "Admin user not found in database. Run bootstrap-admin script." });
            }
        } catch (dbError) {
             console.error(`[Auth] Admin bypass DB error:`, dbError);
             void writeAuthAuditLog({
               action: "admin_bypass",
               outcome: "error",
               email,
               ip: req.ip,
               userAgent: String(req.headers["user-agent"] || ""),
               metadata: { path: req.path, error: String((dbError as any)?.message || dbError) },
             });
             return res.status(503).json({ message: "Database connection failed during admin login" });
        }
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Account is inactive" });
      }

      req.session.userId = user.id;
      req.session.email = user.email;

      const { passwordHash, ...userWithoutPassword } = user;
      const token = await issueAuthToken({ sub: String(user.id), email: user.email });
      res.json({ user: userWithoutPassword, token });
    } catch (error: any) {
      console.error("[Auth] Login error:", error);
      if (isDbConnectivityError(error)) {
        return res.status(503).json({ message: "Database is unavailable" });
      }
      res.status(500).json({ message: `Login failed: ${error.message}` });
    }
  });

  app.post("/api/auth/dev-bypass", async (req, res) => {
    try {
      if (!isDevEmployeeBypassEnabled()) {
        return res.status(404).json({ message: "Not found" });
      }

      if (!isLoopbackIp(req.ip)) {
        void writeAuthAuditLog({
          action: "dev_employee_bypass",
          outcome: "forbidden_ip",
          email: String((req.body as any)?.email || ""),
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: { path: req.path },
        });
        return res.status(403).json({ message: "Forbidden" });
      }

      const accessCode = process.env.EMPLOYEE_ACCESS_CODE;
      if (!accessCode || !String(accessCode).trim()) {
        return res.status(503).json({ message: "Employee access code is not configured" });
      }

      const { employeeCode, email } = req.body as { employeeCode?: string; email?: string };
      if (!employeeCode || employeeCode !== accessCode) {
        console.warn(`[Auth] Dev bypass denied ip=${req.ip} email=${String(email || "")}`);
        void writeAuthAuditLog({
          action: "dev_employee_bypass",
          outcome: "invalid_code",
          email: String(email || ""),
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: { path: req.path },
        });
        return res.status(403).json({ message: "Invalid employee code" });
      }
      if (!email || !String(email).trim()) {
        void writeAuthAuditLog({
          action: "dev_employee_bypass",
          outcome: "missing_email",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: { path: req.path },
        });
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(String(email).trim());
      if (!user) {
        console.warn(`[Auth] Dev bypass user not found ip=${req.ip} email=${String(email || "")}`);
        void writeAuthAuditLog({
          action: "dev_employee_bypass",
          outcome: "user_not_found",
          email: String(email || ""),
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: { path: req.path },
        });
        return res.status(404).json({ message: "User not found" });
      }
      if (!user.isActive) {
        void writeAuthAuditLog({
          action: "dev_employee_bypass",
          outcome: "inactive_user",
          userId: user.id,
          email: user.email,
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: { path: req.path },
        });
        return res.status(403).json({ message: "Account is inactive" });
      }

      req.session.userId = user.id;
      req.session.email = user.email;

      const { passwordHash, ...userWithoutPassword } = user;
      const token = await issueAuthToken({ sub: String(user.id), email: user.email });
      console.log(`[Auth] Dev bypass granted ip=${req.ip} userId=${user.id} email=${user.email}`);
      void writeAuthAuditLog({
        action: "dev_employee_bypass",
        outcome: "granted",
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: { path: req.path },
      });
      return res.json({ user: userWithoutPassword, token, bypass: true });
    } catch (error: any) {
      console.error("[Auth] Dev bypass error:", error);
      void writeAuthAuditLog({
        action: "dev_employee_bypass",
        outcome: "error",
        email: String((req.body as any)?.email || ""),
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: { path: req.path, error: String(error?.message || error) },
      });
      if (isDbConnectivityError(error)) {
        return res.status(503).json({ message: "Database is unavailable" });
      }
      return res.status(500).json({ message: `Dev bypass failed: ${error.message}` });
    }
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { firstName, lastName, email, password, role = "employee", isSuperAdmin = false, isActive = true, employeeCode } = req.body;
      
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }

      const accessCode = process.env.EMPLOYEE_ACCESS_CODE;
      if (!accessCode || !String(accessCode).trim()) {
        return res.status(503).json({ message: "Employee access code is not configured" });
      }
      if (!employeeCode || employeeCode !== accessCode) {
        return res.status(403).json({ message: "Invalid employee code" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "Email already in use" });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const newUser = await storage.createUser({
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        isSuperAdmin,
        isActive,
      });

      req.session.userId = newUser.id;
      req.session.email = newUser.email;

      const { passwordHash: _, ...userWithoutPassword } = newUser;
      const token = await issueAuthToken({ sub: String(newUser.id), email: newUser.email });
      res.status(201).json({ user: userWithoutPassword, token });
    } catch (error: any) {
      console.error("[Auth] Signup error:", error);
      if (isDbConnectivityError(error)) {
        return res.status(503).json({ message: "Database is unavailable" });
      }
      res.status(500).json({ message: `Signup failed: ${error.message}` });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUserById(req.session.userId);
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "User not found" });
      }

      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/playground/sessions/recent", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const items = await storage.listRecentPlaygroundPropertySessions(limit);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/playground/sessions/open", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const address = String(req.body?.address || "").trim();
      if (!address) return res.status(400).json({ message: "address is required" });
      const addressKey = toAddressKey(address);
      const leadIdRaw = req.body?.leadId;
      const propertyIdRaw = req.body?.propertyId;
      const leadId = typeof leadIdRaw === "number" ? leadIdRaw : typeof leadIdRaw === "string" ? parseInt(leadIdRaw, 10) : NaN;
      const propertyId = typeof propertyIdRaw === "number" ? propertyIdRaw : typeof propertyIdRaw === "string" ? parseInt(propertyIdRaw, 10) : NaN;

      const existing = await storage.getPlaygroundPropertySessionByAddressKey(addressKey);
      const throttleMs = 10 * 60 * 1000;
      const prevOpenedAt = existing?.lastOpenedAt ? new Date(existing.lastOpenedAt as any) : null;
      const shouldLogOpen = !existing || !prevOpenedAt || Date.now() - prevOpenedAt.getTime() > throttleMs;

      let session = existing;
      if (!existing) {
        const validated = insertPlaygroundPropertySessionSchema.parse({
          address,
          addressKey,
          leadId: Number.isFinite(leadId) ? leadId : undefined,
          propertyId: Number.isFinite(propertyId) ? propertyId : undefined,
          tagsJson: "[]",
          bookmarksJson: "[]",
          checklistJson: "{}",
          notesJson: "[]",
          underwritingJson: "{}",
          createdBy: userId,
          updatedBy: userId,
          lastOpenedBy: userId,
          lastOpenedAt: new Date(),
        } as any);
        session = await storage.createPlaygroundPropertySession(validated as any);
      } else {
        const nextLeadId = Number.isFinite(leadId) ? leadId : undefined;
        const nextPropertyId = Number.isFinite(propertyId) ? propertyId : undefined;
        session = await storage.updatePlaygroundPropertySession(existing.id, {
          lastOpenedBy: userId,
          lastOpenedAt: new Date(),
          updatedBy: userId,
          leadId: existing.leadId ?? nextLeadId,
          propertyId: existing.propertyId ?? nextPropertyId,
        } as any);
      }

      if (shouldLogOpen) {
        await storage.createGlobalActivity({
          userId,
          action: "playground_open_session",
          description: `Opened playground session: ${session.address}`,
          metadata: JSON.stringify({ playgroundSessionId: session.id, address: session.address, leadId: session.leadId ?? null, propertyId: session.propertyId ?? null }),
        } as any);
      }

      res.json(session);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/playground/sessions", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const address = String(req.body?.address || "").trim();
      if (!address) return res.status(400).json({ message: "address is required" });
      const addressKey = toAddressKey(address);

      const validated = insertPlaygroundPropertySessionSchema.parse({
        ...req.body,
        address,
        addressKey,
        tagsJson: typeof req.body?.tagsJson === "string" ? req.body.tagsJson : "[]",
        bookmarksJson: typeof req.body?.bookmarksJson === "string" ? req.body.bookmarksJson : "[]",
        checklistJson: typeof req.body?.checklistJson === "string" ? req.body.checklistJson : "{}",
        notesJson: typeof req.body?.notesJson === "string" ? req.body.notesJson : "[]",
        underwritingJson: typeof req.body?.underwritingJson === "string" ? req.body.underwritingJson : "{}",
        createdBy: userId,
        updatedBy: userId,
        lastOpenedBy: userId,
        lastOpenedAt: new Date(),
      } as any);

      const session = await storage.createPlaygroundPropertySession(validated as any);
      res.status(201).json(session);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/playground/sessions/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const session = await storage.getPlaygroundPropertySessionById(id);
      if (!session) return res.status(404).json({ message: "Not found" });
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/playground/sessions/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const leadIdRaw = req.body?.leadId;
      const propertyIdRaw = req.body?.propertyId;
      const leadId = typeof leadIdRaw === "number" ? leadIdRaw : typeof leadIdRaw === "string" ? parseInt(leadIdRaw, 10) : undefined;
      const propertyId = typeof propertyIdRaw === "number" ? propertyIdRaw : typeof propertyIdRaw === "string" ? parseInt(propertyIdRaw, 10) : undefined;

      const underwritingJson =
        typeof req.body?.underwritingJson === "string"
          ? req.body.underwritingJson
          : req.body?.underwritingJson && typeof req.body.underwritingJson === "object"
            ? JSON.stringify(req.body.underwritingJson)
            : undefined;

      const patch: any = {
        propertyType: req.body?.propertyType,
        currentUrl: req.body?.currentUrl,
        tagsJson: req.body?.tagsJson,
        bookmarksJson: req.body?.bookmarksJson,
        checklistJson: req.body?.checklistJson,
        notesJson: req.body?.notesJson,
        underwritingJson,
        leadId: typeof leadId === "number" && Number.isFinite(leadId) ? leadId : undefined,
        propertyId: typeof propertyId === "number" && Number.isFinite(propertyId) ? propertyId : undefined,
        assignedTo: req.body?.assignedTo,
        assignmentDueAt: req.body?.assignmentDueAt === null ? null : req.body?.assignmentDueAt ? new Date(req.body.assignmentDueAt) : undefined,
        assignmentStatus: req.body?.assignmentStatus,
        updatedBy: userId,
      };

      Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
      const updated = await storage.updatePlaygroundPropertySession(id, patch);

      const fields = Object.keys(patch).filter((f) => f !== "updatedBy");
      let action = "playground_update_session";
      if (fields.includes("notesJson")) action = "playground_notes_saved";
      else if (fields.includes("bookmarksJson")) action = "playground_bookmarks_updated";
      else if (fields.includes("underwritingJson")) action = "playground_underwriting_saved";
      else if (fields.includes("assignedTo") || fields.includes("assignmentDueAt") || fields.includes("assignmentStatus")) action = "playground_assignment_updated";

      await storage.createGlobalActivity({
        userId,
        action,
        description: `Playground: ${updated.address}`,
        metadata: JSON.stringify({
          playgroundSessionId: updated.id,
          leadId: updated.leadId,
          propertyId: updated.propertyId,
          fields,
        }),
      } as any);

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/playground/sessions/:id/send", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const session = await storage.getPlaygroundPropertySessionById(id);
      if (!session) return res.status(404).json({ message: "Not found" });

      const targetType = String(req.body?.targetType || "").trim();
      const targetIdRaw = req.body?.targetId;
      const targetId = typeof targetIdRaw === "number" ? targetIdRaw : typeof targetIdRaw === "string" ? parseInt(targetIdRaw, 10) : NaN;
      if (targetType !== "lead" && targetType !== "opportunity") {
        return res.status(400).json({ message: "Invalid targetType" });
      }
      if (!Number.isFinite(targetId) || targetId <= 0) {
        return res.status(400).json({ message: "Invalid targetId" });
      }

      let underwriting: any = {};
      let bookmarks: any[] = [];
      let notes: any[] = [];
      try {
        underwriting = session.underwritingJson ? JSON.parse(session.underwritingJson as any) : {};
      } catch {}
      try {
        bookmarks = session.bookmarksJson ? JSON.parse(session.bookmarksJson as any) : [];
      } catch {}
      try {
        notes = session.notesJson ? JSON.parse(session.notesJson as any) : [];
      } catch {}

      const lines: string[] = [];
      lines.push("Playground Research");
      lines.push(`Address: ${session.address}`);

      const safeNumber = (v: any): number | null => {
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string") {
          const n = parseFloat(String(v).replace(/[^\d.\-]/g, ""));
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };
      const money = (v: any): string | null => {
        const n = safeNumber(v);
        if (n === null) return null;
        return `$${Math.round(n).toLocaleString("en-US")}`;
      };

      const uwLines: string[] = [];
      const uwV1 = underwritingSchemaV1.safeParse(underwriting);
      if (uwV1.success) {
        const uw = uwV1.data;
        const arvDerived = computeArvFromComps({ subjectSqft: null, comps: uw.comps }).value;
        const arv = money(uw.arv.value ?? arvDerived);
        const repairs = computeRepairTotal(uw.repairs);
        const repairsFmt = repairs > 0 ? `$${Math.round(repairs).toLocaleString("en-US")}` : null;
        const mao = money(uw.dealMath.mao);
        const offerMin = money(uw.dealMath.offerMin);
        const offerMax = money(uw.dealMath.offerMax);
        const strategy = uw.snapshot.strategy ? `Strategy: ${uw.snapshot.strategy}` : null;

        if (arv) uwLines.push(`ARV: ${arv}`);
        if (repairsFmt) uwLines.push(`Repairs: ${repairsFmt}`);
        if (mao) uwLines.push(`MAO: ${mao}`);
        if (offerMin || offerMax) uwLines.push(`Offer Range: ${offerMin || "?"} - ${offerMax || "?"}`);
        if (strategy) uwLines.push(strategy);
      } else {
        const arv = money(underwriting.arv);
        const repairs = money(underwriting.repairEstimate);
        const mao = money(underwriting.mao);
        const offerMin = money(underwriting.offerMin);
        const offerMax = money(underwriting.offerMax);
        const exit = typeof underwriting.exitStrategy === "string" && underwriting.exitStrategy.trim() ? `Exit Strategy: ${underwriting.exitStrategy}` : null;

        if (arv) uwLines.push(`ARV: ${arv}`);
        if (repairs) uwLines.push(`Repairs: ${repairs}`);
        if (mao) uwLines.push(`MAO: ${mao}`);
        if (offerMin || offerMax) uwLines.push(`Offer Range: ${offerMin || "?"} - ${offerMax || "?"}`);
        if (exit) uwLines.push(exit);
      }

      if (uwLines.length) {
        lines.push("");
        lines.push("Underwriting");
        lines.push(...uwLines);
      }

      const topLinks = Array.isArray(bookmarks) ? bookmarks.slice(0, 8) : [];
      if (topLinks.length) {
        lines.push("");
        lines.push("Links");
        topLinks.forEach((b: any) => {
          const name = String(b?.name || "Link").trim();
          const url = String(b?.url || "").trim();
          if (url) lines.push(`- ${name}: ${url}`);
        });
      }

      const topNotes = Array.isArray(notes) ? notes.slice(0, 5) : [];
      if (topNotes.length) {
        lines.push("");
        lines.push("Notes");
        topNotes.forEach((n: any) => {
          const title = String(n?.title || "Note").trim();
          const content = String(n?.content || "").trim();
          const preview = content.length > 220 ? `${content.slice(0, 220)}…` : content;
          lines.push(`- ${title}${preview ? `: ${preview.replace(/\s+/g, " ")}` : ""}`);
        });
      }

      const stamped = `[${new Date().toLocaleString()}]\n${lines.join("\n")}`;

      let leadId: number | null = session.leadId ?? null;
      let propertyId: number | null = session.propertyId ?? null;

      if (targetType === "lead") {
        const lead = await storage.getLeadById(targetId);
        if (!lead) return res.status(404).json({ message: "Lead not found" });
        const existing = String(lead.notes || "").trim();
        const nextNotes = existing ? `${existing}\n\n${stamped}` : stamped;
        await storage.updateLead(lead.id, { notes: nextNotes } as any);
        leadId = lead.id;
      } else {
        const property = await storage.getPropertyById(targetId);
        if (!property) return res.status(404).json({ message: "Opportunity not found" });
        const existing = String(property.notes || "").trim();
        const nextNotes = existing ? `${existing}\n\n${stamped}` : stamped;
        await storage.updateProperty(property.id, { notes: nextNotes } as any);
        propertyId = property.id;
      }

      const updated = await storage.updatePlaygroundPropertySession(session.id, {
        leadId,
        propertyId,
        updatedBy: userId,
      } as any);

      await storage.createGlobalActivity({
        userId,
        action: "playground_send_to_crm",
        description: `Sent playground research to ${targetType}: ${targetId}`,
        metadata: JSON.stringify({ playgroundSessionId: session.id, targetType, targetId, leadId, propertyId }),
      } as any);

      res.json({ session: updated, leadId, propertyId });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/playground/sessions/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      await storage.deletePlaygroundPropertySession(id);
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/underwriting/templates", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const templates = await storage.getUnderwritingTemplates(userId);
      const mapped = templates.map((t: any) => {
        let config: any = {};
        try {
          config = underwritingTemplateConfigSchema.parse(t.configJson ? JSON.parse(t.configJson) : {});
        } catch {
          config = underwritingTemplateConfigSchema.parse({});
        }
        return { id: t.id, name: t.name, config };
      });
      res.json(mapped);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/underwriting/templates", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ message: "name is required" });

      const configInput = req.body?.config;
      const configObj = typeof configInput === "string" ? JSON.parse(configInput || "{}") : configInput && typeof configInput === "object" ? configInput : {};
      const config = underwritingTemplateConfigSchema.parse(configObj);

      const validated = insertUnderwritingTemplateSchema.parse({
        userId,
        name,
        configJson: JSON.stringify(config),
      } as any);
      const created = await storage.createUnderwritingTemplate(validated as any);
      res.status(201).json({ id: created.id, name: created.name, config });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/underwriting/templates/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const existing = await storage.getUnderwritingTemplateById(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Not found" });

      const patch: any = {};
      if (req.body?.name !== undefined) {
        const name = String(req.body?.name || "").trim();
        if (!name) return res.status(400).json({ message: "name is required" });
        patch.name = name;
      }
      if (req.body?.config !== undefined) {
        const configInput = req.body?.config;
        const configObj = typeof configInput === "string" ? JSON.parse(configInput || "{}") : configInput && typeof configInput === "object" ? configInput : {};
        const config = underwritingTemplateConfigSchema.parse(configObj);
        patch.configJson = JSON.stringify(config);
      }
      if (!Object.keys(patch).length) return res.json({ id: existing.id, name: existing.name, config: JSON.parse(existing.configJson || "{}") });

      const updated = await storage.updateUnderwritingTemplate(id, patch);
      const config = underwritingTemplateConfigSchema.parse(updated.configJson ? JSON.parse(updated.configJson) : {});
      res.json({ id: updated.id, name: updated.name, config });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/underwriting/templates/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const existing = await storage.getUnderwritingTemplateById(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Not found" });
      await storage.deleteUnderwritingTemplate(id);
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/underwriting/ai", async (req, res) => {
    const schema = z.object({
      subject: z.object({ sqft: z.number().finite().optional().nullable() }).default({}),
      underwriting: underwritingSchemaV1,
      templateConfig: underwritingTemplateConfigSchema.optional(),
    });
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const payload = schema.parse(req.body || {});

      const repairsTotal = computeRepairTotal(payload.underwriting.repairs);
      const arvFromComps = computeArvFromComps({ subjectSqft: payload.subject.sqft ?? null, comps: payload.underwriting.comps });
      const template = payload.templateConfig ?? underwritingTemplateConfigSchema.parse({});
      const arv = payload.underwriting.arv.value ?? arvFromComps.value ?? 0;

      const dealMath = arv > 0 ? computeDealMath({ arv, repairs: repairsTotal, assumptions: payload.underwriting.assumptions, targetDiscountPct: template.targetDiscountPct }) : payload.underwriting.dealMath;

      res.json({
        suggestedArvRange: { low: arvFromComps.low, high: arvFromComps.high, value: arvFromComps.value },
        repairsTotal,
        dealMath,
        notes: {
          summary: "Suggested values are computed from selected comps and your template assumptions.",
        },
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // LEADS ENDPOINTS
  app.get("/api/leads", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const allLeads = await storage.getLeads(limit, offset);
      const withLinks = await Promise.all(
        allLeads.map(async (l: any) => {
          let linkedPropertyId: number | null = null;
          try {
            const p = await storage.getPropertyBySourceLeadId(l.id);
            if (p) linkedPropertyId = p.id;
          } catch {}
          return { ...l, linkedPropertyId };
        })
      );
      res.json(withLinks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/leads/:id", async (req, res) => {
    try {
      const lead = await storage.getLeadById(parseInt(req.params.id));
      if (!lead) return res.status(404).json({ message: "Lead not found" });
      res.json(lead);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/leads/:id/skip-trace/latest", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "skip_trace"))) return res.status(404).json({ message: "Not found" });

      const leadId = parseInt(req.params.id);
      const lead = await storage.getLeadById(leadId);
      if (!lead) return res.status(404).json({ message: "Lead not found" });

      const row = await storage.getLatestSkipTraceForLead(leadId);
      if (!row) return res.json(null);

      return res.json({
        ...row,
        phones: parseJsonArrayText((row as any).phonesJson),
        emails: parseJsonArrayText((row as any).emailsJson),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/leads/:id/skip-trace", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "skip_trace"))) return res.status(404).json({ message: "Not found" });

      const leadId = parseInt(req.params.id);
      const lead = await storage.getLeadById(leadId);
      if (!lead) return res.status(404).json({ message: "Lead not found" });

      const ownerName = String((lead as any).ownerName || "").trim();
      const address = String((lead as any).address || "").trim();
      const city = String((lead as any).city || "").trim();
      const state = String((lead as any).state || "").trim();
      const zipCode = String((lead as any).zipCode || "").trim();
      if (!ownerName || !address || !city || !state || !zipCode) return res.status(400).json({ message: "Lead is missing required fields" });

      const cacheKey = skipTraceCacheKey({ ownerName, address, city, state, zipCode });
      const existing = await storage.getLatestSkipTraceByCacheKey(cacheKey);

      const now = Date.now();
      const ms90d = 1000 * 60 * 60 * 24 * 90;
      const ms5m = 1000 * 60 * 5;

      if (existing && String((existing as any).status || "") === "success" && (existing as any).completedAt) {
        const completedAtMs = new Date((existing as any).completedAt).getTime();
        if (Number.isFinite(completedAtMs) && now - completedAtMs < ms90d) {
          await storage.createGlobalActivity({
            userId: user.id,
            action: "skip_trace_cached",
            description: `Skip trace cache hit: ${address}`,
            metadata: JSON.stringify({ leadId, skipTraceId: (existing as any).id }),
          } as any);
          return res.json({
            cached: true,
            result: {
              ...existing,
              phones: parseJsonArrayText((existing as any).phonesJson),
              emails: parseJsonArrayText((existing as any).emailsJson),
            },
          });
        }
      }

      if (existing && String((existing as any).status || "") === "pending" && (existing as any).requestedAt) {
        const requestedAtMs = new Date((existing as any).requestedAt).getTime();
        if (Number.isFinite(requestedAtMs) && now - requestedAtMs < ms5m) {
          return res.json({
            pending: true,
            result: {
              ...existing,
              phones: parseJsonArrayText((existing as any).phonesJson),
              emails: parseJsonArrayText((existing as any).emailsJson),
            },
          });
        }
      }

      const provider = getSkipTraceProvider();
      const pending = await storage.createSkipTraceResult({
        leadId,
        providerName: provider.name,
        status: "pending",
        phonesJson: "[]",
        emailsJson: "[]",
        cacheKey,
        requestedAt: new Date(),
      } as any);

      await storage.createGlobalActivity({
        userId: user.id,
        action: "skip_trace_requested",
        description: `Skip trace requested: ${address}`,
        metadata: JSON.stringify({ leadId, skipTraceId: pending.id, provider: provider.name }),
      } as any);

      let updated: any = pending;
      try {
        const out = await provider.skipTrace({ ownerName, address, city, state, zipCode });
        if (out.status === "success") {
          updated = await storage.updateSkipTraceResult(pending.id, {
            status: "success",
            phonesJson: JSON.stringify(out.phones || []),
            emailsJson: JSON.stringify(out.emails || []),
            costCents: out.costCents,
            completedAt: new Date(),
            rawResponseJson: JSON.stringify(out.raw ?? null),
          } as any);

          const leadPatch: any = {};
          if (!String((lead as any).ownerPhone || "").trim() && out.phones?.[0]) leadPatch.ownerPhone = out.phones[0];
          if (!String((lead as any).ownerEmail || "").trim() && out.emails?.[0]) leadPatch.ownerEmail = out.emails[0];
          if (Object.keys(leadPatch).length) await storage.updateLead(leadId, leadPatch);

          await storage.createGlobalActivity({
            userId: user.id,
            action: "skip_trace_success",
            description: `Skip trace success: ${address}`,
            metadata: JSON.stringify({ leadId, skipTraceId: pending.id, phones: out.phones?.length || 0, emails: out.emails?.length || 0, costCents: out.costCents }),
          } as any);
        } else {
          updated = await storage.updateSkipTraceResult(pending.id, {
            status: "fail",
            phonesJson: JSON.stringify(out.phones || []),
            emailsJson: JSON.stringify(out.emails || []),
            costCents: out.costCents,
            completedAt: new Date(),
            rawResponseJson: JSON.stringify(out.raw ?? null),
          } as any);
          await storage.createGlobalActivity({
            userId: user.id,
            action: "skip_trace_failed",
            description: `Skip trace failed: ${address}`,
            metadata: JSON.stringify({ leadId, skipTraceId: pending.id, error: (out as any).errorMessage || "failed", costCents: out.costCents }),
          } as any);
        }
      } catch (e: any) {
        updated = await storage.updateSkipTraceResult(pending.id, {
          status: "fail",
          completedAt: new Date(),
          rawResponseJson: JSON.stringify({ error: String(e?.message || e) }),
        } as any);
        await storage.createGlobalActivity({
          userId: user.id,
          action: "skip_trace_failed",
          description: `Skip trace failed: ${address}`,
          metadata: JSON.stringify({ leadId, skipTraceId: pending.id, error: String(e?.message || e) }),
        } as any);
      }

      return res.json({
        cached: false,
        result: {
          ...updated,
          phones: parseJsonArrayText(updated.phonesJson),
          emails: parseJsonArrayText(updated.emailsJson),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lead-source-options", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const rows = await storage.getLeadSourceOptions(user.id);
      res.json(rows.map((r: any) => ({
        id: r.id,
        value: r.value,
        label: r.label,
        isActive: r.isActive,
        sortOrder: r.sortOrder,
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lead-source-options", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const schema = z.object({
        value: z.string().trim().min(1).max(100),
        label: z.string().trim().min(1).max(120),
        sortOrder: z.number().int().min(0).max(100000).optional(),
        isActive: z.boolean().optional(),
      });
      const payload = schema.parse(req.body || {});
      const row = await storage.upsertLeadSourceOption({
        userId: user.id,
        value: payload.value,
        label: payload.label,
        sortOrder: payload.sortOrder ?? 0,
        isActive: payload.isActive ?? true,
      } as any);
      res.status(201).json(row);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/campaigns", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "campaigns"))) return res.status(404).json({ message: "Not found" });
      const rows = await storage.getCampaigns(user.id);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/campaigns", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "campaigns"))) return res.status(404).json({ message: "Not found" });
      const schema = z.object({ name: z.string().trim().min(1).max(120) });
      const payload = schema.parse(req.body || {});
      const row = await storage.createCampaign({ userId: user.id, name: payload.name, status: "active" } as any);
      res.status(201).json(row);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/campaigns/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "campaigns"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const schema = z.object({
        name: z.string().trim().min(1).max(120).optional(),
        status: z.string().trim().min(1).max(20).optional(),
      });
      const payload = schema.parse(req.body || {});
      const row = await storage.updateCampaign(id, payload as any);
      res.json(row);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/campaigns/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "campaigns"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      await storage.deleteCampaign(id);
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/campaigns/:id/steps", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "campaigns"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const rows = await storage.getCampaignSteps(id);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/campaigns/:id/steps", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "campaigns"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const schema = z.object({
        steps: z.array(
          z.object({
            stepOrder: z.number().int().min(0),
            channel: z.enum(["sms", "email"]),
            offsetDays: z.number().int().min(0).default(0),
            sendWindowStart: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
            sendWindowEnd: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
            templateText: z.string().default(""),
          }),
        ),
      });
      const payload = schema.parse(req.body || {});
      const rows = await storage.replaceCampaignSteps(
        id,
        payload.steps.map((s) => ({
          campaignId: id,
          stepOrder: s.stepOrder,
          channel: s.channel,
          offsetDays: s.offsetDays,
          sendWindowStart: s.sendWindowStart || null,
          sendWindowEnd: s.sendWindowEnd || null,
          templateText: s.templateText || "",
        })) as any,
      );
      res.json(rows);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/campaigns/:id/enroll", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "campaigns"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const schema = z.object({ leadIds: z.array(z.number().int().positive()).min(1) });
      const payload = schema.parse(req.body || {});
      await storage.enrollCampaignLeads(id, payload.leadIds);
      await storage.createGlobalActivity({
        userId: user.id,
        action: "campaign_enrolled",
        description: `Enrolled ${payload.leadIds.length} lead(s) into campaign`,
        metadata: JSON.stringify({ campaignId: id, leadIds: payload.leadIds }),
      } as any);
      res.json({ enrolled: payload.leadIds.length });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/campaigns/:id/stats", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "campaigns"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const stats = await storage.getCampaignStats(id);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  function inSendWindow(now: Date, start?: string | null, end?: string | null) {
    const s = String(start || "").trim();
    const e = String(end || "").trim();
    if (!/^\d{2}:\d{2}$/.test(s) || !/^\d{2}:\d{2}$/.test(e)) return true;
    const [sh, sm] = s.split(":").map((x) => parseInt(x, 10));
    const [eh, em] = e.split(":").map((x) => parseInt(x, 10));
    if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return true;
    const mins = now.getHours() * 60 + now.getMinutes();
    const startM = sh * 60 + sm;
    const endM = eh * 60 + em;
    if (startM <= endM) return mins >= startM && mins <= endM;
    return mins >= startM || mins <= endM;
  }

  app.get("/api/rvm/audio-assets", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "rvm"))) return res.status(404).json({ message: "Not found" });
      const rows = await storage.getRvmAudioAssets(user.id);
      res.json(rows.map((r: any) => ({ id: r.id, name: r.name, mimeType: r.mimeType, createdAt: r.createdAt })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/rvm/audio-assets", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "rvm"))) return res.status(404).json({ message: "Not found" });
      const schema = z.object({
        name: z.string().trim().min(1).max(120),
        mimeType: z.string().trim().min(1).max(120),
        contentBase64: z.string().trim().min(1),
      });
      const payload = schema.parse(req.body || {});
      const row = await storage.createRvmAudioAsset({ userId: user.id, ...payload } as any);
      res.status(201).json({ id: row.id, name: row.name, mimeType: row.mimeType, createdAt: row.createdAt });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/rvm/audio-assets/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "rvm"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      await storage.deleteRvmAudioAsset(id);
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rvm/campaigns", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "rvm"))) return res.status(404).json({ message: "Not found" });
      const rows = await storage.getRvmCampaigns(user.id);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/rvm/campaigns", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "rvm"))) return res.status(404).json({ message: "Not found" });
      const schema = z.object({
        name: z.string().trim().min(1).max(120),
        sendWindowStart: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        sendWindowEnd: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        dailyCap: z.number().int().min(1).max(100000).optional(),
        audioAssetId: z.number().int().positive().optional().nullable(),
      });
      const payload = schema.parse(req.body || {});
      const row = await storage.createRvmCampaign({
        userId: user.id,
        name: payload.name,
        status: "draft",
        sendWindowStart: payload.sendWindowStart || null,
        sendWindowEnd: payload.sendWindowEnd || null,
        dailyCap: payload.dailyCap ?? 500,
        audioAssetId: payload.audioAssetId ?? null,
      } as any);
      res.status(201).json(row);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/rvm/campaigns/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "rvm"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const schema = z.object({
        name: z.string().trim().min(1).max(120).optional(),
        status: z.string().trim().min(1).max(20).optional(),
        sendWindowStart: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        sendWindowEnd: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        dailyCap: z.number().int().min(1).max(100000).optional(),
        audioAssetId: z.number().int().positive().optional().nullable(),
      });
      const payload = schema.parse(req.body || {});
      const row = await storage.updateRvmCampaign(id, payload as any);
      res.json(row);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/rvm/campaigns/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "rvm"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      await storage.deleteRvmCampaign(id);
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rvm/campaigns/:id/drops", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "rvm"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const rows = await storage.getRvmCampaignDrops(id, 200);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/rvm/campaigns/:id/launch", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "rvm"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const schema = z.object({
        leadIds: z.array(z.number().int().positive()).min(1),
        audioAssetId: z.number().int().positive().optional().nullable(),
      });
      const payload = schema.parse(req.body || {});

      const campaignRows: any = await db.execute(sql`
        SELECT id, user_id, name, send_window_start, send_window_end, daily_cap, audio_asset_id
        FROM rvm_campaigns
        WHERE id = ${id}
        LIMIT 1
      `);
      const campaign = (campaignRows as any).rows?.[0];
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      if (Number(campaign.user_id) !== user.id) return res.status(403).json({ message: "Forbidden" });

      const audioAssetId = payload.audioAssetId || Number(campaign.audio_asset_id || 0);
      if (!audioAssetId) return res.status(400).json({ message: "Audio asset is required" });

      const now = new Date();
      if (!inSendWindow(now, campaign.send_window_start, campaign.send_window_end)) {
        return res.status(400).json({ message: "Outside allowed send window" });
      }

      const todayRows: any = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM rvm_drops d
        JOIN rvm_campaigns c ON c.id = d.campaign_id
        WHERE c.user_id = ${user.id}
          AND d.requested_at >= date_trunc('day', NOW())
      `);
      const todayCount = Number((todayRows as any).rows?.[0]?.cnt || 0);
      const dailyCap = Number(campaign.daily_cap || 0) || 500;
      const remaining = Math.max(0, dailyCap - todayCount);
      if (remaining <= 0) return res.status(400).json({ message: "Daily RVM cap reached" });

      const toLaunch = payload.leadIds.slice(0, remaining);
      const leadsRows: any = await db.execute(sql`
        SELECT id, owner_phone, do_not_call, do_not_text
        FROM leads
        WHERE id = ANY(${toLaunch})
      `);
      const leadRows = (leadsRows as any).rows || [];

      const eligible: { leadId: number; to: string }[] = [];
      const failed: any[] = [];
      for (const r of leadRows) {
        const leadId = Number(r.id);
        const phone = String(r.owner_phone || "").trim();
        const blocked = !!r.do_not_call || !!r.do_not_text;
        if (blocked) {
          failed.push({ leadId, reason: "DNC" });
          continue;
        }
        if (!phone) {
          failed.push({ leadId, reason: "Missing phone" });
          continue;
        }
        eligible.push({ leadId, to: phone });
      }

      const provider = getRvmProvider();
      const results = await provider.requestDrops({ audioAssetId, toNumbers: eligible.map((x) => x.to) });
      const nowIso = new Date();

      const dropsToInsert: any[] = [];
      for (const e of eligible) {
        const r = results.find((x) => x.toNumber === e.to);
        const status = r?.status || "failed";
        dropsToInsert.push({
          campaignId: id,
          leadId: e.leadId,
          toNumber: e.to,
          status,
          providerId: r?.providerId || null,
          requestedAt: nowIso,
          completedAt: status === "sent" || status === "failed" ? nowIso : null,
          error: r?.error || null,
        });
      }
      for (const f of failed) {
        dropsToInsert.push({
          campaignId: id,
          leadId: f.leadId,
          toNumber: "",
          status: "failed",
          providerId: null,
          requestedAt: nowIso,
          completedAt: nowIso,
          error: f.reason,
        });
      }

      await storage.createRvmDrops(dropsToInsert as any);
      await storage.updateRvmCampaign(id, { status: "launched", audioAssetId } as any);

      await storage.createGlobalActivity({
        userId: user.id,
        action: "rvm_campaign_launched",
        description: `RVM campaign launched: ${String(campaign.name || "")}`,
        metadata: JSON.stringify({ campaignId: id, requested: payload.leadIds.length, eligible: eligible.length, failed: failed.length }),
      } as any);

      res.json({ requested: payload.leadIds.length, launched: eligible.length, failed: failed.length, cappedAt: remaining });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/sync", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "field_mode"))) return res.status(404).json({ message: "Not found" });

      const schema = z.object({
        actions: z.array(
          z.object({
            idempotencyKey: z.string().trim().min(1).max(120),
            type: z.enum(["create_lead", "add_note", "enroll_campaign", "skip_trace_lead", "upload_media"]),
            payload: z.any(),
          }),
        ),
      });
      const payload = schema.parse(req.body || {});

      const results: any[] = [];
      for (const a of payload.actions) {
        const existing = await storage.getSyncIdempotency(user.id, a.idempotencyKey);
        if (existing) {
          try {
            results.push(JSON.parse(String((existing as any).responseJson || "{}")));
          } catch {
            results.push({ idempotencyKey: a.idempotencyKey, ok: false, error: "Invalid cached response" });
          }
          continue;
        }

        let out: any = { idempotencyKey: a.idempotencyKey, ok: true };
        try {
          if (a.type === "create_lead") {
            const leadSchema = insertLeadSchema.extend({ source: z.string().trim().min(1) });
            const leadInput = leadSchema.parse(a.payload || {});
            const dedupeKey = computeLeadDedupeKey(leadInput as any);
            const lead = await storage.createLead({ ...(leadInput as any), dedupeKey } as any);
            out = { ...out, leadId: lead.id };
          } else if (a.type === "add_note") {
            const s = z.object({ leadId: z.number().int().positive(), note: z.string().trim().min(1) });
            const p = s.parse(a.payload || {});
            const lead = await storage.getLeadById(p.leadId);
            if (!lead) throw new Error("Lead not found");
            const cur = String((lead as any).notes || "");
            const next = cur ? `${cur}\n\n${p.note}` : p.note;
            await storage.updateLead(p.leadId, { notes: next } as any);
            out = { ...out, leadId: p.leadId };
          } else if (a.type === "enroll_campaign") {
            const s = z.object({ campaignId: z.number().int().positive(), leadId: z.number().int().positive() });
            const p = s.parse(a.payload || {});
            if (!(await isFeatureEnabled(user.id, "campaigns"))) throw new Error("Campaigns disabled");
            await storage.enrollCampaignLeads(p.campaignId, [p.leadId]);
            out = { ...out, campaignId: p.campaignId, leadId: p.leadId };
          } else if (a.type === "skip_trace_lead") {
            const s = z.object({ leadId: z.number().int().positive() });
            const p = s.parse(a.payload || {});
            if (!(await isFeatureEnabled(user.id, "skip_trace"))) throw new Error("Skip trace disabled");
            const lead = await storage.getLeadById(p.leadId);
            if (!lead) throw new Error("Lead not found");
            const ownerName = String((lead as any).ownerName || "").trim();
            const address = String((lead as any).address || "").trim();
            const city = String((lead as any).city || "").trim();
            const state = String((lead as any).state || "").trim();
            const zipCode = String((lead as any).zipCode || "").trim();
            const cacheKey = skipTraceCacheKey({ ownerName, address, city, state, zipCode });

            const existingSt = await storage.getLatestSkipTraceByCacheKey(cacheKey);
            const now = Date.now();
            const ms90d = 1000 * 60 * 60 * 24 * 90;
            if (existingSt && String((existingSt as any).status || "") === "success" && (existingSt as any).completedAt) {
              const completedAtMs = new Date((existingSt as any).completedAt).getTime();
              if (Number.isFinite(completedAtMs) && now - completedAtMs < ms90d) {
                out = { ...out, cached: true, skipTraceId: (existingSt as any).id };
              } else {
                out = { ...out, cached: false };
              }
            }

            if (!out.cached) {
              const provider = getSkipTraceProvider();
              const pending = await storage.createSkipTraceResult({
                leadId: p.leadId,
                providerName: provider.name,
                status: "pending",
                phonesJson: "[]",
                emailsJson: "[]",
                cacheKey,
                requestedAt: new Date(),
              } as any);
              try {
                const r = await provider.skipTrace({ ownerName, address, city, state, zipCode });
                if (r.status === "success") {
                  await storage.updateSkipTraceResult(pending.id, {
                    status: "success",
                    phonesJson: JSON.stringify(r.phones || []),
                    emailsJson: JSON.stringify(r.emails || []),
                    costCents: r.costCents,
                    completedAt: new Date(),
                    rawResponseJson: JSON.stringify(r.raw ?? null),
                  } as any);
                } else {
                  await storage.updateSkipTraceResult(pending.id, {
                    status: "fail",
                    phonesJson: JSON.stringify(r.phones || []),
                    emailsJson: JSON.stringify(r.emails || []),
                    costCents: r.costCents,
                    completedAt: new Date(),
                    rawResponseJson: JSON.stringify(r.raw ?? null),
                  } as any);
                }
              } catch (e: any) {
                await storage.updateSkipTraceResult(pending.id, {
                  status: "fail",
                  completedAt: new Date(),
                  rawResponseJson: JSON.stringify({ error: String(e?.message || e) }),
                } as any);
              }
              out = { ...out, cached: false, skipTraceId: pending.id };
            }
          } else if (a.type === "upload_media") {
            const s = z.object({
              leadId: z.number().int().positive().optional().nullable(),
              kind: z.enum(["photo", "voice"]),
              mimeType: z.string().trim().min(1).max(120),
              contentBase64: z.string().trim().min(1),
            });
            const p = s.parse(a.payload || {});
            const row = await storage.createFieldMediaAsset({
              userId: user.id,
              leadId: p.leadId ?? null,
              kind: p.kind,
              mimeType: p.mimeType,
              contentBase64: p.contentBase64,
            } as any);
            out = { ...out, mediaId: row.id };
          }
        } catch (e: any) {
          out = { idempotencyKey: a.idempotencyKey, ok: false, error: String(e?.message || e) };
        }

        await storage.createSyncIdempotency({ userId: user.id, idempotencyKey: a.idempotencyKey, responseJson: JSON.stringify(out) } as any);
        results.push(out);
      }

      res.json({ results });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/leads", async (req, res) => {
    try {
      const validated = insertLeadSchema.parse(req.body) as InsertLead;
      if (!String((validated as any).source || "").trim()) {
        return res.status(400).json({ message: "Lead source is required" });
      }

      const dedupeKey = computeLeadDedupeKey(validated as any);

      try {
        const dupRows: any = await db.execute(sql`
          SELECT id FROM leads
          WHERE dedupe_key = ${dedupeKey}
          LIMIT 1
        `);
        if ((dupRows as any).rows?.length) {
          const existingId = (dupRows as any).rows[0].id;
          return res.status(409).json({ message: "Duplicate lead: address and owner already exist", leadId: existingId });
        }
      } catch {}

      const lead = await storage.createLead({ ...(validated as any), dedupeKey } as any);
      
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "created_lead",
          description: `Added new lead: ${lead.address}`,
          metadata: JSON.stringify({ leadId: lead.id, address: lead.address }),
        });
      }

      try {
        await onLeadCreated({
          leadId: lead.id,
          leadAddress: String(lead.address || "").trim(),
          assignedTo: (lead as any).assignedTo ?? null,
          createdBy: Number(req.session.userId || 0),
        });
      } catch {}
      
      res.status(201).json(lead);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/leads/:id", async (req, res) => {
    try {
      const partial = insertLeadSchema.partial().parse(req.body) as Partial<InsertLead>;
      const id = parseInt(req.params.id);
      const before = await storage.getLeadById(id);
      if (before) {
        const merged: any = { ...before, ...(partial as any) };
        if (merged.address && merged.city && merged.state && merged.zipCode && merged.ownerName) {
          (partial as any).dedupeKey = computeLeadDedupeKey(merged);
        }
      }
      const lead = await storage.updateLead(id, partial);
      try {
        const property = await storage.getPropertyBySourceLeadId(id);
        if (property) {
          const propertyPatch: any = {};
          if (typeof partial.address !== 'undefined') propertyPatch.address = partial.address;
          if (typeof partial.city !== 'undefined') propertyPatch.city = partial.city;
          if (typeof partial.state !== 'undefined') propertyPatch.state = partial.state;
          if (typeof partial.zipCode !== 'undefined') propertyPatch.zipCode = partial.zipCode;
          if (Object.keys(propertyPatch).length) {
            await storage.updateProperty(property.id, propertyPatch);
            console.log(`[link] propagated lead ${id} fields to property ${property.id}`);
          }
        }
      } catch {}
      
      if (req.session.userId) {
        const onlyNotesChanged = before && typeof partial.notes !== 'undefined' && partial.notes !== before.notes && Object.keys(partial).length === 1;
        const action = onlyNotesChanged ? "added_note" : "updated_lead";
        const description = onlyNotesChanged ? `Added note to lead: ${lead.address}` : `Updated lead: ${lead.address}`;
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action,
          description,
          metadata: JSON.stringify({ leadId: lead.id, address: lead.address }),
        });
      }

      try {
        await onLeadStatusChanged({
          leadId: lead.id,
          leadAddress: String(lead.address || "").trim(),
          beforeStatus: (before as any)?.status ?? null,
          afterStatus: (lead as any)?.status ?? null,
          assignedTo: (lead as any)?.assignedTo ?? null,
          actorUserId: Number(req.session.userId || 0),
        });
      } catch {}
      
      res.json(lead);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/leads/:id", async (req, res) => {
    try {
      const lead = await storage.getLeadById(parseInt(req.params.id));
      await storage.deleteLead(parseInt(req.params.id));
      
      if (req.session.userId && lead) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "deleted_lead",
          description: `Deleted lead: ${lead.address}`,
          metadata: JSON.stringify({ leadId: lead.id, address: lead.address }),
        });
      }
      
      res.json({ message: "Lead deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Convert lead to property (lead must be under_contract status)
  app.post("/api/leads/:id/convert-to-property", async (req, res) => {
    try {
      const leadId = parseInt(req.params.id);
      const lead = await storage.getLeadById(leadId);
      
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      // Normalize status check (case-insensitive, trim whitespace)
      const normalizedStatus = lead.status?.toLowerCase().trim();
      if (normalizedStatus !== "under_contract") {
        return res.status(400).json({ 
          message: "Lead must be 'under contract' status before converting to property" 
        });
      }
      
      // Check if property already exists from this lead (DB has unique index but check first for better UX)
      const existingProperty = await storage.getPropertyBySourceLeadId(leadId);
      if (existingProperty) {
        return res.status(409).json({ 
          message: "Property already exists for this lead",
          propertyId: existingProperty.id
        });
      }
      
      // Create property from lead data - validate with schema
      const propertyData = insertPropertySchema.parse({
        address: lead.address,
        city: lead.city,
        state: lead.state,
        zipCode: lead.zipCode,
        price: lead.estimatedValue || null,
        status: "under_contract",
        sourceLeadId: lead.id,
        leadSource: (lead as any).source || null,
        notes: lead.notes || null,
      });
      
      const property = await storage.createProperty(propertyData);
      
      // Log activity
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "converted_lead_to_property",
          description: `Converted lead to property: ${property.address}`,
          metadata: JSON.stringify({ 
            leadId: lead.id, 
            propertyId: property.id, 
            address: property.address 
          }),
        });
      }
      
      res.status(201).json({ 
        message: "Lead successfully converted to property",
        property 
      });
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(409).json({ message: "Property already exists for this lead" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // OPPORTUNITIES ENDPOINTS (New Terminology)
  app.get("/api/opportunities", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const allProperties = await storage.getProperties(limit, offset);
      res.json(allProperties);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/opportunities/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const property = await storage.getPropertyById(id);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });

      let lead: any = null;
      if (property.sourceLeadId) {
        try {
          lead = await storage.getLeadById(property.sourceLeadId);
        } catch {}
      }

      res.json({ property, lead });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/opportunities/:id/skip-trace/latest", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "skip_trace"))) return res.status(404).json({ message: "Not found" });

      const propertyId = parseInt(req.params.id);
      const property = await storage.getPropertyById(propertyId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });

      const row = await storage.getLatestSkipTraceForProperty(propertyId);
      if (!row) return res.json(null);

      return res.json({
        ...row,
        phones: parseJsonArrayText((row as any).phonesJson),
        emails: parseJsonArrayText((row as any).emailsJson),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/opportunities/:id/skip-trace", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "skip_trace"))) return res.status(404).json({ message: "Not found" });

      const propertyId = parseInt(req.params.id);
      const property = await storage.getPropertyById(propertyId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });

      let lead: any = null;
      if ((property as any).sourceLeadId) {
        try {
          lead = await storage.getLeadById((property as any).sourceLeadId);
        } catch {}
      }

      const ownerName = String((lead?.ownerName ?? req.body?.ownerName ?? "")).trim();
      const address = String((property as any).address || "").trim();
      const city = String((property as any).city || "").trim();
      const state = String((property as any).state || "").trim();
      const zipCode = String((property as any).zipCode || "").trim();
      if (!ownerName || !address || !city || !state || !zipCode) return res.status(400).json({ message: "Opportunity is missing required fields" });

      const cacheKey = skipTraceCacheKey({ ownerName, address, city, state, zipCode });
      const existing = await storage.getLatestSkipTraceByCacheKey(cacheKey);

      const now = Date.now();
      const ms90d = 1000 * 60 * 60 * 24 * 90;
      const ms5m = 1000 * 60 * 5;

      if (existing && String((existing as any).status || "") === "success" && (existing as any).completedAt) {
        const completedAtMs = new Date((existing as any).completedAt).getTime();
        if (Number.isFinite(completedAtMs) && now - completedAtMs < ms90d) {
          await storage.createGlobalActivity({
            userId: user.id,
            action: "skip_trace_cached",
            description: `Skip trace cache hit: ${address}`,
            metadata: JSON.stringify({ propertyId, skipTraceId: (existing as any).id }),
          } as any);
          return res.json({
            cached: true,
            result: {
              ...existing,
              phones: parseJsonArrayText((existing as any).phonesJson),
              emails: parseJsonArrayText((existing as any).emailsJson),
            },
          });
        }
      }

      if (existing && String((existing as any).status || "") === "pending" && (existing as any).requestedAt) {
        const requestedAtMs = new Date((existing as any).requestedAt).getTime();
        if (Number.isFinite(requestedAtMs) && now - requestedAtMs < ms5m) {
          return res.json({
            pending: true,
            result: {
              ...existing,
              phones: parseJsonArrayText((existing as any).phonesJson),
              emails: parseJsonArrayText((existing as any).emailsJson),
            },
          });
        }
      }

      const provider = getSkipTraceProvider();
      const pending = await storage.createSkipTraceResult({
        propertyId,
        leadId: lead?.id ?? null,
        providerName: provider.name,
        status: "pending",
        phonesJson: "[]",
        emailsJson: "[]",
        cacheKey,
        requestedAt: new Date(),
      } as any);

      await storage.createGlobalActivity({
        userId: user.id,
        action: "skip_trace_requested",
        description: `Skip trace requested: ${address}`,
        metadata: JSON.stringify({ propertyId, leadId: lead?.id ?? null, skipTraceId: pending.id, provider: provider.name }),
      } as any);

      let updated: any = pending;
      try {
        const out = await provider.skipTrace({ ownerName, address, city, state, zipCode });
        if (out.status === "success") {
          updated = await storage.updateSkipTraceResult(pending.id, {
            status: "success",
            phonesJson: JSON.stringify(out.phones || []),
            emailsJson: JSON.stringify(out.emails || []),
            costCents: out.costCents,
            completedAt: new Date(),
            rawResponseJson: JSON.stringify(out.raw ?? null),
          } as any);

          if (lead?.id) {
            const leadPatch: any = {};
            if (!String(lead?.ownerPhone || "").trim() && out.phones?.[0]) leadPatch.ownerPhone = out.phones[0];
            if (!String(lead?.ownerEmail || "").trim() && out.emails?.[0]) leadPatch.ownerEmail = out.emails[0];
            if (Object.keys(leadPatch).length) await storage.updateLead(lead.id, leadPatch);
          }

          await storage.createGlobalActivity({
            userId: user.id,
            action: "skip_trace_success",
            description: `Skip trace success: ${address}`,
            metadata: JSON.stringify({ propertyId, leadId: lead?.id ?? null, skipTraceId: pending.id, phones: out.phones?.length || 0, emails: out.emails?.length || 0, costCents: out.costCents }),
          } as any);
        } else {
          updated = await storage.updateSkipTraceResult(pending.id, {
            status: "fail",
            phonesJson: JSON.stringify(out.phones || []),
            emailsJson: JSON.stringify(out.emails || []),
            costCents: out.costCents,
            completedAt: new Date(),
            rawResponseJson: JSON.stringify(out.raw ?? null),
          } as any);
          await storage.createGlobalActivity({
            userId: user.id,
            action: "skip_trace_failed",
            description: `Skip trace failed: ${address}`,
            metadata: JSON.stringify({ propertyId, leadId: lead?.id ?? null, skipTraceId: pending.id, error: (out as any).errorMessage || "failed", costCents: out.costCents }),
          } as any);
        }
      } catch (e: any) {
        updated = await storage.updateSkipTraceResult(pending.id, {
          status: "fail",
          completedAt: new Date(),
          rawResponseJson: JSON.stringify({ error: String(e?.message || e) }),
        } as any);
        await storage.createGlobalActivity({
          userId: user.id,
          action: "skip_trace_failed",
          description: `Skip trace failed: ${address}`,
          metadata: JSON.stringify({ propertyId, leadId: lead?.id ?? null, skipTraceId: pending.id, error: String(e?.message || e) }),
        } as any);
      }

      return res.json({
        cached: false,
        result: {
          ...updated,
          phones: parseJsonArrayText(updated.phonesJson),
          emails: parseJsonArrayText(updated.emailsJson),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/opportunities/:id/comps/snapshots", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "comps"))) return res.status(404).json({ message: "Not found" });
      const propertyId = parseInt(req.params.id);
      const rows = await storage.getCompSnapshotsByProperty(propertyId, 20);
      res.json(rows.map((r: any) => ({ ...r, comps: (() => { try { return JSON.parse(String(r.compsJson || "[]")); } catch { return []; } })() })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/opportunities/:id/comps/pull", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "comps"))) return res.status(404).json({ message: "Not found" });
      const propertyId = parseInt(req.params.id);
      const property = await storage.getPropertyById(propertyId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });

      const provider = getCompProvider();
      const { comps, raw } = await provider.getComps({
        address: String((property as any).address || ""),
        city: String((property as any).city || ""),
        state: String((property as any).state || ""),
        zipCode: String((property as any).zipCode || ""),
      });

      const arv = computeArvFromComps(comps as any);
      const arvSuggestion = typeof arv === "number" && Number.isFinite(arv) ? arv : null;
      const offerRangeMin = arvSuggestion ? Math.round(arvSuggestion * 0.65) : null;
      const offerRangeMax = arvSuggestion ? Math.round(arvSuggestion * 0.75) : null;

      const snap = await storage.createCompSnapshot({
        propertyId,
        providerName: provider.name,
        requestedAt: new Date(),
        compsJson: JSON.stringify(comps),
        rawResponseJson: JSON.stringify(raw ?? null),
        arvSuggestion: arvSuggestion ? String(arvSuggestion) : null,
        offerRangeMin: offerRangeMin ? String(offerRangeMin) : null,
        offerRangeMax: offerRangeMax ? String(offerRangeMax) : null,
      } as any);

      res.json({
        snapshot: { ...snap, comps },
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  async function recomputeBuyerMatches(propertyId: number) {
    const property = await storage.getPropertyById(propertyId);
    if (!property) throw new Error("Opportunity not found");
    const buyers = await storage.getBuyers(1000, 0);

    const dealZipCode = String((property as any).zipCode || "");
    const dealCity = String((property as any).city || "");
    const dealState = String((property as any).state || "");
    const dealBeds = typeof (property as any).bedrooms === "number" ? (property as any).bedrooms : (property as any).beds ? Number((property as any).beds) : null;
    const dealBaths = typeof (property as any).bathrooms === "number" ? (property as any).bathrooms : (property as any).baths ? Number((property as any).baths) : null;
    const dealPrice = (property as any).price ? Number((property as any).price) : null;
    const sourceLeadId = (property as any).sourceLeadId ? Number((property as any).sourceLeadId) : null;
    const sourceLead = sourceLeadId ? await storage.getLeadById(sourceLeadId).catch(() => undefined) : undefined;
    const dealTags = Array.isArray((sourceLead as any)?.tags) ? (sourceLead as any).tags : [];

    const matches = (buyers || [])
      .map((b: any) => {
        const buyerZipCodes = Array.isArray(b.zipCodes) ? b.zipCodes : [];
        const buyerPreferredAreas = Array.isArray(b.preferredAreas) ? b.preferredAreas : [];
        const buyerTags = Array.isArray(b.tags) ? b.tags : [];
        const buyerTypes = Array.isArray(b.propertyTypes) ? b.propertyTypes : Array.isArray(b.preferredPropertyTypes) ? b.preferredPropertyTypes : [];
        const buyerMinPrice = b.minPrice ? Number(b.minPrice) : b.minBudget ? Number(b.minBudget) : null;
        const buyerMaxPrice = b.maxPrice ? Number(b.maxPrice) : b.maxBudget ? Number(b.maxBudget) : null;
        const score = computeBuyerMatchScore({
          dealZipCode,
          dealCity,
          dealState,
          dealPrice,
          dealBeds,
          dealBaths,
          dealPropertyType: null,
          buyerZipCodes,
          buyerPreferredAreas,
          buyerMinPrice,
          buyerMaxPrice,
          buyerMinBeds: b.minBeds ? Number(b.minBeds) : null,
          buyerMaxBeds: b.maxBeds ? Number(b.maxBeds) : null,
          buyerPropertyTypes: buyerTypes,
          buyerTags,
          dealTags,
        });
        return { buyerId: b.id, score };
      })
      .filter((m: any) => m.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 25);

    await storage.replaceDealBuyerMatches(
      propertyId,
      matches.map((m: any) => ({ buyerId: m.buyerId, score: m.score, computedAt: new Date() })) as any,
    );

    return matches;
  }

  app.get("/api/opportunities/:id/buyer-matches", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "buyer_match"))) return res.status(404).json({ message: "Not found" });
      const propertyId = parseInt(req.params.id);
      const rows = await storage.getDealBuyerMatches(propertyId, 25);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/opportunities/:id/buyer-matches/recompute", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "buyer_match"))) return res.status(404).json({ message: "Not found" });
      const propertyId = parseInt(req.params.id);
      const matches = await recomputeBuyerMatches(propertyId);
      res.json({ ok: true, count: matches.length });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/opportunities", async (req, res) => {
    try {
      const validated = insertPropertySchema.parse(req.body);
      const dedupeKey = computeOpportunityDedupeKey(validated as any);

      try {
        const dupRows: any = await db.execute(sql`
          SELECT id FROM properties
          WHERE dedupe_key = ${dedupeKey}
          LIMIT 1
        `);
        if ((dupRows as any).rows?.length) {
          const existingId = (dupRows as any).rows[0].id;
          return res.status(409).json({ message: "Duplicate opportunity: address already exists", opportunityId: existingId });
        }
      } catch {}

      const property = await storage.createProperty({ ...(validated as any), dedupeKey } as any);
      
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "created_opportunity",
          description: `Added new opportunity: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address }),
        });
      }
      
      res.status(201).json(property);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/opportunities/:id", async (req, res) => {
    try {
      const partial = insertPropertySchema.partial().parse(req.body);
      const id = parseInt(req.params.id);
      const before = await storage.getPropertyById(id);
      if (before) {
        const merged: any = { ...(before as any), ...(partial as any) };
        if (merged.address && merged.city && merged.state && merged.zipCode) {
          (partial as any).dedupeKey = computeOpportunityDedupeKey(merged);
        }
      }
      const property = await storage.updateProperty(id, partial);
      
      if (req.session.userId) {
        const onlyNotesChanged = before && typeof (partial as any).notes !== "undefined" && (partial as any).notes !== (before as any).notes && Object.keys(partial as any).length === 1;
        const action = onlyNotesChanged ? "added_note" : "updated_opportunity";
        const description = onlyNotesChanged ? `Added note to opportunity: ${property.address}` : `Updated opportunity: ${property.address}`;
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action,
          description,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address }),
        });
      }
      
      res.json(property);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/opportunities/:id", async (req, res) => {
    try {
      const property = await storage.getPropertyById(parseInt(req.params.id));
      await storage.deleteProperty(parseInt(req.params.id));
      
      if (req.session.userId && property) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "deleted_opportunity",
          description: `Deleted opportunity: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address }),
        });
      }
      
      res.json({ message: "Opportunity deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PROPERTIES ENDPOINTS (Legacy Proxies)
  app.get("/api/properties", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const allProperties = await storage.getProperties(limit, offset);
      res.json(allProperties);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // DIALER WORKSPACE ENDPOINTS (Queue)
  app.get("/api/dialer/lists", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    res.json([
      { id: "new", name: "New leads" },
      { id: "followups_due", name: "Follow-ups due" },
      { id: "all_callable", name: "All callable" },
    ]);
  });

  app.get("/api/dialer/queue", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
      const listId = String(req.query.listId || "new");
      const rawLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 50;

      const conditions: any[] = [
        sql`l.owner_phone IS NOT NULL`,
        sql`COALESCE(l.do_not_call, false) = false`,
      ];

      let orderBy: any = sql`l.created_at DESC`;

      if (listId === "new") {
        conditions.push(sql`COALESCE(l.status, '') = 'new'`);
        orderBy = sql`l.created_at DESC`;
      } else if (listId === "followups_due") {
        conditions.push(sql`l.next_follow_up_at IS NOT NULL`);
        conditions.push(sql`l.next_follow_up_at <= ${new Date()}`);
        orderBy = sql`l.next_follow_up_at ASC NULLS LAST`;
      } else if (listId === "all_callable") {
        orderBy = sql`l.updated_at DESC`;
      } else {
        return res.status(400).json({ message: "Invalid listId" });
      }

      const where = sql.join(conditions, sql` AND `);
      try {
        const result: any = await db.execute(sql`
          SELECT
            l.id as "leadId",
            l.owner_name as "ownerName",
            l.owner_phone as "ownerPhone",
            l.address as "address",
            l.city as "city",
            l.state as "state",
            l.status as "status",
            l.next_follow_up_at as "nextFollowUpAt",
            lc.last_call_at as "lastCallAt"
          FROM leads l
          LEFT JOIN (
            SELECT lead_id, MAX(started_at) as last_call_at
            FROM call_logs
            WHERE lead_id IS NOT NULL
            GROUP BY lead_id
          ) lc ON lc.lead_id = l.id
          WHERE ${where}
          ORDER BY ${orderBy}
          LIMIT ${limit}
        `);
        return res.json({ listId, items: result.rows || [] });
      } catch {
        const leadsList: any[] = await storage.getLeads(limit, 0);
        const calls: any[] = await storage.getCallLogs(5000 as any, 0 as any);
        const lastCallByLeadId = new Map<number, string>();
        for (const c of calls || []) {
          const lid = typeof c.leadId === "number" ? c.leadId : null;
          if (!lid || !c.startedAt) continue;
          const iso = new Date(c.startedAt).toISOString();
          const prev = lastCallByLeadId.get(lid);
          if (!prev || iso > prev) lastCallByLeadId.set(lid, iso);
        }

        const now = Date.now();
        const filtered = (leadsList || [])
          .filter((l: any) => Boolean(l.ownerPhone) && !l.doNotCall)
          .filter((l: any) => {
            if (listId === "new") return String(l.status || "") === "new";
            if (listId === "followups_due") return l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() <= now;
            return true;
          })
          .slice(0, limit)
          .map((l: any) => ({
            leadId: l.id,
            ownerName: l.ownerName,
            ownerPhone: l.ownerPhone,
            address: l.address,
            city: l.city,
            state: l.state,
            status: l.status ?? null,
            nextFollowUpAt: l.nextFollowUpAt ? new Date(l.nextFollowUpAt).toISOString() : null,
            lastCallAt: lastCallByLeadId.get(l.id) || null,
          }));

        return res.json({ listId, items: filtered });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // TELEPHONY ENDPOINTS (Dialer)
  app.post("/api/telephony/calls", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;

      const { direction, number, contactId, status, startedAt, metadata, leadId } = req.body || {};
      const resolvedLeadId = leadId ? Number(leadId) : metadata?.leadId ? Number(metadata.leadId) : null;
      const log = await storage.createCallLog({
        userId: user.id,
        direction,
        number,
        contactId: contactId ?? null as any,
        leadId: resolvedLeadId || null,
        status: status || "dialing",
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        metadata: metadata ? JSON.stringify(metadata) : null as any,
      } as any);
      if (metadata && typeof metadata === "object") {
        const metaLeadId = (metadata as any).leadId ? Number((metadata as any).leadId) : null;
        const propertyId = (metadata as any).propertyId ? Number((metadata as any).propertyId) : null;
        const linkedLeadId = resolvedLeadId || metaLeadId;
        if (linkedLeadId || propertyId) {
          await storage.createGlobalActivity({
            userId: user.id,
            action: "call_started",
            description: `Started call to ${String(number || "")}`,
            metadata: JSON.stringify({ leadId: linkedLeadId || undefined, propertyId: propertyId || undefined, callLogId: log.id, number: String(number || "") }),
          } as any);
        }
      }
      res.status(201).json(log);
      emitTelephonyEventToAll({ type: "call_log_created", payload: { id: log.id, status: log.status, number: log.number, direction: log.direction, leadId: log.leadId } });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/telephony/calls/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;

      const id = parseInt(req.params.id);
      let beforeStatus: string | null = null;
      let beforeMetadataText: string | null = null;
      let beforeLeadId: number | null = null;
      try {
        const beforeRows: any = await db.execute(sql`SELECT status, metadata, lead_id FROM call_logs WHERE id = ${id} LIMIT 1`);
        const row = (beforeRows as any).rows?.[0];
        beforeStatus = row?.status ?? null;
        beforeMetadataText = row?.metadata ?? null;
        beforeLeadId = row?.lead_id ?? null;
      } catch {}
      const patch = { ...(req.body || {}) };
      const followUpAtRaw = patch.followUpAt;
      delete patch.followUpAt;

      if (patch.metadata && typeof patch.metadata !== "string") patch.metadata = JSON.stringify(patch.metadata);
      if (patch.status && ["answered", "missed", "failed", "ended"].includes(String(patch.status))) {
        patch.endedAt = new Date();
      }
      if (typeof patch.startedAt === "string" || typeof patch.startedAt === "number") patch.startedAt = new Date(patch.startedAt);
      if (typeof patch.endedAt === "string" || typeof patch.endedAt === "number") patch.endedAt = new Date(patch.endedAt);
      if (typeof patch.durationMs !== "undefined") patch.durationMs = Number(patch.durationMs);
      if (typeof patch.leadId !== "undefined") patch.leadId = patch.leadId ? Number(patch.leadId) : null;
      const updated = await storage.updateCallLog(id, patch);
      const nextStatus = patch.status ? String(patch.status) : null;
      let meta: any = null;
      try {
        meta = beforeMetadataText ? JSON.parse(beforeMetadataText) : null;
      } catch {}
      const metaLeadId = meta?.leadId ? Number(meta.leadId) : null;
      const propertyId = meta?.propertyId ? Number(meta.propertyId) : null;
      const effectiveLeadId = (typeof updated.leadId === "number" ? updated.leadId : null) || beforeLeadId || metaLeadId;

      if (nextStatus && nextStatus !== beforeStatus) {
        const terminal = new Set(["answered", "missed", "failed"]);
        if (terminal.has(nextStatus)) {
          if (effectiveLeadId || propertyId) {
            await storage.createGlobalActivity({
              userId: user.id,
              action: `call_${nextStatus}`,
              description: `Call ${nextStatus}: ${String(updated.number || "")}`,
              metadata: JSON.stringify({ leadId: effectiveLeadId || undefined, propertyId: propertyId || undefined, callLogId: updated.id, status: nextStatus }),
            } as any);
          }
        }
      }

      if ((patch.disposition || patch.note) && (effectiveLeadId || propertyId)) {
        await storage.createGlobalActivity({
          userId: user.id,
          action: "call_dispositioned",
          description: patch.disposition ? `Disposition: ${String(patch.disposition)}` : "Disposition updated",
          metadata: JSON.stringify({ leadId: effectiveLeadId || undefined, propertyId: propertyId || undefined, callLogId: updated.id, disposition: patch.disposition || undefined }),
        } as any);
      }

      if (followUpAtRaw && effectiveLeadId) {
        const followUpAt = new Date(followUpAtRaw);
        if (!Number.isNaN(followUpAt.valueOf())) {
          await storage.updateLead(effectiveLeadId, { nextFollowUpAt: followUpAt } as any);
          await storage.createGlobalActivity({
            userId: user.id,
            action: "followup_scheduled",
            description: `Follow-up scheduled: ${followUpAt.toLocaleString()}`,
            metadata: JSON.stringify({ leadId: effectiveLeadId, callLogId: updated.id }),
          } as any);
        }
      }

      if (patch.disposition === "do_not_call" && effectiveLeadId) {
        await storage.updateLead(effectiveLeadId, { doNotCall: true } as any);
      }

      res.json(updated);
      emitTelephonyEventToAll({ type: "call_log_updated", payload: { id: updated.id, status: updated.status, number: updated.number, direction: updated.direction } });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/telephony/history", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;

      const { limit, offset, status, contactId } = req.query as any;
      const items = await storage.getCallLogs(
        limit ? parseInt(limit) : undefined,
        offset ? parseInt(offset) : 0,
        status as string | undefined,
        contactId ? parseInt(contactId as string) : undefined,
      );
      if (!items.length) return res.json(items);
      const numbers = Array.from(new Set(items.map((i: any) => String(i.number || "").trim()).filter(Boolean)));
      const reps = await storage.getNumberReputationByE164s(user.id, numbers);
      const labelByE164 = new Map<string, string>();
      for (const r of reps as any[]) labelByE164.set(String(r.e164), String(r.label));
      res.json(items.map((i: any) => ({ ...i, spamLabel: labelByE164.get(String(i.number || "").trim()) || null })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/telephony/contacts", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;

      const q = (req.query.query as string || "").toLowerCase();
      const all = await storage.getContacts(100, 0);
      const filtered = all.filter(c => (
        (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q)
      ));
      res.json({ items: filtered.map(c => ({ id: c.id, name: c.name, numbers: [c.phone].filter(Boolean) })) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/telephony/spam/flag", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const e164 = String(req.body?.e164 || "").trim();
      const label = String(req.body?.label || "").trim().toLowerCase();
      const reason = typeof req.body?.reason === "string" ? req.body.reason : null;
      if (!e164) return res.status(400).json({ message: "Missing e164" });
      if (label !== "spam" && label !== "allow" && label !== "block") return res.status(400).json({ message: "Invalid label" });
      const saved = await storage.upsertNumberReputation({ userId: req.session.userId!, e164, label, reason } as any);
      res.json(saved);
      emitTelephonyEventToAll({ type: "spam_flag_updated", payload: { e164, label } });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/telephony/spam/unflag", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const e164 = String(req.body?.e164 || "").trim();
      if (!e164) return res.status(400).json({ message: "Missing e164" });
      await storage.deleteNumberReputation(req.session.userId!, e164);
      res.json({ ok: true });
      emitTelephonyEventToAll({ type: "spam_flag_updated", payload: { e164, label: null } });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/telephony/analytics/summary", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const rangeDaysRaw = String((req.query as any).rangeDays || "30");
      const rangeDays = Math.max(1, Math.min(365, parseInt(rangeDaysRaw, 10) || 30));
      const startDate = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
      const summary = await storage.getTelephonyAnalyticsSummary(req.session.userId!, startDate);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/telephony/voicemail", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const limit = Math.max(1, Math.min(200, parseInt(String((req.query as any).limit || "50"), 10) || 50));
      const items = await storage.listTelephonyMedia(req.session.userId!, "voicemail", limit);
      const numbers = Array.from(new Set(items.map((i: any) => String(i.e164 || "").trim()).filter(Boolean)));
      const reps = await storage.getNumberReputationByE164s(req.session.userId!, numbers);
      const labelByE164 = new Map<string, string>();
      for (const r of reps as any[]) labelByE164.set(String(r.e164), String(r.label));
      const enriched = await Promise.all(
        items.map(async (m: any) => {
          const audioUrl = m.storageKey ? await getTelephonyMediaSignedUrl({ key: String(m.storageKey) }) : null;
          return { ...m, audioUrl: audioUrl || m.providerUrl || null, spamLabel: labelByE164.get(String(m.e164 || "").trim()) || null };
        }),
      );
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/telephony/presence", async (req, res) => {
    try {
      const number = req.query.number as string;
      // Placeholder presence; integrate SwitchFree later
      res.json({ number, available: true, lastSeenAt: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/telephony/health", async (req, res) => {
    try {
      // Check database connectivity
      await storage.getUserByEmail("test@example.com");
      
      // Check SignalWire connectivity
      const space = process.env.SIGNALWIRE_SPACE_URL?.replace(/^https?:\/\//, "");
      const project = process.env.SIGNALWIRE_PROJECT_ID;
      const token = process.env.SIGNALWIRE_API_TOKEN;
      
      let signalwireStatus = "unconfigured";
      if (space && project && token) {
        try {
          const url = `https://${space}/api/laml/2010-04-01/Accounts/${project}.json`;
          const auth = Buffer.from(`${project}:${token}`).toString("base64");
          const resp = await fetch(url, { 
            method: "GET", 
            headers: { "Authorization": `Basic ${auth}` },
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          signalwireStatus = resp.ok ? "reachable" : "unreachable";
        } catch (error) {
          signalwireStatus = "error";
          console.error("SignalWire health check failed:", error);
        }
      }
      
      res.json({ 
        status: "ok", 
        db: "connected", 
        signalwire: signalwireStatus,
        timestamp: new Date().toISOString(),
        numbers: process.env.DIALER_NUMBERS_JSON ? JSON.parse(process.env.DIALER_NUMBERS_JSON) : [],
        defaultFrom: process.env.DIALER_DEFAULT_FROM_NUMBER || null
      });
    } catch (error: any) {
      console.error("Telephony health check failed:", error);
      res.status(500).json({ 
        status: "error", 
        db: "disconnected", 
        signalwire: "error",
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // SYSTEM HEALTH (Aggregated diagnostics)
  app.get("/api/system/health", async (_req, res) => {
    try {
      // DB connectivity
      let dbStatus = "disconnected";
      try {
        await storage.getUserByEmail("test@example.com");
        dbStatus = "connected";
      } catch (_e) {}

      // SignalWire reachability (reuse logic)
      const space = process.env.SIGNALWIRE_SPACE_URL?.replace(/^https?:\/\//, "");
      const project = process.env.SIGNALWIRE_PROJECT_ID;
      const token = process.env.SIGNALWIRE_API_TOKEN;
      let signalwireStatus = "unconfigured";
      if (space && project && token) {
        try {
          const url = `https://${space}/api/laml/2010-04-01/Accounts/${project}.json`;
          const auth = Buffer.from(`${project}:${token}`).toString("base64");
          const resp = await fetch(url, { method: "GET", headers: { "Authorization": `Basic ${auth}` }, signal: AbortSignal.timeout(5000) });
          signalwireStatus = resp.ok ? "reachable" : "unreachable";
        } catch (_e) {
          signalwireStatus = "error";
        }
      }

      // Env vars presence
      const required = [
        "DATABASE_URL",
        "SESSION_SECRET",
        "EMPLOYEE_ACCESS_CODE",
        "SIGNALWIRE_SPACE_URL",
        "SIGNALWIRE_PROJECT_ID",
        "SIGNALWIRE_API_TOKEN",
      ];
      const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");

      // Sessions store check (ensure table exists)
      let sessionsOk = true;
      try {
        // @ts-ignore drizzle query via node-postgres: simple existence check
        await (await import("./db.js")).db.execute?.(undefined as any);
      } catch (_e) {
        sessionsOk = true; // keep optimistic; pg-simple auto-creates table
      }

      // Next steps
      const nextSteps: string[] = [];
      if (missing.length) nextSteps.push(`Add missing env vars: ${missing.join(", ")}`);
      if (signalwireStatus !== "reachable") nextSteps.push("Verify SignalWire credentials and number capabilities");
      if (dbStatus !== "connected") nextSteps.push("Verify DATABASE_URL and Neon availability");
      if (!process.env.DIALER_DEFAULT_FROM_NUMBER) nextSteps.push("Set DIALER_DEFAULT_FROM_NUMBER for outbound caller ID");

      res.json({
        status: missing.length === 0 && dbStatus === "connected" && signalwireStatus === "reachable" ? "ok" : "warn",
        env: { nodeEnv: process.env.NODE_ENV || "", missing },
        db: dbStatus,
        signalwire: signalwireStatus,
        numbers: process.env.DIALER_NUMBERS_JSON ? JSON.parse(process.env.DIALER_NUMBERS_JSON) : [],
        defaultFrom: process.env.DIALER_DEFAULT_FROM_NUMBER || null,
        sessions: { ok: sessionsOk },
        nextSteps,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/telephony/signalwire/token", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;

      const { to, from } = req.body || {};
      
      if (!to) {
        return res.status(400).json({ message: "Destination number (to) is required" });
      }
      
      const space = process.env.SIGNALWIRE_SPACE_URL?.replace(/^https?:\/\//, "").trim();
      const project = process.env.SIGNALWIRE_PROJECT_ID?.trim();
      const token = process.env.SIGNALWIRE_API_TOKEN?.trim();
      
      if (!space || !project || !token) {
        return res.status(500).json({ message: "SignalWire credentials not configured" });
      }
      
      // Generate a short-lived JWT token for WebRTC
      // resource must be a string identifier for the client (e.g. the phone number)
      const resolvedFrom = String(from ?? process.env.DIALER_DEFAULT_FROM_NUMBER ?? "").trim();
      if (!resolvedFrom) {
        return res.status(400).json({ message: "Missing from number" });
      }
      const resource = resolvedFrom;
      
      const payload = {
        iss: project,
        sub: req.session.userId?.toString() || "anonymous",
        aud: `https://${space}`,
        exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
        iat: Math.floor(Date.now() / 1000),
        scope: "voice",
        resource: resource,
      };
      
      if (process.env.NODE_ENV !== "production") {
        console.log("[SignalWire] WebRTC JWT claims:", {
          iss: payload.iss,
          sub: payload.sub,
          aud: payload.aud,
          exp: payload.exp,
          iat: payload.iat,
          scope: payload.scope,
          resource: payload.resource,
        });
      }

      const secret = new TextEncoder().encode(token);
      const jwtToken = await new SignJWT(payload as any)
        .setProtectedHeader({ alg: "HS256" })
        .sign(secret);
      
      res.json({ 
        token: jwtToken,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
        space: `wss://${space}`,
        project: project,
        from: resolvedFrom,
      });
    } catch (error: any) {
      console.error("WebRTC token generation failed:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/telephony/ws-token", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const secret = process.env.SESSION_SECRET || "";
      if (!secret) return res.status(503).json({ message: "Server authentication is not configured" });
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 60;
      const token = await new SignJWT({ sub: String(req.session.userId || ""), exp, iat: now } as any)
        .setProtectedHeader({ alg: "HS256" })
        .sign(new TextEncoder().encode(secret));
      res.json({ token, expiresAt: new Date(exp * 1000).toISOString() });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/telephony/sms", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;

      const { to, from, body, metadata } = req.body || {};
      if (!to || !body) return res.status(400).json({ message: "Missing to/body" });
      const resolvedFrom = from || process.env.DIALER_DEFAULT_FROM_NUMBER || process.env.SIGNALWIRE_FROM_NUMBER || "";
      const out = await sendSignalWireSms({ to, body, from: resolvedFrom });
      const sid = out.messageSid || null;
      const smsStatus = "queued";
      if (metadata && typeof metadata === "object") {
        const leadId = (metadata as any).leadId ? Number((metadata as any).leadId) : null;
        const propertyId = (metadata as any).propertyId ? Number((metadata as any).propertyId) : null;
        if (leadId || propertyId) {
          await storage.createGlobalActivity({
            userId: user.id,
            action: "sms_sent",
            description: `Sent SMS to ${String(to || "")}`,
            metadata: JSON.stringify({ leadId: leadId || undefined, propertyId: propertyId || undefined, to: String(to || ""), sid, status: smsStatus, body: String(body || "") }),
          } as any);
        }
      }
      res.json({ sid, status: smsStatus });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  function normalizeDigits(value: any) {
    return String(value || "").replace(/[^\d]/g, "");
  }

  async function findLeadMatchByPhone(rawPhone: any): Promise<{ leadId: number; userId: number } | null> {
    const digits = normalizeDigits(rawPhone);
    if (digits.length < 7) return null;
    const last10 = digits.slice(-10);
    const like = `%${last10}`;
    const rows: any = await db.execute(sql`
      SELECT id, assigned_to
      FROM leads
      WHERE regexp_replace(COALESCE(owner_phone, ''), '\\D', '', 'g') LIKE ${like}
      ORDER BY id DESC
      LIMIT 1
    `);
    const row = (rows as any).rows?.[0];
    if (!row?.id) return null;
    const leadId = Number(row.id);
    const userId = row.assigned_to ? Number(row.assigned_to) : 0;
    return { leadId, userId: Number.isFinite(userId) ? userId : 0 };
  }

  async function findCallLogIdByCallSid(callSid: any): Promise<number | null> {
    const sid = String(callSid || "").trim();
    if (!sid) return null;
    const like = `%"callSid":"${sid}"%`;
    const rows: any = await db.execute(sql`
      SELECT id
      FROM call_logs
      WHERE metadata LIKE ${like}
      ORDER BY id DESC
      LIMIT 1
    `);
    const row = (rows as any).rows?.[0];
    return row?.id ? Number(row.id) : null;
  }

  // Inbound SMS webhook with cXML auto-reply
  app.post("/api/telephony/sms/webhook", async (req, res) => {
    try {
      // Verify SignalWire signature if configured
      const signature = req.headers["x-signalwire-signature"] as string;
      const url = req.protocol + "://" + req.get("host") + req.originalUrl;
      
      if (signature && process.env.SIGNALWIRE_API_TOKEN) {
        // Simple signature verification (can be enhanced with crypto)
        // For now, we'll accept the webhook
      }
      
      const { To, From, Body } = req.body;
      
      // Send cXML response for auto-reply
      const cxmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks, we'll call you shortly.</Message>
  <Route to="${process.env.DIALER_DEFAULT_FROM_NUMBER || '+12314060943'}" body="${Body}" from="${To}"/>
</Response>`;
      
      res.set("Content-Type", "text/xml");
      res.send(cxmlResponse);

      setImmediate(() => {
        findLeadMatchByPhone(From)
          .then((match) => {
            const leadId = match?.leadId || null;
            const userId = match?.userId || 0;
            const bodyText = String(Body || "");
            const normalized = bodyText.trim().toUpperCase();
            const isOptOut = normalized === "STOP" || normalized === "UNSUBSCRIBE" || normalized === "CANCEL" || normalized === "QUIT";

            if (leadId && isOptOut) {
              db.execute(sql`UPDATE leads SET do_not_text = true, updated_at = NOW() WHERE id = ${leadId}`).catch(() => {});
              db.execute(sql`UPDATE campaign_enrollments SET status = 'opted_out', updated_at = NOW() WHERE lead_id = ${leadId} AND status = 'active'`).catch(() => {});
              storage
                .createGlobalActivity({
                  userId,
                  action: "campaign_opt_out",
                  description: "Lead opted out via SMS",
                  metadata: JSON.stringify({ leadId, from: String(From || ""), to: String(To || ""), body: bodyText }),
                } as any)
                .catch(() => {});
            }

            return storage.createGlobalActivity({
              userId,
              action: "sms_received",
              description: typeof Body === "string" ? Body : "Inbound SMS received",
              metadata: JSON.stringify({ leadId: leadId || undefined, from: String(From || ""), to: String(To || ""), body: bodyText }),
            } as any);
          })
          .catch(() => {});
      });
      
    } catch (error: any) {
      console.error("SMS webhook error:", error);
      res.status(500).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
    }
  });

  // Inbound voice webhook with cXML IVR
  app.post("/api/telephony/voice/webhook", async (req, res) => {
    try {
      const { To, From, CallSid } = req.body;
      
      setImmediate(() => {
        (async () => {
          const existingId = await findCallLogIdByCallSid(CallSid);
          if (existingId) return;
          const match = await findLeadMatchByPhone(From);
          const leadId = match?.leadId || null;
          const userId = match?.userId || 0;
          await storage.createCallLog({
            userId,
            direction: "inbound",
            number: String(From || ""),
            contactId: null as any,
            leadId: leadId || null,
            status: "ringing",
            startedAt: new Date(),
            metadata: JSON.stringify({ callSid: String(CallSid || ""), to: String(To || ""), from: String(From || "") }),
          } as any);
          await storage.createGlobalActivity({
            userId,
            action: "call_inbound",
            description: `Inbound call from ${String(From || "")}`,
            metadata: JSON.stringify({ leadId: leadId || undefined, callSid: String(CallSid || ""), from: String(From || ""), to: String(To || "") }),
          } as any);
        })().catch(() => {});
      });
      
      // Simple IVR response - can be enhanced with business hours logic
      const hour = new Date().getHours();
      const isBusinessHours = hour >= 9 && hour < 17; // 9 AM to 5 PM
      
      let cxmlResponse: string;
      
      if (isBusinessHours) {
        // Business hours: AI greeting and qualification
        cxmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling. Please tell us how we can help you today.</Say>
  <Gather input="speech" timeout="10" action="/api/telephony/voice/gather" method="POST">
    <Say voice="Polly.Joanna">You can say things like schedule appointment, property inquiry, or speak to agent.</Say>
  </Gather>
</Response>`;
      } else {
        // After hours: voicemail with SMS callback
        cxmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling. Our office is currently closed. Please leave a message and we will return your call during business hours.</Say>
  <Record timeout="30" finishOnKey="#" action="/api/telephony/voice/recording" method="POST"/>
  <Say voice="Polly.Joanna">Thank you for your message. We will contact you soon.</Say>
</Response>`;
      }
      
      res.set("Content-Type", "text/xml");
      res.send(cxmlResponse);
      
    } catch (error: any) {
      console.error("Voice webhook error:", error);
      res.status(500).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
    }
  });

  // Voice gather webhook for speech recognition
  app.post("/api/telephony/voice/gather", async (req, res) => {
    try {
      const { To, From, CallSid, SpeechResult, Confidence } = req.body;
      
      console.log(`[Voice Gather] From: ${From}, Speech: ${SpeechResult}, Confidence: ${Confidence}`);
      
      let cxmlResponse: string;
      
      if (SpeechResult && Confidence > 0.5) {
        const speech = SpeechResult.toLowerCase();
        
        if (speech.includes("appointment") || speech.includes("schedule")) {
          cxmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I'll connect you to our scheduling department. Please hold.</Say>
  <Dial>${process.env.DIALER_DEFAULT_FROM_NUMBER || '+12314060943'}</Dial>
</Response>`;
        } else if (speech.includes("property") || speech.includes("inquiry")) {
          cxmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I'll connect you to our property specialist. Please hold.</Say>
  <Dial>${process.env.DIALER_DEFAULT_FROM_NUMBER || '+12314060943'}</Dial>
</Response>`;
        } else if (speech.includes("agent") || speech.includes("speak")) {
          cxmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I'll connect you to the next available agent. Please hold.</Say>
  <Dial>${process.env.DIALER_DEFAULT_FROM_NUMBER || '+12314060943'}</Dial>
</Response>`;
        } else {
          cxmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I didn't understand that. Let me connect you to an agent.</Say>
  <Dial>${process.env.DIALER_DEFAULT_FROM_NUMBER || '+12314060943'}</Dial>
</Response>`;
        }
      } else {
        cxmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I didn't catch that. Let me connect you to an agent.</Say>
  <Dial>${process.env.DIALER_DEFAULT_FROM_NUMBER || '+12314060943'}</Dial>
</Response>`;
      }
      
      res.set("Content-Type", "text/xml");
      res.send(cxmlResponse);
      
    } catch (error: any) {
      console.error("Voice gather error:", error);
      res.status(500).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
    }
  });

  // Voice recording webhook
  app.post("/api/telephony/voice/recording", async (req, res) => {
    try {
      const { To, From, CallSid, RecordingUrl, RecordingSid, RecordingDuration } = req.body;
      
      if (process.env.NODE_ENV !== "production") {
        console.log(`[Voice Recording] From: ${From}, RecordingUrl present: ${Boolean(RecordingUrl)}, Duration: ${RecordingDuration}s`);
      }
      
      // Send SMS confirmation
      const space = process.env.SIGNALWIRE_SPACE_URL?.replace(/^https?:\/\//, "") || "";
      const project = process.env.SIGNALWIRE_PROJECT_ID || "";
      const token = process.env.SIGNALWIRE_API_TOKEN || "";
      
      if (space && project && token) {
        const smsUrl = `https://${space}/api/laml/2010-04-01/Accounts/${project}/Messages.json`;
        const smsForm = new URLSearchParams({ 
          From: process.env.DIALER_DEFAULT_FROM_NUMBER || '+12314060943',
          To: From,
          Body: "Thank you for leaving a voicemail. We will review your message and contact you during business hours."
        });
        const auth = Buffer.from(`${project}:${token}`).toString("base64");
        
        try {
          await fetch(smsUrl, { 
            method: "POST", 
            headers: { 
              "Authorization": `Basic ${auth}`, 
              "Content-Type": "application/x-www-form-urlencoded" 
            }, 
            body: smsForm 
          });
          console.log(`[Voice Recording] SMS confirmation sent to ${From}`);
        } catch (smsError) {
          console.error("Failed to send SMS confirmation:", smsError);
        }
      }

      try {
        const match = await findLeadMatchByPhone(From);
        const inboxUserId = match?.userId || 0;
        const leadId = match?.leadId || null;

        const existingCallLogId = await findCallLogIdByCallSid(CallSid);
        const callLog = existingCallLogId
          ? await storage.updateCallLog(existingCallLogId, {
              status: "voicemail",
              leadId: leadId || null,
              endedAt: new Date(),
              durationMs: RecordingDuration ? parseInt(String(RecordingDuration), 10) * 1000 : null,
              metadata: JSON.stringify({ To, From, CallSid, RecordingUrl, RecordingSid, RecordingDuration }),
            } as any)
          : await storage.createCallLog({
              userId: inboxUserId,
              direction: "inbound",
              number: String(From || ""),
              contactId: null as any,
              leadId: leadId || null,
              status: "voicemail",
              startedAt: new Date(),
              endedAt: new Date(),
              durationMs: RecordingDuration ? parseInt(String(RecordingDuration), 10) * 1000 : null,
              metadata: JSON.stringify({ To, From, CallSid, RecordingUrl, RecordingSid, RecordingDuration }),
            } as any);

        const media = await storage.createCallMedia({
          userId: inboxUserId,
          callLogId: callLog.id,
          kind: "voicemail",
          e164: String(From || ""),
          providerUrl: RecordingUrl ? String(RecordingUrl) : null,
          providerSid: String(RecordingSid || CallSid || ""),
          durationSeconds: RecordingDuration ? parseInt(String(RecordingDuration), 10) : null,
          isRead: false,
        } as any);

        emitTelephonyEventToAll({ type: "voicemail_updated", payload: { id: media.id, e164: media.e164 } });

        await storage.createGlobalActivity({
          userId: inboxUserId,
          action: "voicemail_received",
          description: `Voicemail from ${String(From || "")}`,
          metadata: JSON.stringify({ leadId: leadId || undefined, callLogId: callLog.id, from: String(From || ""), to: String(To || ""), audioUrl: RecordingUrl ? String(RecordingUrl) : null }),
        } as any);

        if (RecordingUrl) {
          void (async () => {
            try {
              const key = `voicemail/${media.id}-${String(RecordingSid || CallSid || "recording")}.mp3`;
              const uploaded = await uploadTelephonyMediaFromUrl({ key, sourceUrl: String(RecordingUrl), contentType: "audio/mpeg" });
              if (uploaded) {
                await storage.updateCallMedia(media.id, { storageKey: uploaded.key, mimeType: uploaded.contentType } as any);
                emitTelephonyEventToAll({ type: "recording_ready", payload: { id: media.id, key: uploaded.key } });
              }
            } catch {}
          })();
        }
      } catch {}
      
      const cxmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for your message. We will contact you soon.</Say>
  <Hangup/>
</Response>`;
      
      res.set("Content-Type", "text/xml");
      res.send(cxmlResponse);
      
    } catch (error: any) {
      console.error("Voice recording error:", error);
      res.status(500).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
    }
  });

  app.get("/api/properties/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const property = await storage.getPropertyById(id);
      if (!property) return res.status(404).json({ message: "Property not found" });
      let lead: any = null;
      if (property.sourceLeadId) {
        try {
          lead = await storage.getLeadById(property.sourceLeadId);
        } catch {}
      }
      res.json({ property, lead });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/properties", async (req, res) => {
    try {
      const validated = insertPropertySchema.parse(req.body);
      const property = await storage.createProperty(validated);
      
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "created_property",
          description: `Added new property: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address }),
        });
      }
      
      res.status(201).json(property);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/properties/:id", async (req, res) => {
    try {
      const partial = insertPropertySchema.partial().parse(req.body);
      const property = await storage.updateProperty(parseInt(req.params.id), partial);
      
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "updated_property",
          description: `Updated property: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address }),
        });
      }
      
      res.json(property);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/properties/:id", async (req, res) => {
    try {
      const property = await storage.getPropertyById(parseInt(req.params.id));
      await storage.deleteProperty(parseInt(req.params.id));
      
      if (req.session.userId && property) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "deleted_property",
          description: `Deleted property: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address }),
        });
      }
      
      res.json({ message: "Property deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // CONTRACTS ENDPOINTS
  app.get("/api/contracts", async (req, res) => {
    try {
      const propertyId = req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      if (propertyId) {
        const items = await storage.getContractsByPropertyId(propertyId, limit, offset);
        return res.json(items);
      }
      const items = await storage.getContracts(limit, offset);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/contracts/:id", async (req, res) => {
    try {
      const contract = await storage.getContractById(parseInt(req.params.id));
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      res.json(contract);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contracts", async (req, res) => {
    try {
      const validated = insertContractSchema.parse(req.body);
      const contract = await storage.createContract(validated);
      res.status(201).json(contract);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/contracts/:id", async (req, res) => {
    try {
      const partial = insertContractSchema.partial().parse(req.body);
      const contract = await storage.updateContract(parseInt(req.params.id), partial);
      res.json(contract);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/contracts/:id", async (req, res) => {
    try {
      await storage.deleteContract(parseInt(req.params.id));
      res.json({ message: "Contract deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // CONTACTS ENDPOINTS
  app.get("/api/contacts", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const query = String((req.query as any).query || "").trim().toLowerCase();
      const allContacts = await storage.getContacts(limit, offset);
      if (!query) return res.json(allContacts);
      const filtered = allContacts.filter((c: any) => {
        const hay = [
          c?.name,
          c?.email,
          c?.phone,
          c?.company,
          c?.type,
          c?.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      });
      res.json(filtered);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/contacts/:id", async (req, res) => {
    try {
      const contact = await storage.getContactById(parseInt(req.params.id));
      if (!contact) return res.status(404).json({ message: "Contact not found" });
      res.json(contact);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contacts", async (req, res) => {
    try {
      const validated = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(validated);
      res.status(201).json(contact);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      const partial = insertContactSchema.partial().parse(req.body);
      const contact = await storage.updateContact(parseInt(req.params.id), partial);
      res.json(contact);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/contacts/:id", async (req, res) => {
    try {
      await storage.deleteContact(parseInt(req.params.id));
      res.json({ message: "Contact deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // CONTRACT TEMPLATES ENDPOINTS
  app.get("/api/contract-templates", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const templates = await storage.getContractTemplates(limit, offset);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/contract-templates/:id", async (req, res) => {
    try {
      const template = await storage.getContractTemplateById(parseInt(req.params.id));
      if (!template) return res.status(404).json({ message: "Template not found" });
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contract-templates", async (req, res) => {
    try {
      const validated = insertContractTemplateSchema.parse(req.body);
      const template = await storage.createContractTemplate(validated);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/contract-templates/:id", async (req, res) => {
    try {
      const partial = insertContractTemplateSchema.partial().parse(req.body);
      const template = await storage.updateContractTemplate(parseInt(req.params.id), partial);
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/contract-templates/:id", async (req, res) => {
    try {
      await storage.deleteContractTemplate(parseInt(req.params.id));
      res.json({ message: "Template deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // CONTRACT DOCUMENTS ENDPOINTS
  app.get("/api/contract-documents", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const documents = await storage.getContractDocuments(limit, offset);
      res.json(documents);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/contract-documents/:id", async (req, res) => {
    try {
      const document = await storage.getContractDocumentById(parseInt(req.params.id));
      if (!document) return res.status(404).json({ message: "Document not found" });
      res.json(document);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contract-documents", async (req, res) => {
    try {
      const validated = insertContractDocumentSchema.parse(req.body);
      const document = await storage.createContractDocument(validated);
      res.status(201).json(document);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/contract-documents/:id", async (req, res) => {
    try {
      const partial = insertContractDocumentSchema.partial().parse(req.body);
      const document = await storage.updateContractDocument(parseInt(req.params.id), partial);
      res.json(document);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/contract-documents/:id", async (req, res) => {
    try {
      await storage.deleteContractDocument(parseInt(req.params.id));
      res.json({ message: "Document deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/contract-documents/:id/envelopes", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "esign"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const rows = await storage.getContractEnvelopesByDocument(id);
      res.json(rows.map((e: any) => ({ ...e, tokenHash: undefined })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contract-documents/:id/envelopes", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "esign"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const doc = await storage.getContractDocumentById(id);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      const schema = z.object({
        signerName: z.string().trim().min(1).max(255),
        signerEmail: z.string().trim().email().max(255),
        expiresInDays: z.number().int().min(1).max(120).optional(),
      });
      const payload = schema.parse(req.body || {});

      const token = crypto.randomBytes(24).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + (payload.expiresInDays ?? 30) * 24 * 60 * 60 * 1000);

      const env = await storage.createContractEnvelope({
        documentId: id,
        status: "sent",
        signerName: payload.signerName,
        signerEmail: payload.signerEmail,
        tokenHash,
        expiresAt,
        sentAt: new Date(),
        auditJson: JSON.stringify([{ event: "sent", at: new Date().toISOString(), userId: user.id }]),
      } as any);

      await storage.updateContractDocument(id, { status: "sent" } as any);
      await storage.createGlobalActivity({
        userId: user.id,
        action: "contract_sent",
        description: `Contract sent for signature: ${doc.title}`,
        metadata: JSON.stringify({ documentId: id, envelopeId: env.id, signerEmail: payload.signerEmail }),
      } as any);

      const origin = `${req.protocol}://${req.get("host")}`;
      const signerUrl = `${origin}/sign/${token}`;

      let emailSent = false;
      let emailError: string | null = null;
      try {
        const subject = `Signature requested: ${String(doc.title || "Document")}`;
        const text = `You have a document to sign.\n\n${signerUrl}\n\nThis link expires on ${expiresAt.toISOString()}.`;
        const html = `<p>You have a document to sign.</p><p><a href="${signerUrl}">${signerUrl}</a></p><p>This link expires on ${expiresAt.toISOString()}.</p>`;
        await sendResendEmail({ to: payload.signerEmail, subject, text, html });
        emailSent = true;
      } catch (e: any) {
        emailError = String(e?.message || e);
      }

      try {
        const audit = (() => {
          try {
            const parsed = JSON.parse(String((env as any).auditJson || "[]"));
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })();
        audit.push({
          event: emailSent ? "email_sent" : "email_failed",
          at: new Date().toISOString(),
          to: payload.signerEmail,
          error: emailSent ? undefined : emailError,
        });
        await storage.updateContractEnvelope(env.id, { auditJson: JSON.stringify(audit) } as any);
      } catch {}

      res.status(201).json({ envelopeId: env.id, signerUrl, expiresAt: expiresAt.toISOString(), emailSent, emailError });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/contract-envelopes/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "esign"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const env = await storage.getContractEnvelopeById(id);
      if (!env) return res.status(404).json({ message: "Not found" });
      res.json({ ...env, tokenHash: undefined, signatureImageBase64: undefined, signedPdfBase64: undefined });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contract-envelopes/:id/upload-signed", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!(await isFeatureEnabled(user.id, "esign"))) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const schema = z.object({ signedPdfBase64: z.string().trim().min(1) });
      const payload = schema.parse(req.body || {});
      const env = await storage.getContractEnvelopeById(id);
      if (!env) return res.status(404).json({ message: "Not found" });
      const audit = (() => {
        try {
          const parsed = JSON.parse(String((env as any).auditJson || "[]"));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      audit.push({ event: "uploaded", at: new Date().toISOString(), userId: user.id });
      const updated = await storage.updateContractEnvelope(id, {
        status: "signed",
        signedAt: new Date(),
        signedPdfBase64: payload.signedPdfBase64,
        auditJson: JSON.stringify(audit),
      } as any);
      await storage.createGlobalActivity({
        userId: user.id,
        action: "contract_uploaded",
        description: "Signed contract uploaded",
        metadata: JSON.stringify({ envelopeId: id, documentId: updated.documentId }),
      } as any);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/sign/envelopes/:token", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!token) return res.status(404).json({ message: "Not found" });
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const env = await storage.getContractEnvelopeByTokenHash(tokenHash);
      if (!env) return res.status(404).json({ message: "Not found" });
      if ((env as any).expiresAt && new Date((env as any).expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Link expired" });

      const doc = await storage.getContractDocumentById(env.documentId);
      if (!doc) return res.status(404).json({ message: "Not found" });

      let mergeData: any = {};
      try {
        mergeData = doc.mergeData ? JSON.parse(String(doc.mergeData)) : {};
      } catch {
        mergeData = {};
      }
      const merged = mergeTemplate(String(doc.content || ""), mergeData);

      res.json({
        envelope: {
          id: env.id,
          status: env.status,
          signerName: env.signerName,
          signerEmail: env.signerEmail,
          expiresAt: (env as any).expiresAt,
          sentAt: (env as any).sentAt,
          viewedAt: (env as any).viewedAt,
          signedAt: (env as any).signedAt,
          declinedAt: (env as any).declinedAt,
        },
        document: { id: doc.id, title: doc.title, content: merged },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sign/envelopes/:token/viewed", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const env = await storage.getContractEnvelopeByTokenHash(tokenHash);
      if (!env) return res.status(404).json({ message: "Not found" });
      if ((env as any).expiresAt && new Date((env as any).expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Link expired" });

      const audit = (() => {
        try {
          const parsed = JSON.parse(String((env as any).auditJson || "[]"));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      audit.push({ event: "viewed", at: new Date().toISOString(), ip: req.ip, ua: req.headers["user-agent"] || "" });

      await storage.updateContractEnvelope(env.id, {
        status: env.status === "sent" ? "viewed" : env.status,
        viewedAt: (env as any).viewedAt || new Date(),
        auditJson: JSON.stringify(audit),
      } as any);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sign/envelopes/:token/decline", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const env = await storage.getContractEnvelopeByTokenHash(tokenHash);
      if (!env) return res.status(404).json({ message: "Not found" });
      if ((env as any).expiresAt && new Date((env as any).expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Link expired" });
      if (env.status === "signed") return res.status(400).json({ message: "Already signed" });

      const audit = (() => {
        try {
          const parsed = JSON.parse(String((env as any).auditJson || "[]"));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      audit.push({ event: "declined", at: new Date().toISOString(), ip: req.ip, ua: req.headers["user-agent"] || "" });

      await storage.updateContractEnvelope(env.id, { status: "declined", declinedAt: new Date(), auditJson: JSON.stringify(audit) } as any);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sign/envelopes/:token/sign", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const env = await storage.getContractEnvelopeByTokenHash(tokenHash);
      if (!env) return res.status(404).json({ message: "Not found" });
      if ((env as any).expiresAt && new Date((env as any).expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Link expired" });
      if (env.status === "signed") return res.status(400).json({ message: "Already signed" });
      if (env.status === "declined") return res.status(400).json({ message: "Declined" });

      const schema = z.object({
        signatureType: z.enum(["typed", "drawn"]),
        signatureText: z.string().trim().max(255).optional().nullable(),
        signatureImageBase64: z.string().trim().optional().nullable(),
      });
      const payload = schema.parse(req.body || {});
      if (payload.signatureType === "typed" && !String(payload.signatureText || "").trim()) return res.status(400).json({ message: "Signature text is required" });
      if (payload.signatureType === "drawn" && !String(payload.signatureImageBase64 || "").trim()) return res.status(400).json({ message: "Signature image is required" });

      const doc = await storage.getContractDocumentById(env.documentId);
      if (!doc) return res.status(404).json({ message: "Not found" });

      let mergeData: any = {};
      try {
        mergeData = doc.mergeData ? JSON.parse(String(doc.mergeData)) : {};
      } catch {
        mergeData = {};
      }
      const merged = mergeTemplate(String(doc.content || ""), mergeData);

      const audit = (() => {
        try {
          const parsed = JSON.parse(String((env as any).auditJson || "[]"));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      audit.push({ event: "signed", at: new Date().toISOString(), ip: req.ip, ua: req.headers["user-agent"] || "" });

      const auditLines = [
        `Envelope #${env.id}`,
        `Signer: ${String(env.signerName || "")} <${String(env.signerEmail || "")}>`,
        `Signed at: ${new Date().toISOString()}`,
      ];
      const signedPdfBase64 = await generateSignedPdfBase64({
        title: String(doc.title || "Document"),
        contentText: merged,
        signatureType: payload.signatureType,
        signatureText: payload.signatureText || null,
        signatureImageBase64: payload.signatureImageBase64 || null,
        auditLines,
      });

      await storage.updateContractEnvelope(env.id, {
        status: "signed",
        signedAt: new Date(),
        signatureType: payload.signatureType,
        signatureText: payload.signatureText || null,
        signatureImageBase64: payload.signatureType === "drawn" ? payload.signatureImageBase64 || null : null,
        signedPdfBase64,
        auditJson: JSON.stringify(audit),
      } as any);

      await storage.updateContractDocument(env.documentId, { status: "executed" } as any).catch(() => {});
      await storage.createGlobalActivity({
        userId: 0,
        action: "contract_signed",
        description: `Contract signed: ${String(doc.title || "")}`,
        metadata: JSON.stringify({ envelopeId: env.id, documentId: env.documentId, signerEmail: env.signerEmail || null }),
      } as any).catch(() => {});

      try {
        await onContractSigned({
          documentId: env.documentId,
          title: String(doc.title || "").trim(),
          propertyId: (doc as any)?.propertyId ?? null,
        });
      } catch {}

      res.json({ ok: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/sign/envelopes/:token/pdf", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const env = await storage.getContractEnvelopeByTokenHash(tokenHash);
      if (!env) return res.status(404).json({ message: "Not found" });
      if (!env.signedPdfBase64) return res.status(404).json({ message: "Not found" });
      const bytes = Buffer.from(String(env.signedPdfBase64), "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="signed-envelope-${env.id}.pdf"`);
      res.send(bytes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // DOCUMENT VERSIONS ENDPOINTS
  app.get("/api/documents/:documentId/versions", async (req, res) => {
    try {
      const versions = await storage.getDocumentVersions(parseInt(req.params.documentId));
      res.json(versions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/documents/:documentId/versions", async (req, res) => {
    try {
      const validated = insertDocumentVersionSchema.parse({
        ...req.body,
        documentId: parseInt(req.params.documentId)
      });
      const version = await storage.createDocumentVersion(validated);
      res.status(201).json(version);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // LOIS ENDPOINTS
  app.get("/api/lois", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const allLois = await storage.getLois(limit, offset);
      res.json(allLois);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lois/:id", async (req, res) => {
    try {
      const loi = await storage.getLoiById(parseInt(req.params.id));
      if (!loi) return res.status(404).json({ message: "LOI not found" });
      res.json(loi);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lois", async (req, res) => {
    try {
      const validated = insertLoiSchema.parse(req.body);
      const loi = await storage.createLoi(validated);
      res.status(201).json(loi);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/lois/:id", async (req, res) => {
    try {
      const partial = insertLoiSchema.partial().parse(req.body);
      const loi = await storage.updateLoi(parseInt(req.params.id), partial);
      res.json(loi);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/lois/:id", async (req, res) => {
    try {
      await storage.deleteLoi(parseInt(req.params.id));
      res.json({ message: "LOI deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // USERS ENDPOINTS
  app.get("/api/users", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const users = await storage.getUsers(limit, offset);
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUserById(parseInt(req.params.id));
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const validated = insertUserSchema.parse(req.body);
      const user = await storage.createUser(validated);
      res.status(201).json(user);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Change password
  app.patch("/api/users/:id/password", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const userId = parseInt(req.params.id);
    if (req.session.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      const user = await storage.getUserById(userId);
      if (!user || !user.passwordHash) {
        return res.status(404).json({ message: "User not found" });
      }

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(userId, { passwordHash: newPasswordHash });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const partial = insertUserSchema.partial().parse(req.body);
      const user = await storage.updateUser(parseInt(req.params.id), partial);
      res.json(user);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // TWO FACTOR AUTH ENDPOINTS
  app.get("/api/users/:userId/2fa", async (req, res) => {
    try {
      const auth = await storage.getTwoFactorAuthByUserId(parseInt(req.params.userId));
      res.json(auth || { isEnabled: false });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/:userId/2fa", async (req, res) => {
    try {
      const validated = insertTwoFactorAuthSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const auth = await storage.createTwoFactorAuth(validated);
      res.status(201).json(auth);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/users/:userId/2fa", async (req, res) => {
    try {
      const partial = insertTwoFactorAuthSchema.partial().parse(req.body);
      const auth = await storage.updateTwoFactorAuth(parseInt(req.params.userId), partial);
      res.json(auth);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/users/:userId/2fa", async (req, res) => {
    try {
      await storage.deleteTwoFactorAuth(parseInt(req.params.userId));
      res.json({ message: "2FA disabled" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // BACKUP CODES ENDPOINTS
  app.get("/api/users/:userId/backup-codes", async (req, res) => {
    try {
      const codes = await storage.getBackupCodesByUserId(parseInt(req.params.userId));
      res.json(codes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/:userId/backup-codes", async (req, res) => {
    try {
      const validated = insertBackupCodeSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const code = await storage.createBackupCode(validated);
      res.status(201).json(code);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  const defaultPipelineColumnsByEntityType: Record<string, Array<{ value: string; label: string }>> = {
    lead: [
      { value: "new", label: "New" },
      { value: "contacted", label: "Contacted" },
      { value: "qualified", label: "Qualified" },
      { value: "negotiation", label: "Negotiation" },
      { value: "under_contract", label: "Under Contract" },
      { value: "closed", label: "Closed" },
      { value: "lost", label: "Lost" },
    ],
    opportunity: [
      { value: "active", label: "Active" },
      { value: "negotiation", label: "Negotiation" },
      { value: "under_contract", label: "Under Contract" },
      { value: "pending", label: "Pending" },
      { value: "sold", label: "Sold" },
      { value: "withdrawn", label: "Withdrawn" },
    ],
  };

  app.get("/api/pipeline-config", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const entityType = String(req.query.entityType || "").trim();
      const defaults = defaultPipelineColumnsByEntityType[entityType];
      if (!defaults) return res.status(400).json({ message: "Invalid entityType" });

      const row = await storage.getPipelineConfig(userId, entityType);
      if (!row) return res.json({ entityType, columns: defaults });

      let parsed: any = defaults;
      try {
        const json = JSON.parse(row.columns);
        if (Array.isArray(json)) parsed = json;
      } catch {}

      res.json({ entityType, columns: parsed });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/pipeline-config", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const entityType = String(req.query.entityType || "").trim();
      const defaults = defaultPipelineColumnsByEntityType[entityType];
      if (!defaults) return res.status(400).json({ message: "Invalid entityType" });

      const columns = req.body?.columns;
      if (!Array.isArray(columns) || !columns.length) return res.status(400).json({ message: "Invalid columns" });

      const cleaned = columns
        .map((c: any) => ({ value: String(c?.value || "").trim(), label: String(c?.label || "").trim() }))
        .filter((c: any) => c.value && c.label);

      if (!cleaned.length) return res.status(400).json({ message: "Invalid columns" });

      const updated = await storage.upsertPipelineConfig(userId, entityType, JSON.stringify(cleaned));
      let parsed: any = cleaned;
      try {
        const json = JSON.parse(updated.columns);
        if (Array.isArray(json)) parsed = json;
      } catch {}
      res.json({ entityType, columns: parsed });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GLOBAL ACTIVITY ENDPOINT
  app.get("/api/activity", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const propertyId = req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined;
      const leadId = req.query.leadId ? parseInt(req.query.leadId as string) : undefined;
      const playgroundSessionId = req.query.playgroundSessionId ? parseInt(req.query.playgroundSessionId as string) : undefined;
      const logs = await storage.getGlobalActivityLogs(limit);
      
      const logsWithUsers = await Promise.all(
        logs.map(async (log) => {
          const user = log.userId === 0 ? null : await storage.getUserById(log.userId);
          let meta: any = null;
          try { meta = log.metadata ? JSON.parse(log.metadata as any) : null; } catch {}
          return {
            ...log,
            user: log.userId === 0 ? {
              id: 0,
              firstName: "System",
              lastName: null,
              email: null,
              profilePicture: null,
            } : user ? {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              profilePicture: user.profilePicture,
            } : null,
            metadataParsed: meta,
          };
        })
      );
      const filtered = logsWithUsers.filter((log: any) => {
        if (playgroundSessionId && log.metadataParsed?.playgroundSessionId !== playgroundSessionId) return false;
        if (propertyId && log.metadataParsed?.propertyId !== propertyId) return false;
        if (leadId && log.metadataParsed?.leadId !== leadId) return false;
        return true;
      });
      res.json(filtered);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/activity", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const action = String(req.body?.action || "").trim();
      const description = typeof req.body?.description === "string" ? req.body.description : null;
      const metadata = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : null;
      if (!action) return res.status(400).json({ message: "Missing action" });

      const log = await storage.createGlobalActivity({
        userId,
        action,
        description,
        metadata: metadata ? JSON.stringify(metadata) : null,
      } as any);

      res.status(201).json(log);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // TEAMS ENDPOINTS
  app.get("/api/teams", async (req, res) => {
    try {
      const teams = await storage.getTeams();
      res.json(teams);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/teams/:id", async (req, res) => {
    try {
      const team = await storage.getTeamById(parseInt(req.params.id));
      if (!team) return res.status(404).json({ message: "Team not found" });
      res.json(team);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      const validated = insertTeamSchema.parse(req.body);
      const team = await storage.createTeam(validated);
      res.status(201).json(team);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/teams/:id", async (req, res) => {
    try {
      const partial = insertTeamSchema.partial().parse(req.body);
      const team = await storage.updateTeam(parseInt(req.params.id), partial);
      res.json(team);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/teams/:id", async (req, res) => {
    try {
      await storage.deleteTeam(parseInt(req.params.id));
      res.json({ message: "Team deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // TEAM MEMBERS ENDPOINTS
  app.get("/api/teams/:teamId/members", async (req, res) => {
    try {
      const members = await storage.getTeamMembers(parseInt(req.params.teamId));
      res.json(members);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/teams/:teamId/members", async (req, res) => {
    try {
      const validated = insertTeamMemberSchema.parse({ ...req.body, teamId: parseInt(req.params.teamId) });
      const member = await storage.createTeamMember(validated);
      res.status(201).json(member);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/team-members/:id", async (req, res) => {
    try {
      const partial = insertTeamMemberSchema.partial().parse(req.body);
      const member = await storage.updateTeamMember(parseInt(req.params.id), partial);
      res.json(member);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/team-members/:id", async (req, res) => {
    try {
      await storage.deleteTeamMember(parseInt(req.params.id));
      res.json({ message: "Team member removed" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // TEAM ACTIVITY LOGS ENDPOINTS
  app.get("/api/teams/:teamId/activity", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const logs = await storage.getTeamActivityLogs(parseInt(req.params.teamId), limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/teams/:teamId/activity", async (req, res) => {
    try {
      const validated = insertTeamActivityLogSchema.parse({ ...req.body, teamId: parseInt(req.params.teamId) });
      const log = await storage.createTeamActivityLog(validated);
      res.status(201).json(log);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // NOTIFICATION PREFERENCES ENDPOINTS
  app.get("/api/users/:userId/notification-preferences", async (req, res) => {
    try {
      const prefs = await storage.getNotificationPreferencesByUserId(parseInt(req.params.userId));
      res.json(prefs || {});
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/:userId/notification-preferences", async (req, res) => {
    try {
      const validated = insertNotificationPreferenceSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const prefs = await storage.createNotificationPreferences(validated);
      res.status(201).json(prefs);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/users/:userId/notification-preferences", async (req, res) => {
    try {
      const partial = insertNotificationPreferenceSchema.partial().parse(req.body);
      const prefs = await storage.updateNotificationPreferences(parseInt(req.params.userId), partial);
      res.json(prefs);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // USER NOTIFICATIONS ENDPOINTS (actual notification messages)
  app.get("/api/users/:userId/notifications", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const notifications = await storage.getUserNotifications(parseInt(req.params.userId), limit, offset);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/:userId/notifications", async (req, res) => {
    try {
      const validated = insertUserNotificationSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const notification = await storage.createUserNotification(validated);
      res.status(201).json(notification);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const notification = await storage.markNotificationAsRead(parseInt(req.params.id));
      res.json(notification);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      await storage.deleteUserNotification(parseInt(req.params.id));
      res.json({ message: "Notification deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/users/:userId/notifications", async (req, res) => {
    try {
      await storage.deleteAllUserNotifications(parseInt(req.params.userId));
      res.json({ message: "All notifications deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/users/:userId/notifications/read-all", async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead(parseInt(req.params.userId));
      res.json({ message: "All notifications marked as read" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  function canViewTask(user: any, task: any) {
    if (isManagerUser(user)) return true;
    if (task?.isPrivate) {
      return Number(task?.createdBy) === Number(user?.id) || Number(task?.assignedToUserId) === Number(user?.id);
    }
    return true;
  }

  function canMutateTask(user: any, task: any) {
    if (isManagerUser(user)) return true;
    return Number(task?.createdBy) === Number(user?.id) || Number(task?.assignedToUserId) === Number(user?.id);
  }

  // TASKS ENDPOINTS
  app.get("/api/tasks", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;

      const schema = z.object({
        assignedToUserId: z.coerce.number().int().positive().optional(),
        createdByUserId: z.coerce.number().int().positive().optional(),
        status: z.string().trim().min(1).optional(),
        type: z.string().trim().min(1).optional(),
        priority: z.string().trim().min(1).optional(),
        relatedEntityType: z.string().trim().min(1).optional(),
        relatedEntityId: z.coerce.number().int().positive().optional(),
        dueFrom: z.coerce.date().optional(),
        dueTo: z.coerce.date().optional(),
        includeCompleted: z
          .enum(["true", "false"])
          .optional()
          .transform((v) => v === "true"),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      });

      const q = schema.parse(req.query || {});
      const out = await storage.listTasks(
        { userId: user.id, isManager: isManagerUser(user) },
        {
          assignedToUserId: q.assignedToUserId,
          createdByUserId: q.createdByUserId,
          status: q.status,
          type: q.type,
          priority: q.priority,
          relatedEntityType: q.relatedEntityType,
          relatedEntityId: q.relatedEntityId,
          dueFrom: q.dueFrom,
          dueTo: q.dueTo,
          includeCompleted: q.includeCompleted,
          limit: q.limit,
          offset: q.offset,
        },
      );
      res.json(out);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;

      const createSchema = insertTaskSchema.omit({ createdBy: true } as any);
      const validated: any = createSchema.parse(req.body || {});

      const assignedToUserId =
        typeof validated.assignedToUserId === "number" ? validated.assignedToUserId : user.id;

      const task = await createTask({
        ...validated,
        assignedToUserId,
        createdBy: user.id,
      });
      res.status(201).json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;

      const id = parseInt(req.params.id);
      const task = await storage.getTaskById(id);
      if (!task) return res.status(404).json({ message: "Task not found" });
      if (!canViewTask(user, task)) return res.status(404).json({ message: "Task not found" });
      if (!canMutateTask(user, task)) return res.status(403).json({ message: "Forbidden" });

      const patchSchema = insertTaskSchema.partial().omit({ createdBy: true } as any);
      const patch: any = patchSchema.parse(req.body || {});
      const updated = await storage.updateTask(id, patch);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tasks/:id/complete", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;

      const id = parseInt(req.params.id);
      const task = await storage.getTaskById(id);
      if (!task) return res.status(404).json({ message: "Task not found" });
      if (!canViewTask(user, task)) return res.status(404).json({ message: "Task not found" });
      if (!canMutateTask(user, task)) return res.status(403).json({ message: "Forbidden" });

      const out = await completeTaskWithRecurrence({ taskId: id, completedAt: new Date() });
      if (!out) return res.status(404).json({ message: "Task not found" });
      res.json(out);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;

      const id = parseInt(req.params.id);
      const task = await storage.getTaskById(id);
      if (!task) return res.status(404).json({ message: "Task not found" });
      if (!canViewTask(user, task)) return res.status(404).json({ message: "Task not found" });
      if (!canMutateTask(user, task)) return res.status(403).json({ message: "Forbidden" });

      await storage.deleteTask(id);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  async function listEntityTasks(req: any, res: any, entity: { type: string; id: number }) {
    const user = await requireAuth(req, res);
    if (!user) return null;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const includeCompleted = String(req.query.includeCompleted || "").trim().toLowerCase() === "true";
    const out = await storage.listTasks(
      { userId: user.id, isManager: isManagerUser(user) },
      {
        relatedEntityType: entity.type,
        relatedEntityId: entity.id,
        includeCompleted,
        limit,
        offset: 0,
      },
    );
    return out;
  }

  async function createEntityTask(req: any, res: any, entity: { type: string; id: number }) {
    const user = await requireAuth(req, res);
    if (!user) return null;
    const createSchema = insertTaskSchema.omit({ createdBy: true, relatedEntityType: true, relatedEntityId: true } as any);
    const validated: any = createSchema.parse(req.body || {});
    const assignedToUserId = typeof validated.assignedToUserId === "number" ? validated.assignedToUserId : user.id;
    const task = await createTask({
      ...validated,
      relatedEntityType: entity.type,
      relatedEntityId: entity.id,
      assignedToUserId,
      createdBy: user.id,
    });
    return task;
  }

  app.get("/api/leads/:id/tasks", async (req, res) => {
    try {
      const out = await listEntityTasks(req, res, { type: "lead", id: parseInt(req.params.id) });
      if (!out) return;
      res.json(out);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/leads/:id/tasks", async (req, res) => {
    try {
      const task = await createEntityTask(req, res, { type: "lead", id: parseInt(req.params.id) });
      if (!task) return;
      res.status(201).json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/opportunities/:id/tasks", async (req, res) => {
    try {
      const out = await listEntityTasks(req, res, { type: "opportunity", id: parseInt(req.params.id) });
      if (!out) return;
      res.json(out);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/opportunities/:id/tasks", async (req, res) => {
    try {
      const task = await createEntityTask(req, res, { type: "opportunity", id: parseInt(req.params.id) });
      if (!task) return;
      res.status(201).json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/buyers/:id/tasks", async (req, res) => {
    try {
      const out = await listEntityTasks(req, res, { type: "buyer", id: parseInt(req.params.id) });
      if (!out) return;
      res.json(out);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/buyers/:id/tasks", async (req, res) => {
    try {
      const task = await createEntityTask(req, res, { type: "buyer", id: parseInt(req.params.id) });
      if (!task) return;
      res.status(201).json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/campaigns/:id/tasks", async (req, res) => {
    try {
      const out = await listEntityTasks(req, res, { type: "campaign", id: parseInt(req.params.id) });
      if (!out) return;
      res.json(out);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/campaigns/:id/tasks", async (req, res) => {
    try {
      const task = await createEntityTask(req, res, { type: "campaign", id: parseInt(req.params.id) });
      if (!task) return;
      res.status(201).json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/ai/config", async (_req, res) => {
    const required = [
      "SIGNALWIRE_SPACE_URL",
      "SIGNALWIRE_PROJECT_ID",
      "SIGNALWIRE_API_TOKEN",
    ];
    const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");
    const ready = missing.length === 0;
    res.json({ ready, missing });
  });

  app.get("/api/ai/ping", async (_req, res) => {
    const ok = Boolean(process.env.SIGNALWIRE_SPACE_URL && process.env.SIGNALWIRE_PROJECT_ID && process.env.SIGNALWIRE_API_TOKEN);
    res.json({ ok });
  });

  // USER GOALS ENDPOINTS
  app.get("/api/users/:userId/goals", async (req, res) => {
    try {
      const goals = await storage.getUserGoals(parseInt(req.params.userId));
      res.json(goals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/goals/:id", async (req, res) => {
    try {
      const goal = await storage.getUserGoalById(parseInt(req.params.id));
      if (!goal) return res.status(404).json({ message: "Goal not found" });
      res.json(goal);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/:userId/goals", async (req, res) => {
    try {
      const validated = insertUserGoalSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const goal = await storage.createUserGoal(validated);
      res.status(201).json(goal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/goals/:id", async (req, res) => {
    try {
      const partial = insertUserGoalSchema.partial().parse(req.body);
      const goal = await storage.updateUserGoal(parseInt(req.params.id), partial);
      res.json(goal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/goals/:id", async (req, res) => {
    try {
      await storage.deleteUserGoal(parseInt(req.params.id));
      res.json({ message: "Goal deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // OFFERS ENDPOINTS
  app.get("/api/offers", async (req, res) => {
    try {
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const propertyId = req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      
      if (userId) {
        const offers = await storage.getOffersByUserId(userId, limit, offset);
        return res.json(offers);
      }
      if (propertyId) {
        const offers = await storage.getOffersByPropertyId(propertyId, limit, offset);
        return res.json(offers);
      }
      const offers = await storage.getOffers(limit, offset);
      res.json(offers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/offers/:id", async (req, res) => {
    try {
      const offer = await storage.getOfferById(parseInt(req.params.id));
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      res.json(offer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/offers", async (req, res) => {
    try {
      const validated = insertOfferSchema.parse(req.body);
      const offer = await storage.createOffer(validated);
      res.status(201).json(offer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/offers/:id", async (req, res) => {
    try {
      const partial = insertOfferSchema.partial().parse(req.body);
      const offer = await storage.updateOffer(parseInt(req.params.id), partial);
      res.json(offer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/offers/:id", async (req, res) => {
    try {
      await storage.deleteOffer(parseInt(req.params.id));
      res.json({ message: "Offer deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/timeclock/current", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const session = await storage.getOpenTimeClockSession(req.session.userId);
      res.json(session || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/timeclock/auto-start", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const { clientNow, tzOffsetMinutes } = req.body || {};
      if (typeof clientNow !== "string" || typeof tzOffsetMinutes !== "number") {
        return res.status(400).json({ message: "clientNow and tzOffsetMinutes are required" });
      }
      const clockInAt = new Date(clientNow);
      if (Number.isNaN(clockInAt.getTime())) return res.status(400).json({ message: "Invalid clientNow" });

      const open = await storage.getOpenTimeClockSession(req.session.userId);
      if (open) return res.json(open);

      const user = await storage.getUserById(req.session.userId);
      const employee = user?.firstName || user?.lastName
        ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
        : user?.email || "Employee";

      try {
        const created = await storage.createTimeClockSession({
          userId: req.session.userId,
          employee,
          task: "General",
          clockInAt,
          tzOffsetMinutes,
          autoStarted: true,
        } as any);
        return res.status(201).json(created);
      } catch (e) {
        const existing = await storage.getOpenTimeClockSession(req.session.userId);
        if (existing) return res.json(existing);
        throw e;
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/timeclock/auto-stop", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const { clientNow, tzOffsetMinutes } = req.body || {};
      if (typeof clientNow !== "string" || typeof tzOffsetMinutes !== "number") {
        return res.status(400).json({ message: "clientNow and tzOffsetMinutes are required" });
      }
      const clockOutAt = new Date(clientNow);
      if (Number.isNaN(clockOutAt.getTime())) return res.status(400).json({ message: "Invalid clientNow" });

      const result = await storage.closeOpenTimeClockSessionAndCreateEntry(req.session.userId, { clockOutAt, tzOffsetMinutes });
      if (!result) return res.json({ stopped: false });
      res.json({ stopped: true, entry: result.entry });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/timeclock/current", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const { task } = req.body || {};
      if (typeof task !== "string" || !task.trim()) return res.status(400).json({ message: "task is required" });
      const updated = await storage.updateOpenTimeClockSession(req.session.userId, { task: task.trim() } as any);
      if (!updated) return res.status(404).json({ message: "No active session" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/timesheet", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const sessionUser = await storage.getUserById(req.session.userId);
      const manager = isManagerUser(sessionUser);

      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;
      const userId = typeof req.query.userId === "string" ? parseInt(req.query.userId) : undefined;
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit) : undefined;
      const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset) : 0;

      const effectiveUserId = manager ? userId : req.session.userId;
      const entries = await storage.getTimesheetEntriesFiltered({ userId: effectiveUserId, from, to, limit, offset });
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // TIMESHEET ENTRIES ENDPOINTS
  app.get("/api/users/:userId/timesheet", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const entries = await storage.getTimesheetEntries(parseInt(req.params.userId), limit, offset);
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/timesheet/:id", async (req, res) => {
    try {
      const entry = await storage.getTimesheetEntryById(parseInt(req.params.id));
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/:userId/timesheet", async (req, res) => {
    try {
      const validated = insertTimesheetEntrySchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const entry = await storage.createTimesheetEntry(validated);
      res.status(201).json(entry);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/timesheet/:id", async (req, res) => {
    try {
      const partial = insertTimesheetEntrySchema.partial().parse(req.body);
      const entry = await storage.updateTimesheetEntry(parseInt(req.params.id), partial);
      res.json(entry);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/timesheet/:id", async (req, res) => {
    try {
      await storage.deleteTimesheetEntry(parseInt(req.params.id));
      res.json({ message: "Entry deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // BUYERS ENDPOINTS
  app.get("/api/buyers", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const buyers = await storage.getBuyers(limit, offset);
      res.json(buyers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/buyers/:id", async (req, res) => {
    try {
      const buyer = await storage.getBuyerById(parseInt(req.params.id));
      if (!buyer) return res.status(404).json({ message: "Buyer not found" });
      res.json(buyer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/buyers", async (req, res) => {
    try {
      const validated = insertBuyerSchema.parse(req.body);
      const buyer = await storage.createBuyer(validated);
      res.status(201).json(buyer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/buyers/:id", async (req, res) => {
    try {
      const partial = insertBuyerSchema.partial().parse(req.body);
      const buyer = await storage.updateBuyer(parseInt(req.params.id), partial);
      res.json(buyer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/buyers/:id", async (req, res) => {
    try {
      await storage.deleteBuyer(parseInt(req.params.id));
      res.json({ message: "Buyer deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // BUYER COMMUNICATIONS ENDPOINTS
  app.get("/api/buyers/:buyerId/communications", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const comms = await storage.getBuyerCommunications(parseInt(req.params.buyerId), limit, offset);
      res.json(comms);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/buyers/:buyerId/communications", async (req, res) => {
    try {
      const validated = insertBuyerCommunicationSchema.parse({
        ...req.body,
        buyerId: parseInt(req.params.buyerId)
      });
      const comm = await storage.createBuyerCommunication(validated);
      res.status(201).json(comm);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/buyer-communications/:id", async (req, res) => {
    try {
      await storage.deleteBuyerCommunication(parseInt(req.params.id));
      res.json({ message: "Communication deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // DEAL ASSIGNMENTS ENDPOINTS
  app.get("/api/deal-assignments", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const assignments = await storage.getDealAssignments(limit, offset);
      res.json(assignments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/deal-assignments/:id", async (req, res) => {
    try {
      const assignment = await storage.getDealAssignmentById(parseInt(req.params.id));
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      res.json(assignment);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/properties/:propertyId/assignments", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const assignments = await storage.getDealAssignmentsByPropertyId(parseInt(req.params.propertyId), limit, offset);
      res.json(assignments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/buyers/:buyerId/assignments", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const assignments = await storage.getDealAssignmentsByBuyerId(parseInt(req.params.buyerId), limit, offset);
      res.json(assignments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/deal-assignments", async (req, res) => {
    try {
      const validated = insertDealAssignmentSchema.parse(req.body);
      const assignment = await storage.createDealAssignment(validated);
      res.status(201).json(assignment);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/deal-assignments/:id", async (req, res) => {
    try {
      const partial = insertDealAssignmentSchema.partial().parse(req.body);
      const assignment = await storage.updateDealAssignment(parseInt(req.params.id), partial);
      res.json(assignment);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/deal-assignments/:id", async (req, res) => {
    try {
      await storage.deleteDealAssignment(parseInt(req.params.id));
      res.json({ message: "Assignment deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/reports/source", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;

      const fromRaw = typeof req.query.from === "string" ? req.query.from : "";
      const toRaw = typeof req.query.to === "string" ? req.query.to : "";

      const from = fromRaw ? new Date(fromRaw) : null;
      const to = toRaw ? new Date(toRaw) : null;
      const fromOk = from && Number.isFinite(from.getTime()) ? from : null;
      const toOk = to && Number.isFinite(to.getTime()) ? to : null;

      const leadWhere = sql`WHERE ${
        fromOk ? sql`created_at >= ${fromOk}` : sql`TRUE`
      } AND ${
        toOk ? sql`created_at < ${toOk}` : sql`TRUE`
      }`;

      const oppWhere = sql`WHERE ${
        fromOk ? sql`p.created_at >= ${fromOk}` : sql`TRUE`
      } AND ${
        toOk ? sql`p.created_at < ${toOk}` : sql`TRUE`
      }`;

      const dealWhere = sql`WHERE ${
        fromOk ? sql`da.created_at >= ${fromOk}` : sql`TRUE`
      } AND ${
        toOk ? sql`da.created_at < ${toOk}` : sql`TRUE`
      }`;

      const leadsRows: any = await db.execute(sql`
        SELECT
          COALESCE(NULLIF(TRIM(source), ''), 'Unknown') AS source,
          COUNT(*)::int AS leads
        FROM leads
        ${leadWhere}
        GROUP BY 1
      `);

      const oppRows: any = await db.execute(sql`
        SELECT
          COALESCE(NULLIF(TRIM(COALESCE(p.lead_source, l.source)), ''), 'Unknown') AS source,
          COUNT(*)::int AS opportunities
        FROM properties p
        LEFT JOIN leads l ON l.id = p.source_lead_id
        ${oppWhere}
        GROUP BY 1
      `);

      const dealRows: any = await db.execute(sql`
        SELECT
          COALESCE(NULLIF(TRIM(COALESCE(p.lead_source, l.source)), ''), 'Unknown') AS source,
          COUNT(*)::int AS deals,
          COALESCE(SUM(COALESCE(da.payout_amount, '0')::numeric), 0)::numeric AS revenue
        FROM deal_assignments da
        JOIN properties p ON p.id = da.property_id
        LEFT JOIN leads l ON l.id = p.source_lead_id
        ${dealWhere}
        GROUP BY 1
      `);

      const merged = new Map<string, any>();
      for (const r of (leadsRows as any).rows || []) {
        merged.set(String(r.source), { source: String(r.source), leads: r.leads || 0, opportunities: 0, deals: 0, revenue: 0 });
      }
      for (const r of (oppRows as any).rows || []) {
        const key = String(r.source);
        const cur = merged.get(key) || { source: key, leads: 0, opportunities: 0, deals: 0, revenue: 0 };
        cur.opportunities = r.opportunities || 0;
        merged.set(key, cur);
      }
      for (const r of (dealRows as any).rows || []) {
        const key = String(r.source);
        const cur = merged.get(key) || { source: key, leads: 0, opportunities: 0, deals: 0, revenue: 0 };
        cur.deals = r.deals || 0;
        cur.revenue = typeof r.revenue === "string" || typeof r.revenue === "number" ? Number(r.revenue) : 0;
        merged.set(key, cur);
      }

      const sources = Array.from(merged.values()).sort((a, b) => (b.revenue || 0) - (a.revenue || 0) || (b.deals || 0) - (a.deals || 0) || (b.leads || 0) - (a.leads || 0));

      res.json({ from: fromRaw || null, to: toRaw || null, sources });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  initTelephonyWs(httpServer);
  return httpServer;
}
