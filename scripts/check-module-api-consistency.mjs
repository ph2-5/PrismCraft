#!/usr/bin/env node

import { readdir, readFile } from "fs/promises";
import { join, relative, dirname } from "path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const MODULES_DIR = join(SRC, "modules");

const warnings = [];

function rel(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, "/");
}

async function getModuleDirs() {
  const entries = await readdir(MODULES_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => join(MODULES_DIR, e.name));
}

function extractExportsFromIndexTs(content) {
  const exports = new Set();
  const starExports = [];
  const normalized = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const joined = normalized.replace(/\n/g, " ");
  const reExportRegex = /export\s+(?:type\s+)?\{([^}]+)\}/g;
  let match;
  while ((match = reExportRegex.exec(joined)) !== null) {
    const names = match[1].split(",").map((n) => {
      const cleaned = n.trim().replace(/^type\s+/, "");
      const parts = cleaned.split(/\s+as\s+/);
      return parts[parts.length - 1].trim();
    });
    for (const name of names) {
      if (name) exports.add(name);
    }
  }
  const namedRegex = /export\s+(?:async\s+)?(?:const|function|class|type|interface)\s+(\w+)/g;
  while ((match = namedRegex.exec(joined)) !== null) {
    exports.add(match[1]);
  }
  // 收集 `export * from "..."` 形式的重新导出，稍后递归处理
  const starRegex = /export\s+\*\s+from\s+["']([^"']+)["']/g;
  while ((match = starRegex.exec(joined)) !== null) {
    starExports.push(match[1]);
  }
  return { exports, starExports };
}

// 递归解析 `export * from "..."` 引入的所有导出
async function resolveStarExports(moduleIndexPath, starPaths, visited = new Set()) {
  const allExports = new Set();
  for (const starPath of starPaths) {
    // 解析相对路径，自动尝试 index.ts / index.tsx
    const baseDir = starPath.startsWith(".")
      ? join(dirname(moduleIndexPath), starPath)
      : join(SRC, starPath);
    let targetPath;
    try {
      // 尝试直接作为文件
      targetPath = baseDir;
      await readFile(targetPath, "utf-8");
    } catch {
      try {
        targetPath = baseDir + ".ts";
        await readFile(targetPath, "utf-8");
      } catch {
        try {
          targetPath = baseDir + ".tsx";
          await readFile(targetPath, "utf-8");
        } catch {
          try {
            targetPath = join(baseDir, "index.ts");
            await readFile(targetPath, "utf-8");
          } catch {
            try {
              targetPath = join(baseDir, "index.tsx");
              await readFile(targetPath, "utf-8");
            } catch {
              continue; // 无法解析的路径，跳过
            }
          }
        }
      }
    }
    const resolved = targetPath.replace(/\\/g, "/");
    if (visited.has(resolved)) continue; // 防止循环
    visited.add(resolved);
    const subContent = await readFile(targetPath, "utf-8");
    const { exports: subExports, starExports: subStars } = extractExportsFromIndexTs(subContent);
    for (const name of subExports) allExports.add(name);
    // 递归处理子模块的 `export *`
    if (subStars.length > 0) {
      const nestedExports = await resolveStarExports(targetPath, subStars, visited);
      for (const name of nestedExports) allExports.add(name);
    }
  }
  return allExports;
}

function extractApiNamesFromModuleMd(content) {
  const result = { documented: new Set(), declared: new Set() };
  const apiSectionMatch = content.match(/##\s+公共\s*API[\s\S]*?(?=\n##\s|$)/i)
    || content.match(/##\s+Public\s*API[\s\S]*?(?=\n##\s|$)/i);
  if (!apiSectionMatch) return result;
  const apiSection = apiSectionMatch[0];

  const skipWords = new Set([
    "API", "签名", "说明", "类型", "描述", "用途", "路径", "职责", "子域", "Signature", "Description",
    "type", "const", "interface", "class", "function", "export", "import", "return", "void",
    "string", "number", "boolean", "undefined", "null", "true", "false",
    "Promise", "Array", "Map", "Set", "Partial", "Record", "Omit", "Pick",
    "React", "UseQueryResult", "UseMutationResult", "Result", "from", "string", "index",
  ]);

  // 1. Explicit documentation: list format `- `apiName`` and table format | `apiName` |
  // These are "documented" — used for both missing and stale checks
  const linePattern = /^-\s+`([a-zA-Z_][a-zA-Z0-9_]+)`/gm;
  let match;
  while ((match = linePattern.exec(apiSection)) !== null) {
    if (!skipWords.has(match[1])) result.documented.add(match[1]);
  }

  const tablePattern = /\|\s*`?([a-zA-Z_][a-zA-Z0-9_]+)`?\s*\|/g;
  while ((match = tablePattern.exec(apiSection)) !== null) {
    if (!skipWords.has(match[1])) result.documented.add(match[1]);
  }

  // 2. Inline code outside code blocks: `apiName`
  const textOutsideCodeBlocks = apiSection.replace(/```[\s\S]*?```/g, "");
  const inlineCodePattern = /`([a-zA-Z_][a-zA-Z0-9_]+)`/g;
  while ((match = inlineCodePattern.exec(textOutsideCodeBlocks)) !== null) {
    if (!skipWords.has(match[1])) result.documented.add(match[1]);
  }

  // 3. Code block declarations: only top-level names
  // These are "declared" — used only for missing documentation check, NOT for stale check
  // (because code blocks contain internal details like property names, parameter names, etc.)
  const codeBlocks = apiSection.match(/```[\s\S]*?```/g) || [];
  for (const block of codeBlocks) {
    const lines = block.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("```") || trimmed.startsWith("*")) continue;

      // Match: `apiName(` — function call or declaration
      const funcMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]+)\s*\(/);
      if (funcMatch && !skipWords.has(funcMatch[1])) {
        result.declared.add(funcMatch[1]);
        continue;
      }

      // Match: `apiName.something(` — service method call (extract service name)
      const serviceMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]+)\.[a-zA-Z]/);
      if (serviceMatch && !skipWords.has(serviceMatch[1])) {
        result.declared.add(serviceMatch[1]);
        continue;
      }

      // Match: `apiName:` or `apiName =` — constant/type declaration
      const constMatch = trimmed.match(/^(?:export\s+)?(?:type\s+|const\s+|interface\s+|class\s+)?([a-zA-Z_][a-zA-Z0-9_]+)\s*[:=]/);
      if (constMatch && !skipWords.has(constMatch[1])) {
        result.declared.add(constMatch[1]);
        continue;
      }
    }
  }

  return result;
}

async function checkModuleApiConsistency() {
  const moduleDirs = await getModuleDirs();

  for (const moduleDir of moduleDirs) {
    const moduleName = relative(MODULES_DIR, moduleDir);
    const indexPath = join(moduleDir, "index.ts");
    const mdPath = join(moduleDir, "MODULE.md");

    let indexContent;
    try {
      indexContent = await readFile(indexPath, "utf-8");
    } catch {
      continue;
    }

    const { exports: directExports, starExports } = extractExportsFromIndexTs(indexContent);
    // 递归解析 `export * from "..."` 引入的子模块导出
    const starResolvedExports = await resolveStarExports(indexPath, starExports);
    const actualExports = new Set([...directExports, ...starResolvedExports]);

    let mdContent;
    try {
      mdContent = await readFile(mdPath, "utf-8");
    } catch {
      continue;
    }

    const { documented, declared } = extractApiNamesFromModuleMd(mdContent);

    // Missing documentation: exported API not in documented (explicit) or declared (code block) names
    const allDocumented = new Set([...documented, ...declared]);
    const undocumented = [...actualExports].filter(
      (e) => !allDocumented.has(e) && !e.endsWith("Props") && !e.endsWith("Ref") && e !== "default"
    );

    // Stale documentation: documented (explicit list/table) API not in actual exports
    // Only check "documented" set (not "declared" from code blocks, which may contain internal details)
    const stale = [...documented].filter((e) => !actualExports.has(e));

    if (undocumented.length > 0) {
      warnings.push(
        `⚠️ ${moduleName}/MODULE.md: Missing documentation for exported APIs: ${undocumented.join(", ")}`
      );
    }

    if (stale.length > 0) {
      warnings.push(
        `⚠️ ${moduleName}/MODULE.md: Documents APIs not in index.ts: ${stale.join(", ")}`
      );
    }
  }
}

async function checkAiModuleGuideConsistency() {
  const aiModulesDir = join(ROOT, ".ai", "modules");
  const moduleDirs = await getModuleDirs();

  let aiEntries;
  try {
    aiEntries = await readdir(aiModulesDir, { withFileTypes: true });
  } catch {
    return;
  }

  const aiModuleNames = new Set(
    aiEntries.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name.replace(".md", ""))
  );

  const srcModuleNames = new Set(
    (await getModuleDirs()).map((d) => relative(MODULES_DIR, d))
  );

  for (const name of srcModuleNames) {
    if (!aiModuleNames.has(name)) {
      warnings.push(`⚠️ Module '${name}' exists in src/modules/ but has no .ai/modules/${name}.md guide`);
    }
  }

  for (const name of aiModuleNames) {
    if (!srcModuleNames.has(name)) {
      warnings.push(`⚠️ .ai/modules/${name}.md exists but module '${name}' not found in src/modules/`);
    }
  }
}

async function main() {
  console.log("🔍 Checking MODULE.md ↔ index.ts consistency...\n");

  await checkModuleApiConsistency();
  await checkAiModuleGuideConsistency();

  if (warnings.length > 0) {
    for (const w of warnings) {
      console.log(w);
    }
    console.log(`\nFound ${warnings.length} consistency warning(s)`);
    console.log("\nThese are warnings, not errors. Update MODULE.md or .ai/modules/ if they are stale.");
    process.exit(0);
  } else {
    console.log("✅ All MODULE.md files are consistent with index.ts exports");
    process.exit(0);
  }
}

main();
