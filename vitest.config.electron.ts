import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['electron/src/**/*.test.ts'],
    setupFiles: [],
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 2 },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['electron/src/plugins/**/*.ts'],
      exclude: [
        'electron/src/plugins/**/*.test.ts',
        'electron/src/plugins/**/__tests__/**',
        'electron/src/plugins/index.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './electron/src/shared'),
      '@domain': path.resolve(__dirname, './electron/src/domain'),
      '@shared-logic': path.resolve(__dirname, './src/shared-logic'),
    },
  },
});
