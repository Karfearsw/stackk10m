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

  it("soft-deletes owned media", async () => {
    const res = await request(makeApp()).delete("/api/media/101");
    expect(res.status).toBe(200);
    expect(mediaVault.softDeleteMedia).toHaveBeenCalledWith(101);
  });
});
