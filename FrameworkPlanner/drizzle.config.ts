import { defineConfig } from "drizzle-kit";
import "dotenv/config";
import { config } from "dotenv";

// Force load from FrameworkPlanner/.env
config({ path: "./.env" });

console.log("DATABASE_URL loaded:", !!process.env.DATABASE_URL);
console.log("DATABASE_URL length:", process.env.DATABASE_URL?.length);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL missing");
}

function sanitizeDatabaseUrl(input: string): string {
  try {
    const u = new URL(input);
    const channelBinding = (u.searchParams.get("channel_binding") || "").toLowerCase();
    if (channelBinding === "require") {
      u.searchParams.delete("channel_binding");
      console.log("Removed channel_binding from URL");
      return u.toString();
    }
    return input;
  } catch {
    return input;
  }
}

const sanitized = sanitizeDatabaseUrl(process.env.DATABASE_URL);
console.log("Sanitized URL:", sanitized);

export default defineConfig({
  out: "./migrations",
  schema: "./server/shared-schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: sanitized,
  },
  // Increase timeout for Neon
  databaseConfig: {
    connectTimeoutSeconds: 60,
  }
});
