/**
 * 原生模块版本锁定检查
 * 确保 package.json 中的原生模块使用精确版本号（不带 ^ 或 ~）
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const pkgPath = join(rootDir, "package.json");

const NATIVE_MODULES = [
  "better-sqlite3",
];

function isExactVersion(version) {
  if (!version) return false;
  return /^\d+\.\d+\.\d+$/.test(version);
}

function check() {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const errors = [];

  for (const mod of NATIVE_MODULES) {
    const depVersion = pkg.dependencies?.[mod];
    const devVersion = pkg.devDependencies?.[mod];
    const version = depVersion || devVersion;

    if (!version) {
      errors.push(`原生模块 ${mod} 未在 dependencies 或 devDependencies 中找到`);
      continue;
    }

    if (!isExactVersion(version)) {
      errors.push(`原生模块 ${mod} 版本 ${version} 不是精确锁定（应使用 x.y.z 格式，不带 ^ 或 ~）`);
    }
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, version] of Object.entries(allDeps)) {
    if (NATIVE_MODULES.includes(name)) continue;
    if (name.startsWith("@types/")) continue;
    if (version.includes(".node") || name.includes("sqlite") || name.includes("native")) {
      if (!isExactVersion(version)) {
        errors.push(`疑似原生模块 ${name} 版本 ${version} 未精确锁定，请确认是否需要添加到 NATIVE_MODULES 列表`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("❌ 原生模块版本检查失败：");
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log("✅ 原生模块版本检查通过");
}

check();
