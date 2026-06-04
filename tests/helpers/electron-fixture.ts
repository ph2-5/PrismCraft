import { test as base, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";

type ElectronTestFixture = {
  app: ElectronApplication;
  page: Page;
};

export const test = base.extend<ElectronTestFixture>({
  app: async ({}, use) => {
    const app = await electron.launch({
      args: ["./electron/dist/main.js"],
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
    });
    await use(app);
    await app.close();
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await use(page);
  },
});

export { expect } from "@playwright/test";
