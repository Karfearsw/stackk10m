import { defineConfig } from "drizzle-kit";
import "dotenv/config";
import { migrationsDatabaseEnvNames, resolveDatabaseUrlFromEnv } from "./server/db-url.js";

const resolved = resolveDatabaseUrlFromEnv(migrationsDatabaseEnvNames);
if (!resolved.url) {
  throw new Error(`Database URL is required for migrations. Set one of: ${migrationsDatabaseEnvNames.join(", ")}`);
}

export default defineConfig({
  out: "./migrations",
  schema: "./server/shared-schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: resolved.url,
  },
});
