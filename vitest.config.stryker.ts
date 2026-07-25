import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Task 3.1: Stryker 专用 vitest 配置
 *
 * Stryker 运行时使用此配置，与主 vitest.config.ts 区别：
 * - 不包含覆盖率配置（Stryker 自行计算）
 * - maxWorkers=1（Stryker 并发控制由自身管理）
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // 仅运行 mutate 目标对应的测试文件，避免 dry run 跑全量 8647 测试导致超时
    include: [
      'src/infrastructure/ai-providers/__tests__/model-capabilities.test.ts',
      'src/infrastructure/ai-providers/__tests__/capability-consistency.test.ts',
    ],
    exclude: ['tests/**', 'node_modules/**', 'out/**', 'electron/dist/**', 'electron/src/**', '.stryker-tmp/**'],
    setupFiles: ['./src/__tests__/setup.ts'],
    maxWorkers: 1,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared-logic': path.resolve(__dirname, './src/shared-logic'),
      '@huggingface/transformers': path.resolve(__dirname, './src/__tests__/mocks/huggingface-transformers-mock.ts'),
    },
  },
});
