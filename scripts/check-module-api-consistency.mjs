#!/usr/bin/env node

import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

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
  const namedRegex = /export\s+(?:const|function|class|type|interface)\s+(\w+)/g;
  while ((match = namedRegex.exec(joined)) !== null) {
    exports.add(match[1]);
  }
  return exports;
}

function extractApiNamesFromModuleMd(content) {
  const names = new Set();
  const apiSectionMatch = content.match(/##\s+公共\s*API[\s\S]*?(?=\n##\s|$)/i)
    || content.match(/##\s+Public\s*API[\s\S]*?(?=\n##\s|$)/i);
  if (!apiSectionMatch) return names;
  const apiSection = apiSectionMatch[0];
  const linePattern = /^-\s+`([a-zA-Z][a-zA-Z0-9_]+)`/gm;
  let match;
  while ((match = linePattern.exec(apiSection)) !== null) {
    names.add(match[1]);
  }
  return names;
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

    const actualExports = extractExportsFromIndexTs(indexContent);

    let mdContent;
    try {
      mdContent = await readFile(mdPath, "utf-8");
    } catch {
      continue;
    }

    const documentedApis = extractApiNamesFromModuleMd(mdContent);

    const undocumented = [...actualExports].filter(
      (e) => !documentedApis.has(e) && !e.endsWith("Props") && !e.endsWith("Ref") && e !== "default"
    );

    const stale = [...documentedApis].filter((e) => !actualExports.has(e));

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
