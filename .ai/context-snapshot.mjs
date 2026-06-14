#!/usr/bin/env node

/**
 * AI Context Snapshot Generator
 *
 * 新 AI 会话开始时运行此脚本，生成当前代码状态的快速摘要。
 * 用法: node .ai/context-snapshot.mjs
 *
 * 输出:
 * - 最近修改的文件（git status）
 * - 未提交的变更摘要（git diff --stat）
 * - 当前分支
 * - TypeScript 编译状态
 * - 测试状态
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function run(cmd, silent = true) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf-8", stdio: silent ? "pipe" : "inherit" }).trim();
  } catch {
    return null;
  }
}

console.log("=== AI Context Snapshot ===\n");

// 1. Git status
const branch = run("git branch --show-current");
console.log(`Branch: ${branch || "unknown"}`);

const modified = run("git status --short");
if (modified) {
  const files = modified.split("\n").filter(Boolean);
  console.log(`\nModified files (${files.length}):`);
  files.slice(0, 20).forEach((f) => console.log(`  ${f}`));
  if (files.length > 20) console.log(`  ... and ${files.length - 20} more`);
} else {
  console.log("\nNo uncommitted changes.");
}

// 2. Recent diff stats
const diffStat = run("git diff --stat HEAD");
if (diffStat) {
  console.log("\nChange summary:");
  const lines = diffStat.split("\n");
  lines.slice(-3).forEach((l) => console.log(`  ${l}`));
}

// 3. Recent commits
const recentCommits = run("git log --oneline -5");
if (recentCommits) {
  console.log("\nRecent commits:");
  recentCommits.split("\n").forEach((l) => console.log(`  ${l}`));
}

// 4. Session notes (last 5 entries)
const sessionPath = resolve(root, ".ai/session-notes.md");
if (existsSync(sessionPath)) {
  const content = readFileSync(sessionPath, "utf-8");
  const entries = content.split("### [").slice(1, 6);
  if (entries.length > 0) {
    console.log("\nRecent session entries:");
    entries.forEach((entry) => {
      const firstLine = entry.split("\n")[0];
      console.log(`  [${firstLine}`);
    });
  }
}

// 5. Active work claims
const claimsPath = resolve(root, ".ai/work-claims.md");
if (existsSync(claimsPath)) {
  const content = readFileSync(claimsPath, "utf-8");
  const activeSection = content.split("## 活跃声明")[1]?.split("##")[0];
  if (activeSection && activeSection.trim() !== "（当前无活跃声明）" && activeSection.includes("[进行中]")) {
    console.log("\n⚠️ Active work claims detected:");
    activeSection.split("###").filter(Boolean).forEach((claim) => {
      if (claim.includes("[进行中]")) {
        const firstLine = claim.split("\n").find((l) => l.trim());
        if (firstLine) console.log(`  ${firstLine.trim()}`);
      }
    });
  } else {
    console.log("\nNo active work claims.");
  }
}

// 6. Typecheck status (quick)
console.log("\nTypecheck: ");
const tcResult = run("npx tsc --noEmit 2>&1 | tail -1");
if (tcResult === "" || tcResult === null) {
  console.log("  ✅ Clean");
} else {
  console.log(`  ⚠️ ${tcResult}`);
}

console.log("\n=== End of Snapshot ===");
