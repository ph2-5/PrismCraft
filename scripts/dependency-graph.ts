#!/usr/bin/env tsx
import * as fs from "fs";
import * as path from "path";

const IMPORT_PATTERN = /import\s+.*?\s+from\s+["'](@\/modules\/[^"']+|@\/infrastructure\/[^"']+)["']/g;

function getModuleName(importPath: string): string {
  const modulesMatch = importPath.match(/^@\/modules\/([^/]+)/);
  if (modulesMatch) return `modules/${modulesMatch[1]}`;
  const infraMatch = importPath.match(/^@\/infrastructure\/([^/]+)/);
  if (infraMatch) return `infrastructure/${infraMatch[1]}`;
  return importPath;
}

function scanImports(dir: string): Map<string, Set<string>> {
  const deps = new Map<string, Set<string>>();

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const relativeDir = path.relative(dir, currentDir);
        const moduleKey = relativeDir || path.basename(dir);

        let match: RegExpExecArray | null;
        IMPORT_PATTERN.lastIndex = 0;
        while ((match = IMPORT_PATTERN.exec(content)) !== null) {
          const importPath = match[1]!;
          const targetModule = getModuleName(importPath);
          if (!deps.has(moduleKey)) {
            deps.set(moduleKey, new Set());
          }
          deps.get(moduleKey)!.add(targetModule);
        }
      }
    }
  }

  walk(dir);
  return deps;
}

function generateMermaid(deps: Map<string, Set<string>>): string {
  let mermaid = "graph TD\n";
  for (const [module, imports] of deps) {
    for (const imp of imports) {
      const safeFrom = module.replace(/[/\\]/g, "_");
      const safeTo = imp.replace(/[/\\]/g, "_");
      mermaid += `  ${safeFrom}["${module}"] --> ${safeTo}["${imp}"]\n`;
    }
  }
  return mermaid;
}

const projectRoot = process.argv[2] || process.cwd();
const modulesDir = path.join(projectRoot, "src/modules");
const infraDir = path.join(projectRoot, "src/infrastructure");

const allDeps = new Map<string, Set<string>>();

if (fs.existsSync(modulesDir)) {
  const modulesDeps = scanImports(modulesDir);
  for (const [key, value] of modulesDeps) {
    allDeps.set(`modules/${key}`, value);
  }
}

if (fs.existsSync(infraDir)) {
  const infraDeps = scanImports(infraDir);
  for (const [key, value] of infraDeps) {
    allDeps.set(`infrastructure/${key}`, value);
  }
}

console.log(generateMermaid(allDeps));
