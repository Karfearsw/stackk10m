import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the DB so tests stay hermetic (no real Postgres).
const { mockExecute, mockStored } = vi.hoisted(() => {
  const stored = new Map<string, { data: Uint8Array; mime_type: string; size_bytes: number }>();
  const parseSql = (q: any) => {
    const text = (q?.queryChunks ?? [])
      .filter((c: any) => c && typeof c === 'object' && Array.isArray(c.value))
      .map((c: any) => c.value.join(''))
      .join('');
    const values = (q?.queryChunks ?? []).filter((c: any) => typeof c !== 'object' || Buffer.isBuffer(c));
    return { text, values };
  };
  const execute = vi.fn(async (query: any) => {
    const { text, values } = parseSql(query);
    if (text.includes('INSERT INTO vault_document_blobs')) {
      stored.set(values[0], {
        data: values[1],
        mime_type: values[2],
        size_bytes: values[3],
      });
      return { rows: [] };
    }
    if (text.includes('FROM vault_document_blobs')) {
      const blob = stored.get(values[0]);
      return { rows: blob ? [blob] : [] };
    }
    return { rows: [] };
  });
  return { mockExecute: execute, mockStored: stored };
});

vi.mock('../server/db', () => ({ db: { execute: mockExecute } }));

import {
  isDocumentVaultConfigured,
  documentStorageMode,
  uploadDocumentObject,
  getDocumentContent,
  getDocumentSignedUrl,
  sha256Hex,
} from '../server/media/documentVault';

describe('Document vault DB mode', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DOCUMENTS_BUCKET;
    delete process.env.DOCUMENTS_REGION;
    delete process.env.DOCUMENT_STORAGE_MODE;
    mockStored.clear();
    mockExecute.mockClear();
  });

  it('reports configured and db mode without S3 config', () => {
    expect(isDocumentVaultConfigured()).toBe(true);
    expect(documentStorageMode()).toBe('db');
  });

  it('uses s3 mode when DOCUMENT_STORAGE_MODE=s3 even without bucket env', () => {
    process.env.DOCUMENT_STORAGE_MODE = 's3';
    expect(documentStorageMode()).toBe('s3');
  });

  it('round-trips a blob through Postgres (upload then content)', async () => {
    const body = Buffer.from('hello document storage');
    await uploadDocumentObject({
      storageKey: 'teams/1/documents/test.txt',
      contentType: 'text/plain',
      body,
    });

    const content = await getDocumentContent({ storageKey: 'teams/1/documents/test.txt' });
    expect(content).not.toBeNull();
    expect(content!.body.toString()).toBe('hello document storage');
    expect(content!.contentType).toBe('text/plain');
    expect(content!.sizeBytes).toBe(body.length);
  });

  it('returns null for missing content', async () => {
    const content = await getDocumentContent({ storageKey: 'teams/1/documents/nope.txt' });
    expect(content).toBeNull();
  });

  it('returns null signed URL in db mode', async () => {
    const url = await getDocumentSignedUrl({ storageKey: 'teams/1/documents/test.txt' });
    expect(url).toBeNull();
  });

  it('overwrites an existing blob on re-upload', async () => {
    await uploadDocumentObject({ storageKey: 'k', contentType: 'text/plain', body: Buffer.from('v1') });
    await uploadDocumentObject({ storageKey: 'k', contentType: 'text/plain', body: Buffer.from('v2-longer') });
    const content = await getDocumentContent({ storageKey: 'k' });
    expect(content!.body.toString()).toBe('v2-longer');
    expect(content!.sizeBytes).toBe(9);
  });

  it('computes sha256 for integrity', () => {
    const hash = sha256Hex(Buffer.from('abc'));
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

// ── S3 / dual-mode coverage ────────────────────────────────────────────────
const { mockS3Send, MockS3Client } = vi.hoisted(() => {
  const send = vi.fn(async () => ({
    Body: { transformToByteArray: async () => Uint8Array.from(Buffer.from("s3-content")) },
    ContentType: "text/plain",
  }));
  class MockS3Client {
    constructor() {
      this.send = send;
    }
  }
  return { mockS3Send: send, MockS3Client };
});

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: MockS3Client,
  GetObjectCommand: vi.fn(),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://signed.example/object"),
}));

import {
  storageMode,
  useDual,
  documentVaultHealth,
  uploadDocumentObject as uploadDual,
  getDocumentContent as getDual,
} from "../server/media/documentVault";

describe("Document vault storage modes and dual-write", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DOCUMENTS_BUCKET;
    delete process.env.DOCUMENTS_REGION;
    delete process.env.DOCUMENT_STORAGE_MODE;
    mockS3Send.mockClear();
    mockStored.clear();
    mockExecute.mockClear();
  });

  it("normalizes database/object_storage aliases", () => {
    process.env.DOCUMENT_STORAGE_MODE = "database";
    expect(storageMode()).toBe("db");
    process.env.DOCUMENT_STORAGE_MODE = "object_storage";
    expect(storageMode()).toBe("s3");
    process.env.DOCUMENT_STORAGE_MODE = "dual";
    expect(storageMode()).toBe("dual");
    expect(useDual()).toBe(true);
  });

  it("dual mode without S3 config degrades to Postgres and reports honestly", async () => {
    process.env.DOCUMENT_STORAGE_MODE = "dual";
    delete process.env.DOCUMENTS_BUCKET;
    delete process.env.DOCUMENTS_REGION;

    const health = documentVaultHealth();
    expect(health.mode).toBe("dual");
    expect(health.primary).toBe("s3");
    expect(health.primaryReady).toBe(false);
    expect(health.replicationStatus).toBe("s3_unconfigured");

    const result = await uploadDual({ storageKey: "teams/1/documents/dual.txt", contentType: "text/plain", body: Buffer.from("x") });
    expect(result.storageMode).toBe("db");
    expect(result.replicationStatus).toBe("s3_unconfigured");
    expect(result.errors.length).toBe(1);
    // Never claim success against the required S3 target.
    expect(health.primaryReady).toBe(false);
  });

  it("dual mode writes S3 (primary) and DB replica, then reads from DB on S3 failure", async () => {
    process.env.DOCUMENT_STORAGE_MODE = "dual";
    process.env.DOCUMENTS_BUCKET = "crm-docs";
    process.env.DOCUMENTS_REGION = "us-east-1";

    const result = await uploadDual({ storageKey: "teams/1/documents/dual2.txt", contentType: "text/plain", body: Buffer.from("hello dual") });
    expect(result.storageMode).toBe("dual");
    expect(result.replicationStatus).toBe("ok");
    expect(mockS3Send).toHaveBeenCalled();

    // S3 read fails → DB replica fallback keeps the read working.
    mockS3Send.mockRejectedValueOnce(new Error("S3 down"));
    const content = await getDual({ storageKey: "teams/1/documents/dual2.txt" });
    expect(content).not.toBeNull();
    expect(content!.body.toString()).toBe("hello dual");
  });

  it("dual mode with a failing S3 primary rejects the write (no fake success)", async () => {
    process.env.DOCUMENT_STORAGE_MODE = "dual";
    process.env.DOCUMENTS_BUCKET = "crm-docs";
    process.env.DOCUMENTS_REGION = "us-east-1";
    mockS3Send.mockRejectedValueOnce(new Error("S3 primary unavailable"));
    await expect(
      uploadDual({ storageKey: "teams/1/documents/fail.txt", contentType: "text/plain", body: Buffer.from("nope") }),
    ).rejects.toThrow("S3 primary unavailable");
  });

  it("explicit object_storage mode writes to S3 only", async () => {
    process.env.DOCUMENT_STORAGE_MODE = "object_storage";
    process.env.DOCUMENTS_BUCKET = "crm-docs";
    process.env.DOCUMENTS_REGION = "us-east-1";
    const result = await uploadDual({ storageKey: "teams/1/documents/s3only.txt", contentType: "text/plain", body: Buffer.from("s3 only") });
    expect(result.storageMode).toBe("s3");
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });
});
