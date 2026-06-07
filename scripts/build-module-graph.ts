#!/usr/bin/env tsx
/**
 * 模块依赖图生成器
 *
 * 扫描 src/modules/ 下的所有代码，分析子域之间的导入关系，
 * 生成 module-graph.json 供 AI 开发时查询影响范围。
 */

import * as nodePath from "path";
import * as fs from "fs";

const MODULES_DIR = nodePath.resolve(process.cwd(), "src/modules");
const SHARED_DIR = nodePath.resolve(process.cwd(), "src/shared");
const DOMAIN_DIR = nodePath.resolve(process.cwd(), "src/domain");
const INFRA_DIR = nodePath.resolve(process.cwd(), "src/infrastructure");
const OUTPUT_PATH = nodePath.resolve(process.cwd(), "module-graph.json");
const MERMAID_OUTPUT_PATH = nodePath.resolve(process.cwd(), "module-graph.mmd");

interface ModuleNode {
  id: string;
  module: string;
  subdomain: string;
  lines: number;
  files: number;
  contractVersion?: string;
}

interface ModuleEdge {
  from: string;
  to: string;
  type: "function" | "type" | "value" | "unknown";
  symbols: string[];
}

interface DddViolation {
  file: string;
  from: string;
  to: string;
  rule: string;
}

interface ModuleGraph {
  generatedAt: string;
  nodes: ModuleNode[];
  edges: ModuleEdge[];
  cycles: string[][];
  orphans: string[];
  dddViolations: DddViolation[];
  stats: {
    totalModules: number;
    totalSubdomains: number;
    totalEdges: number;
    cycleCount: number;
    violationCount: number;
  };
}

function getSubdomainId(module: string, subdomain: string): string {
  return `${module}-${subdomain}`;
}

function countLines(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = nodePath.join(dir, entry.name);
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
    const full = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += countFiles(full);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      total++;
    }
  }
  return total;
}

function findSubdomainForPath(filePath: string): { module: string; subdomain: string } | null {
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/src\/modules\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { module: match[1]!, subdomain: match[2]! };
}

function detectImportTarget(moduleSpecifier: string): { module: string; subdomain: string } | null {
  const match = moduleSpecifier.match(/@\/modules\/([^/]+)(?:\/([^/]+))?/);
  if (!match) return null;
  return { module: match[1]!, subdomain: match[2] || "__root__" };
}

function extractImports(filePath: string): Array<{ target: { module: string; subdomain: string }; symbols: string[] }> {
  const content = fs.readFileSync(filePath, "utf-8");
  const results: Array<{ target: { module: string; subdomain: string }; symbols: string[] }> = [];

  // 匹配 import { a, b, type C } from "..."
  const namedImportRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/g;
  let m: RegExpExecArray | null;

  while ((m = namedImportRegex.exec(content)) !== null) {
    const symbols = m[1]!
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("//"))
      .map((s) => s.replace(/^type\s+/, "").trim());

    const target = detectImportTarget(m[2]!);
    if (target) {
      results.push({ target, symbols });
    }
  }

  // 匹配 import X from "..."
  const defaultImportRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/g;
  while ((m = defaultImportRegex.exec(content)) !== null) {
    const target = detectImportTarget(m[2]!);
    if (target) {
      results.push({ target, symbols: [m[1]!] });
    }
  }

  // 匹配 import * as X from "..."
  const namespaceImportRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/g;
  while ((m = namespaceImportRegex.exec(content)) !== null) {
    const target = detectImportTarget(m[2]!);
    if (target) {
      results.push({ target, symbols: [`* as ${m[1]!}`] });
    }
  }

  return results;
}

function scanDirectory(dir: string, callback: (filePath: string) => void) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(full, callback);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      callback(full);
    }
  }
}

function detectDddViolations(): DddViolation[] {
  const violations: DddViolation[] = [];
  const rules: Array<{ dir: string; pattern: RegExp; forbidden: string; rule: string }> = [
    { dir: DOMAIN_DIR, pattern: /from\s+['"]@\/(modules|infrastructure)\//, forbidden: "modules/infrastructure", rule: "domain MUST NOT import from modules or infrastructure" },
    { dir: SHARED_DIR, pattern: /from\s+['"]@\/(modules|infrastructure)\//, forbidden: "modules/infrastructure", rule: "shared MUST NOT import from modules or infrastructure" },
    { dir: INFRA_DIR, pattern: /from\s+['"]@\/modules\//, forbidden: "modules", rule: "infrastructure MUST NOT import from modules" },
  ];

  for (const rule of rules) {
    if (!fs.existsSync(rule.dir)) continue;
    scanDirectory(rule.dir, (filePath) => {
      const content = fs.readFileSync(filePath, "utf-8");
      const relativePath = nodePath.relative(process.cwd(), filePath).replace(/\\/g, "/");
      let m: RegExpExecArray | null;
      const regex = new RegExp(rule.pattern.source, "g");
      while ((m = regex.exec(content)) !== null) {
        const fullMatch = /from\s+['"](@\/[^'"]+)['"]/.exec(m[0]);
        violations.push({
          file: relativePath,
          from: rule.dir.split("/").pop() || rule.dir,
          to: fullMatch ? fullMatch[1]! : m[0],
          rule: rule.rule,
        });
      }
    });
  }

  return violations;
}

function generateMermaid(graph: ModuleGraph): string {
  const lines: string[] = ["graph TD"];

  const moduleColors: Record<string, string> = {
    story: "#4A90D9",
    shot: "#7B68EE",
    video: "#E74C3C",
    character: "#2ECC71",
    scene: "#F39C12",
    prompt: "#9B59B6",
    asset: "#1ABC9C",
    sync: "#3498DB",
    feedback: "#95A5A6",
    persistence: "#16A085",
    security: "#C0392B",
  };

  for (const node of graph.nodes) {
    lines.push(`  ${node.id}["${node.module}/${node.subdomain}<br/>${node.lines}L ${node.files}F"]:::mod`);
  }

  lines.push("");

  for (const edge of graph.edges) {
    const label = edge.symbols.length <= 3 ? edge.symbols.join(", ") : `${edge.symbols.slice(0, 3).join(", ")} +${edge.symbols.length - 3}`;
    lines.push(`  ${edge.from} -->|"${label}"| ${edge.to}`);
  }

  if (graph.cycles.length > 0) {
    lines.push("");
    lines.push("  subgraph cycles");
    for (const cycle of graph.cycles) {
      for (let i = 0; i < cycle.length - 1; i++) {
        lines.push(`  ${cycle[i]} -.-> ${cycle[i + 1]}`);
      }
    }
    lines.push("  end");
  }

  lines.push("");
  for (const [mod, color] of Object.entries(moduleColors)) {
    lines.push(`  classDef ${mod}Mod fill:${color},color:#fff,stroke:#333`);
  }

  return lines.join("\n");
}

function buildGraph(): ModuleGraph {
  const nodes: ModuleNode[] = [];
  const edges: ModuleEdge[] = [];
  const edgeMap = new Map<string, ModuleEdge>();

  // 1. 发现所有子域
  for (const moduleEntry of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!moduleEntry.isDirectory()) continue;
    const modulePath = nodePath.join(MODULES_DIR, moduleEntry.name);

    for (const subEntry of fs.readdirSync(modulePath, { withFileTypes: true })) {
      if (!subEntry.isDirectory()) continue;
      const subdomainPath = nodePath.join(modulePath, subEntry.name);
      const contractPath = nodePath.join(subdomainPath, "contract.json");

      if (!fs.existsSync(contractPath)) continue;

      const contract = JSON.parse(fs.readFileSync(contractPath, "utf-8"));
      const nodeId = getSubdomainId(moduleEntry.name, subEntry.name);

      nodes.push({
        id: nodeId,
        module: moduleEntry.name,
        subdomain: subEntry.name,
        lines: countLines(subdomainPath),
        files: countFiles(subdomainPath),
        contractVersion: contract.version || "1.0.0",
      });
    }
  }

  // 2. 扫描所有源码文件的导入
  scanDirectory(MODULES_DIR, (filePath) => {
    const fromInfo = findSubdomainForPath(filePath);
    if (!fromInfo) return;

    const fromId = getSubdomainId(fromInfo.module, fromInfo.subdomain);
    const imports = extractImports(filePath);

    for (const imp of imports) {
      const target = imp.target;
      if (target.module === fromInfo.module && target.subdomain === fromInfo.subdomain) continue;

      const toId = getSubdomainId(target.module, target.subdomain);
      const edgeKey = `${fromId}→${toId}`;

      if (edgeMap.has(edgeKey)) {
        edgeMap.get(edgeKey)!.symbols.push(...imp.symbols);
      } else {
        edgeMap.set(edgeKey, {
          from: fromId,
          to: toId,
          type: "unknown",
          symbols: [...imp.symbols],
        });
      }
    }
  });

  edges.push(...edgeMap.values());

  // 3. 检测循环依赖
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.add(edge.to);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const pathNodes: string[] = [];

  function dfs(nodeId: string) {
    if (stack.has(nodeId)) {
      const cycleStart = pathNodes.indexOf(nodeId);
      const cycle = pathNodes.slice(cycleStart).concat([nodeId]);
      cycles.push(cycle);
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    stack.add(nodeId);
    pathNodes.push(nodeId);

    for (const neighbor of adjacency.get(nodeId) || []) {
      dfs(neighbor);
    }

    pathNodes.pop();
    stack.delete(nodeId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  // 4. 检测孤儿节点
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  const orphans = nodes.filter((n) => !connected.has(n.id)).map((n) => n.id);

  const dddViolations = detectDddViolations();

  return {
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    cycles: cycles.filter((c, i) => cycles.findIndex((other) => other.join(",") === c.join(",")) === i),
    orphans,
    dddViolations,
    stats: {
      totalModules: new Set(nodes.map((n) => n.module)).size,
      totalSubdomains: nodes.length,
      totalEdges: edges.length,
      cycleCount: cycles.length,
      violationCount: dddViolations.length,
    },
  };
}

function main() {
  console.log("🔍 扫描模块依赖关系...");
  const graph = buildGraph();

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(graph, null, 2));

  const mermaid = generateMermaid(graph);
  fs.writeFileSync(MERMAID_OUTPUT_PATH, mermaid);

  console.log(`\n✅ 模块依赖图已生成:`);
  console.log(`  JSON: ${OUTPUT_PATH}`);
  console.log(`  Mermaid: ${MERMAID_OUTPUT_PATH}`);
  console.log(`\n📊 统计:`);
  console.log(`  模块数: ${graph.stats.totalModules}`);
  console.log(`  子域数: ${graph.stats.totalSubdomains}`);
  console.log(`  依赖边: ${graph.stats.totalEdges}`);
  console.log(`  循环依赖: ${graph.stats.cycleCount}`);
  console.log(`  DDD 违规: ${graph.stats.violationCount}`);

  if (graph.cycles.length > 0) {
    console.log(`\n⚠️  发现循环依赖:`);
    for (const cycle of graph.cycles) {
      console.log(`  ${cycle.join(" → ")}`);
    }
  }

  if (graph.orphans.length > 0) {
    console.log(`\n📝 孤立子域（无导入/被导入）:`);
    for (const orphan of graph.orphans) {
      console.log(`  ${orphan}`);
    }
  }

  if (graph.dddViolations.length > 0) {
    console.log(`\n🚫 DDD 分层违规:`);
    for (const v of graph.dddViolations) {
      console.log(`  ${v.file}: ${v.rule} (imports ${v.to})`);
    }
  }
}

main();
