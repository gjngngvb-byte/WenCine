import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    coverage: { reporter: ['text', 'html'], include: ['apps/*/src/**', 'packages/*/src/**'] },
  },
});
