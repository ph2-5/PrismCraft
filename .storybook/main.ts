import type { StorybookConfig } from "@storybook/react-vite";
import path from "path";

/**
 * Task 3.1: Storybook 配置
 *
 * 使用 @storybook/react-vite builder（与项目 Vite 配置一致）。
 * 路径别名通过 viteFinal 注入，复用 src/tsconfig 的 @/* 和 @shared-logic/*。
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx|mdx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname, "../src"),
      "@shared-logic": path.resolve(__dirname, "../src/shared-logic"),
    };
    return config;
  },
};

export default config;
