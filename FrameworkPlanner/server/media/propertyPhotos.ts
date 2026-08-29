import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import path from "node:path";
import { db } from "../db.js";

// ── Property / opportunity photo storage ────────────────────────────────────
// Storage backend is chosen per-write:
//   S3  → when PROPERTY_PHOTOS_BUCKET + PROPERTY_PHOTOS_REGION are set
//         (PROPERTY_PHOTOS_ENDPOINT for MinIO / R2).
//   DB  → otherwise, image bytes are stored in PostgreSQL
//         (property_photo_blobs) so uploads always work — locally and on
//         Vercel — with zero S3 setup.
// The images column stores `property-photo:<storageKey>` refs either way; the
// GET route serves from S3 (signed redirect) or the DB (stream) transparently.

type PropertyPhotoConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

function getPropertyPhotoConfig(): PropertyPhotoConfig | null {
  const bucket = String(process.env.PROPERTY_PHOTOS_BUCKET || "").trim();
  const region = String(process.env.PROPERTY_PHOTOS_REGION || "").trim();
  if (!bucket || !region) return null;
  const endpoint = String(process.env.PROPERTY_PHOTOS_ENDPOINT || "").trim() || undefined;
  const accessKeyId = String(process.env.PROPERTY_PHOTOS_ACCESS_KEY_ID || "").trim() || undefined;
  const secretAccessKey = String(process.env.PROPERTY_PHOTOS_SECRET_ACCESS_KEY || "").trim() || undefined;
  return { bucket, region, endpoint, accessKeyId, secretAccessKey };
}

/** Whether property photos can be written. The DB blob backend always works. */
export function isPropertyPhotoStorageConfigured(): boolean {
  return true;
}

function getS3Client(config: PropertyPhotoConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: Boolean(config.endpoint),
    credentials:
      config.accessKeyId && config.secretAccessKey
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        : undefined,
  });
}

function safeBasename(name: string) {
  const base = path.basename(name || "photo");
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export async function uploadPropertyPhoto(input: {
  opportunityId: number;
  contentType: string;
  body: Buffer;
  originalName: string;
}): Promise<{ storageKey: string }> {
  const ext = path.extname(input.originalName || "").slice(0, 16);
  const name = safeBasename(input.originalName || "photo");
  const filePart = name || `photo${ext || ""}`;
  const storageKey = `opportunities/${input.opportunityId}/${crypto.randomUUID()}-${filePart}`;

  const config = getPropertyPhotoConfig();
  if (config) {
    const s3 = getS3Client(config);
    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: storageKey,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return { storageKey };
  }

  // No S3 configured → DB blob fallback so uploads always succeed.
  await db.execute(sql`
    INSERT INTO property_photo_blobs (storage_key, data, mime_type, size_bytes, sha256)
    VALUES (${storageKey}, ${input.body}, ${input.contentType}, ${input.body.length}, ${sha256Hex(input.body)})
    ON CONFLICT (storage_key) DO UPDATE SET
      data = EXCLUDED.data,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes,
      sha256 = EXCLUDED.sha256,
      created_at = NOW()
  `);
  return { storageKey };
}

function sha256Hex(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export async function getPropertyPhotoContent(storageKey: string): Promise<{ body: Buffer; contentType: string | null; sizeBytes: number } | null> {
  const result: any = await db.execute(sql`
    SELECT data, mime_type, size_bytes
    FROM property_photo_blobs
    WHERE storage_key = ${storageKey}
  `);
  const row = result?.rows?.[0];
  if (!row) return null;
  return {
    body: Buffer.from(row.data),
    contentType: row.mime_type || null,
    sizeBytes: Number(row.size_bytes || 0),
  };
}

export async function getPropertyPhotoSignedUrl(storageKey: string): Promise<string | null> {
  const config = getPropertyPhotoConfig();
  if (!config) return null;
  const s3 = getS3Client(config);
  return await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: storageKey,
    }),
    { expiresIn: 60 * 10 },
  );
}
