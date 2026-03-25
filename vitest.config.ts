import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/*.test.tsx', 'src/**/*.spec.tsx', 'tests/**/*.test.ts', 'tests/**/*.spec.ts', 'tests/**/*.test.tsx', 'tests/**/*.spec.tsx'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/service/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['**/*.d.ts'],
    },
    testTimeout: 10000,
  },
});
