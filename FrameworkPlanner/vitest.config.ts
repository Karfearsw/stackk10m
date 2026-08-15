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
