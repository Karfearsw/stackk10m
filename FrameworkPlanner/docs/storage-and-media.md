# Document Storage & Media Uploads

Runbook for the OceanLuxe CRM storage layer: how documents and media are
stored, how to configure storage modes, what the media upload rules are, and
how SMS/MMS attachments behave.

## 1. Document vault — `DOCUMENT_STORAGE_MODE`

Documents (contracts, PDFs, listing docs) have metadata in Postgres (`documents`,
`document_links`, `vault_document_versions`) and bytes in a storage backend.

Supported values (case-insensitive, aliases accepted):

| Value | Aliases | Behavior |
|---|---|---|
| `auto` | _(default)_ | S3 when `DOCUMENTS_BUCKET` + `DOCUMENTS_REGION` are set, otherwise Postgres `vault_document_blobs` |
| `database` | `db` | Postgres blob store only |
| `object_storage` | `s3` | S3-compatible store only; fails if unconfigured |
| `dual` | — | S3 **primary** + Postgres **replica**; writes go to both, reads prefer S3 and fall back to the DB replica |

### Required environment variables

- **database**: none. `vault_document_blobs` is always available.
- **object_storage**: `DOCUMENTS_BUCKET`, `DOCUMENTS_REGION`
  (+ `DOCUMENTS_ENDPOINT` for MinIO/R2, `DOCUMENTS_ACCESS_KEY_ID`,
  `DOCUMENTS_SECRET_ACCESS_KEY` if not using default credential chain).
- **dual**: the same S3 variables. Without them, dual degrades to Postgres-only
  and **reports `s3_unconfigured`** — it never claims a healthy dual write.

### Readiness

`GET /api/comms/readiness` → `documentStorage` now includes `mode`,
`effective`, `primary`, `primaryReady`, `secondary`, `secondaryReady`, and
`replicationStatus`. The System tab shows these. In `dual` mode an unconfigured
or failed S3 primary shows as a **blocker**, not green.

### Validation & rollback

- `isDocumentVaultConfigured()` is always true (the DB is always there).
- **Dual-write failure handling**: if the S3 primary (the required target)
  fails, the upload is **rejected** — no fake success. If only the DB replica
  fails, the upload succeeds with `replicationStatus: "db_failed"` and the
  error is logged. To identify replication failures, search server logs for
  `[documentVault]` entries and check the System tab blocker text.
- **Rollback**: to stop using S3, set `DOCUMENT_STORAGE_MODE=database` (or
  remove the bucket envs with `auto`). Bytes written to S3 remain there; reads
  switch to Postgres. To migrate from S3 back to DB, re-upload or restore from
  the blob table if it was kept in dual mode.

## 2. Media uploads (images & video)

Used for internal records, opportunity/property media, team messages, and
SMS/MMS attachments.

- **Limits** (env-configurable, byte counts or suffixed values like `25mb`):
  - `MAX_IMAGE_UPLOAD_BYTES` — default 25 MB
  - `MAX_VIDEO_UPLOAD_BYTES` — default 250 MB
  - `MAX_MEDIA_UPLOAD_BYTES` — default max(image, video)
  - `MAX_MEDIA_ATTACHMENTS_PER_MESSAGE` — default 10
- **Allowed types**: images `image/jpeg`, `image/png`, `image/webp`,
  `image/gif`; video `video/mp4`, `video/3gpp`. Executables, HTML, SVG,
  archives, and unknown MIME types are rejected. Declared MIME must match
  magic bytes (server-side sniffing, no client trust).
- **Storage**: bytes go to `media_blobs` (Postgres) by default, or the same
  S3-compatible store as the document vault when `DOCUMENTS_*` is configured.
  Metadata lives in `media_assets`; `media_attachments` links assets to any
  entity (`lead`, `contact`, `opportunity`, `property`, `conversation`,
  `internal_message`, `internal_note`, `document`, `task`, `sms_message`).
- **Access**: every read/download/delete requires authentication and
  team-scoped ownership. Short-lived HMAC-signed share links
  (`POST /api/media/:id/share-link`, `/api/media/open/:token`) expire and can
  be revoked by deleting the asset. Never expose bucket credentials or raw
  storage keys to the browser.
- **Videos**: direct browser playback for MP4/3GPP. There is no transcoding
  pipeline yet — poster thumbnails are generated client-side via the video
  element; original files are preserved.
- **Delete**: soft delete (`deleted_at`); the byte payload is retained until a
  retention workflow is defined.

## 3. SMS/MMS attachments

When a user attaches media to an outbound SMS, the server plans delivery:

- **MMS** when the total payload is at or below `MMS_SAFE_MEDIA_BYTES`
  (default **614400 bytes / 600 KB** — the safe maximum across US carriers
  per Telnyx) **and** every file type is MMS-capable (JPEG/PNG/GIF/WebP
  images, MP4/3GP video). Telnyx fetches the `media_urls` (short-lived signed
  URLs) at send time.
- **Link fallback** when the media is too large for MMS or uses an unsupported
  type: the message is sent as plain SMS with a short-lived secure link, and
  the UI shows
  > "The media file is too large for standard MMS delivery, so it will be sent
  > as a secure link instead."

The delivery decision (`mms` vs `link_fallback`) is recorded on the message
metadata and on each `media_assets.delivery_mode`. Attachments are linked to
the outbound message via `media_attachments` (`sms_message` entity).

> Note: carrier MMS limits vary; 600 KB is the safe default across U.S.
> carriers. Enable Telnyx `mms_transcoding` on the messaging profile if you
> want Telnyx to resize borderline media instead of falling back to links.

## 4. Where media shows up

- **Communications Workspace → SMS tab** (`/workspace/communications`):
  attachment picker with MMS/link preview before send.
- **Internal Messages** (`/messages`): attach images/video to team messages;
  thumbnails render in the conversation.
- **Opportunity detail → Media tab**: gallery with upload, preview, download,
  share link, and delete.

## 5. API surface (summary)

- `POST /api/media/upload` (multipart: `file`, `entityType`, `entityId`, `role`)
- `GET /api/media?entityType=&entityId=` · `GET /api/media/:id`
- `GET /api/media/:id/preview` · `GET /api/media/:id/download`
- `DELETE /api/media/:id` · `POST /api/media/:id/share-link`
- `GET /api/media/open/:token` (public signed stream; also used by MMS)
- `POST /api/telephony/sms` now accepts `mediaIds: number[]`
- `POST /api/messages` now accepts `mediaIds: number[]` (internal messages)
