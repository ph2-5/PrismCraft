import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['tests/**', 'node_modules/**', 'dist/**', 'out/**', 'electron/dist/**', 'electron/src/**', 'src/__tests__/e2e/**'],
    setupFiles: ['./src/__tests__/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 2 },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/domain/**',
        'src/infrastructure/**',
        'src/modules/**',
        'src/shared/**',
      ],
      exclude: [
        '**/*.d.ts',
        '**/*.config.*',
        '**/__tests__/**',
        '**/node_modules/**',
        '**/index.ts',
        'src/domain/ports/',
        'src/modules/**/presentation/**',
        'src/shared/ui/**',
        'src/shared/presentation/**',
        'src/shared/types/**',
        'src/infrastructure/monitoring/**',
        'src/infrastructure/server/**',
        'src/infrastructure/database/**',
        'src/infrastructure/di/**',
        'src/infrastructure/network/**',
        'src/infrastructure/api/**',
      ],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
