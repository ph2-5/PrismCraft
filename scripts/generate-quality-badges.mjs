/**
 * generate-quality-badges.mjs
 *
 * 自动统计质量指标并同步到 README.md（Tests badge + 质量指标表）。
 *
 * 背景：README 中的测试数/文件数/i18n 键曾出现手工维护导致的失真
 * （如迁移版本 v4→v12、测试数落后于 CHANGELOG），本脚本从源码直接
 * 统计，从机制上杜绝失真。
 *
 * 用法：
 *   node scripts/generate-quality-badges.mjs            # 校验模式：不一致则报错（供 CI）
 *   node scripts/generate-quality-badges.mjs --fix      # 修复模式：直接更新 README.md
 *
 * 统计口径（与测试/文档保持一致）：
 *   - 渲染进程测试用例：src 下匹配行首 (it|test)( 的行数（*.ts/*.tsx）
 *   - Electron 测试用例：electron/src 下匹配行首 (it|test)( 的行数（*.ts）
 *   - 测试文件数：*.test.ts / *.test.tsx 文件计数
 *   - i18n 键：src/shared/constants/messages.ts 中 "key": 键定义行数
 *   - Schema 版本：electron/src/database/migrations.ts 的 CURRENT_SCHEMA_VERSION
 *
 * 依赖：仅 Node 内置模块（fs/path），零外部依赖。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README_PATH = path.join(ROOT, "README.md");
const MESSAGES_PATH = path.join(ROOT, "src", "shared", "constants", "messages.ts");
const MIGRATIONS_PATH = path.join(ROOT, "electron", "src", "database", "migrations.ts");

const FIX = process.argv.includes("--fix");

/** 递归收集目录下所有匹配文件（默认扩展名集合） */
function collectFiles(dir, exts) {
  const results = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue; // 目录不存在则跳过
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        // 跳过 node_modules / dist / out 等产物目录
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "out" || entry.name === "release") continue;
        stack.push(full);
      } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
        results.push(full);
      }
    }
  }
  return results;
}

/** 统计匹配正则的行数（按行匹配，与 grep 口径一致） */
function countLines(files, pattern) {
  const re = new RegExp(pattern);
  let count = 0;
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      for (const line of content.split("\n")) {
        if (re.test(line)) count += 1;
      }
    } catch {
      // 忽略不可读文件
    }
  }
  return count;
}

function extractSchemaVersion() {
  try {
    const content = fs.readFileSync(MIGRATIONS_PATH, "utf-8");
    const match = content.match(/CURRENT_SCHEMA_VERSION\s*=\s*(\d+)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function extractI18nKeys() {
  try {
    const content = fs.readFileSync(MESSAGES_PATH, "utf-8");
    let count = 0;
    for (const line of content.split("\n")) {
      // 匹配形如 "common.save": "..." 的键定义行
      if (/^\s*"[A-Za-z0-9_.]+"\s*:/.test(line)) count += 1;
    }
    return count;
  } catch {
    return null;
  }
}

// ─── 统计 ─────────────────────────────────────────────────────────────────────
const rendererTsFiles = collectFiles(path.join(ROOT, "src"), [".ts", ".tsx"]);
const electronTsFiles = collectFiles(path.join(ROOT, "electron", "src"), [".ts"]);

const rendererTests = countLines(rendererTsFiles, "^\\s*(it|test)\\(");
const electronTests = countLines(electronTsFiles, "^\\s*(it|test)\\(");
const rendererTestFiles = collectFiles(path.join(ROOT, "src"), [".test.ts", ".test.tsx"]).length;
const electronTestFiles = collectFiles(path.join(ROOT, "electron", "src"), [".test.ts"]).length;
const i18nKeys = extractI18nKeys();
const schemaVersion = extractSchemaVersion();
const totalTests = rendererTests + electronTests;

const metrics = {
  rendererTests,
  electronTests,
  rendererTestFiles,
  electronTestFiles,
  i18nKeys,
  schemaVersion,
  totalTests,
};

// ─── 报告 ─────────────────────────────────────────────────────────────────────
function formatReport() {
  return [
    `渲染进程测试用例: ${rendererTests}（${rendererTestFiles} 文件）`,
    `Electron 测试用例: ${electronTests}（${electronTestFiles} 文件）`,
    `测试合计: ${totalTests}`,
    `i18n 键: ${i18nKeys ?? "?"}`,
    `Schema 版本: ${schemaVersion ?? "?"}`,
  ].join("\n");
}

console.log(formatReport());

// ─── 同步 README ──────────────────────────────────────────────────────────────
let readme;
try {
  readme = fs.readFileSync(README_PATH, "utf-8");
} catch {
  console.error("[generate-quality-badges] 无法读取 README.md");
  process.exit(1);
}

const expected = {
  badge: `[![Tests](https://img.shields.io/badge/tests-${totalTests}-brightgreen)](docs/DEVELOPMENT.md)`,
  unitLine: `| 单元测试 | ${rendererTests}+（渲染进程，${rendererTestFiles} 文件） |`,
  electronLine: `| Electron 测试 | ${electronTests}+（${electronTestFiles} 文件） |`,
  i18nLine: `| i18n 键 | ${i18nKeys} |`,
};

const badgeRe = /\[!\[Tests\]\(https:\/\/img\.shields\.io\/badge\/tests-\d+(?:%2B)?-brightgreen\)\]\(docs\/DEVELOPMENT\.md\)/;
const unitRe = /\| 单元测试 \| \d+\+（渲染进程，\d+ 文件） \|/;
const electronRe = /\| Electron 测试 \| \d+\+（\d+ 文件） \|/;
const i18nRe = /\| i18n 键 \| \d+ \|/;

const issues = [];
if (!badgeRe.test(readme)) issues.push("Tests badge 缺失或格式不匹配");
else if (!readme.includes(expected.badge)) issues.push(`Tests badge 期望 ${expected.badge}`);
if (!unitRe.test(readme)) issues.push("单元测试行缺失或格式不匹配");
else if (!readme.includes(expected.unitLine)) issues.push(`单元测试行期望 "${expected.unitLine}"`);
if (!electronRe.test(readme)) issues.push("Electron 测试行缺失或格式不匹配");
else if (!readme.includes(expected.electronLine)) issues.push(`Electron 测试行期望 "${expected.electronLine}"`);
if (!i18nRe.test(readme)) issues.push("i18n 键行缺失或格式不匹配");
else if (i18nKeys !== null && !readme.includes(expected.i18nLine)) issues.push(`i18n 键行期望 "${expected.i18nLine}"`);

if (issues.length === 0) {
  console.log("\n[generate-quality-badges] ✅ README 质量指标与实际一致");
  process.exit(0);
}

if (!FIX) {
  console.error("\n[generate-quality-badges] ❌ README 质量指标失真：");
  for (const issue of issues) console.error(`  - ${issue}`);
  console.error("\n请运行 `node scripts/generate-quality-badges.mjs --fix` 自动修正。");
  process.exit(1);
}

// 修复模式：逐项替换
let updated = readme;
if (badgeRe.test(updated)) updated = updated.replace(badgeRe, expected.badge);
if (unitRe.test(updated)) updated = updated.replace(unitRe, expected.unitLine);
if (electronRe.test(updated)) updated = updated.replace(electronRe, expected.electronLine);
if (i18nRe.test(updated) && i18nKeys !== null) updated = updated.replace(i18nRe, expected.i18nLine);

fs.writeFileSync(README_PATH, updated, "utf-8");
console.log("\n[generate-quality-badges] ✅ 已修正 README.md：");
for (const issue of issues) console.log(`  - ${issue}`);
