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
    pool: "forks",
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: [
        "src/domain/**/*.ts",
        "src/infrastructure/**/*.ts",
        "src/modules/**/*.ts",
        "src/shared/**/*.ts",
        "src/config/**/*.ts",
      ],
      exclude: [
        "src/__tests__/",
        "**/__tests__/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/index.ts",
        "src/domain/ports/",
        "src/modules/**/presentation/**",
        "src/modules/**/constants.ts",
        "src/shared/ui/**",
        "src/shared/presentation/**",
        "src/shared/types/**",
      ],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
        perFile: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
