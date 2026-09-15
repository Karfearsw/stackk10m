import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { signMediaToken } from "../server/media/share-token";

const { mockGetLeadById } = vi.hoisted(() => ({
  mockGetLeadById: vi.fn(async () => ({ id: 55, fullName: "Jane Buyer" })),
}));

vi.mock("../server/storage", () => ({
  storage: {
    getLeadById: mockGetLeadById,
    getContactById: vi.fn(async () => null),
    getPropertyById: vi.fn(async () => null),
    getTaskById: vi.fn(async () => null),
    getDocumentById: vi.fn(async () => null),
    getOpportunityPartyById: vi.fn(async () => null),
  },
}));

vi.mock("../server/media/mediaVault", async () => {
  const actual = await vi.importActual<typeof import("../server/media/mediaVault")>("../server/media/mediaVault");
  return {
    ...actual,
    createMediaAsset: vi.fn(async (input: any) => ({
      id: 101,
      teamId: input.teamId,
      uploadedByUserId: input.uploadedByUserId,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      fileSizeBytes: input.buffer.length,
      sha256: "sha",
      width: input.width,
      height: input.height,
      processingStatus: "ready",
      deliveryMode: null,
      createdAt: new Date().toISOString(),
    })),
    getMediaAssetById: vi.fn(async (id: number) =>
      id === 101
        ? { id: 101, teamId: 18, uploadedByUserId: 1, storageMode: "db", storageKey: "k", originalFilename: "photo.png", mimeType: "image/png", fileSizeBytes: 9, sha256: "s", width: 1, height: 1, processingStatus: "ready", deliveryMode: null, createdAt: new Date().toISOString() }
        : id === 102
          ? { id: 102, teamId: 99, uploadedByUserId: 2, storageMode: "db", storageKey: "k2", originalFilename: "other.png", mimeType: "image/png", fileSizeBytes: 9, sha256: "s", width: 1, height: 1, processingStatus: "ready", deliveryMode: null, createdAt: new Date().toISOString() }
          : null,
    ),
    getMediaContent: vi.fn(async () => ({ body: Buffer.from("img-bytes"), contentType: "image/png", sizeBytes: 9 })),
    listMediaForEntity: vi.fn(async () => []),
    attachMedia: vi.fn(async () => {}),
    softDeleteMedia: vi.fn(async () => {}),
    setMediaDeliveryMode: vi.fn(async () => {}),
    presignMediaUpload: vi.fn(async (input: any) => ({
      storageKey: `teams/${input.teamId}/media/presigned-abc-${input.originalFilename}`,
      uploadUrl: "https://s3.test/bucket/presigned-put",
      expiresInSeconds: 900,
    })),
    verifyMediaObject: vi.fn(async () => ({ sizeBytes: 9, contentType: "video/mp4" })),
    finalizePresignedMedia: vi.fn(async (input: any) => ({
      id: 201,
      teamId: input.teamId,
      uploadedByUserId: input.uploadedByUserId,
      storageMode: "s3",
      storageKey: input.storageKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      sha256: null,
      width: null,
      height: null,
      durationSeconds: null,
      processingStatus: "ready",
      deliveryMode: null,
      createdAt: new Date().toISOString(),
    })),
  };
});

import * as mediaVault from "../server/media/mediaVault";
import { registerMediaRoutes } from "../server/media/media-routes";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 0x01, 0, 0, 0, 0x01, 8, 0, 0, 0, 0,
]);

function makeApp(overrides?: { teamId?: number }) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    (req as any).session.userId = 1;
    next();
  });
  const helpers = {
    requireAuth: async (req: any, res: any) => {
      if (!req.session?.userId) {
        res.status(401).json({ message: "Unauthorized" });
        return null;
      }
      return { id: 1, email: "a@b.c", isSuperAdmin: false };
    },
    requireActiveTeam: async (req: any, res: any) => {
      const user = await helpers.requireAuth(req, res);
      if (!user) return null;
      return { user, teamId: overrides?.teamId ?? 18 };
    },
  };
  registerMediaRoutes(app, helpers);
  return app;
}

describe("media routes", () => {
  beforeEach(() => {
    vi.mocked(mediaVault.createMediaAsset).mockClear();
    vi.mocked(mediaVault.getMediaAssetById).mockClear();
    vi.mocked(mediaVault.attachMedia).mockClear();
    vi.mocked(mediaVault.softDeleteMedia).mockClear();
    vi.mocked(mediaVault.presignMediaUpload).mockClear();
    vi.mocked(mediaVault.verifyMediaObject).mockClear();
    vi.mocked(mediaVault.finalizePresignedMedia).mockClear();
    vi.mocked(mediaVault.getMediaContent).mockClear();
    mockGetLeadById.mockReset();
    mockGetLeadById.mockResolvedValue({ id: 55, fullName: "Jane Buyer" });
  });

  it("requires authentication", async () => {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    registerMediaRoutes(app, {
      requireAuth: async (_req, res) => {
        res.status(401).json({ message: "Unauthorized" });
        return null;
      },
      requireActiveTeam: async (_req, res) => {
        res.status(401).json({ message: "Unauthorized" });
        return null;
      },
    });
    const res = await request(app).get("/api/media?entityType=lead&entityId=55");
    expect(res.status).toBe(401);
  });

  it("uploads an image and attaches it to a lead", async () => {
    const res = await request(makeApp())
      .post("/api/media/upload")
      .field("entityType", "lead")
      .field("entityId", "55")
      .attach("file", PNG, { filename: "lead-photo.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.asset.id).toBe(101);
    expect(mediaVault.attachMedia).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "lead", entityId: 55, mediaId: 101 }),
    );
  });

  it("rejects unsupported upload types with a clear error", async () => {
    const res = await request(makeApp())
      .post("/api/media/upload")
      .field("entityType", "lead")
      .field("entityId", "55")
      .attach("file", Buffer.from("hello"), { filename: "note.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects uploads when the entity does not exist (authz)", async () => {
    mockGetLeadById.mockResolvedValueOnce(undefined);
    const res = await request(makeApp())
      .post("/api/media/upload")
      .field("entityType", "lead")
      .field("entityId", "999")
      .attach("file", PNG, { filename: "x.png", contentType: "image/png" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ENTITY_ACCESS_DENIED");
  });

  it("blocks access to another team's media", async () => {
    const res = await request(makeApp()).get("/api/media/102");
    expect(res.status).toBe(403);
  });

  it("serves preview bytes for an owned asset", async () => {
    const res = await request(makeApp()).get("/api/media/101/preview");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(Buffer.from(res.body).toString()).toBe("img-bytes");
  });

  it("rejects invalid/expired open links (410)", async () => {
    const res = await request(makeApp()).get("/api/media/open/bogus");
    expect(res.status).toBe(410);
  });

  it("streams media through a valid signed open link without auth", async () => {
    const token = signMediaToken({ mediaId: 101, purpose: "share", ttlSeconds: 3600 });
    const res = await request(makeApp()).get(`/api/media/open/${token}`);
    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).toString()).toBe("img-bytes");
  });

  it("rejects expired signed tokens (410)", async () => {
    const token = signMediaToken({ mediaId: 101, purpose: "share", ttlSeconds: -5 });
    const res = await request(makeApp()).get(`/api/media/open/${token}`);
    expect(res.status).toBe(410);
  });

  it("uploads with no entity fields (deferAttach flow) without attaching", async () => {
    const res = await request(makeApp())
      .post("/api/media/upload")
      .attach("file", PNG, { filename: "chat-photo.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.asset.id).toBe(101);
    expect(mediaVault.attachMedia).not.toHaveBeenCalled();
  });

  it("serves a byte range for video seeking (206 + Content-Range)", async () => {
    const res = await request(makeApp())
      .get("/api/media/101/preview")
      .set("Range", "bytes=3-5");
    expect(res.status).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 3-5/9");
    expect(Buffer.from(res.body).toString()).toBe("-by");
  });

  it("serves an open-ended range from offset to end", async () => {
    const res = await request(makeApp())
      .get("/api/media/101/preview")
      .set("Range", "bytes=4-");
    expect(res.status).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 4-8/9");
  });

  it("rejects an unsatisfiable range with 416", async () => {
    const res = await request(makeApp())
      .get("/api/media/101/preview")
      .set("Range", "bytes=100-200");
    expect(res.status).toBe(416);
    expect(res.headers["content-range"]).toBe("bytes */9");
  });

  it("returns the full body when no Range header is present", async () => {
    const res = await request(makeApp()).get("/api/media/101/preview");
    expect(res.status).toBe(200);
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(Buffer.from(res.body).toString()).toBe("img-bytes");
  });
  it("soft-deletes owned media", async () => {
    const res = await request(makeApp()).delete("/api/media/101");
    expect(res.status).toBe(200);
    expect(mediaVault.softDeleteMedia).toHaveBeenCalledWith(101);
  });

  it("presigns a large video for direct-to-S3 upload", async () => {
    const res = await request(makeApp())
      .post("/api/media/upload-url")
      .send({ filename: "walkthrough.mp4", mimeType: "video/mp4", fileSizeBytes: 52428800 });
    expect(res.status).toBe(201);
    expect(res.body.uploadUrl).toContain("https://");
    expect(res.body.storageKey).toContain("teams/18/media/");
    expect(mediaVault.presignMediaUpload).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 18, mimeType: "video/mp4" }),
    );
  });

  it("rejects presign for unsupported types and oversized files", async () => {
    const bad = await request(makeApp())
      .post("/api/media/upload-url")
      .send({ filename: "evil.exe", mimeType: "application/x-msdownload", fileSizeBytes: 100 });
    expect(bad.status).toBe(400);
    const big = await request(makeApp())
      .post("/api/media/upload-url")
      .send({ filename: "huge.mp4", mimeType: "video/mp4", fileSizeBytes: 251 * 1024 * 1024 });
    expect(big.status).toBe(400);
    expect(big.body.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects finalize for another team's storage key", async () => {
    const res = await request(makeApp())
      .post("/api/media/upload-complete")
      .send({ filename: "clip.mp4", mimeType: "video/mp4", fileSizeBytes: 1024, storageKey: "teams/99/media/other.mp4" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("KEY_FORBIDDEN");
    expect(mediaVault.finalizePresignedMedia).not.toHaveBeenCalled();
  });

  it("rejects finalize when the object never landed in storage", async () => {
    vi.mocked(mediaVault.verifyMediaObject).mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .post("/api/media/upload-complete")
      .send({ filename: "clip.mp4", mimeType: "video/mp4", fileSizeBytes: 1024, storageKey: "teams/18/media/missing.mp4" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("UPLOAD_NOT_FOUND");
    expect(mediaVault.finalizePresignedMedia).not.toHaveBeenCalled();
  });

  it("finalizes a completed presigned upload and attaches to an entity", async () => {
    const res = await request(makeApp())
      .post("/api/media/upload-complete")
      .send({ filename: "clip.mp4", mimeType: "video/mp4", fileSizeBytes: 1048576, storageKey: "teams/18/media/clip.mp4", entityType: "lead", entityId: 55 });
    expect(res.status).toBe(201);
    expect(res.body.asset.id).toBe(201);
    expect(res.body.asset.storageMode).toBe("s3");
    expect(mediaVault.attachMedia).toHaveBeenCalledWith(
      expect.objectContaining({ mediaId: 201, entityType: "lead", entityId: 55 }),
    );
  });
});
