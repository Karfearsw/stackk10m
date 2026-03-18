import { defineConfig } from "drizzle-kit";
import "dotenv/config";

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
