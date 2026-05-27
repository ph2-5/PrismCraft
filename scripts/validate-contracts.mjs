#!/usr/bin/env node

import { readdir, readFile, readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const MODULES_DIR = join(ROOT, "src/modules");

const violations = [];
const warnings = [];

function rel(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, "/");
}

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

function countLinesInDir(dir) {
  let total = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += countLinesInDir(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        total += readFileSync(full, "utf-8").split("\n").length;
      }
    }
  } catch {}
  return total;
}

function countFilesInDir(dir) {
  let total = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += countFilesInDir(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        total++;
      }
    }
  } catch {}
  return total;
}

function extractExports(content) {
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

async function checkContractStructure() {
  const contractFiles = await glob(MODULES_DIR, /contract\.json$/);

  for (const contractPath of contractFiles) {
    let contract;
    try {
      const raw = await readFile(contractPath, "utf-8");
      contract = JSON.parse(raw);
    } catch {
      violations.push(`❌ ${rel(contractPath)} - Invalid JSON`);
      continue;
    }

    const subdomainDir = join(contractPath, "..");
    const indexPath = join(subdomainDir, "index.ts");

    let indexContent;
    try {
      indexContent = await readFile(indexPath, "utf-8");
    } catch {
      continue;
    }

    if (!contract.invariants) {
      warnings.push(`⚠️ ${rel(contractPath)}: missing 'invariants' field (AI needs invariants to respect business rules)`);
    } else if (contract.invariants.length === 0) {
      warnings.push(`⚠️ ${rel(contractPath)}: invariants array is empty (should have at least 1 invariant)`);
    }

    const provides = contract.provides || contract.publicAPI;
    if (!provides) continue;

    const allDeclared = [
      ...(provides.functions || provides.hooks || []),
      ...(provides.types || provides.services || []),
      ...(provides.constants || provides.components || []),
    ];

    if (allDeclared.length === 0) continue;

    const actualExports = extractExports(indexContent);

    for (const apiName of allDeclared) {
      if (apiName === "index") continue;
      if (!actualExports.has(apiName)) {
        warnings.push(`⚠️ ${rel(contractPath)}: declares '${apiName}' but not found in ${rel(indexPath)}`);
      }
    }

    const constraints = contract.constraints || {};
    const lines = countLinesInDir(subdomainDir);
    if (constraints.maxLines && lines > constraints.maxLines) {
      violations.push(`❌ ${rel(contractPath)}: ${lines} lines exceeds maxLines=${constraints.maxLines}`);
    }

    const fileCount = countFilesInDir(subdomainDir);
    if (constraints.maxFiles && fileCount > constraints.maxFiles) {
      violations.push(`❌ ${rel(contractPath)}: ${fileCount} files exceeds maxFiles=${constraints.maxFiles}`);
    }

    if (constraints.noDirectImport) {
      const importLines = indexContent.split("\n").filter((l) => l.includes("from"));
      for (const pattern of constraints.noDirectImport) {
        const regex = new RegExp(pattern.replace(/\*/g, ".*"));
        for (const line of importLines) {
          const specifierMatch = line.match(/from\s+['"]([^'"]+)['"]/);
          if (specifierMatch && regex.test(specifierMatch[1])) {
            violations.push(`❌ ${rel(contractPath)}: forbidden import '${specifierMatch[1]}' (rule: ${pattern})`);
          }
        }
      }
    }
  }
}

async function main() {
  console.log("🔍 Validating module contracts...\n");

  await checkContractStructure();

  if (violations.length > 0) {
    for (const v of violations) {
      console.log(v);
    }
    console.log(`\nFound ${violations.length} violation(s)`);
  } else {
    console.log("✅ No contract violations found");
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
