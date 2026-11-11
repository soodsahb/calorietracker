import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // /shared/schema.ts lives outside this package; make it resolve our zod copy.
    alias: { zod: fileURLToPath(new URL('./node_modules/zod', import.meta.url)) },
  },
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/validate.ts'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
