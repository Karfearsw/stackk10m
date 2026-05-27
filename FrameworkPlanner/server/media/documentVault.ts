import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";
import path from "node:path";

type DocumentVaultConfig = {
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

function getClient(cfg: DocumentVaultConfig) {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: Boolean(cfg.endpoint),
    credentials:
      cfg.accessKeyId && cfg.secretAccessKey ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } : undefined,
  });
}

function safeBasename(name: string) {
  const base = path.basename(name || "file");
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function isDocumentVaultConfigured(): boolean {
  return readConfig() !== null;
}

export function sha256Hex(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function makeDocumentStorageKey(input: { teamId: number; originalName: string }) {
  const filePart = safeBasename(input.originalName);
  return `teams/${input.teamId}/documents/${crypto.randomUUID()}-${filePart}`;
}

export async function uploadDocumentObject(input: {
  storageKey: string;
  contentType: string;
  body: Buffer;
}) {
  const cfg = readConfig();
  if (!cfg) throw new Error("Document vault is not configured");
  const client = getClient(cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: input.storageKey,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
  return { storageKey: input.storageKey };
}

export async function getDocumentSignedUrl(input: { storageKey: string; expiresInSeconds?: number }) {
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

