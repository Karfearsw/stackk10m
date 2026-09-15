import { describe, it, expect, vi, beforeEach } from "vitest";

// Hermetic mediaVault CRUD tests with a mocked DB.
const { mockDbExecute } = vi.hoisted(() => ({ mockDbExecute: vi.fn(async () => ({ rows: [] })) }));
vi.mock("../server/db", () => ({ db: { execute: mockDbExecute } }));

import {
  createMediaAsset,
  listMediaByAttachments,
  getMediaAssetById,
  listMediaForEntity,
  softDeleteMedia,
  assertMediaTeam,
  attachMedia,
  setMediaDeliveryMode,
} from "../server/media/mediaVault";

describe("mediaVault storage (mocked db)", () => {
  beforeEach(() => {
    mockDbExecute.mockReset();
    mockDbExecute.mockImplementation(async () => ({ rows: [] }));
  });

  it("creates an asset and stores bytes", async () => {
    mockDbExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 7, team_id: 18, uploaded_by_user_id: 1, storage_mode: "db", storage_key: "k",
            original_filename: "a.png", mime_type: "image/png", file_size_bytes: 9, sha256: "s",
            width: 10, height: 20, duration_seconds: null, processing_status: "ready",
            delivery_mode: null, created_at: "2026-08-26T00:00:00Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // blob insert
    const asset = await createMediaAsset({
      teamId: 18,
      uploadedByUserId: 1,
      originalFilename: "a.png",
      mimeType: "image/png",
      kind: "image",
      buffer: Buffer.from("img-bytes"),
      width: 10,
      height: 20,
    });
    expect(asset.id).toBe(7);
    expect(asset.teamId).toBe(18);
    expect(asset.mimeType).toBe("image/png");
    expect(asset.width).toBe(10);
    // second call stored the blob
    const blobCall = JSON.stringify(mockDbExecute.mock.calls[1][0]);
    expect(blobCall).toContain("media_blobs");
  });

  it("maps asset rows on read", async () => {
    mockDbExecute.mockResolvedValueOnce({
      rows: [
        {
          id: 3, team_id: 18, uploaded_by_user_id: 1, storage_mode: "db", storage_key: "k",
          original_filename: "a.png", mime_type: "image/png", file_size_bytes: 9, sha256: "s",
          width: null, height: null, duration_seconds: null, processing_status: "ready",
          delivery_mode: null, created_at: "2026-08-26T00:00:00Z",
        },
      ],
    });
    const asset = await getMediaAssetById(3);
    expect(asset?.id).toBe(3);
    expect(asset?.teamId).toBe(18);
  });

  it("returns null for missing assets", async () => {
    const asset = await getMediaAssetById(999);
    expect(asset).toBeNull();
  });

  it("lists media by entity with team filter", async () => {
    mockDbExecute.mockResolvedValueOnce({ rows: [] });
    const list = await listMediaForEntity({ teamId: 18, entityType: "lead", entityId: 55 });
    expect(list).toEqual([]);
    const text = JSON.stringify(mockDbExecute.mock.calls[0][0]);
    expect(text).toContain("team_id");
    expect(text).toContain("media_attachments");
  });

  it("attaches media with role", async () => {
    await attachMedia({ mediaId: 1, entityType: "lead", entityId: 55, role: "photo", createdByUserId: 1 });
    const text = JSON.stringify(mockDbExecute.mock.calls[0][0]);
    expect(text).toContain("media_attachments");
    expect(text).toContain("photo");
  });

  it("soft-deletes by setting deleted_at", async () => {
    await softDeleteMedia(5);
    const text = JSON.stringify(mockDbExecute.mock.calls[0][0]);
    expect(text).toContain("deleted_at");
  });

  it("records delivery mode", async () => {
    await setMediaDeliveryMode(5, "link_fallback");
    const text = JSON.stringify(mockDbExecute.mock.calls[0][0]);
    expect(text).toContain("delivery_mode");
  });

  it("enforces team isolation", () => {
    const asset = { teamId: 18 } as any;
    expect(assertMediaTeam(asset, 18)).toBe(true);
    expect(assertMediaTeam(asset, 99)).toBe(false);
  });
});

describe("listMediaByAttachments", () => {
  beforeEach(() => {
    mockDbExecute.mockReset();
    mockDbExecute.mockImplementation(async () => ({ rows: [] }));
  });

  it("returns {} for empty input without querying", async () => {
    const out = await listMediaByAttachments({ teamId: 18, entityType: "internal_message", entityIds: [] });
    expect(out).toEqual({});
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  it("groups assets by entity id from joined rows", async () => {
    mockDbExecute.mockResolvedValueOnce({
      rows: [
        { entity_id: 11, id: 1, team_id: 18, uploaded_by_user_id: 2, storage_mode: "db", storage_key: "k1", original_filename: "pic.png", mime_type: "image/png", file_size_bytes: 10, sha256: "s1", width: 3, height: 4, duration_seconds: null, processing_status: "ready", delivery_mode: null, created_at: "2026-09-01T00:00:00Z" },
        { entity_id: 11, id: 2, team_id: 18, uploaded_by_user_id: 2, storage_mode: "db", storage_key: "k2", original_filename: "clip.mp4", mime_type: "video/mp4", file_size_bytes: 999, sha256: "s2", width: null, height: null, duration_seconds: 12.5, processing_status: "ready", delivery_mode: null, created_at: "2026-09-01T00:00:01Z" },
        { entity_id: 12, id: 3, team_id: 18, uploaded_by_user_id: 2, storage_mode: "db", storage_key: "k3", original_filename: "other.png", mime_type: "image/png", file_size_bytes: 5, sha256: "s3", width: 1, height: 1, duration_seconds: null, processing_status: "ready", delivery_mode: null, created_at: "2026-09-01T00:00:02Z" },
      ],
    });
    const out = await listMediaByAttachments({ teamId: 18, entityType: "internal_message", entityIds: [11, 12] });
    expect(Object.keys(out).sort()).toEqual(["11", "12"]);
    expect(out[11].length).toBe(2);
    expect(out[11][0].id).toBe(1);
    expect(out[11][1].mimeType).toBe("video/mp4");
    expect(out[11][1].durationSeconds).toBe(12.5);
    expect(out[12][0].id).toBe(3);
  });

  it("scopes the query to the caller team and excludes deleted assets", async () => {
    await listMediaByAttachments({ teamId: 18, entityType: "internal_message", entityIds: [11] });
    const q = JSON.stringify(mockDbExecute.mock.calls[0][0]);
    expect(q).toContain("18");
    expect(q).toContain("deleted_at IS NULL");
    expect(q).toContain("entity_type = ");
  });
});
