#!/usr/bin/env tsx
import * as fs from "fs";
import * as path from "path";

const MODULES_DIR = path.resolve(process.cwd(), "src/modules");
const OUTPUT_PATH = path.resolve(process.cwd(), "CHANGELOG.md");

interface Contract {
  name: string;
  description: string;
  dependencies: string[];
  publicAPI: {
    hooks: string[];
    services: string[];
    components: string[];
  };
  invariants: string[];
}

interface ChangelogEntry {
  module: string;
  subdomain: string;
  description: string;
  hooks: string[];
  services: string[];
  components: string[];
  invariants: string[];
  dependencies: string[];
}

function findContracts(): Array<{ path: string; module: string; subdomain: string }> {
  const results: Array<{ path: string; module: string; subdomain: string }> = [];

  function scan(dir: string, modulePath: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        scan(path.join(dir, entry.name), path.join(modulePath, entry.name));
      } else if (entry.name === "contract.json") {
        const parts = modulePath.split(path.sep);
        const module = parts[0]!;
        const subdomain = parts.slice(1).join("/") || "core";
        results.push({ path: path.join(dir, entry.name), module, subdomain });
      }
    }
  }

  if (fs.existsSync(MODULES_DIR)) {
    for (const entry of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        scan(path.join(MODULES_DIR, entry.name), entry.name);
      }
    }
  }

  return results;
}

function generateChangelog(): string {
  const contracts = findContracts();
  const entries: ChangelogEntry[] = [];

  for (const { path: contractPath, module, subdomain } of contracts) {
    try {
      const content = fs.readFileSync(contractPath, "utf-8");
      const contract: Contract = JSON.parse(content);
      entries.push({
        module,
        subdomain,
        description: contract.description,
        hooks: contract.publicAPI?.hooks || [],
        services: contract.publicAPI?.services || [],
        components: contract.publicAPI?.components || [],
        invariants: contract.invariants || [],
        dependencies: contract.dependencies || [],
      });
    } catch {
      // skip invalid contracts
    }
  }

  const moduleGroups = new Map<string, ChangelogEntry[]>();
  for (const entry of entries) {
    if (!moduleGroups.has(entry.module)) {
      moduleGroups.set(entry.module, []);
    }
    moduleGroups.get(entry.module)!.push(entry);
  }

  const lines: string[] = [
    "# Module API Changelog",
    "",
    `> Auto-generated from contract.json files at ${new Date().toISOString().split("T")[0]}`,
    "",
    `## Summary: ${entries.length} sub-domains across ${moduleGroups.size} modules`,
    "",
  ];

  for (const [module, subdomains] of moduleGroups) {
    lines.push(`## ${module}`);
    lines.push("");

    for (const entry of subdomains) {
      lines.push(`### ${entry.subdomain}`);
      lines.push(`> ${entry.description}`);
      lines.push("");

      if (entry.dependencies.length > 0) {
        lines.push(`**Dependencies:** ${entry.dependencies.join(", ")}`);
        lines.push("");
      }

      if (entry.hooks.length > 0) {
        lines.push("**Hooks:**");
        for (const hook of entry.hooks) {
          lines.push(`- \`${hook}\``);
        }
        lines.push("");
      }

      if (entry.services.length > 0) {
        lines.push("**Services:**");
        for (const service of entry.services) {
          lines.push(`- \`${service}\``);
        }
        lines.push("");
      }

      if (entry.components.length > 0) {
        lines.push("**Components:**");
        for (const component of entry.components) {
          lines.push(`- \`${component}\``);
        }
        lines.push("");
      }

      if (entry.invariants.length > 0) {
        lines.push("**Invariants:**");
        for (const invariant of entry.invariants) {
          lines.push(`- ${invariant}`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

function main() {
  console.log("📋 扫描 contract.json 文件...");
  const changelog = generateChangelog();
  fs.writeFileSync(OUTPUT_PATH, changelog);
  console.log(`✅ 变更日志已生成: ${OUTPUT_PATH}`);
}

main();
