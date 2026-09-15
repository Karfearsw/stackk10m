import multer from "multer";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import {
  maxImageUploadBytes,
  maxMediaUploadBytes,
  maxVideoUploadBytes,
  probeImageDimensions,
  validateMediaFile,
} from "./mime-guard.js";
import {
  attachMedia,
  createMediaAsset,
  getMediaAssetById,
  getMediaContent,
  getMediaSignedUrl,
  listMediaForEntity,
  setMediaDeliveryMode,
  softDeleteMedia,
  assertMediaTeam,
} from "./mediaVault.js";
import { makeMediaShareUrl, verifyMediaToken } from "./share-token.js";

const ALLOWED_ENTITY_TYPES = new Set([
  "lead",
  "contact",
  "opportunity",
  "property",
  "conversation",
  "internal_message",
  "internal_note",
  "document",
  "task",
  "sms_message",
  "sms_thread",
]);

type MediaRouteHelpers = {
  requireAuth: (req: any, res: any) => Promise<any | null>;
  requireActiveTeam: (req: any, res: any, input?: any) => Promise<any | null>;
};

async function assertEntityAccess(ctx: any, entityType: string, entityId: number): Promise<boolean> {
  try {
    switch (entityType) {
      case "lead":
        return Boolean(await storage.getLeadById(entityId));
      case "contact":
        return Boolean(await storage.getContactById(entityId));
      case "property":
        return Boolean(await storage.getPropertyById(entityId));
      case "task":
        return Boolean(await storage.getTaskById(entityId));
      case "document":
        return Boolean(await storage.getDocumentById(entityId));
      case "opportunity":
        return Boolean(await storage.getOpportunityPartyById(entityId));
      case "internal_message": {
        const r: any = await db.execute(
          sql`SELECT 1 AS ok FROM internal_messages WHERE id = ${entityId} AND (sender_user_id = ${ctx.user.id} OR recipient_user_id = ${ctx.user.id}) LIMIT 1`,
        );
        return Boolean(r?.rows?.[0]);
      }
      // Threads and notes are team-scoped at the caller level.
      case "conversation":
      case "internal_note":
      case "sms_message":
      case "sms_thread":
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

function sendMediaContent(
  req: any,
  res: any,
  content: { body: Buffer; contentType: string | null; sizeBytes: number },
  input: { download?: boolean; filename?: string },
) {
  const contentType = content.contentType || "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(content.sizeBytes));
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (input.download) {
    const safe = String(input.filename || "media").replace(/[^a-zA-Z0-9._-]+/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safe}"`);
  }
  const total = content.sizeBytes;
  res.setHeader("Accept-Ranges", "bytes");
  const rangeHeader = String(req?.headers?.["range"] || "");
  const rangeMatch = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (rangeMatch && (rangeMatch[1] !== "" || rangeMatch[2] !== "")) {
    let start: number;
    let end: number;
    if (rangeMatch[1] === "") {
      // suffix range: last N bytes
      const suffixLen = parseInt(rangeMatch[2], 10);
      if (suffixLen <= 0 || total <= 0) {
        res.status(416).setHeader("Content-Range", `bytes */${total}`);
        res.removeHeader("Content-Length");
        return res.end();
      }
      start = Math.max(0, total - suffixLen);
      end = total - 1;
    } else {
      start = parseInt(rangeMatch[1], 10);
      end = rangeMatch[2] === "" ? total - 1 : Math.min(parseInt(rangeMatch[2], 10), total - 1);
    }
    if (total <= 0 || Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      res.status(416).setHeader("Content-Range", `bytes */${total}`);
      res.removeHeader("Content-Length");
      return res.end();
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    res.setHeader("Content-Length", String(end - start + 1));
    return res.end(content.body.subarray(start, end + 1));
  }
  res.end(content.body);
}

export function registerMediaRoutes(app: any, helpers: MediaRouteHelpers) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMediaUploadBytes() } });

  // ── Upload (multipart: file + entityType, entityId, role) ───────────────
  app.post("/api/media/upload", upload.single("file"), async (req: any, res: any) => {
    try {
      const ctx = await helpers.requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const file = req.file;
      if (!file) return res.status(400).json({ code: "MISSING_FILE", message: "Missing file" });

      const entityType = String(req.body?.entityType || "").trim();
      const entityIdRaw = String(req.body?.entityId || "").trim();
      const entityId = entityIdRaw ? parseInt(entityIdRaw, 10) : NaN;
      const role = req.body?.role ? String(req.body.role).trim() : null;
      const isKind = String(req.body?.kind || "").trim() || "attachment";

      const allowsZeroId = entityType === "sms_thread" || entityType === "conversation";
      const validId = allowsZeroId ? Number.isInteger(entityId) && entityId >= 0 : Number.isInteger(entityId) && entityId > 0;
      if (entityType && !validId) {
        return res.status(400).json({ code: "INVALID_ENTITY", message: "entityId must be a positive integer" });
      }
      if (entityType && !ALLOWED_ENTITY_TYPES.has(entityType)) {
        return res.status(400).json({ code: "BAD_ENTITY_TYPE", message: `Unsupported entityType "${entityType}"` });
      }

      const validation = validateMediaFile({
        fileName: String(file.originalname || "media"),
        declaredMime: String(file.mimetype || ""),
        buffer: file.buffer,
      });
      if (!validation.ok) {
        return res.status(400).json({ code: validation.code, message: validation.error });
      }

      if (entityType && entityId > 0) {
        const access = await assertEntityAccess(ctx, entityType, entityId);
        if (!access) {
          return res.status(403).json({ code: "ENTITY_ACCESS_DENIED", message: "You cannot attach media to this record" });
        }
      }

      const dims = validation.kind === "image" ? probeImageDimensions(file.buffer) : null;
      const asset = await createMediaAsset({
        teamId: ctx.teamId,
        uploadedByUserId: ctx.user.id,
        originalFilename: String(file.originalname || "media"),
        mimeType: validation.mime,
        kind: validation.kind,
        buffer: file.buffer,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      });

      if (entityType && entityId > 0) {
        await attachMedia({
          mediaId: asset.id,
          entityType,
          entityId,
          role: isKind && isKind !== "attachment" ? isKind : role,
          createdByUserId: ctx.user.id,
        });
      }

      res.status(201).json({ asset });
    } catch (e: any) {
      console.error("[media] upload failed:", e?.message || e);
      res.status(500).json({ code: "UPLOAD_FAILED", message: e?.message || "Upload failed" });
    }
  });

  // ── Presigned direct upload: step 1 ────────────────────
  app.post("/api/media/upload-url", async (req: any, res: any) => {
    try {
      const ctx = await helpers.requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const originalFilename = String(req.body?.filename || "").trim();
      const mimeType = String(req.body?.mimeType || "").split(";")[0].trim().toLowerCase();
      const fileSizeBytes = parseInt(String(req.body?.fileSizeBytes || "0"), 10);
      if (!originalFilename || !mimeType || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
        return res.status(400).json({ code: "BAD_INPUT", message: "filename, mimeType and fileSizeBytes are required" });
      }
      // Same allow-list and size caps as the multipart route. Empty buffer =
      // magic-byte checks skipped; type+extension+size still enforced.
      const validation = validateMediaFile({ fileName: originalFilename, declaredMime: mimeType, buffer: Buffer.alloc(0) });
      if (!validation.ok) {
        return res.status(400).json({ code: validation.code, message: validation.error });
      }
      // Enforce the per-kind size cap on the DECLARED size (the bytes are
      // not on the server yet, so validateMediaFile cannot see them).
      const declaredLimit = validation.kind === "video" ? maxVideoUploadBytes() : maxImageUploadBytes();
      if (fileSizeBytes > declaredLimit) {
        return res.status(400).json({ code: "FILE_TOO_LARGE", message: `File exceeds the ${Math.round(declaredLimit / 1024 / 1024)} MB limit.` });
      }
      const { presignMediaUpload } = await import("./mediaVault.js");
      const presigned = await presignMediaUpload({
        teamId: ctx.teamId,
        originalFilename,
        mimeType: validation.mime,
        fileSizeBytes,
      });
      res.status(201).json(presigned);
    } catch (e: any) {
      console.error("[media] presign failed:", e?.message || e);
      res.status(500).json({ code: "PRESIGN_FAILED", message: e?.message || "Failed to create upload URL" });
    }
  });

  // ── Presigned direct upload: step 2 (finalize) ──────────────
  app.post("/api/media/upload-complete", async (req: any, res: any) => {
    try {
      const ctx = await helpers.requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const originalFilename = String(req.body?.filename || "").trim();
      const mimeType = String(req.body?.mimeType || "").split(";")[0].trim().toLowerCase();
      const fileSizeBytes = parseInt(String(req.body?.fileSizeBytes || "0"), 10);
      const storageKey = String(req.body?.storageKey || "").trim();
      const entityId = req.body?.entityId != null ? parseInt(String(req.body.entityId), 10) : null;
      const entityType = String(req.body?.entityType || "").trim();
      if (!originalFilename || !mimeType || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0 || !storageKey) {
        return res.status(400).json({ code: "BAD_INPUT", message: "filename, mimeType, fileSizeBytes and storageKey are required" });
      }
      // Only accept keys this team could have been minted.
      const expectedPrefix = "teams/" + String(ctx.teamId) + "/media/";
      if (!storageKey.startsWith(expectedPrefix)) {
        return res.status(403).json({ code: "KEY_FORBIDDEN", message: "storageKey does not belong to your team" });
      }
      const validation = validateMediaFile({ fileName: originalFilename, declaredMime: mimeType, buffer: Buffer.alloc(0) });
      if (!validation.ok) {
        return res.status(400).json({ code: validation.code, message: validation.error });
      }
      // Enforce the per-kind size cap on the DECLARED size (the bytes are
      // not on the server yet, so validateMediaFile cannot see them).
      const declaredLimit = validation.kind === "video" ? maxVideoUploadBytes() : maxImageUploadBytes();
      if (fileSizeBytes > declaredLimit) {
        return res.status(400).json({ code: "FILE_TOO_LARGE", message: `File exceeds the ${Math.round(declaredLimit / 1024 / 1024)} MB limit.` });
      }
      // Verify the object actually landed before creating the row.
      const { verifyMediaObject, finalizePresignedMedia } = await import("./mediaVault.js");
      const head = await verifyMediaObject(storageKey);
      if (!head) {
        return res.status(409).json({ code: "UPLOAD_NOT_FOUND", message: "Upload not found in storage (did the PUT complete?)" });
      }
      const asset = await finalizePresignedMedia({
        teamId: ctx.teamId,
        uploadedByUserId: ctx.user.id,
        originalFilename,
        mimeType: validation.mime,
        kind: validation.kind,
        fileSizeBytes,
        storageKey,
      });
      if (entityType && entityId) {
        const access = await assertEntityAccess(ctx, entityType, entityId);
        if (!access) {
          return res.status(403).json({ code: "ENTITY_ACCESS_DENIED", message: "You cannot attach media to this record" });
        }
        await attachMedia({
          mediaId: asset.id,
          entityType,
          entityId,
          role: "attachment",
          createdByUserId: ctx.user.id,
        });
      }
      res.status(201).json({ asset });
    } catch (e: any) {
      console.error("[media] finalize failed:", e?.message || e);
      res.status(500).json({ code: "FINALIZE_FAILED", message: e?.message || "Failed to finalize upload" });
    }
  });

  // ── List media for an entity ────────────────────────────────────────────
  app.get("/api/media", async (req: any, res: any) => {
    try {
      const ctx = await helpers.requireActiveTeam(req, res);
      if (!ctx) return;
      const entityType = String(req.query.entityType || "").trim();
      const entityId = parseInt(String(req.query.entityId || ""), 10);
      const role = req.query.role ? String(req.query.role).trim() : null;
      if (!entityType || !Number.isInteger(entityId) || entityId <= 0) {
        return res.status(400).json({ code: "INVALID_ENTITY", message: "entityType and entityId are required" });
      }
      const assets = await listMediaForEntity({ teamId: ctx.teamId, entityType, entityId, role });
      res.json({ assets });
    } catch (e: any) {
      res.status(500).json({ code: "LIST_FAILED", message: e?.message || "Failed to list media" });
    }
  });

  // ── Metadata ────────────────────────────────────────────────────────────
  app.get("/api/media/:id", async (req: any, res: any) => {
    try {
      const ctx = await helpers.requireActiveTeam(req, res);
      if (!ctx) return;
      const id = parseInt(String(req.params.id), 10);
      const asset = await getMediaAssetById(id);
      if (!asset) return res.status(404).json({ code: "MEDIA_NOT_FOUND", message: "Media not found" });
      if (!assertMediaTeam(asset, ctx.teamId)) {
        return res.status(403).json({ code: "MEDIA_ACCESS_DENIED", message: "Forbidden" });
      }
      res.json({ asset });
    } catch (e: any) {
      res.status(500).json({ code: "META_FAILED", message: e?.message || "Failed to load media" });
    }
  });

  // ── Preview (inline) ────────────────────────────────────────────────────
  app.get("/api/media/:id/preview", async (req: any, res: any) => {
    try {
      const ctx = await helpers.requireActiveTeam(req, res);
      if (!ctx) return;
      const id = parseInt(String(req.params.id), 10);
      const asset = await getMediaAssetById(id);
      if (!asset) return res.status(404).json({ code: "MEDIA_NOT_FOUND", message: "Media not found" });
      if (!assertMediaTeam(asset, ctx.teamId)) {
        return res.status(403).json({ code: "MEDIA_ACCESS_DENIED", message: "Forbidden" });
      }
      const content = await getMediaContent({ mediaId: id });
      if (!content) return res.status(404).json({ code: "MEDIA_CONTENT_MISSING", message: "Content missing" });
      sendMediaContent(req, res, content, {});
    } catch (e: any) {
      res.status(500).json({ code: "PREVIEW_FAILED", message: e?.message || "Failed to load media" });
    }
  });

  // ── Download ────────────────────────────────────────────────────────────
  app.get("/api/media/:id/download", async (req: any, res: any) => {
    try {
      const ctx = await helpers.requireActiveTeam(req, res);
      if (!ctx) return;
      const id = parseInt(String(req.params.id), 10);
      const asset = await getMediaAssetById(id);
      if (!asset) return res.status(404).json({ code: "MEDIA_NOT_FOUND", message: "Media not found" });
      if (!assertMediaTeam(asset, ctx.teamId)) {
        return res.status(403).json({ code: "MEDIA_ACCESS_DENIED", message: "Forbidden" });
      }
      const content = await getMediaContent({ mediaId: id });
      if (!content) return res.status(404).json({ code: "MEDIA_CONTENT_MISSING", message: "Content missing" });
      sendMediaContent(req, res, content, { download: true, filename: asset.originalFilename });
    } catch (e: any) {
      res.status(500).json({ code: "DOWNLOAD_FAILED", message: e?.message || "Failed to download media" });
    }
  });

  // ── Soft delete ─────────────────────────────────────────────────────────
  app.delete("/api/media/:id", async (req: any, res: any) => {
    try {
      const ctx = await helpers.requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const id = parseInt(String(req.params.id), 10);
      const asset = await getMediaAssetById(id);
      if (!asset) return res.status(404).json({ code: "MEDIA_NOT_FOUND", message: "Media not found" });
      if (!assertMediaTeam(asset, ctx.teamId)) {
        return res.status(403).json({ code: "MEDIA_ACCESS_DENIED", message: "Forbidden" });
      }
      await softDeleteMedia(id);
      res.json({ deleted: true, id });
    } catch (e: any) {
      res.status(500).json({ code: "DELETE_FAILED", message: e?.message || "Failed to delete media" });
    }
  });

  // ── Short-lived share link (authenticated) ──────────────────────────────
  app.post("/api/media/:id/share-link", async (req: any, res: any) => {
    try {
      const ctx = await helpers.requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const id = parseInt(String(req.params.id), 10);
      const asset = await getMediaAssetById(id);
      if (!asset) return res.status(404).json({ code: "MEDIA_NOT_FOUND", message: "Media not found" });
      if (!assertMediaTeam(asset, ctx.teamId)) {
        return res.status(403).json({ code: "MEDIA_ACCESS_DENIED", message: "Forbidden" });
      }
      const url = makeMediaShareUrl({ mediaId: id, purpose: "share" });
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      res.json({ url, expiresAt });
    } catch (e: any) {
      res.status(500).json({ code: "SHARE_FAILED", message: e?.message || "Failed to create share link" });
    }
  });

  // ── Public signed open route (MMS fetch / secure link) ─────────────────
  app.get("/api/media/open/:token", async (req: any, res: any) => {
    try {
      const token = String(req.params.token || "");
      const verified = verifyMediaToken(token);
      if (!verified) {
        return res.status(410).json({ code: "INVALID_OR_EXPIRED_LINK", message: "This link is invalid or has expired." });
      }
      const asset = await getMediaAssetById(verified.mediaId);
      if (!asset) return res.status(404).json({ code: "MEDIA_NOT_FOUND", message: "Media not found" });
      const content = await getMediaContent({ mediaId: verified.mediaId });
      if (!content) return res.status(404).json({ code: "MEDIA_CONTENT_MISSING", message: "Content missing" });
      const download = String(req.query.download || "") === "1";
      sendMediaContent(req, res, content, { download, filename: asset.originalFilename });
    } catch (e: any) {
      res.status(500).json({ code: "OPEN_FAILED", message: e?.message || "Failed to load media" });
    }
  });
}
