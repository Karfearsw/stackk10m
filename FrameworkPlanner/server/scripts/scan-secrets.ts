/**
 * Ticket 03 — committed-secret scanner.
 *
 * Scans source-controlled files for high-signal secret patterns (connection
 * strings with embedded credentials, common API-key shapes). Reports findings
 * with redacted matches and exits non-zero when any are found.
 *
 * Usage: npm run security:scan-secrets
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Scan the whole repository, not just the app subtree, so committed secrets in
 * wrapper/docs/tooling files are caught too. Falls back to the working directory
 * when not inside a git checkout.
 */
function resolveScanRoot(): string {
  try {
    const top = execSync("git rev-parse --show-toplevel", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (top) return top;
  } catch {
    // not a git repo — fall through to cwd
  }
  return process.cwd();
}

const ROOT = resolveScanRoot();

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "dist-server", "build", "coverage", "test-results", "playwright-report"]);

const ALLOW_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".sql", ".yml", ".yaml", ".env", ".txt", ".example",
]);

interface Pattern {
  name: string;
  regex: RegExp;
  /** Optional: allow a line if it matches this (documentation/examples). */
  allow?: RegExp;
}

const PATTERNS: Pattern[] = [
  {
    name: "postgres connection string with credentials",
    // postgres:// or postgresql:// with user:password@host
    regex: /postgres(?:ql)?:\/\/[^/\s"'`@]+:[^/\s"'`@]+@[^\s"'`/]+/gi,
    allow: /(localhost|127\.0\.0\.1|0\.0\.0\.0|example\.com|user:pass|user:password|test:test|bad:bad|<[A-Z_]+>|PLACEHOLDER|CHANGEME)/i,
  },
  { name: "neon hosted database", regex: /@[a-z0-9-]+\.(?:c-\d+\.)?[a-z0-9-]*\.?aws\.neon\.tech\b/gi },
  {
    name: "neon role password",
    regex: /\bnpg_[A-Za-z0-9]{8,}\b/g,
    allow: /(PLACEHOLDER|CHANGEME|xxxx|<[A-Z_]+>|example|1234567890)/i,
  },
  { name: "stripe secret key", regex: /\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/g },
  {
    name: "telnyx api key",
    regex: /\bKEY[0-9A-Fa-f]{32}\b/g,
    allow: /(PLACEHOLDER|CHANGEME|xxxx|<[A-Z_]+>)/i,
  },
  { name: "aws access key id", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "github token", regex: /\bgh[ps]_[A-Za-z0-9]{36,}\b/g },
  {
    name: "session secret assignment",
    regex: /SESSION_SECRET\s*[=:]\s*["']?[A-Za-z0-9_-]{16,}/gi,
    allow: /(PLACEHOLDER|CHANGEME|your[-_][a-z-]*secret|<[A-Z_]+>|DO-NOT-USE|development-secret)/i,
  },
];

function redact(match: string): string {
  if (match.length <= 8) return "***";
  return `${match.slice(0, 4)}…${match.slice(-2)} (${match.length} chars)`;
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, out);
    } else {
      const dot = entry.lastIndexOf(".");
      const ext = dot >= 0 ? entry.slice(dot) : "";
      if (ALLOW_EXT.has(ext) || entry === ".env.example") out.push(full);
    }
  }
}

function main(): void {
  const files: string[] = [];
  walk(ROOT, files);

  const findings: Array<{ file: string; line: number; pattern: string; match: string }> = [];

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    // Skip the scanner itself and the guard test, which contain sample patterns,
    // plus test fixtures and .env examples that intentionally use dummy creds.
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (rel.endsWith("scan-secrets.ts") || rel.endsWith("env-guards.test.ts") || rel.endsWith("env.ts")) continue;
    if (rel.endsWith(".env.example") || rel.endsWith(".env.sample")) continue;
    // Playwright e2e specs are excluded; unit/integration tests are scanned so a
    // real secret pasted into an assertion is caught (placeholder-only via allow).
    if (/(^|\/)tests-e2e\//.test(rel)) continue;

    const lines = content.split(/\r?\n/);
    for (const pattern of PATTERNS) {
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        pattern.regex.lastIndex = 0;
        const m = pattern.regex.exec(line);
        if (!m) continue;
        if (pattern.allow && pattern.allow.test(line)) continue;
        findings.push({ file: rel, line: i + 1, pattern: pattern.name, match: redact(m[0]) });
      }
    }
  }

  if (findings.length === 0) {
    console.log("[scan-secrets] No committed secrets detected.");
    return;
  }

  console.error(`[scan-secrets] ${findings.length} potential committed secret(s) found:`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  [${f.pattern}]  ${f.match}`);
  }
  console.error("[scan-secrets] Rotate the exposed credential and move it into environment configuration.");
  process.exitCode = 1;
}

main();
