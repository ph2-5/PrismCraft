#!/usr/bin/env tsx
import * as fs from "fs";
import * as path from "path";

const CONTAINER_PATH = path.resolve(process.cwd(), "src/infrastructure/di/container.ts");
const OUTPUT_PATH = path.resolve(process.cwd(), "docs/di-tokens.md");

interface TokenEntry {
  name: string;
  category: string;
  categoryLabel: string;
  typeHint: string;
  isLazy: boolean;
  sourceModule: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  A: "Domain Port 实现",
  B: "有状态服务",
  C: "Storage 实例",
  D: "Repository 实例",
  E: "懒加载模块",
  F: "Infrastructure 桥接",
};

function parseContainer(): TokenEntry[] {
  const content = fs.readFileSync(CONTAINER_PATH, "utf-8");
  const tokens: TokenEntry[] = [];

  let currentCategory = "";
  let currentCategoryLabel = "";

  const lines = content.split("\n");
  for (const line of lines) {
    const categoryMatch = line.match(/\/\/\s*──\s*([A-F])\.\s*(.+?)\s*──/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1]!;
      currentCategoryLabel = CATEGORY_LABELS[currentCategory] || categoryMatch[2]!.trim();
      continue;
    }

    const tokenMatch = line.match(/^\s*(\w+):\s*createToken(?:<([^>]+)>)?\(\s*["'](\w+)["']/);
    if (tokenMatch) {
      const name = tokenMatch[1]!;
      const typeHint = tokenMatch[2] || "";
      const isLazy = line.includes("async ()");

      let sourceModule = "";
      const importRegex = new RegExp(`import.*\\b${name}\\b.*from\\s+['"]([^'"]+)['"]`);
      for (const importLine of lines) {
        const m = importLine.match(importRegex);
        if (m) {
          sourceModule = m[1]!;
          break;
        }
      }

      if (!sourceModule && name !== name.toLowerCase()) {
        for (const importLine of lines) {
          const anyImport = importLine.match(new RegExp(`\\b${name}\\b.*from\\s+['"]([^'"]+)['"]`));
          if (anyImport) {
            sourceModule = anyImport[1]!;
            break;
          }
        }
      }

      if (!sourceModule) {
        for (const importLine of lines) {
          const destructuredMatch = importLine.match(new RegExp(`\\{[^}]*\\b${name}\\b[^}]*\\}.*from\\s+['"]([^'"]+)['"]`));
          if (destructuredMatch) {
            sourceModule = destructuredMatch[1]!;
            break;
          }
        }
      }

      tokens.push({
        name,
        category: currentCategory,
        categoryLabel: currentCategoryLabel,
        typeHint,
        isLazy,
        sourceModule,
      });
    }
  }

  return tokens;
}

function generateMarkdown(tokens: TokenEntry[]): string {
  const lines: string[] = [
    "# DI Container Token Reference",
    "",
    `> Auto-generated from \`src/infrastructure/di/container.ts\` at ${new Date().toISOString()}`,
    "",
    "## Token Categories",
    "",
    "| Category | Description | Count |",
    "|----------|-------------|-------|",
  ];

  const categoryGroups = new Map<string, TokenEntry[]>();
  for (const token of tokens) {
    if (!categoryGroups.has(token.category)) {
      categoryGroups.set(token.category, []);
    }
    categoryGroups.get(token.category)!.push(token);
  }

  for (const [cat, entries] of categoryGroups) {
    lines.push(`| ${cat}. ${CATEGORY_LABELS[cat]} | ${entries[0]!.categoryLabel} | ${entries.length} |`);
  }

  lines.push("");
  lines.push("## Token Details");
  lines.push("");

  for (const [cat, entries] of categoryGroups) {
    lines.push(`### ${cat}. ${CATEGORY_LABELS[cat]}`);
    lines.push("");
    lines.push("| Token | Type | Lazy | Source |");
    lines.push("|-------|------|------|--------|");

    for (const entry of entries) {
      const typeDisplay = entry.typeHint || "`unknown`";
      const lazyDisplay = entry.isLazy ? "✓" : "";
      const sourceDisplay = entry.sourceModule ? `\`${entry.sourceModule}\`` : "-";
      lines.push(`| \`${entry.name}\` | ${typeDisplay} | ${lazyDisplay} | ${sourceDisplay} |`);
    }

    lines.push("");
  }

  lines.push("## Usage Examples");
  lines.push("");
  lines.push("### Accessing a token");
  lines.push("```typescript");
  lines.push('import { container } from "@/infrastructure/di";');
  lines.push("const storage = container.videoTaskStorage;");
  lines.push("```");
  lines.push("");
  lines.push("### Overriding a token in tests");
  lines.push("```typescript");
  lines.push('import { overrideToken } from "@/infrastructure/di";');
  lines.push('import { container } from "@/infrastructure/di";');
  lines.push("overrideToken(container.videoTaskStorage, () => mockStorage);");
  lines.push("```");
  lines.push("");
  lines.push("### Adding a new token");
  lines.push("1. Determine the category (A-F)");
  lines.push("2. Add `createToken()` in the appropriate section of `container.ts`");
  lines.push("3. If category E, add a comment explaining why the module cannot import directly");
  lines.push("4. Run `npm run di-docs` to update this document");
  lines.push("");

  return lines.join("\n");
}

function main() {
  console.log("📋 解析 DI Container tokens...");
  const tokens = parseContainer();
  const markdown = generateMarkdown(tokens);

  const docsDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, markdown);
  console.log(`✅ DI Token 文档已生成: ${OUTPUT_PATH}`);
  console.log(`   共 ${tokens.length} 个 tokens`);
}

main();
