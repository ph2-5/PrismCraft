#!/usr/bin/env tsx
/**
 * AI 上下文边界工具
 *
 * 给定一个文件路径，计算 AI 修改该文件时应该加载和不应该加载的上下文。
 * 支持两种 contract.json 格式:
 * - 新格式: provides / depends / constraints / aiGuide
 * - 旧格式: internalDeps / externalDeps / entryPoints / invariants
 */

import * as path from "path";
import * as fs from "fs";

interface ContextBoundary {
  shouldLoad: string[];
  shouldNotLoad: string[];
  module: string | null;
  subdomain: string | null;
  contract: Record<string, unknown> | null;
}

const MODULES_DIR = path.resolve(process.cwd(), "src/modules");

function findSubdomain(filePath: string): { module: string; subdomain: string | null } | null {
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/src\/modules\/([^/]+)(?:\/([^/]+))?/);
  if (!match) return null;
  return { module: match[1]!, subdomain: match[2] ?? null };
}

function loadContract(moduleDir: string, subdomain: string): Record<string, unknown> | null {
  const contractPath = path.join(moduleDir, subdomain, "contract.json");
  if (!fs.existsSync(contractPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(contractPath, "utf-8"));
  } catch {
    return null;
  }
}

function getContractField(contract: Record<string, unknown> | null, key: string): unknown {
  if (!contract) return undefined;
  return contract[key];
}

function resolveContextBoundary(filePath: string): ContextBoundary {
  const info = findSubdomain(filePath);
  if (!info) {
    return { shouldLoad: [filePath], shouldNotLoad: [], module: null, subdomain: null, contract: null };
  }

  const { module, subdomain } = info;
  const moduleDir = path.join(MODULES_DIR, module);

  // 在模块根目录（无子域）
  if (!subdomain) {
    const entries = fs.readdirSync(moduleDir, { withFileTypes: true });
    const subdomains = entries
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(moduleDir, e.name, "contract.json")))
      .map((e) => e.name);

    return {
      shouldLoad: [filePath],
      shouldNotLoad: subdomains.map((sd) => `src/modules/${module}/${sd}/**/*`),
      module,
      subdomain: null,
      contract: null,
    };
  }

  const contract = loadContract(moduleDir, subdomain);
  const shouldLoad: string[] = [];
  const shouldNotLoad: string[] = [];

  // 同模块的其他子域 → 不应加载
  const otherSubdomains = fs.readdirSync(moduleDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== subdomain && fs.existsSync(path.join(moduleDir, e.name, "contract.json")))
    .map((e) => e.name);

  for (const other of otherSubdomains) {
    shouldNotLoad.push(`src/modules/${module}/${other}/**/*`);
  }

  // 当前子域内部文件 → 应该加载
  shouldLoad.push(`src/modules/${module}/${subdomain}/**/*`);

  // 依赖的外部模块（从 contract 中读取）
  const depends = getContractField(contract, "depends") as Record<string, string[]> | undefined;
  if (depends?.modules) {
    for (const dep of depends.modules) {
      if (typeof dep === "string") {
        shouldLoad.push(`src/modules/${dep}/index.ts`);
      } else if (dep && typeof dep === "object" && "name" in dep) {
        shouldLoad.push(`src/modules/${(dep as any).name}/index.ts`);
      }
    }
  }

  // 旧格式: externalDeps
  const externalDeps = getContractField(contract, "externalDeps") as Record<string, string[]> | undefined;
  if (externalDeps) {
    for (const [depModule] of Object.entries(externalDeps)) {
      if (depModule.startsWith("domain-") || depModule.startsWith("infrastructure")) continue;
      if (depModule.includes("/")) {
        shouldLoad.push(`src/modules/${depModule}/index.ts`);
      }
    }
  }

  return { shouldLoad, shouldNotLoad, module, subdomain, contract };
}

function printContractInfo(contract: Record<string, unknown> | null) {
  if (!contract) return;

  const subdomain = getContractField(contract, "subdomain") || getContractField(contract, "name");
  const responsibility = getContractField(contract, "responsibility") || getContractField(contract, "description");

  if (subdomain) {
    console.log(`\n[SUBDOMAIN]`);
    console.log(`  ${subdomain}`);
  }
  if (responsibility) {
    console.log(`\n[RESPONSIBILITY]`);
    console.log(`  ${responsibility}`);
  }

  // 新格式: aiGuide.risks
  const aiGuide = getContractField(contract, "aiGuide") as Record<string, string[]> | undefined;
  if (aiGuide?.risks?.length) {
    console.log(`\n[RISKS]`);
    aiGuide.risks.forEach((r) => console.log(`  ⚠️  ${r}`));
  }

  // 旧格式: invariants
  const invariants = getContractField(contract, "invariants") as string[] | undefined;
  if (invariants?.length) {
    console.log(`\n[INVARIANTS]`);
    invariants.forEach((i) => console.log(`  📌 ${i}`));
  }

  // 约束
  const constraints = getContractField(contract, "constraints") as Record<string, unknown> | undefined;
  if (constraints?.maxLines) {
    console.log(`\n[CONSTRAINTS]`);
    console.log(`  Max Lines: ${constraints.maxLines}`);
  }
}

function main() {
  const targetArg = process.argv.find((a) => a.startsWith("--target="));
  const target = targetArg?.replace("--target=", "");

  if (!target) {
    console.error("Usage: npx tsx scripts/ai-context-boundary.ts --target=<file-path>");
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), target);
  const boundary = resolveContextBoundary(resolved);

  console.log(`\n📁 Target: ${target}`);
  if (boundary.module && boundary.subdomain) {
    console.log(`📦 Module: ${boundary.module}/${boundary.subdomain}`);
  }

  console.log("\n[SHOULD_LOAD]");
  boundary.shouldLoad.forEach((f) => console.log(`  ✅ ${f}`));

  console.log("\n[SHOULD_NOT_LOAD]");
  boundary.shouldNotLoad.forEach((f) => console.log(`  ❌ ${f}`));

  printContractInfo(boundary.contract);
}

main();
