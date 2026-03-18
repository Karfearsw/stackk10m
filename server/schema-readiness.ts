import crypto from "node:crypto";
import { pool } from "./db.js";

type SchemaReadiness =
  | { ok: true; checkedAt: string }
  | {
      ok: false;
      checkedAt: string;
      kind: "db_unavailable" | "schema_missing";
      message: string;
      code: string | null;
      missing: string[];
    };

let cached: { value: SchemaReadiness; expiresAt: number } | null = null;

function nowIso() {
  return new Date().toISOString();
}

function isDbConnectivityError(error: any): boolean {
  const code = error?.code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT") return true;
  if (code === "57P01" || code === "57P02" || code === "57P03") return true;
  if (code === "53300" || code === "08000" || code === "08003" || code === "08006" || code === "08001") return true;
  if (code === "ENETUNREACH" || code === "EHOSTUNREACH") return true;
  return false;
}

function log(level: "info" | "warn" | "error", payload: Record<string, unknown>) {
  const line = JSON.stringify({ ts: nowIso(), event: "schema", ...payload });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

async function checkSchemaOnce(): Promise<SchemaReadiness> {
  const checkedAt = nowIso();
  const missing: string[] = [];
  try {
    if (!String(process.env.DATABASE_URL || "").trim()) {
      return {
        ok: false,
        checkedAt,
        kind: "db_unavailable",
        message: "DATABASE_URL is not set",
        code: null,
        missing,
      };
    }

    const reqId = crypto.randomUUID();
    const leadsRes = await pool.query("select to_regclass('public.leads') as reg", []);
    if (!String(leadsRes?.rows?.[0]?.reg || "").trim()) missing.push("table:leads");

    const sourceRes = await pool.query(
      "select 1 as ok from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'source' limit 1",
      [],
    );
    if (!sourceRes?.rows?.length) missing.push("column:leads.source");

    if (missing.length) {
      log("error", { kind: "missing", missing, requestId: reqId });
      return {
        ok: false,
        checkedAt,
        kind: "schema_missing",
        message: "Database schema is not ready",
        code: null,
        missing,
      };
    }
    return { ok: true, checkedAt };
  } catch (e: any) {
    const code = e?.code ? String(e.code) : null;
    const isConn = isDbConnectivityError(e);
    log("error", { kind: "check_failed", message: String(e?.message || e), code, connectivity: isConn });
    return {
      ok: false,
      checkedAt,
      kind: isConn ? "db_unavailable" : "schema_missing",
      message: isConn ? "Database is unavailable" : "Database schema check failed",
      code,
      missing,
    };
  }
}

export async function getSchemaReadiness(): Promise<SchemaReadiness> {
  const ttlMs = 30_000;
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await checkSchemaOnce();
  cached = { value, expiresAt: now + ttlMs };
  return value;
}

export function schemaFixInstructions() {
  return {
    drizzlePush: "npm --prefix FrameworkPlanner run db:push",
  };
}

