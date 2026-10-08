# Object Storage — Retention & Backup Policy (Ticket 18)

## Overview

All files (contracts, recordings, signed docs, uploads) live in S3-compatible
durable object storage, private by default. Downloads go through expiring signed
URLs (default 15 min TTL). Nothing is ever public.

## Environment separation

| Environment | Bucket env var | Notes |
|---|---|---|
| Production | `STORAGE_BUCKET` | Real customer data. Versioning ON. |
| Development | `STORAGE_BUCKET_DEV` | Falls back to `STORAGE_BUCKET` if unset — set it. |

Credentials (`STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY`) are
per-environment and live in env vars / the secret manager only. They are never
stored in the database, never logged, never returned by any API.

`STORAGE_ENDPOINT` points at non-AWS providers (Cloudflare R2, MinIO).
`STORAGE_REGION` defaults to `us-east-1`; R2 uses `auto`.

## Retention

| Category | Retention | Notes |
|---|---|---|
| Signed legal docs (`is_immutable=true`) | Indefinite | Write-once. Read-only to ordinary roles. Deletion requires super-admin + documented legal-hold release. |
| Call recordings | 13 months | Then auto-flagged for review before purge (statute-of-limitations window + margin). |
| General uploads (documents, media) | While linked | Orphaned files (no entity link) flagged after 90 days. |
| Migration sources | Until verified | Local files / DB blobs are NEVER deleted by the migrator. Cleanup is an explicit, owner-approved step after checksum verification. |

## Backup & recovery

1. **Bucket versioning**: ON for production. Accidental overwrites are recoverable.
2. **Cross-region replication**: recommended for the production bucket.
3. **Metadata**: Postgres (`stored_files`) is the source of truth for what exists;
   it is backed up on the normal database schedule.
4. **Restore drill**: quarterly — restore one immutable doc and one recording from
   version history, verify SHA-256 against `stored_files.checksum_sha256`.
5. **RTO/RPO targets**: RTO 4h, RPO 24h for file restores.

## Immutability enforcement

- `stored_files.is_immutable=true` marks signed legal docs.
- S3 objects are tagged `immutable=true` at upload.
- `LocalStorageProvider.delete()` refuses immutable objects (dev guard).
- API: only managers may set `immutable=true` on upload; there is no API to
  clear the flag or delete an immutable record (by design — requires direct DB
  + bucket access with owner approval).

## Migration runbook

1. Apply migration `0090_object_storage.sql` (adds `stored_files`, `storage_config`,
   `storage_migrations`; adds `migrated_to_storage` to blob tables).
2. Set `STORAGE_BUCKET` (+ region/credentials) in production; `STORAGE_BUCKET_DEV` in dev.
3. Settings → Storage tab → **Dry-run preview**. Review the candidate count.
4. **Migrate now**. Every file is re-downloaded and SHA-256 compared before the
   registry row is written. Mismatches abort that file; sources are never deleted.
5. Verify: spot-check downloads via signed URLs; compare checksums.
6. Only after verification: owner-approved cleanup of local sources (separate step,
   not automated).

## Monitoring

- Settings → Storage tab shows backend, bucket, usage by entity type, immutable count,
  pending migration count, and recent files.
- `storage_migrations` table logs every run (dry-run vs live, counts, failures).
- Alert if: backend falls back to `local` in production (boot refuses unless
  `STORAGE_ALLOW_LOCAL=true`), or pending-migration count grows unexpectedly.
