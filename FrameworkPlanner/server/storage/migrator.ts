/**
 * Ticket 18 — Storage migrator.
 *
 * Inventories files currently living outside durable object storage and moves
 * them into the configured provider (S3-compatible), verifying SHA-256
 * checksums at every step so no data is lost or corrupted in transit.
 *
 * Sources inventoried:
 *  1. Local upload directories (./var/storage, ./uploads, attached_assets)
 *  2. Postgres blob tables (vault_document_blobs, media_blobs) when the
 *     provider is S3 — DB blobs stay as replicas in dual mode.
 *
 * Safety:
 *  - dryRun=true (default) only reports what WOULD happen.
 *  - Every upload is re-downloaded and checksum-compared before the source
 *    row is marked migrated. Mismatches abort that file (never delete source
 *    on mismatch).
 *  - Source files are NEVER deleted by the migrator — cleanup is a separate,
 *    explicit, owner-approved step after verification.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { getStorageProvider, makeStorageKey, sha256Hex } from "./provider.js";

export interface MigrationCandidate {
  source: "local_dir" | "db_blob";
  sourcePath: string;          // local path or "table:id"
  table?: string;
  rowId?: number | string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  entityType: string;
  entityId: string | number;
  immutable: boolean;
}

export interface MigrateResult {
  dryRun: boolean;
  scanned: number;
  candidates: number;
  uploaded: number;
  verified: number;
  failed: Array<{ source: string; error: string }>;
  skipped: number;
}

const LOCAL_SCAN_DIRS = ["var/storage", "uploads", "attached_assets"];

function* walkDir(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkDir(full);
    else if (e.isFile() && !e.name.endsWith(".immutable")) yield full;
  }
}

function guessMime(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || "application/octet-stream";
}

/** Inventory every migratable file. No writes. */
export async function inventoryCandidates(): Promise<MigrationCandidate[]> {
  const out: MigrationCandidate[] = [];

  // 1. Local directories.
  for (const dir of LOCAL_SCAN_DIRS) {
    const abs = path.join(process.cwd(), dir);
    for (const file of walkDir(abs)) {
      const stat = fs.statSync(file);
      const buf = fs.readFileSync(file);
      out.push({
        source: "local_dir",
        sourcePath: path.relative(process.cwd(), file),
        originalName: path.basename(file),
        mimeType: guessMime(file),
        sizeBytes: stat.size,
        sha256: sha256Hex(buf),
        entityType: "legacy_upload",
        entityId: 0,
        immutable: fs.existsSync(file + ".immutable"),
      });
    }
  }

  // 2. Postgres blob tables → S3 (only when provider is S3; otherwise nothing to do).
  const provider = getStorageProvider();
  if (provider.backend === "s3") {
    const tables = ["vault_document_blobs", "media_blobs"] as const;
    for (const table of tables) {
      try {
        // Discover id/blob columns defensively; schemas differ per table.
        const rows = await db.execute(sql`
          SELECT * FROM ${sql.identifier(table)}
          WHERE migrated_to_storage IS NOT TRUE
          LIMIT 500
        `).catch(() => null as any);
        if (!rows) continue;
        const list: any[] = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
        for (const r of list) {
          const blob: Buffer | null =
            r.blob ?? r.data ?? r.file_data ?? r.content ?? null;
          if (!blob) continue;
          const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
          out.push({
            source: "db_blob",
            sourcePath: `${table}:${r.id}`,
            table,
            rowId: r.id,
            originalName: String(r.original_filename ?? r.filename ?? r.name ?? `blob-${r.id}`),
            mimeType: String(r.mime_type ?? r.mimetype ?? guessMime(String(r.original_filename ?? ""))),
            sizeBytes: buf.length,
            sha256: String(r.sha256 ?? sha256Hex(buf)),
            entityType: table === "vault_document_blobs" ? "document" : "media",
            entityId: r.document_id ?? r.media_id ?? r.id,
            immutable: Boolean(r.is_immutable),
          });
        }
      } catch {
        // Table missing — skip.
      }
    }
  }

  return out;
}

async function alreadyStored(sha256: string): Promise<boolean> {
  try {
    const rows: any = await db.execute(sql`
      SELECT 1 FROM stored_files WHERE checksum_sha256 = ${sha256} LIMIT 1
    `);
    const list: any[] = Array.isArray(rows) ? rows : rows?.rows ?? [];
    return list.length > 0;
  } catch {
    return false; // table not migrated yet — treat as not stored
  }
}

/**
 * Run the migration. dryRun=true only inventories and reports.
 * Returns per-file results. Never deletes sources.
 */
export async function runMigration(opts?: { dryRun?: boolean; uploadedBy?: number }): Promise<MigrateResult> {
  const dryRun = opts?.dryRun !== false; // default dry run
  const provider = getStorageProvider();
  const candidates = await inventoryCandidates();

  const result: MigrateResult = {
    dryRun,
    scanned: candidates.length,
    candidates: candidates.length,
    uploaded: 0,
    verified: 0,
    failed: [],
    skipped: 0,
  };

  if (dryRun) return result;

  for (const c of candidates) {
    try {
      if (await alreadyStored(c.sha256)) {
        result.skipped++;
        continue;
      }

      // Load bytes.
      let body: Buffer;
      if (c.source === "local_dir") {
        body = fs.readFileSync(path.join(process.cwd(), c.sourcePath));
      } else {
        const rows: any = await db.execute(sql`
          SELECT * FROM ${sql.identifier(c.table!)} WHERE id = ${c.rowId} LIMIT 1
        `);
        const list: any[] = Array.isArray(rows) ? rows : rows?.rows ?? [];
        const row = list[0];
        const blob = row?.blob ?? row?.data ?? row?.file_data ?? row?.content;
        if (!blob) throw new Error("blob bytes missing");
        body = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
      }

      // Sanity: bytes must match inventoried checksum.
      if (sha256Hex(body) !== c.sha256) {
        throw new Error(`source checksum drift for ${c.sourcePath} (source changed mid-run?)`);
      }

      const key = makeStorageKey({
        entityType: c.entityType,
        entityId: c.entityId,
        originalName: c.originalName,
      });

      const up = await provider.upload({
        key,
        body,
        mimeType: c.mimeType,
        immutable: c.immutable,
      });
      result.uploaded++;

      // Verify: re-download and compare checksums.
      const back = await provider.download(up.key);
      if (sha256Hex(back) !== c.sha256) {
        await provider.delete(up.key).catch(() => undefined);
        throw new Error(`checksum mismatch after upload for ${c.sourcePath}`);
      }
      result.verified++;

      // Record in stored_files.
      await db.execute(sql`
        INSERT INTO stored_files
          (original_name, storage_key, bucket, size_bytes, mime_type,
           checksum_sha256, entity_type, entity_id, is_immutable,
           source_kind, source_ref, uploaded_by)
        VALUES
          (${c.originalName}, ${up.key}, ${provider.bucket}, ${up.sizeBytes},
           ${c.mimeType}, ${c.sha256}, ${c.entityType}, ${String(c.entityId)},
           ${c.immutable}, ${c.source}, ${c.sourcePath}, ${opts?.uploadedBy ?? null})
        ON CONFLICT (checksum_sha256) DO NOTHING
      `);

      // Mark DB blob rows migrated (local files are left in place — explicit cleanup later).
      if (c.source === "db_blob") {
        await db.execute(sql`
          UPDATE ${sql.identifier(c.table!)}
          SET migrated_to_storage = TRUE
          WHERE id = ${c.rowId}
        `).catch(() => undefined);
      }
    } catch (e: any) {
      result.failed.push({ source: c.sourcePath, error: String(e?.message || e) });
    }
  }

  // Log the run.
  try {
    await db.execute(sql`
      INSERT INTO storage_migrations (dry_run, scanned, uploaded, verified, failed, skipped)
      VALUES (${dryRun}, ${result.scanned}, ${result.uploaded}, ${result.verified},
              ${result.failed.length}, ${result.skipped})
    `);
  } catch {
    // migration table may not exist yet — non-fatal
  }

  return result;
}

/** Storage usage rollup for the settings UI. */
export async function storageUsage(): Promise<{
  backend: string;
  bucket: string;
  totalFiles: number;
  totalBytes: number;
  immutableFiles: number;
  byEntity: Array<{ entityType: string; files: number; bytes: number }>;
}> {
  const provider = getStorageProvider();
  try {
    const rows: any = await db.execute(sql`
      SELECT entity_type,
             COUNT(*)::int AS files,
             COALESCE(SUM(size_bytes),0)::bigint AS bytes
      FROM stored_files
      GROUP BY entity_type
    `);
    const list: any[] = Array.isArray(rows) ? rows : rows?.rows ?? [];
    const totalFiles = list.reduce((a, r) => a + Number(r.files), 0);
    const totalBytes = list.reduce((a, r) => a + Number(r.bytes), 0);
    const imm: any = await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM stored_files WHERE is_immutable = TRUE
    `);
    const immList: any[] = Array.isArray(imm) ? imm : imm?.rows ?? [];
    return {
      backend: provider.backend,
      bucket: provider.bucket,
      totalFiles,
      totalBytes,
      immutableFiles: Number(immList[0]?.n ?? 0),
      byEntity: list.map((r) => ({
        entityType: String(r.entity_type),
        files: Number(r.files),
        bytes: Number(r.bytes),
      })),
    };
  } catch {
    return {
      backend: provider.backend,
      bucket: provider.bucket,
      totalFiles: 0,
      totalBytes: 0,
      immutableFiles: 0,
      byEntity: [],
    };
  }
}
