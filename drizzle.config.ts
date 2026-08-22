import { defineConfig } from "drizzle-kit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frameworkRoot = path.resolve(__dirname, "FrameworkPlanner");
const candidates = [
  path.join(frameworkRoot, ".env.local"),
  path.join(frameworkRoot, ".env"),
];

for (const filePath of candidates) {
  if (!fs.existsSync(filePath)) continue;
  config({ path: filePath, override: false });
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

function sanitizeDatabaseUrl(input: string): string {
  try {
    const u = new URL(input);
    const channelBinding = (u.searchParams.get("channel_binding") || "").toLowerCase();
    if (channelBinding === "require") {
      u.searchParams.delete("channel_binding");
      return u.toString();
    }
    return input;
  } catch {
    return input;
  }
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: sanitizeDatabaseUrl(process.env.DATABASE_URL),
  },
});
