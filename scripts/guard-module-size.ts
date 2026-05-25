#!/usr/bin/env tsx
/**
 * 模块大小守护
 *
 * 检查所有子域的代码行数，当超过阈值时发出警告或阻断。
 * 可作为 CI 前置检查使用。
 */

import * as path from "path";
import * as fs from "fs";

const MODULES_DIR = path.resolve(process.cwd(), "src/modules");
const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_FILES = 20;

interface SizeReport {
  module: string;
  subdomain: string;
  lines: number;
  files: number;
  maxLines: number;
  maxFiles: number;
  exceeded: boolean;
}

function countLines(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += countLines(full);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      total += fs.readFileSync(full, "utf-8").split("\n").length;
    }
  }
  return total;
}

function countFiles(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += countFiles(full);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      total++;
    }
  }
  return total;
}

function loadMaxLines(subdomainPath: string): number {
  const contractPath = path.join(subdomainPath, "contract.json");
  if (fs.existsSync(contractPath)) {
    try {
      const contract = JSON.parse(fs.readFileSync(contractPath, "utf-8"));
      return contract.constraints?.maxLines || DEFAULT_MAX_LINES;
    } catch {
      // ignore
    }
  }
  return DEFAULT_MAX_LINES;
}

function loadMaxFiles(subdomainPath: string): number {
  const contractPath = path.join(subdomainPath, "contract.json");
  if (fs.existsSync(contractPath)) {
    try {
      const contract = JSON.parse(fs.readFileSync(contractPath, "utf-8"));
      return contract.constraints?.maxFiles || DEFAULT_MAX_FILES;
    } catch {
      // ignore
    }
  }
  return DEFAULT_MAX_FILES;
}

function scan(): SizeReport[] {
  const reports: SizeReport[] = [];

  for (const moduleEntry of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!moduleEntry.isDirectory()) continue;
    const modulePath = path.join(MODULES_DIR, moduleEntry.name);

    for (const subEntry of fs.readdirSync(modulePath, { withFileTypes: true })) {
      if (!subEntry.isDirectory()) continue;
      const subdomainPath = path.join(modulePath, subEntry.name);
      if (!fs.existsSync(path.join(subdomainPath, "contract.json"))) continue;

      const lines = countLines(subdomainPath);
      const files = countFiles(subdomainPath);
      const maxLines = loadMaxLines(subdomainPath);
      const maxFiles = loadMaxFiles(subdomainPath);

      reports.push({
        module: moduleEntry.name,
        subdomain: subEntry.name,
        lines,
        files,
        maxLines,
        maxFiles,
        exceeded: lines > maxLines || files > maxFiles,
      });
    }
  }

  return reports.sort((a, b) => b.lines - a.lines);
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const reports = scan();

  console.log("📏 模块大小扫描结果\n");
  console.log(`${"Module/Subdomain".padEnd(40)} ${"Lines".padStart(8)} ${"Files".padStart(6)} ${"Limit".padStart(8)} ${"Status"}`);
  console.log("-".repeat(75));

  let hasViolation = false;

  for (const r of reports) {
    const name = `${r.module}/${r.subdomain}`;
    const lineStatus = r.lines > r.maxLines ? `🔴 ${r.lines}/${r.maxLines}` : `🟢 ${r.lines}/${r.maxLines}`;
    const fileStatus = r.files > r.maxFiles ? `🔴 ${r.files}/${r.maxFiles}` : `🟢 ${r.files}/${r.maxFiles}`;
    const status = r.exceeded ? "❌ EXCEEDED" : "✅ OK";

    console.log(`${name.padEnd(40)} ${lineStatus.padStart(16)} ${fileStatus.padStart(14)} ${status}`);

    if (r.exceeded) hasViolation = true;
  }

  console.log();

  if (hasViolation) {
    console.log("⚠️  部分子域超出大小限制，建议拆分或调整阈值。");
    if (strict) {
      console.log("🚫 --strict 模式已启用，构建被阻断。");
      process.exit(1);
    }
  } else {
    console.log("✅ 所有子域大小在限制范围内。");
  }
}

main();
