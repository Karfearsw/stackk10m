import dotenv from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const frameworkRoot = fileURLToPath(new URL("../..", import.meta.url));

dotenv.config({ path: join(frameworkRoot, ".env") });

function splitSqlStatements(input: string) {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  const s = String(input || "");
  while (i < s.length) {
    const ch = s[i];
    const next = i + 1 < s.length ? s[i + 1] : "";

    if (inLineComment) {
      cur += ch;
      if (ch === "\n") inLineComment = false;
      i += 1;
      continue;
    }

    if (inBlockComment) {
      cur += ch;
      if (ch === "*" && next === "/") {
        cur += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }

    if (!inSingle && !inDouble && !dollarTag) {
      if (ch === "-" && next === "-") {
        cur += ch + next;
        i += 2;
        inLineComment = true;
        continue;
      }
      if (ch === "/" && next === "*") {
        cur += ch + next;
        i += 2;
        inBlockComment = true;
        continue;
      }
    }

    if (!inDouble && !dollarTag && ch === "'") {
      cur += ch;
      if (inSingle && next === "'") {
        cur += next;
        i += 2;
        continue;
      }
      inSingle = !inSingle;
      i += 1;
      continue;
    }

    if (!inSingle && !dollarTag && ch === '"') {
      cur += ch;
      if (inDouble && next === '"') {
        cur += next;
        i += 2;
        continue;
      }
      inDouble = !inDouble;
      i += 1;
      continue;
    }

    if (!inSingle && !inDouble && ch === "$") {
      const tail = s.slice(i);
      const m = tail.match(/^\$[A-Za-z0-9_]*\$/);
      if (m?.[0]) {
        const tag = m[0];
        cur += tag;
        i += tag.length;
        if (dollarTag === tag) dollarTag = null;
        else if (!dollarTag) dollarTag = tag;
        continue;
      }
    }

    if (!inSingle && !inDouble && !dollarTag && ch === ";") {
      const stmt = cur.trim();
      if (stmt) out.push(stmt);
      cur = "";
      i += 1;
      continue;
    }

    cur += ch;
    i += 1;
  }

  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

export async function applyMigrations() {
  const dir = join(frameworkRoot, "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Migrations directory: ${dir} (${files.length} .sql files)`);

  const { pool } = await import("../db.js");
  for (const f of files) {
    const p = join(dir, f);
    const sql = readFileSync(p, "utf8");
    console.log(`Applying migration: ${f}`);
    try {
      const statements = splitSqlStatements(sql);
      await pool.query("BEGIN");
      for (let idx = 0; idx < statements.length; idx += 1) {
        const stmt = statements[idx];
        try {
          await pool.query(stmt);
        } catch (e: any) {
          const code = String(e?.code || "");
          const msg = String(e?.message || "");
          const alreadyExists =
            code === "42710" ||
            code === "42P07" ||
            code === "42701" ||
            /already exists/i.test(msg);
          if (alreadyExists) continue;
          const preview = stmt.replace(/\s+/g, " ").slice(0, 220);
          console.error(
            JSON.stringify({
              ts: new Date().toISOString(),
              event: "migration_failed",
              file: f,
              statementIndex: idx,
              code: code || null,
              message: msg || null,
              preview,
            }),
          );
          throw e;
        }
      }
      await pool.query("COMMIT");
      console.log(`Applied: ${f}`);
    } catch (e: any) {
      try {
        await pool.query("ROLLBACK");
      } catch {}
      const code = String(e?.code || "");
      const msg = String(e?.message || "");
      const alreadyExists =
        code === "42710" ||
        code === "42P07" ||
        code === "42701" ||
        /already exists/i.test(msg);
      if (alreadyExists) {
        console.log(`Skipped: ${f}`);
        continue;
      }
      throw e;
    }
  }
}

function isMain() {
  const self = resolve(fileURLToPath(import.meta.url));
  const argv = process.argv[1] ? resolve(process.argv[1]) : "";
  return self === argv;
}

if (isMain()) {
  applyMigrations()
    .then(() => {
      console.log("All migrations applied");
    })
    .catch((e) => {
      console.error("Migration failed", e);
      process.exitCode = 1;
    });
}
