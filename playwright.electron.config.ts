import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["electron-integration.spec.ts", "electron-pages.spec.ts"],
  timeout: 60000,
  retries: 0,
  use: {
    trace: "on-first-retry",
    baseURL: "http://localhost:3000",
  },
});
