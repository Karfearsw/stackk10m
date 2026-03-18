import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type StorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function readStorageConfig(): StorageConfig | null {
  const bucket = String(process.env.TELEPHONY_MEDIA_BUCKET || "").trim();
  const region = String(process.env.TELEPHONY_MEDIA_REGION || "auto").trim();
  const endpoint = String(process.env.TELEPHONY_MEDIA_ENDPOINT || "").trim() || undefined;
  const accessKeyId = String(process.env.TELEPHONY_MEDIA_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.TELEPHONY_MEDIA_SECRET_ACCESS_KEY || "").trim();
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;
  return { bucket, region, endpoint, accessKeyId, secretAccessKey };
}

function getClient(cfg: StorageConfig) {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: Boolean(cfg.endpoint),
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
}

export function isTelephonyMediaStorageConfigured() {
  return Boolean(readStorageConfig());
}

export async function getTelephonyMediaSignedUrl(input: { key: string; expiresInSeconds?: number }) {
  const cfg = readStorageConfig();
  if (!cfg) return null;
  const client = getClient(cfg);
  const cmd = new GetObjectCommand({ Bucket: cfg.bucket, Key: input.key });
  const url = await getSignedUrl(client, cmd, { expiresIn: input.expiresInSeconds ?? 300 });
  return url;
}

export async function uploadTelephonyMediaFromUrl(input: { key: string; sourceUrl: string; contentType?: string }) {
  const cfg = readStorageConfig();
  if (!cfg) return null;
  const client = getClient(cfg);

  const resp = await fetch(input.sourceUrl);
  if (!resp.ok) throw new Error(`Failed to fetch source media: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const contentType = input.contentType || resp.headers.get("content-type") || "application/octet-stream";

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: input.key,
      Body: buf,
      ContentType: contentType,
    }),
  );

  return { key: input.key, contentType, sizeBytes: buf.length };
}

