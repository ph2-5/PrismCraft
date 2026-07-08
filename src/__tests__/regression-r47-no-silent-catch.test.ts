/**
 * R47: Catch Blocks MUST NOT Silently Swallow Errors
 *
 * 回归规则目的：
 *   生产代码中的 catch 块必须满足以下之一：
 *   (1) 通过 errorLogger.warn/error 记录错误
 *   (2) 将错误传播给调用方（throw/reject）
 *   (3) 通过 emitToast 显示用户反馈
 *   禁止空 catch {} 块（"安慰剂"错误处理）。
 *   禁止在 catch 块中使用 console.warn/console.error（绕过结构化日志系统）。
 *   唯一例外：清理操作（如 URL.revokeObjectURL）失败无关紧要的情况。
 *
 * 被测代码：
 *   src/ 和 electron/src/ 下的所有生产代码 .ts/.tsx 文件
 *   （排除 __tests__/、.test.ts、.d.ts、setup.ts）
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const SRC_DIR = path.join(PROJECT_ROOT, "src");
const ELECTRON_SRC_DIR = path.join(PROJECT_ROOT, "electron", "src");

/** 递归获取目录下所有生产代码 .ts/.tsx 文件 */
function getProductionTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      results.push(...getProductionTsFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx") &&
      !entry.name.endsWith(".d.ts") &&
      entry.name !== "setup.ts"
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

/** 检测空 catch 块：catch {} 或 catch (e) {} */
function findEmptyCatchBlocks(content: string, filePath: string): string[] {
  const violations: string[] = [];
  // 匹配 catch {} 或 catch (e) {} 或 catch (e: SomeType) {} 等空块
  const emptyCatchRegex = /catch\s*(?:\(\s*\w*(?:\s*:\s*[^)]+)?\s*\))?\s*\{\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = emptyCatchRegex.exec(content)) !== null) {
    const lineNum = content.slice(0, match.index).split("\n").length;
    violations.push(`${filePath}:${lineNum} — 空 catch 块: ${match[0].trim()}`);
  }
  return violations;
}

/**
 * 检测 catch 块中的 console.warn/console.error。
 * 由于正则无法可靠解析嵌套大括号，这里采用两步检测：
 * 1. 单行模式：catch (...) { ... console.warn/error(...) } 在同一行
 * 2. 多行近似模式：catch 块开始后的前 5 行内出现 console.warn/error
 */
function findConsoleInCatch(content: string, filePath: string): string[] {
  const violations: string[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // 跳过注释行
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      continue;
    }

    // 检测 catch 关键字
    if (!/\bcatch\s*(?:\(|\{)/.test(line)) continue;

    // 向后扫描 catch 块内容（最多 10 行，粗略匹配）
    let braceDepth = 0;
    let foundOpenBrace = false;
    for (let j = i; j < Math.min(i + 10, lines.length); j++) {
      const scanLine = lines[j]!;
      for (const ch of scanLine) {
        if (ch === "{") {
          braceDepth++;
          foundOpenBrace = true;
        } else if (ch === "}") {
          braceDepth--;
        }
      }

      // 在 catch 块内检测 console.warn/console.error
      const consoleMatch = scanLine.match(/console\.(warn|error)\s*\(/);
      if (consoleMatch && foundOpenBrace && braceDepth > 0) {
        violations.push(
          `${filePath}:${j + 1} — catch 块中使用 console.${consoleMatch[1]}（应用 errorLogger）`,
        );
      }

      // catch 块已结束
      if (foundOpenBrace && braceDepth <= 0) break;
    }
  }
  return violations;
}

describe("R47: Catch 块禁止静默吞错", () => {
  const srcFiles = getProductionTsFiles(SRC_DIR);
  const electronFiles = getProductionTsFiles(ELECTRON_SRC_DIR);
  const allFiles = [...srcFiles, ...electronFiles];

  it("应能读取到生产代码 .ts/.tsx 文件", () => {
    expect(allFiles.length).toBeGreaterThan(0);
  });

  describe("生产代码不应有空 catch 块", () => {
    const emptyCatchViolations: string[] = [];
    for (const file of allFiles) {
      const content = fs.readFileSync(file, "utf-8");
      emptyCatchViolations.push(...findEmptyCatchBlocks(content, file));
    }

    it(`空 catch 块数量应为 0（实际发现 ${emptyCatchViolations.length} 个）`, () => {
      if (emptyCatchViolations.length > 0) {
        console.error("发现的空 catch 块:\n" + emptyCatchViolations.join("\n"));
      }
      expect(emptyCatchViolations).toEqual([]);
    });
  });

  describe("生产代码 catch 块中不应使用 console.warn/console.error", () => {
    const consoleViolations: string[] = [];
    for (const file of allFiles) {
      const content = fs.readFileSync(file, "utf-8");
      consoleViolations.push(...findConsoleInCatch(content, file));
    }

    it(`catch 块中 console.warn/error 数量应为 0（实际发现 ${consoleViolations.length} 个）`, () => {
      if (consoleViolations.length > 0) {
        console.error("catch 块中的 console 调用:\n" + consoleViolations.join("\n"));
      }
      expect(consoleViolations).toEqual([]);
    });
  });
});
