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
    // DB-dependent integration tests hit a slow remote Neon instance; the
    // vitest default (5s) is too tight and produces spurious timeouts.
    testTimeout: 60_000,
    // Importing server/routes pulls in the DB connection module which performs a
    // startup ping against a slow remote Neon instance; hooks need the same headroom.
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: "postgresql://neondb_owner:npg_7sAWdTo6cjpF@ep-rough-paper-an8epzvm.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
      DB_STARTUP_TEST: "false",
      TELNYX_API_KEY: "test-api-key",
      TELNYX_CONNECTION_ID: "test-connection-id",
      TELNYX_MESSAGING_PROFILE_ID: "test-profile-id",
      TELNYX_PUBLIC_KEY: "test-public-key",
      TELNYX_DEFAULT_FROM_NUMBER: "+15555550123",
    },
  },
});
