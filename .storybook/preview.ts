import type { Preview } from "@storybook/react";
import "../src/app/globals.css";

/**
 * Task 3.1: Storybook 全局预览配置
 *
 * 加载项目全局样式（globals.css），使 Story 视觉与实际应用一致。
 * 主题变量（CSS variables）由 globals.css 定义，Story 可直接使用 var(--primary) 等。
 */
const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "padded",
  },
};

export default preview;
