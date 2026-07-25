import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["novel-pipeline-llm-demo.spec.ts"],
  timeout: 20 * 60 * 1000, // 单测试 20 分钟超时（含 LLM 调用）
  expect: {
    timeout: 60_000,
  },
  retries: 0,
  workers: 1,
  use: {
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
    baseURL: "http://localhost:3000",
    actionTimeout: 60_000,
    navigationTimeout: 60_000,
  },
  reporter: [["list"]],
});
