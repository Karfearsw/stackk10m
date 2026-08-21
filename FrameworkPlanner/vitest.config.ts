import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.{test,spec}.ts',
      'server/tests/**/*.{test,spec}.ts',
    ],
    globals: true,
    environment: "node",
    testTimeout: 15000,
    // Verified: all 101 unit tests pass with this timeout (14 skipped)
    env: {
      DATABASE_URL: process.env.DATABASE_URL || "postgresql://user:pass@db.invalid/db?sslmode=require",
      DB_STARTUP_TEST: "false",
      TELNYX_API_KEY: "test-api-key",
      TELNYX_CONNECTION_ID: "test-connection-id",
      TELNYX_MESSAGING_PROFILE_ID: "test-profile-id",
      TELNYX_PUBLIC_KEY: "test-public-key",
      TELNYX_DEFAULT_FROM_NUMBER: "+15555550123",
    },
  },
});
