import { describe, it, expect, vi, beforeEach } from "vitest";

// Hermetic mediaVault CRUD tests with a mocked DB.
const { mockDbExecute } = vi.hoisted(() => ({ mockDbExecute: vi.fn(async () => ({ rows: [] })) }));
vi.mock("../server/db", () => ({ db: { execute: mockDbExecute } }));

import {
  createMediaAsset,
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
