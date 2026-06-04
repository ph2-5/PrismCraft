import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "electron-pages.spec.ts",
  timeout: 60000,
  retries: 0,
  use: {
    trace: "on-first-retry",
  },
});
