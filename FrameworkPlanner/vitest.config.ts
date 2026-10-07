import { defineConfig } from 'vitest/config';
import path from 'path';

// Test-only environment defaults. Credentials MUST come from the environment:
// never hardcode a database URL (or any secret) here. Provide a dedicated
// TEST_DATABASE_URL, or fall back to DATABASE_URL from the workspace env.
// Database-backed suites require one of these; without it they fail fast with a
// connection error instead of silently pointing at a shared/production instance.
const testEnv: Record<string, string> = {
  DB_STARTUP_TEST: "false",
  TELNYX_API_KEY: "test-api-key",
  TELNYX_CONNECTION_ID: "test-connection-id",
  TELNYX_MESSAGING_PROFILE_ID: "test-profile-id",
  TELNYX_PUBLIC_KEY: "test-public-key",
  TELNYX_DEFAULT_FROM_NUMBER: "+15555550123",
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (testDatabaseUrl) {
  testEnv.DATABASE_URL = testDatabaseUrl;
}

export default defineConfig({
  esbuild: {
    // Match the app's automatic JSX runtime so test files don't need React in scope.
    jsx: "automatic",
  },
  resolve: {
    // Mirror the vite/tsconfig "@" alias so client components are importable
    // in unit tests.
    alias: {
      "@": path.resolve(__dirname, "client/src"),
    },
  },
  test: {
    include: [
      'tests/**/*.{test,spec}.ts?(x)',
      'server/tests/**/*.{test,spec}.ts?(x)',
    ],
    globals: true,
    environment: "node",
    // DB-dependent integration tests hit a slow remote Neon instance; the
    // vitest default (5s) is too tight and produces spurious timeouts.
    testTimeout: 60_000,
    // Importing server/routes pulls in the DB connection module which performs a
    // startup ping against a slow remote Neon instance; hooks need the same headroom.
    hookTimeout: 60_000,
    env: testEnv,
  },
});
