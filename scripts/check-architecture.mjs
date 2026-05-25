#!/usr/bin/env node

import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const violations = [];
const warnings = [];

async function glob(dir, pattern, results = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "__tests__") continue;
      await glob(full, pattern, results);
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

async function scanFile(filePath, checkFn) {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    checkFn(filePath, lineNum, line);
  }
}

function rel(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, "/");
}

async function checkBareSqlInModules() {
  const files = await glob(join(SRC, "modules"), /\.(ts|tsx)$/);
  const sqlCallPattern = /db\.(prepare|run|query|exec|all|get)\s*\(/;
  const sqlKeywordPattern = /\b(SELECT|INSERT|UPDATE|DELETE|FROM|INTO)\b/i;

  for (const file of files) {
    await scanFile(file, (fp, lineNum, line) => {
      if (sqlCallPattern.test(line) && sqlKeywordPattern.test(line)) {
        violations.push(`❌ ${rel(fp)}:${lineNum} - Bare SQL in module: ${line.trim()}`);
      }
    });
  }
}

async function checkDeepPathCrossModuleImports() {
  const files = await glob(join(SRC, "modules"), /\.(ts|tsx)$/);
  const deepImportPattern = /['"]@\/modules\/[^/]+\/[^/]+\/[^/]+/;

  for (const file of files) {
    await scanFile(file, (fp, lineNum, line) => {
      const match = line.match(deepImportPattern);
      if (match) {
        violations.push(`❌ ${rel(fp)}:${lineNum} - Deep cross-module import (use barrel): ${line.trim()}`);
      }
    });
  }
}

async function checkInfrastructureImportsInModules() {
  const files = await glob(join(SRC, "modules"), /\.(ts|tsx)$/);
  const infraImportPattern = /['"]@\/infrastructure\//;
  const diExceptionPattern = /['"]@\/infrastructure\/di['"]/;
  const typeOnlyPattern = /^\s*export\s+type\s|^\s*type\s+\w+\s*=\s*typeof\s+import\(|^\s*type\s+\w+\s*=\s*Pick<typeof\s+import\(/;

  for (const file of files) {
    await scanFile(file, (fp, lineNum, line) => {
      if (infraImportPattern.test(line) && !diExceptionPattern.test(line) && !typeOnlyPattern.test(line)) {
        violations.push(`❌ ${rel(fp)}:${lineNum} - Direct infrastructure import in module (use DI): ${line.trim()}`);
      }
    });
  }
}

async function checkInfrastructureImportsInShared() {
  const files = await glob(join(SRC, "shared"), /\.(ts|tsx)$/);
  const infraImportPattern = /['"]@\/infrastructure\//;

  for (const file of files) {
    await scanFile(file, (fp, lineNum, line) => {
      if (infraImportPattern.test(line)) {
        violations.push(`❌ ${rel(fp)}:${lineNum} - Infrastructure import in shared: ${line.trim()}`);
      }
    });
  }
}

async function checkModuleImportsInShared() {
  const files = await glob(join(SRC, "shared"), /\.(ts|tsx)$/);
  const moduleImportPattern = /['"]@\/modules\//;

  for (const file of files) {
    await scanFile(file, (fp, lineNum, line) => {
      if (moduleImportPattern.test(line)) {
        violations.push(`❌ ${rel(fp)}:${lineNum} - Module import in shared: ${line.trim()}`);
      }
    });
  }
}

async function checkDomainPurity() {
  const files = await glob(join(SRC, "domain"), /\.(ts|tsx)$/);
  const infraPattern = /['"]@\/infrastructure\//;
  const modulePattern = /['"]@\/modules\//;

  for (const file of files) {
    await scanFile(file, (fp, lineNum, line) => {
      if (infraPattern.test(line)) {
        violations.push(`❌ ${rel(fp)}:${lineNum} - Infrastructure import in domain: ${line.trim()}`);
      }
      if (modulePattern.test(line)) {
        violations.push(`❌ ${rel(fp)}:${lineNum} - Module import in domain: ${line.trim()}`);
      }
    });
  }
}

async function checkContractJsonConsistency() {
  const contractFiles = await glob(join(SRC, "modules"), /contract\.json$/);

  for (const contractPath of contractFiles) {
    let contract;
    try {
      const raw = await readFile(contractPath, "utf-8");
      contract = JSON.parse(raw);
    } catch {
      warnings.push(`⚠️ ${rel(contractPath)} - Invalid JSON`);
      continue;
    }

    const subdomainDir = join(contractPath, "..");
    const indexTsPath = join(subdomainDir, "index.ts");

    let indexContent;
    try {
      indexContent = await readFile(indexTsPath, "utf-8");
    } catch {
      continue;
    }

    if (!contract.publicAPI) continue;

    const allDeclaredApi = [
      ...(contract.publicAPI.hooks || []),
      ...(contract.publicAPI.services || []),
      ...(contract.publicAPI.components || []),
    ];

    for (const apiName of allDeclaredApi) {
      if (apiName === "index") continue;
      const exportPattern = new RegExp(
        `export\\s+(?:async\\s+)?(?:const|function|class|type|interface)\\s+${escapeRegex(apiName)}\\b|export\\s+(?:type\\s+)?\\{[^}]*\\b${escapeRegex(apiName)}\\b`
      );
      if (!exportPattern.test(indexContent)) {
        warnings.push(`⚠️ ${rel(contractPath)}: publicAPI declares '${apiName}' but not found in ${rel(indexTsPath)}`);
      }
    }

    if (contract.invariants && contract.invariants.length === 0) {
      warnings.push(`⚠️ ${rel(contractPath)}: invariants array is empty (should have at least 1 invariant)`);
    }
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  console.log("🔍 Scanning architecture violations...\n");

  await checkBareSqlInModules();
  await checkDeepPathCrossModuleImports();
  await checkInfrastructureImportsInModules();
  await checkInfrastructureImportsInShared();
  await checkModuleImportsInShared();
  await checkDomainPurity();
  await checkContractJsonConsistency();

  if (violations.length > 0) {
    for (const v of violations) {
      console.log(v);
    }
    console.log(`\nFound ${violations.length} violations`);
    process.exit(1);
  } else {
    console.log("✅ No architecture violations found");
  }

  if (warnings.length > 0) {
    console.log("");
    for (const w of warnings) {
      console.log(w);
    }
    console.log(`\nFound ${warnings.length} warning(s) — review and fix if needed`);
  } else {
    console.log("✅ No contract warnings found");
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

main();
