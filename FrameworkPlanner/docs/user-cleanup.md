# User Cleanup (Non-@oceanluxe.org)

## Purpose

Remove all user accounts whose email address does not end with `@oceanluxe.org`, while ensuring:
- Review before deletion (dry-run report)
- Backup before removal (DB + on-disk export)
- Logged actions with timestamps (auth_audit_logs)
- Reversibility within 24 hours (restore script)
- Safety checks to avoid deleting privileged/system-critical accounts

## Data Sources

- Users table: `users`
- Backup store: `user_cleanup_backups` (JSON snapshots, expires after 24 hours)
- Audit log: `auth_audit_logs`

## Safety Rules (Strict)

The cleanup script excludes (and reports) any user that is:
- `is_super_admin = true`, or
- `role` in `admin|manager|owner` (case-insensitive), or
- a team owner (`teams.owner_id = users.id`)

If any protected user is also non-`@oceanluxe.org`, execution is blocked. Remediate manually (change their email to `@oceanluxe.org` or adjust privileges) before running deletion.

## Pre-flight (Dry Run)

Generates a review report listing:
- Candidates for deletion (non-`@oceanluxe.org`, not protected)
- Protected users and exclusion reasons
- Dependency counts for FK-linked tables affected by deletion

Run:

```bash
cd FrameworkPlanner
node ./node_modules/tsx/dist/cli.mjs server/scripts/user-cleanup-non-oceanluxe.ts --domain oceanluxe.org
```

Outputs:
- Console listing
- `FrameworkPlanner/backups/user-cleanup/<runId>/review.json` (unless `--no-files`)

## Execute (Hard Delete)

Execution is gated by confirmations:
- `--execute`
- `--confirm-domain oceanluxe.org`
- `--confirm-count <N>` where N matches the dry-run candidate count
- `--reassign-user-id <id>` (used to satisfy a RESTRICT FK by reassigning `playground_property_sessions.created_by`)

Run:

```bash
cd FrameworkPlanner
node ./node_modules/tsx/dist/cli.mjs server/scripts/user-cleanup-non-oceanluxe.ts \
  --domain oceanluxe.org \
  --execute \
  --confirm-domain oceanluxe.org \
  --confirm-count <N> \
  --reassign-user-id <OCEANLUXE_ADMIN_USER_ID>
```

Artifacts:
- DB: one row per deleted user in `user_cleanup_backups` (expires_at = now + 24h)
- File: `FrameworkPlanner/backups/user-cleanup/<runId>/backup.jsonl`
- Audit: `auth_audit_logs` entries with action `user_cleanup_delete`

## Restore (Within 24 Hours)

Restores a deleted user and associated deleted/updated rows from `user_cleanup_backups`.

By backup id:

```bash
cd FrameworkPlanner
node ./node_modules/tsx/dist/cli.mjs server/scripts/user-cleanup-restore.ts --backup-id <BACKUP_ID>
```

By run id + user id:

```bash
cd FrameworkPlanner
node ./node_modules/tsx/dist/cli.mjs server/scripts/user-cleanup-restore.ts --run-id <RUN_ID> --user-id <USER_ID>
```

Restore is blocked if:
- The backup is expired (past the 24-hour window), or
- Another account already uses the original email address, or
- A user already exists with the original user id

Audit:
- Writes `auth_audit_logs` entry with action `user_cleanup_restore`

## Purge Expired Backups (Optional)

Preview:

```bash
cd FrameworkPlanner
node ./node_modules/tsx/dist/cli.mjs server/scripts/user-cleanup-purge-expired.ts
```

Execute:

```bash
cd FrameworkPlanner
node ./node_modules/tsx/dist/cli.mjs server/scripts/user-cleanup-purge-expired.ts --execute
```

## Verification Checklist

- Dry-run shows the intended candidate set (all non-`@oceanluxe.org` users) and no missing users.
- Execute run summary reports:
  - Remaining non-`@oceanluxe.org` users = 0
  - Remaining oceanluxe users count matches expectations
- `auth_audit_logs` includes deletion entries for each deleted user.
- A sample restore completes successfully within 24 hours.

## Backup Handling / Compliance Notes

- The on-disk export contains user records (including password hashes) and must be treated as sensitive data.
- Do not commit `FrameworkPlanner/backups` to source control.
