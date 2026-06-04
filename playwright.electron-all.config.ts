import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/electron",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/electron-results.json" }],
  ],
  use: {
    trace: "on-first-retry",
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    baseURL: "http://localhost:3000",
  },
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  outputDir: "test-results/electron-artifacts",
});
