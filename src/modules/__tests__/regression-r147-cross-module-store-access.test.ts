/**
 * R147: 跨模块 Store 访问防护
 * 回归防护: 确保跨模块访问 video task store 时通过公共 API
 *           （@/modules/video/task-management）而非直接导入 useVideoTaskStore。
 *
 * 架构规则：模块间通信应通过模块的公共 API（index.ts barrel），
 *           不应直接导入其他模块的内部 hooks/stores。
 *           直接导入 useVideoTaskStore 会绕过模块封装，导致：
 *           1. 模块内部重构时破坏调用方
 *           2. 违反依赖方向原则
 *           3. 难以追踪跨模块数据流
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "../../../");

/** 从文件内容中提取所有 import 语句的路径 */
function extractImportPaths(content: string): string[] {
  const paths: string[] = [];
  const importRegex =
    /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    paths.push(match[1]!);
  }
  return paths;
}

/** 检查文件是否直接导入 useVideoTaskStore（而非通过公共 API） */
function importsUseVideoTaskStoreDirectly(content: string): boolean {
  // 匹配直接导入 useVideoTaskStore 的语句
  // 排除从 @/modules/video/task-management 导入（这是公共 API）
  const directImportRegex =
    /import\s+(?:\{[^}]*\buseVideoTaskStore\b[^}]*\}|[^,{]+\s*,\s*\{[^}]*\buseVideoTaskStore\b[^}]*\})\s+from\s+["'](?!@\/modules\/video\/task-management)["'][^"']*["']/;
  return directImportRegex.test(content);
}

describe("R147: 跨模块 Store 访问防护", () => {
  describe("transactional-delete.ts 不应直接导入 useVideoTaskStore", () => {
    const filePath = path.join(
      PROJECT_ROOT,
      "src/modules/persistence/services/transactional-delete.ts",
    );

    it("文件应存在", () => {
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("不应直接导入 useVideoTaskStore", () => {
      const content = fs.readFileSync(filePath, "utf-8");
      expect(importsUseVideoTaskStoreDirectly(content)).toBe(false);
    });

    it("应通过 @/modules/video/task-management 公共 API 访问", () => {
      const content = fs.readFileSync(filePath, "utf-8");
      const imports = extractImportPaths(content);
      const hasPublicApi = imports.some(
        (p) => p === "@/modules/video/task-management",
      );
      expect(hasPublicApi).toBe(true);
    });
  });

  describe("use-story-saver.ts 不应直接导入 useVideoTaskStore", () => {
    const filePath = path.join(
      PROJECT_ROOT,
      "src/modules/storyboard/planning/hooks/use-story-saver.ts",
    );

    it("文件应存在", () => {
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("不应直接导入 useVideoTaskStore", () => {
      const content = fs.readFileSync(filePath, "utf-8");
      expect(importsUseVideoTaskStoreDirectly(content)).toBe(false);
    });

    it("应通过 @/modules/video/task-management 公共 API 访问", () => {
      const content = fs.readFileSync(filePath, "utf-8");
      const imports = extractImportPaths(content);
      const hasPublicApi = imports.some(
        (p) => p === "@/modules/video/task-management",
      );
      expect(hasPublicApi).toBe(true);
    });
  });

  describe("公共 API 应导出所需的跨模块函数", () => {
    const publicApiPath = path.join(
      PROJECT_ROOT,
      "src/modules/video/task-management/index.ts",
    );

    it("公共 API 文件应存在", () => {
      expect(fs.existsSync(publicApiPath)).toBe(true);
    });

    it("应导出 removeTasksByBeatId", () => {
      const content = fs.readFileSync(publicApiPath, "utf-8");
      expect(content).toContain("removeTasksByBeatId");
    });

    it("应导出 removeTasksByStoryId", () => {
      const content = fs.readFileSync(publicApiPath, "utf-8");
      expect(content).toContain("removeTasksByStoryId");
    });
  });

  describe("全局扫描：其他模块不应直接导入 useVideoTaskStore", () => {
    // 扫描 src/modules 下所有非 video/task-management 的 .ts/.tsx 文件
    const modulesDir = path.join(PROJECT_ROOT, "src/modules");

    function getAllTsFiles(dir: string, excludePatterns: string[] = []): string[] {
      const results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__tests__" || entry.name === "node_modules") continue;
          if (excludePatterns.some((p) => fullPath.includes(p))) continue;
          results.push(...getAllTsFiles(fullPath, excludePatterns));
        } else if (
          entry.isFile() &&
          (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
          !entry.name.endsWith(".test.ts") &&
          !entry.name.endsWith(".test.tsx")
        ) {
          results.push(fullPath);
        }
      }
      return results;
    }

    // 排除 video/task-management 自身（它导出 useVideoTaskStore 是允许的）
    const files = getAllTsFiles(modulesDir, [
      path.join("video", "task-management"),
    ]);

    const violators: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      if (importsUseVideoTaskStoreDirectly(content)) {
        violators.push(path.relative(modulesDir, file));
      }
    }

    it("不应有模块直接导入 useVideoTaskStore（应通过公共 API）", () => {
      expect(violators).toEqual([]);
    });
  });
});
