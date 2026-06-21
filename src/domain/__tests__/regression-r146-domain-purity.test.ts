/**
 * R146: domain 层纯净性
 * 回归防护: 确保 src/domain/ 目录下所有 .ts 文件不导入其他层
 *           （@/shared/*、@/infrastructure/*、@/modules/*），
 *           保持 domain 层零外部依赖的纯净性。
 *
 * 架构规则：domain 层只能定义纯类型，不能依赖任何其他层。
 *           若 domain 导入 @/shared/constants/messages 等模块，
 *           会形成循环依赖或违反分层架构原则。
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const DOMAIN_DIR = path.resolve(__dirname, "../../domain");

/** 递归获取目录下所有 .ts 文件（排除 .test.ts 和 __tests__ 目录） */
function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      results.push(...getAllTsFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

/** 从文件内容中提取所有 import 语句的路径 */
function extractImportPaths(content: string): string[] {
  const paths: string[] = [];
  // 匹配 import ... from "..." 和 import "..."
  const importRegex =
    /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    paths.push(match[1]!);
  }
  // 匹配 export ... from "..."
  const exportRegex = /export\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  while ((match = exportRegex.exec(content)) !== null) {
    paths.push(match[1]!);
  }
  return paths;
}

describe("R146: domain 层纯净性", () => {
  const tsFiles = getAllTsFiles(DOMAIN_DIR);

  it("应能读取到 domain 目录下的 .ts 文件", () => {
    expect(tsFiles.length).toBeGreaterThan(0);
  });

  describe("domain 层不应导入 @/shared/*", () => {
    for (const file of tsFiles) {
      const relativePath = path.relative(DOMAIN_DIR, file);
      it(`${relativePath} 不应导入 @/shared/*`, () => {
        const content = fs.readFileSync(file, "utf-8");
        const imports = extractImportPaths(content);
        const violations = imports.filter((p) => p.startsWith("@/shared/"));
        expect(violations).toEqual([]);
      });
    }
  });

  describe("domain 层不应导入 @/infrastructure/*", () => {
    for (const file of tsFiles) {
      const relativePath = path.relative(DOMAIN_DIR, file);
      it(`${relativePath} 不应导入 @/infrastructure/*`, () => {
        const content = fs.readFileSync(file, "utf-8");
        const imports = extractImportPaths(content);
        const violations = imports.filter((p) =>
          p.startsWith("@/infrastructure/"),
        );
        expect(violations).toEqual([]);
      });
    }
  });

  describe("domain 层不应导入 @/modules/*", () => {
    for (const file of tsFiles) {
      const relativePath = path.relative(DOMAIN_DIR, file);
      it(`${relativePath} 不应导入 @/modules/*`, () => {
        const content = fs.readFileSync(file, "utf-8");
        const imports = extractImportPaths(content);
        const violations = imports.filter((p) => p.startsWith("@/modules/"));
        expect(violations).toEqual([]);
      });
    }
  });

  describe("特定文件检查", () => {
    it("src/domain/video/task-state.ts 不应导入 @/shared/constants/messages", () => {
      const filePath = path.join(DOMAIN_DIR, "video", "task-state.ts");
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");
      const imports = extractImportPaths(content);
      const violations = imports.filter(
        (p) => p === "@/shared/constants/messages",
      );
      expect(violations).toEqual([]);
    });

    it("domain 层只应导入相对路径或 @/domain/*（自身）", () => {
      for (const file of tsFiles) {
        const content = fs.readFileSync(file, "utf-8");
        const imports = extractImportPaths(content);
        for (const imp of imports) {
          // 允许：相对路径（./ 或 ../）、@/domain/*、第三方包（如 zod）
          const isRelative = imp.startsWith("./") || imp.startsWith("../");
          const isDomainSelf = imp.startsWith("@/domain/");
          const isThirdParty =
            !imp.startsWith("@/") && !imp.startsWith(".") && !imp.startsWith("/");
          if (!isRelative && !isDomainSelf && !isThirdParty) {
            throw new Error(
              `${path.relative(DOMAIN_DIR, file)} 导入了禁止的路径: ${imp}`,
            );
          }
        }
      }
    });
  });
});
