import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import multer from "multer";
import { storage } from "./storage.js";
import { db } from "./db.js";
import { sql } from "drizzle-orm";
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
  insertUnderwritingTemplateSchema
} from "./shared-schema.js";
import { z } from "zod";
import { computeArvFromComps, computeDealMath, computeRepairTotal, underwritingSchemaV1, underwritingTemplateConfigSchema } from "../shared/underwriting.js";

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

      let session = await storage.getPlaygroundPropertySessionByAddressKey(addressKey);
      if (!session) {
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
        session = await storage.updatePlaygroundPropertySession(session.id, {
          lastOpenedBy: userId,
          lastOpenedAt: new Date(),
          updatedBy: userId,
          leadId: session.leadId ?? nextLeadId,
          propertyId: session.propertyId ?? nextPropertyId,
        } as any);
      }

      await storage.createGlobalActivity({
        userId,
        action: "playground_open_session",
        description: `Opened playground session: ${session.address}`,
        metadata: JSON.stringify({ playgroundSessionId: session.id, address: session.address, leadId: session.leadId ?? null, propertyId: session.propertyId ?? null }),
      } as any);

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
      const uw = [
        underwriting.arv ? `ARV: ${underwriting.arv}` : null,
        underwriting.mao ? `MAO: ${underwriting.mao}` : null,
        underwriting.repairEstimate ? `Repairs: ${underwriting.repairEstimate}` : null,
        underwriting.offerMin || underwriting.offerMax ? `Offer Range: ${underwriting.offerMin || "?"} - ${underwriting.offerMax || "?"}` : null,
        underwriting.exitStrategy ? `Exit Strategy: ${underwriting.exitStrategy}` : null,
      ].filter(Boolean) as string[];
      if (uw.length) {
        lines.push("");
        lines.push("Underwriting");
        lines.push(...uw);
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

  app.post("/api/leads", async (req, res) => {
    try {
      const validated = insertLeadSchema.parse(req.body) as InsertLead;

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

  // TELEPHONY ENDPOINTS (Dialer)
  app.post("/api/telephony/calls", async (req, res) => {
    try {
      const { direction, number, contactId, status, startedAt, metadata } = req.body || {};
      const userId = req.session.userId || 0;
      const log = await storage.createCallLog({
        userId,
        direction,
        number,
        contactId: contactId ?? null as any,
        status: status || "dialing",
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        metadata: metadata ? JSON.stringify(metadata) : null as any,
      } as any);
      if (req.session.userId && metadata && typeof metadata === "object") {
        const leadId = (metadata as any).leadId ? Number((metadata as any).leadId) : null;
        const propertyId = (metadata as any).propertyId ? Number((metadata as any).propertyId) : null;
        if (leadId || propertyId) {
          await storage.createGlobalActivity({
            userId: req.session.userId,
            action: "call_started",
            description: `Started call to ${String(number || "")}`,
            metadata: JSON.stringify({ leadId: leadId || undefined, propertyId: propertyId || undefined, callLogId: log.id, number: String(number || "") }),
          } as any);
        }
      }
      res.status(201).json(log);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/telephony/calls/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      let beforeStatus: string | null = null;
      let beforeMetadataText: string | null = null;
      try {
        const beforeRows: any = await db.execute(sql`SELECT status, metadata FROM call_logs WHERE id = ${id} LIMIT 1`);
        const row = (beforeRows as any).rows?.[0];
        beforeStatus = row?.status ?? null;
        beforeMetadataText = row?.metadata ?? null;
      } catch {}
      const patch = req.body || {};
      if (patch.metadata && typeof patch.metadata !== "string") patch.metadata = JSON.stringify(patch.metadata);
      if ((patch.status === "ended" || patch.status === "failed")) {
        patch.endedAt = new Date();
      }
      if (typeof patch.startedAt === "string" || typeof patch.startedAt === "number") patch.startedAt = new Date(patch.startedAt);
      if (typeof patch.endedAt === "string" || typeof patch.endedAt === "number") patch.endedAt = new Date(patch.endedAt);
      if (typeof patch.durationMs !== "undefined") patch.durationMs = Number(patch.durationMs);
      const updated = await storage.updateCallLog(id, patch);
      const nextStatus = patch.status ? String(patch.status) : null;
      if (req.session.userId && nextStatus && nextStatus !== beforeStatus) {
        const terminal = new Set(["answered", "missed", "failed"]);
        if (terminal.has(nextStatus)) {
          let meta: any = null;
          try {
            meta = beforeMetadataText ? JSON.parse(beforeMetadataText) : null;
          } catch {}
          const leadId = meta?.leadId ? Number(meta.leadId) : null;
          const propertyId = meta?.propertyId ? Number(meta.propertyId) : null;
          if (leadId || propertyId) {
            await storage.createGlobalActivity({
              userId: req.session.userId,
              action: `call_${nextStatus}`,
              description: `Call ${nextStatus}: ${String(updated.number || "")}`,
              metadata: JSON.stringify({ leadId: leadId || undefined, propertyId: propertyId || undefined, callLogId: updated.id, status: nextStatus }),
            } as any);
          }
        }
      }
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/telephony/history", async (req, res) => {
    try {
      const { limit, offset, status, contactId } = req.query as any;
      const items = await storage.getCallLogs(
        limit ? parseInt(limit) : undefined,
        offset ? parseInt(offset) : 0,
        status as string | undefined,
        contactId ? parseInt(contactId as string) : undefined,
      );
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/telephony/contacts", async (req, res) => {
    try {
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
      const resource = String(from || process.env.DIALER_DEFAULT_FROM_NUMBER);
      
      const payload = {
        iss: project,
        sub: req.session.userId?.toString() || 'anonymous',
        aud: `https://${space}`,
        exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
        iat: Math.floor(Date.now() / 1000),
        scope: 'voice',
        resource: resource 
      };
      
      console.log("[JWT] Generating token (v2) with payload:", JSON.stringify(payload, null, 2));

      const secret = new TextEncoder().encode(token);
      const jwtToken = await new SignJWT(payload as any)
        .setProtectedHeader({ alg: 'HS256' })
        .sign(secret);
      
      res.json({ 
        token: jwtToken,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
        space: `wss://${space}`,
        project: project,
        from: from || process.env.DIALER_DEFAULT_FROM_NUMBER || null
      });
    } catch (error: any) {
      console.error("WebRTC token generation failed:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/telephony/sms", async (req, res) => {
    try {
      const { to, from, body, metadata } = req.body || {};
      const space = process.env.SIGNALWIRE_SPACE_URL?.replace(/^https?:\/\//, "") || "";
      const project = process.env.SIGNALWIRE_PROJECT_ID || "";
      const token = process.env.SIGNALWIRE_API_TOKEN || "";
      const url = `https://${space}/api/laml/2010-04-01/Accounts/${project}/Messages.json`;
      const resolvedFrom = from || process.env.DIALER_DEFAULT_FROM_NUMBER || "";
      if (!resolvedFrom) return res.status(400).json({ message: "Missing from number" });
      if (!to || !body) return res.status(400).json({ message: "Missing to/body" });
      const form = new URLSearchParams({ From: resolvedFrom, To: to, Body: body });
      const auth = Buffer.from(`${project}:${token}`).toString("base64");
      const resp = await fetch(url, { method: "POST", headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
      const data = await resp.json();
      if (!resp.ok) return res.status(resp.status).json(data);
      const sid = data.sid || data.Sid || null;
      const smsStatus = data.status || data.Status || "queued";
      if (req.session.userId && metadata && typeof metadata === "object") {
        const leadId = (metadata as any).leadId ? Number((metadata as any).leadId) : null;
        const propertyId = (metadata as any).propertyId ? Number((metadata as any).propertyId) : null;
        if (leadId || propertyId) {
          await storage.createGlobalActivity({
            userId: req.session.userId,
            action: "sms_sent",
            description: `Sent SMS to ${String(to || "")}`,
            metadata: JSON.stringify({ leadId: leadId || undefined, propertyId: propertyId || undefined, to: String(to || ""), sid, status: smsStatus }),
          } as any);
        }
      }
      res.json({ sid, status: smsStatus });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

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
      
      // Log the incoming message
      console.log(`[SMS Webhook] From: ${From}, To: ${To}, Body: ${Body}`);
      
      // Send cXML response for auto-reply
      const cxmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks, we'll call you shortly.</Message>
  <Route to="${process.env.DIALER_DEFAULT_FROM_NUMBER || '+12314060943'}" body="${Body}" from="${To}"/>
</Response>`;
      
      res.set("Content-Type", "text/xml");
      res.send(cxmlResponse);
      
      // Log the response
      console.log(`[SMS Webhook] Sent auto-reply to ${From}`);
      
    } catch (error: any) {
      console.error("SMS webhook error:", error);
      res.status(500).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
    }
  });

  // Inbound voice webhook with cXML IVR
  app.post("/api/telephony/voice/webhook", async (req, res) => {
    try {
      const { To, From, CallSid } = req.body;
      
      // Log the incoming call
      console.log(`[Voice Webhook] From: ${From}, To: ${To}, CallSid: ${CallSid}`);
      
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
      
      console.log(`[Voice Recording] From: ${From}, Recording URL: ${RecordingUrl}, Duration: ${RecordingDuration}s`);
      
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
      const allContacts = await storage.getContacts(limit, offset);
      res.json(allContacts);
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
          const user = await storage.getUserById(log.userId);
          let meta: any = null;
          try { meta = log.metadata ? JSON.parse(log.metadata as any) : null; } catch {}
          return {
            ...log,
            user: user ? {
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

  const httpServer = createServer(app);
  return httpServer;
}
