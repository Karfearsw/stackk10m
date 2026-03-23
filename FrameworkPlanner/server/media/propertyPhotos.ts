import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";
import path from "node:path";

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

export function isPropertyPhotoStorageConfigured(): boolean {
  return getPropertyPhotoConfig() !== null;
}

function getS3Client(config: PropertyPhotoConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
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
  const config = getPropertyPhotoConfig();
  if (!config) throw new Error("Property photo storage is not configured");

  const s3 = getS3Client(config);
  const ext = path.extname(input.originalName || "").slice(0, 16);
  const name = safeBasename(input.originalName || "photo");
  const filePart = name || `photo${ext || ""}`;
  const storageKey = `opportunities/${input.opportunityId}/${crypto.randomUUID()}-${filePart}`;

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
