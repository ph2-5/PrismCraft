import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

interface ContractJson {
  name: string;
  description: string;
  dependencies: string[];
  publicAPI: Record<string, string[]>;
  invariants: string[];
}

export function loadContract(contractPath: string): ContractJson {
  const raw = readFileSync(contractPath, "utf-8");
  return JSON.parse(raw) as ContractJson;
}

export function loadAllContracts(modulePath: string): Map<string, ContractJson> {
  const contracts = new Map<string, ContractJson>();
  const entries = readdirSync(modulePath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const contractPath = join(modulePath, entry.name, "contract.json");
    try {
      statSync(contractPath);
      contracts.set(entry.name, loadContract(contractPath));
    } catch {
      // no contract.json, skip
    }
  }
  return contracts;
}

export function findIllegalImports(
  dir: string,
  forbiddenPatterns: RegExp[],
  aliasPatterns: RegExp[],
): { file: string; line: string; pattern: RegExp }[] {
  const violations: { file: string; line: string; pattern: RegExp }[] = [];

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const content = readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        for (const line of lines) {
          const allPatterns = [...forbiddenPatterns, ...aliasPatterns];
          for (const pattern of allPatterns) {
            if (pattern.test(line)) {
              violations.push({ file: fullPath, line: line.trim(), pattern });
            }
          }
        }
      }
    }
  }

  walk(dir);
  return violations;
}

export function validateContractStructure(contract: ContractJson): string[] {
  const errors: string[] = [];
  if (!contract.name) errors.push("missing name");
  if (!contract.description) errors.push("missing description");
  if (!Array.isArray(contract.dependencies)) errors.push("missing or invalid dependencies");
  if (!contract.publicAPI || typeof contract.publicAPI !== "object") errors.push("missing or invalid publicAPI");
  if (!Array.isArray(contract.invariants) || contract.invariants.length === 0) {
    errors.push("missing or empty invariants");
  }
  return errors;
}
