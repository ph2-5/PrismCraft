import { chromium } from "@playwright/test";
import { installElectronMock } from "./helpers/electron-mock";

const ALL_PAGES = ["/", "/characters", "/scenes", "/story", "/video-tasks", "/quick-generate", "/settings", "/asset-library"];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const jsErrors: { page: string; message: string }[] = [];
  const consoleErrors: { page: string; text: string }[] = [];
  const consoleWarnings: { page: string; text: string }[] = [];

  page.on("pageerror", (error) => {
    jsErrors.push({ page: page.url(), message: error.message });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ page: page.url(), text: msg.text() });
    }
    if (msg.type() === "warning") {
      consoleWarnings.push({ page: page.url(), text: msg.text() });
    }
  });

  await installElectronMock(page);

  for (const path of ALL_PAGES) {
    await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
  }

  console.log("=== JS ERRORS ===");
  console.log(jsErrors.length === 0 ? "  None!" : jsErrors.map(e => `[${e.page}] ${e.message}`).join("\n  "));

  console.log("\n=== CONSOLE ERRORS (filtered) ===");
  const filteredErrors = consoleErrors.filter((e) =>
    !e.text.includes("favicon") &&
    !e.text.includes("manifest") &&
    !e.text.includes("ResizeObserver") &&
    !e.text.includes("net::ERR") &&
    !e.text.includes("404") &&
    !e.text.includes("Failed to fetch") &&
    !e.text.includes("NetworkError") &&
    !e.text.includes("ERR_CONNECTION_REFUSED") &&
    !e.text.includes("localhost") &&
    !e.text.includes("[SyncSchema]") &&
    !e.text.includes("Schema update should be done")
  );
  if (filteredErrors.length === 0) {
    console.log("  None!");
  } else {
    const grouped = new Map<string, number>();
    for (const e of filteredErrors) {
      const key = e.text.substring(0, 120);
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }
    for (const [key, count] of grouped) {
      console.log(`  [x${count}] ${key}`);
    }
  }

  console.log("\n=== CONSOLE WARNINGS (filtered) ===");
  const filtered = consoleWarnings.filter((e) =>
    !e.text.includes("favicon") &&
    !e.text.includes("manifest") &&
    !e.text.includes("ResizeObserver") &&
    !e.text.includes("DevTools") &&
    !e.text.includes("downloadable") &&
    !e.text.includes("react-") &&
    e.text.length > 5
  );

  if (filtered.length === 0) {
    console.log("  None!");
  } else {
    const grouped = new Map<string, number>();
    for (const e of filtered) {
      const key = e.text.substring(0, 80);
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }
    for (const [key, count] of grouped) {
      console.log(`  [x${count}] ${key}`);
    }
  }

  console.log(`\n=== TOTAL: ${jsErrors.length} JS errors, ${filteredErrors.length}/${consoleErrors.length} console errors, ${filtered.length}/${consoleWarnings.length} filtered warnings ===`);

  await browser.close();
})();
