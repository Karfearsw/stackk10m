import dotenv from "dotenv";
import { join } from "node:path";

dotenv.config({ path: join(process.cwd(), "FrameworkPlanner", ".env") });

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[k] = true;
    } else {
      args[k] = next;
      i++;
    }
  }
  const execute = Boolean(args["execute"]);
  return { execute };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { pool } = await import("../db.js");

  const preview = await pool.query(
    `
    SELECT count(*)::bigint AS c
    FROM user_cleanup_backups
    WHERE expires_at < NOW()
      AND restored_at IS NULL
  `
  );
  const count = parseInt(String(preview.rows?.[0]?.c ?? "0"), 10);
  console.log(`Expired, unrestored backups: ${count}`);

  if (!args.execute) {
    console.log("Dry-run only. Pass --execute to delete these rows.");
    return;
  }

  const del = await pool.query(
    `
    DELETE FROM user_cleanup_backups
    WHERE expires_at < NOW()
      AND restored_at IS NULL
  `
  );
  console.log(`Deleted rows: ${del.rowCount || 0}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

