import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import path from "node:path";
import { db } from "../db.js";

// ── Document vault ─────────────────────────────────────────────────────────
// Storage backends, selected by DOCUMENT_STORAGE_MODE:
//   database       → PostgreSQL blob store (vault_document_blobs) only
//   object_storage → S3-compatible object store only (DOCUMENTS_BUCKET +
//                    DOCUMENTS_REGION; DOCUMENTS_ENDPOINT for MinIO/R2)
//   dual           → write to both S3 (primary) and Postgres (replica); reads
//                    prefer S3 and fall back to the DB replica
//   auto (default) → S3 when configured, otherwise Postgres
// Aliases accepted: "db" == "database", "s3" == "object_storage".
// The DB is always available, so the vault is always usable.

export function s3Config(): DocumentVaultConfig | null {
  return readConfig();
}

export type StorageModeName = "auto" | "s3" | "db" | "dual";

export type DocumentVaultConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

function readConfig(): DocumentVaultConfig | null {
  const bucket = String(process.env.DOCUMENTS_BUCKET || "").trim();
  const region = String(process.env.DOCUMENTS_REGION || "").trim();
  if (!bucket || !region) return null;
  const endpoint = String(process.env.DOCUMENTS_ENDPOINT || "").trim() || undefined;
  const accessKeyId = String(process.env.DOCUMENTS_ACCESS_KEY_ID || "").trim() || undefined;
  const secretAccessKey = String(process.env.DOCUMENTS_SECRET_ACCESS_KEY || "").trim() || undefined;
  return { bucket, region, endpoint, accessKeyId, secretAccessKey };
}

/** Normalized storage mode: auto | s3 | db | dual. */
export function storageMode(): StorageModeName {
  const raw = String(process.env.DOCUMENT_STORAGE_MODE || "auto").trim().toLowerCase();
  const aliases: Record<string, StorageModeName> = {
    database: "db",
    object_storage: "s3",
    objectstorage: "s3",
    s3: "s3",
    db: "db",
    dual: "dual",
  };
  return aliases[raw] || "auto";
}

export function useS3(): boolean {
  const mode = storageMode();
  if (mode === "db") return false;
  if (mode === "s3" || mode === "dual") return true;
  return readConfig() !== null; // auto
}

export function useDual(): boolean {
  return storageMode() === "dual";
}

function getClient(cfg: DocumentVaultConfig) {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: Boolean(cfg.endpoint),
    credentials:
      cfg.accessKeyId && cfg.secretAccessKey
        ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
        : undefined,
  });
}

function safeBasename(name: string) {
  const base = path.basename(name || "file");
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

/** The vault is always usable: S3 when configured, otherwise PostgreSQL blobs. */
export function isDocumentVaultConfigured(): boolean {
  return true;
}

/** Effective backend for reads: "s3" or "db". */
export function documentStorageMode(): "s3" | "db" {
  return useS3() ? "s3" : "db";
}

export function sha256Hex(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function makeDocumentStorageKey(input: { teamId: number; originalName: string }) {
  const filePart = safeBasename(input.originalName);
  return `teams/${input.teamId}/documents/${crypto.randomUUID()}-${filePart}`;
}

export type VaultWriteResult = {
  storageKey: string;
  storageMode: "s3" | "db" | "dual";
  replicationStatus: "ok" | "s3_failed" | "db_failed" | "s3_unconfigured";
  errors: string[];
};

async function writeS3(cfg: DocumentVaultConfig, storageKey: string, contentType: string, body: Buffer) {
  const client = getClient(cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: storageKey,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function writeDbBlob(input: {
  storageKey: string;
  contentType: string;
  body: Buffer;
  storageMode: "db" | "dual";
  replicationStatus: "ok" | "db_failed" | "s3_unconfigured";
}) {
  await db.execute(sql`
    INSERT INTO vault_document_blobs (storage_key, data, mime_type, size_bytes, sha256, storage_mode, replication_status)
    VALUES (${input.storageKey}, ${input.body}, ${input.contentType}, ${input.body.length}, ${sha256Hex(input.body)}, ${input.storageMode}, ${input.replicationStatus})
    ON CONFLICT (storage_key) DO UPDATE SET
      data = EXCLUDED.data,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes,
      sha256 = EXCLUDED.sha256,
      storage_mode = EXCLUDED.storage_mode,
      replication_status = EXCLUDED.replication_status,
      created_at = NOW()
  `);
}

export async function uploadDocumentObject(input: {
  storageKey: string;
  contentType: string;
  body: Buffer;
}): Promise<VaultWriteResult> {
  const mode = storageMode();
  const cfg = readConfig();
  const errors: string[] = [];

  if (mode === "db") {
    await writeDbBlob({ storageKey: input.storageKey, contentType: input.contentType, body: input.body, storageMode: "db", replicationStatus: "ok" });
    return { storageKey: input.storageKey, storageMode: "db", replicationStatus: "ok", errors };
  }

  if (mode === "dual") {
    if (!cfg) {
      // S3 primary unconfigured: degrade to DB replica only, but be honest.
      errors.push("DOCUMENTS_BUCKET/DOCUMENTS_REGION not set — S3 primary unavailable, wrote to Postgres replica only");
      await writeDbBlob({ storageKey: input.storageKey, contentType: input.contentType, body: input.body, storageMode: "db", replicationStatus: "s3_unconfigured" });
      return { storageKey: input.storageKey, storageMode: "db", replicationStatus: "s3_unconfigured", errors };
    }
    // S3 is the primary target: a failure here means the write did not succeed.
    await writeS3(cfg, input.storageKey, input.contentType, input.body);
    try {
      await writeDbBlob({ storageKey: input.storageKey, contentType: input.contentType, body: input.body, storageMode: "dual", replicationStatus: "ok" });
      return { storageKey: input.storageKey, storageMode: "dual", replicationStatus: "ok", errors };
    } catch (e: any) {
      errors.push(`DB replica write failed: ${e?.message || e}`);
      return { storageKey: input.storageKey, storageMode: "dual", replicationStatus: "db_failed", errors };
    }
  }

  // s3 or auto-with-s3
  if (useS3() && cfg) {
    await writeS3(cfg, input.storageKey, input.contentType, input.body);
    return { storageKey: input.storageKey, storageMode: "s3", replicationStatus: "ok", errors };
  }

  await writeDbBlob({ storageKey: input.storageKey, contentType: input.contentType, body: input.body, storageMode: "db", replicationStatus: "ok" });
  return { storageKey: input.storageKey, storageMode: "db", replicationStatus: "ok", errors };
}

export async function getDocumentContent(input: {
  storageKey: string;
}): Promise<{ body: Buffer; contentType: string | null; sizeBytes: number } | null> {
  const mode = storageMode();
  const cfg = readConfig();
  const wantS3 = useS3();

  if (wantS3 && cfg) {
    try {
      const client = getClient(cfg);
      const out = await client.send(
        new GetObjectCommand({
          Bucket: cfg.bucket,
          Key: input.storageKey,
        }),
      );
      const body = out.Body ? Buffer.from(await out.Body.transformToByteArray()) : Buffer.alloc(0);
      return { body, contentType: out.ContentType || null, sizeBytes: body.length };
    } catch (e) {
      if (mode === "dual") {
        // Replica fallback: the non-primary replica being unavailable must not
        // break reads when the DB replica still has the content.
        console.error(`[documentVault] S3 read failed (falling back to DB replica): ${(e as any)?.message || e}`);
      } else {
        throw e;
      }
    }
  }

  const result: any = await db.execute(sql`
    SELECT data, mime_type, size_bytes
    FROM vault_document_blobs
    WHERE storage_key = ${input.storageKey}
  `);
  const row = result?.rows?.[0];
  if (!row) return null;
  return {
    body: Buffer.from(row.data),
    contentType: row.mime_type || null,
    sizeBytes: Number(row.size_bytes || 0),
  };
}

export async function getDocumentSignedUrl(input: { storageKey: string; expiresInSeconds?: number }) {
  if (!useS3()) return null;
  const cfg = readConfig();
  if (!cfg) return null;
  const client = getClient(cfg);
  return await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: input.storageKey,
    }),
    { expiresIn: input.expiresInSeconds ?? 60 * 10 },
  );
}

export type DocumentVaultHealth = {
  mode: StorageModeName;
  effective: "s3" | "db" | "dual";
  primary: "s3" | "db";
  primaryReady: boolean;
  secondary: "db" | null;
  secondaryReady: boolean;
  s3Configured: boolean;
  replicationStatus: "ok" | "s3_unconfigured" | "degraded";
  detail: string;
};

/** Readiness probe used by the System tab and health endpoints. */
export function documentVaultHealth(): DocumentVaultHealth {
  const mode = storageMode();
  const s3Configured = readConfig() !== null;

  if (mode === "db") {
    return {
      mode, effective: "db", primary: "db", primaryReady: true, secondary: null,
      secondaryReady: true, s3Configured, replicationStatus: "ok",
      detail: "PostgreSQL document storage (vault_document_blobs).",
    };
  }
  if (mode === "dual") {
    return {
      mode, effective: s3Configured ? "dual" : "db", primary: "s3", primaryReady: s3Configured, secondary: "db",
      secondaryReady: true, s3Configured,
      replicationStatus: s3Configured ? "ok" : "s3_unconfigured",
      detail: s3Configured
        ? "Dual-write enabled: S3 primary + Postgres replica."
        : "Dual-write requested but DOCUMENTS_BUCKET/DOCUMENTS_REGION are not set — S3 primary unavailable.",
    };
  }
  // s3 or auto
  if (s3Configured) {
    return {
      mode, effective: "s3", primary: "s3", primaryReady: true, secondary: null,
      secondaryReady: true, s3Configured, replicationStatus: "ok",
      detail: `S3-compatible object storage (${process.env.DOCUMENTS_BUCKET}).`,
    };
  }
  return {
    mode, effective: "db", primary: "db", primaryReady: true, secondary: null,
    secondaryReady: true, s3Configured, replicationStatus: "ok",
    detail: "PostgreSQL document storage (vault_document_blobs). Set DOCUMENTS_BUCKET + DOCUMENTS_REGION to switch to S3.",
  };
}
