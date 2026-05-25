import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['tests/**', 'node_modules/**', 'dist/**', '.next/**', 'electron/dist/**'],
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
        'electron/src/**',
      ],
      exclude: [
        '**/*.d.ts',
        '**/*.config.*',
        '**/__tests__/**',
        '**/node_modules/**',
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
