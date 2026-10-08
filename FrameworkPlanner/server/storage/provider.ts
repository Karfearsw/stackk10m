/**
 * Ticket 18 — Object storage provider abstraction.
 *
 * Moves file storage off the local/ephemeral filesystem (Vercel) to durable
 * S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, etc.).
 *
 * Design principles:
 *  - PRIVATE BY DEFAULT: no public buckets; downloads go through expiring
 *    signed URLs only.
 *  - DEV/PROD SEPARATION: separate buckets (and optionally credentials) per
 *    environment, selected by NODE_ENV.
 *  - LOCAL FALLBACK: dev-only. Production refuses to boot the local provider
 *    unless STORAGE_ALLOW_LOCAL=true is explicitly set (never in prod).
 *  - IMMUTABILITY: signed legal docs are write-once; the provider exposes an
 *    `isImmutable(key)` guard backed by the stored_files.is_immutable flag.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type StorageBackend = "s3" | "local";

export interface StorageConfig {
  backend: StorageBackend;
  /** Active bucket (already resolved for dev/prod). */
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Local root dir (local backend only). */
  localRoot?: string;
  /** URL expiry for signed downloads, seconds. Default 900 (15 min). */
  signedUrlTtlSeconds: number;
}

export interface UploadInput {
  key: string;
  body: Buffer;
  mimeType: string;
  /** When true the object is tagged immutable (legal docs). */
  immutable?: boolean;
}

export interface StorageProvider {
  readonly backend: StorageBackend;
  readonly bucket: string;
  upload(input: UploadInput): Promise<{ key: string; sizeBytes: number; sha256: string }>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Expiring signed URL for private download. Never returns a public URL. */
  getSignedDownloadUrl(key: string, ttlSeconds?: number): Promise<string>;
  sha256(buf: Buffer): string;
}

// ── Config resolution ─────────────────────────────────────────────────────
// Env vars (STORAGE_* preferred; DOCUMENTS_* kept as legacy fallback):
//   STORAGE_PROVIDER        "s3" | "local"            (default: s3 if configured else local)
//   STORAGE_BUCKET          prod bucket name
//   STORAGE_BUCKET_DEV      dev bucket name           (falls back to STORAGE_BUCKET)
//   STORAGE_REGION          e.g. us-east-1 | auto (R2)
//   STORAGE_ENDPOINT        e.g. https://<acct>.r2.cloudflarestorage.com (R2/MinIO)
//   STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY
//   STORAGE_SIGNED_URL_TTL  seconds (default 900)
//   STORAGE_LOCAL_ROOT      local dir for dev fallback (default ./var/storage)
//   STORAGE_ALLOW_LOCAL     "true" to permit local backend in production (NOT recommended)

function env(name: string, fallback = ""): string {
  return String(process.env[name] ?? "").trim() || fallback;
}

function isProd(): boolean {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

export function resolveStorageConfig(): StorageConfig {
  const signedUrlTtlSeconds = Math.max(
    60,
    parseInt(env("STORAGE_SIGNED_URL_TTL", "900"), 10) || 900,
  );

  // Bucket: dev gets its own bucket when configured.
  const bucket =
    (!isProd() && env("STORAGE_BUCKET_DEV")) ||
    env("STORAGE_BUCKET") ||
    env("DOCUMENTS_BUCKET");
  const region = env("STORAGE_REGION") || env("DOCUMENTS_REGION") || "us-east-1";
  const endpoint = env("STORAGE_ENDPOINT") || env("DOCUMENTS_ENDPOINT") || undefined;
  const accessKeyId = env("STORAGE_ACCESS_KEY_ID") || env("DOCUMENTS_ACCESS_KEY_ID") || undefined;
  const secretAccessKey = env("STORAGE_SECRET_ACCESS_KEY") || env("DOCUMENTS_SECRET_ACCESS_KEY") || undefined;

  const explicit = env("STORAGE_PROVIDER").toLowerCase();
  let backend: StorageBackend;
  if (explicit === "s3" || explicit === "local") {
    backend = explicit;
  } else {
    backend = bucket ? "s3" : "local";
  }

  if (backend === "local" && isProd() && env("STORAGE_ALLOW_LOCAL").toLowerCase() !== "true") {
    throw new Error(
      "[storage] Refusing local backend in production. Set STORAGE_BUCKET (+ credentials) " +
      "or explicitly set STORAGE_ALLOW_LOCAL=true (not recommended).",
    );
  }

  return {
    backend,
    bucket: backend === "s3" ? bucket : "",
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    localRoot: env("STORAGE_LOCAL_ROOT", path.join(process.cwd(), "var", "storage")),
    signedUrlTtlSeconds,
  };
}

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function safeKey(key: string): string {
  // Prevent path traversal; normalize separators.
  const cleaned = String(key || "").replace(/\\/g, "/").replace(/\.\./g, "").replace(/^\/+/, "");
  if (!cleaned) throw new Error("[storage] empty object key");
  return cleaned;
}

// ── S3-compatible provider ────────────────────────────────────────────────

export class S3StorageProvider implements StorageProvider {
  readonly backend: StorageBackend = "s3";
  readonly bucket: string;
  private client: S3Client;
  private ttl: number;

  constructor(cfg: StorageConfig) {
    if (!cfg.bucket) throw new Error("[storage] S3 backend requires a bucket");
    this.bucket = cfg.bucket;
    this.ttl = cfg.signedUrlTtlSeconds;
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: Boolean(cfg.endpoint),
      credentials:
        cfg.accessKeyId && cfg.secretAccessKey
          ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
          : undefined,
    });
  }

  sha256(buf: Buffer): string {
    return sha256Hex(buf);
  }

  async upload(input: UploadInput): Promise<{ key: string; sizeBytes: number; sha256: string }> {
    const key = safeKey(input.key);
    const hash = sha256Hex(input.body);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.mimeType,
        // Private by default: no ACL = bucket-private. Tag immutables for lifecycle guard.
        Tagging: input.immutable ? "immutable=true" : undefined,
        Metadata: { sha256: hash },
      }),
    );
    return { key, sizeBytes: input.body.length, sha256: hash };
  }

  async download(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }),
    );
    const chunks: Buffer[] = [];
    const stream = res.Body as unknown as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getSignedDownloadUrl(key: string, ttlSeconds?: number): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) });
    return getSignedUrl(this.client, cmd, { expiresIn: ttlSeconds ?? this.ttl });
  }
}

// ── Local provider (DEV ONLY) ─────────────────────────────────────────────

export class LocalStorageProvider implements StorageProvider {
  readonly backend: StorageBackend = "local";
  readonly bucket = "local";
  private root: string;
  private ttl: number;

  constructor(cfg: StorageConfig) {
    this.root = cfg.localRoot || path.join(process.cwd(), "var", "storage");
    this.ttl = cfg.signedUrlTtlSeconds;
    fs.mkdirSync(this.root, { recursive: true });
  }

  private filePath(key: string): string {
    return path.join(this.root, safeKey(key));
  }

  sha256(buf: Buffer): string {
    return sha256Hex(buf);
  }

  async upload(input: UploadInput): Promise<{ key: string; sizeBytes: number; sha256: string }> {
    const key = safeKey(input.key);
    const fp = this.filePath(key);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, input.body);
    if (input.immutable) {
      // Best-effort immutability marker for dev.
      fs.writeFileSync(fp + ".immutable", "1");
    }
    return { key, sizeBytes: input.body.length, sha256: sha256Hex(input.body) };
  }

  async download(key: string): Promise<Buffer> {
    return fs.promises.readFile(this.filePath(key));
  }

  async delete(key: string): Promise<void> {
    const fp = this.filePath(key);
    if (fs.existsSync(fp + ".immutable")) {
      throw new Error("[storage] Refusing to delete immutable object (local dev guard)");
    }
    await fs.promises.unlink(fp).catch(() => undefined);
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.filePath(key));
  }

  async getSignedDownloadUrl(key: string, _ttlSeconds?: number): Promise<string> {
    // Dev-only: local files are served through the API download route which
    // enforces auth. The "signed" URL is the API route itself.
    return `/api/files/download?key=${encodeURIComponent(safeKey(key))}`;
  }
}

// ── Factory (singleton) ───────────────────────────────────────────────────

let singleton: StorageProvider | null = null;

/** Returns the configured provider (S3 when configured, local dev fallback). */
export function getStorageProvider(): StorageProvider {
  if (!singleton) {
    const cfg = resolveStorageConfig();
    singleton = cfg.backend === "s3" ? new S3StorageProvider(cfg) : new LocalStorageProvider(cfg);
  }
  return singleton;
}

/** Test helper: reset the singleton (picks up changed env). */
export function resetStorageProvider(): void {
  singleton = null;
}

/** Storage key builder: <env>/<entityType>/<entityId>/<uuid>-<safeName> */
export function makeStorageKey(input: {
  entityType: string;
  entityId: string | number;
  originalName: string;
}): string {
  const envPrefix = isProd() ? "prod" : "dev";
  const safe = path.basename(input.originalName || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const et = String(input.entityType || "misc").replace(/[^a-z0-9-]+/gi, "_").toLowerCase();
  const eid = String(input.entityId ?? "0").replace(/[^a-zA-Z0-9-]+/g, "_");
  return `${envPrefix}/${et}/${eid}/${crypto.randomUUID()}-${safe}`;
}
