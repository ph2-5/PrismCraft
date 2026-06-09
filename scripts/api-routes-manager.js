const fs = require("fs");
const path = require("path");

const API_DIR = path.join(__dirname, "..", "src", "app", "api");
const DYNAMIC_ROUTES_DIR = path.join(
  __dirname,
  "..",
  "src",
  "app",
  "story",
  "beat",
  "$beatId",
);
const NEXT_DIR = path.join(__dirname, "..", ".next");

const DISABLED_SUFFIX = ".electron-build-disabled";

function cleanNextCache() {
  if (fs.existsSync(NEXT_DIR)) {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        fs.rmSync(NEXT_DIR, { recursive: true, force: true });
        console.log("[Build] Cleaned .next cache directory");
        return;
      } catch (err) {
        if (attempt < maxRetries) {
          console.warn(
            `[Build] Failed to clean .next cache (attempt ${attempt}/${maxRetries}): ${err.message}`,
          );
          const syncMs = 1000 * attempt;
          const end = Date.now() + syncMs;
          while (Date.now() < end) {}
        } else {
          console.warn(
            `[Build] Could not fully clean .next cache: ${err.message}`,
          );
          console.warn("[Build] Attempting to clean dev types only...");
          try {
            const devTypesDir = path.join(NEXT_DIR, "dev", "types");
            if (fs.existsSync(devTypesDir)) {
              fs.rmSync(devTypesDir, { recursive: true, force: true });
              console.log("[Build] Cleaned .next/dev/types directory");
            }
          } catch (_) {
            console.warn(
              "[Build] Could not clean .next/dev/types. Continuing anyway.",
            );
          }
        }
      }
    }
  }
}

function findFiles(dir, predicate) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(entryPath, predicate));
    } else if (predicate(entry.name)) {
      results.push(entryPath);
    }
  }
  return results;
}

function disableRoutes() {
  const apiRouteFiles = findFiles(
    API_DIR,
    (name) => name === "route.ts" || name === "route.js",
  );

  const dynamicRouteFiles = findFiles(
    DYNAMIC_ROUTES_DIR,
    (name) => name === "page.tsx" || name === "page.ts",
  );

  const allFiles = [
    ...apiRouteFiles.map((f) => ({ file: f, type: "API route" })),
    ...dynamicRouteFiles.map((f) => ({ file: f, type: "Dynamic route" })),
  ];

  let disabled = 0;
  let failed = 0;

  for (const { file, type } of allFiles) {
    const disabledPath = file + DISABLED_SUFFIX;
    if (fs.existsSync(disabledPath)) continue;
    try {
      fs.renameSync(file, disabledPath);
      disabled++;
    } catch (err) {
      failed++;
      console.error(`[Build] FAILED to disable ${type}: ${file}`);
      console.error(`[Build] Error: ${err.message}`);
      console.error(
        "[Build] Please close VS Code, dev servers, and other programs that may lock these files, then try again.",
      );
    }
  }

  console.log(
    `[Build] Disabled ${disabled} route file(s)` +
      (failed > 0 ? ` (${failed} failed)` : ""),
  );

  if (failed > 0) {
    console.error(
      "[Build] Cannot proceed with locked files. Aborting build.",
    );
    process.exit(1);
  }

  cleanNextCache();
}

function enableRoutes() {
  const apiDisabledFiles = findFiles(API_DIR, (name) =>
    name.endsWith(DISABLED_SUFFIX),
  );

  const dynamicDisabledFiles = findFiles(DYNAMIC_ROUTES_DIR, (name) =>
    name.endsWith(DISABLED_SUFFIX),
  );

  const allFiles = [
    ...apiDisabledFiles.map((f) => ({ file: f, type: "API route" })),
    ...dynamicDisabledFiles.map((f) => ({ file: f, type: "Dynamic route" })),
  ];

  let enabled = 0;
  let failed = 0;

  for (const { file, type } of allFiles) {
    const originalPath = file.slice(0, -DISABLED_SUFFIX.length);
    try {
      if (fs.existsSync(originalPath)) {
        fs.rmSync(file);
      } else {
        fs.renameSync(file, originalPath);
      }
      enabled++;
    } catch (err) {
      failed++;
      console.warn(`[Build] Could not restore ${type}: ${file}`);
      console.warn(`[Build] Error: ${err.message}`);
    }
  }

  console.log(
    `[Build] Restored ${enabled} route file(s)` +
      (failed > 0 ? ` (${failed} failed)` : ""),
  );
}

const command = process.argv[2];

if (command === "move") {
  disableRoutes();
} else if (command === "restore") {
  enableRoutes();
} else {
  console.error("Usage: node api-routes-manager.js <move|restore>");
  process.exit(1);
}
