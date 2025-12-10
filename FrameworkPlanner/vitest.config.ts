import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.{test,spec}.ts',
    ],
    globals: true,
    environment: "node",
  },
});
