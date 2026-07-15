/**
 * Stryker 专用 vitest 配置（Task 3.1）
 *
 * 继承主 vitest.config.ts，但禁用覆盖率阈值。
 * Stryker 初始测试运行（dry run）会运行所有测试，
 * 若 vitest 因覆盖率阈值失败，Stryker 会误判为测试失败。
 */
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        enabled: false,
        thresholds: {
          branches: 0,
          functions: 0,
          lines: 0,
          statements: 0,
          perFile: false,
        },
      },
    },
  }),
);
