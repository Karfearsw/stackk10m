import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import path from "node:path";
import { db } from "../db.js";
import { s3Config, useS3, sha256Hex } from "./documentVault.js";

// ── Media vault ────────────────────────────────────────────────────────────
// Image/video assets for internal records, messaging and SMS/MMS.
// Metadata lives in media_assets; bytes live in media_blobs (Postgres) or in
// the same S3-compatible object store as the document vault (DOCUMENTS_* envs).

export type MediaKind = "image" | "video";

export type MediaAsset = {
  id: number;
  teamId: number;
  uploadedByUserId: number;
  storageMode: string;
  storageKey: string | null;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  processingStatus: string;
  deliveryMode: string | null;
  createdAt: string;
};

export function mediaStorageMode(): "s3" | "db" {
  return useS3() ? "s3" : "db";
}

function safeBasename(name: string) {
  const base = path.basename(name || "media");
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function makeMediaStorageKey(input: { teamId: number; originalName: string }) {
  const filePart = safeBasename(input.originalName);
  return `teams/${input.teamId}/media/${crypto.randomUUID()}-${filePart}`;
}

function s3Client() {
  const cfg = s3Config();
  if (!cfg) throw new Error("S3 media storage is not configured");
  return {
    cfg,
    client: new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: Boolean(cfg.endpoint),
      credentials:
        cfg.accessKeyId && cfg.secretAccessKey
          ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
          : undefined,
    }),
  };
}

async function storeBytes(input: {
  mediaId: number;
  storageMode: "s3" | "db";
  storageKey: string;
  contentType: string;
  body: Buffer;
  sha256: string;
}) {
  if (input.storageMode === "s3") {
    const { cfg, client } = s3Client();
    await client.send(
      new PutObjectCommand({ Bucket: cfg.bucket, Key: input.storageKey, Body: input.body, ContentType: input.contentType }),
    );
    return;
  }
  await db.execute(sql`
    INSERT INTO media_blobs (media_id, data, mime_type, size_bytes, sha256)
    VALUES (${input.mediaId}, ${input.body}, ${input.contentType}, ${input.body.length}, ${input.sha256})
    ON CONFLICT (media_id) DO UPDATE SET
      data = EXCLUDED.data,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes,
      sha256 = EXCLUDED.sha256,
      created_at = NOW()
  `);
}

function mapAssetRow(row: any): MediaAsset {
  return {
    id: Number(row.id),
    teamId: Number(row.team_id),
    uploadedByUserId: Number(row.uploaded_by_user_id),
    storageMode: String(row.storage_mode || "db"),
    storageKey: row.storage_key || null,
    originalFilename: String(row.original_filename || ""),
    mimeType: String(row.mime_type || ""),
    fileSizeBytes: Number(row.file_size_bytes || 0),
    sha256: row.sha256 || null,
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
    durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    processingStatus: String(row.processing_status || "uploaded"),
    deliveryMode: row.delivery_mode || null,
    createdAt: String(row.created_at || ""),
  };
}

export async function createMediaAsset(input: {
  teamId: number;
  uploadedByUserId: number;
  originalFilename: string;
  mimeType: string;
  kind: MediaKind;
  buffer: Buffer;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  processingStatus?: string;
}): Promise<MediaAsset> {
  const storageMode = mediaStorageMode();
  const storageKey = makeMediaStorageKey({ teamId: input.teamId, originalName: input.originalFilename });
  const sha = sha256Hex(input.buffer);

  const inserted: any = await db.execute(sql`
    INSERT INTO media_assets (
      team_id, uploaded_by_user_id, storage_mode, storage_key, original_filename,
      normalized_filename, mime_type, file_size_bytes, sha256, width, height,
      duration_seconds, processing_status
    ) VALUES (
      ${input.teamId}, ${input.uploadedByUserId}, ${storageMode}, ${storageKey},
      ${input.originalFilename}, ${safeBasename(input.originalFilename)}, ${input.mimeType},
      ${input.buffer.length}, ${sha}, ${input.width ?? null}, ${input.height ?? null},
      ${input.durationSeconds ?? null}, ${input.processingStatus ?? "ready"}
    )
    RETURNING *
  `);
  const row = inserted?.rows?.[0];
  if (!row) throw new Error("Failed to create media asset");

  await storeBytes({
    mediaId: Number(row.id),
    storageMode,
    storageKey,
    contentType: input.mimeType,
    body: input.buffer,
    sha256: sha,
  });

  return mapAssetRow(row);
}

export async function getMediaAssetById(id: number): Promise<MediaAsset | null> {
  const result: any = await db.execute(sql`
    SELECT * FROM media_assets
    WHERE id = ${id} AND deleted_at IS NULL
  `);
  const row = result?.rows?.[0];
  return row ? mapAssetRow(row) : null;
}

export async function listMediaForEntity(input: {
  teamId: number;
  entityType: string;
  entityId: number;
  role?: string | null;
}): Promise<MediaAsset[]> {
  const result: any = await db.execute(sql`
    SELECT m.*
    FROM media_assets m
    JOIN media_attachments a ON a.media_asset_id = m.id
    WHERE m.team_id = ${input.teamId}
      AND m.deleted_at IS NULL
      AND a.entity_type = ${input.entityType}
      AND a.entity_id = ${input.entityId}
      ${input.role ? sql`AND a.attachment_role = ${input.role}` : sql``}
    ORDER BY a.created_at DESC, m.id DESC
  `);
  return (result?.rows || []).map(mapAssetRow);
}

export async function attachMedia(input: {
  mediaId: number;
  entityType: string;
  entityId: number;
  role?: string | null;
  sortOrder?: number;
  createdByUserId: number;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO media_attachments (media_asset_id, entity_type, entity_id, attachment_role, sort_order, created_by_user_id)
    VALUES (${input.mediaId}, ${input.entityType}, ${input.entityId}, ${input.role ?? "attachment"}, ${input.sortOrder ?? 0}, ${input.createdByUserId})
    ON CONFLICT DO NOTHING
  `);
}

export async function getMediaContent(
  input: { mediaId: number },
): Promise<{ body: Buffer; contentType: string | null; sizeBytes: number } | null> {
  const asset = await getMediaAssetById(input.mediaId);
  if (!asset) return null;
  if (asset.storageMode === "s3" && asset.storageKey) {
    try {
      const { cfg, client } = s3Client();
      const out = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: asset.storageKey }));
      const body = out.Body ? Buffer.from(await out.Body.transformToByteArray()) : Buffer.alloc(0);
      return { body, contentType: out.ContentType || asset.mimeType, sizeBytes: body.length };
    } catch (e) {
      console.error(`[mediaVault] S3 read failed for asset ${input.mediaId}: ${(e as any)?.message || e}`);
    }
  }
  const result: any = await db.execute(sql`
    SELECT data, mime_type, size_bytes FROM media_blobs WHERE media_id = ${input.mediaId}
  `);
  const row = result?.rows?.[0];
  if (!row) return null;
  return {
    body: Buffer.from(row.data),
    contentType: row.mime_type || asset.mimeType,
    sizeBytes: Number(row.size_bytes || 0),
  };
}

export async function getMediaSignedUrl(input: { mediaId: number; expiresInSeconds?: number }) {
  const asset = await getMediaAssetById(input.mediaId);
  if (!asset || asset.storageMode !== "s3" || !asset.storageKey) return null;
  const { cfg, client } = s3Client();
  return await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: cfg.bucket, Key: asset.storageKey }),
    { expiresIn: input.expiresInSeconds ?? 60 * 10 },
  );
}

export async function softDeleteMedia(id: number): Promise<void> {
  await db.execute(sql`UPDATE media_assets SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL`);
}

export async function setMediaDeliveryMode(id: number, mode: "mms" | "link_fallback"): Promise<void> {
  await db.execute(sql`UPDATE media_assets SET delivery_mode = ${mode} WHERE id = ${id}`);
}

/** Team isolation: the asset must belong to the caller's team. */
export function assertMediaTeam(asset: MediaAsset, teamId: number): boolean {
  return asset.teamId === teamId;
}
