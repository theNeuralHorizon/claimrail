import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'lib/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json-summary', 'html'],
      // Only measure modules that are meant to be unit-tested. DB-bound code
      // (queries, API routes, auth actions, seed) is covered by manual +
      // integration testing; unit-testing those would require a test DB
      // scaffold larger than the modules themselves.
      include: [
        'lib/sla/**/*.ts',
        'lib/ai/**/*.ts',
        'lib/claims/**/*.ts',
        'lib/probes/engine.ts',
        'lib/probes/ssrf.ts',
        'lib/auth/password.ts',
      ],
      exclude: ['**/*.test.ts', '**/index.ts'],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
