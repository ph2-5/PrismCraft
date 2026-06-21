/**
 * R148: 备份数据库连接泄漏防护
 * 回归防护: 确保 createBackup 中 verifyDb.close() 在 try/finally 块中，
 *           即使验证查询抛出异常，连接也会被关闭，防止连接泄漏。
 *
 * 问题场景：createBackup 使用 file copy 备份时，会打开 verifyDb 验证备份
 *           完整性。若验证查询抛异常而 close() 不在 finally 块中，
 *           连接不会被关闭，导致文件句柄泄漏，长期运行可能耗尽资源。
 *
 * 测试方式：createBackup 是私有函数未导出，采用结构性检查读取源文件
 *           验证 try/finally 模式存在，确保 verifyDb.close() 受保护。
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// 读取源文件内容用于结构性检查（使用真实 fs 模块）
const sourceContent = fs.readFileSync(
  path.resolve(__dirname, "../db-connection.ts"),
  "utf-8",
);

describe("R148: 备份数据库连接泄漏防护", () => {
  describe("结构性检查 - createBackup 源代码", () => {
    it("createBackup 函数应存在", () => {
      expect(sourceContent).toMatch(/async\s+function\s+createBackup/);
    });

    it("应包含 verifyDb 变量声明", () => {
      expect(sourceContent).toMatch(/verifyDb/);
    });

    it("应使用 BetterSqlite3 创建 verifyDb", () => {
      expect(sourceContent).toMatch(/verifyDb\s*=\s*new\s+BetterSqlite3/);
    });

    it("verifyDb.close() 应存在", () => {
      expect(sourceContent).toMatch(/verifyDb\.close\(\)/);
    });

    it("verifyDb.close() 应在 finally 块中", () => {
      // 提取 verifyDb 创建到 close 之间的代码段
      const verifyDbSection = sourceContent.match(
        /verifyDb\s*=\s*new\s+BetterSqlite3[\s\S]*?verifyDb\.close\(\)/,
      );
      expect(verifyDbSection).not.toBeNull();

      const section = verifyDbSection![0];
      const closeIdx = section.lastIndexOf("verifyDb.close()");
      const finallyIdx = section.lastIndexOf("finally", closeIdx);

      // finally 关键字应在 verifyDb.close() 之前
      expect(finallyIdx).toBeGreaterThan(-1);
      expect(finallyIdx).toBeLessThan(closeIdx);
    });

    it("verifyDb.close() 前应有 try 块", () => {
      const verifyDbSection = sourceContent.match(
        /verifyDb\s*=\s*new\s+BetterSqlite3[\s\S]*?verifyDb\.close\(\)/,
      );
      expect(verifyDbSection).not.toBeNull();

      const section = verifyDbSection![0];
      const closeIdx = section.lastIndexOf("verifyDb.close()");
      const finallyIdx = section.lastIndexOf("finally", closeIdx);
      const tryIdx = section.lastIndexOf("try", finallyIdx);

      // try 关键字应在 finally 之前
      expect(tryIdx).toBeGreaterThan(-1);
      expect(tryIdx).toBeLessThan(finallyIdx);
    });

    it("try/finally 结构应完整包裹验证逻辑", () => {
      // 验证源代码包含 try { ... verifyDb.prepare ... } finally { verifyDb.close() }
      const pattern = /try\s*\{[\s\S]*?verifyDb\.prepare[\s\S]*?\}\s*finally\s*\{[\s\S]*?verifyDb\.close\(\)/;
      expect(sourceContent).toMatch(pattern);
    });

    it("verifyDb.close() 不应在 try 块内（应在 finally 块中）", () => {
      // 确保 verifyDb.close() 前面是 finally 而非直接在 try 中
      const lines = sourceContent.split("\n");
      let closeLineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.includes("verifyDb.close()")) {
          closeLineIdx = i;
          break;
        }
      }
      expect(closeLineIdx).toBeGreaterThan(-1);

      // 向上查找，应先遇到 finally 而非 try
      let foundFinally = false;
      let foundTryWithoutFinally = false;
      for (let i = closeLineIdx - 1; i >= Math.max(0, closeLineIdx - 30); i--) {
        const line = lines[i]!;
        if (line.includes("finally")) {
          foundFinally = true;
          break;
        }
        if (line.includes("try") && !line.includes("finally")) {
          foundTryWithoutFinally = true;
          break;
        }
      }
      expect(foundFinally).toBe(true);
      expect(foundTryWithoutFinally).toBe(false);
    });
  });

  describe("源代码模式验证", () => {
    it("应包含 try/finally 包裹 verifyDb 的完整模式", () => {
      // 验证关键模式：new BetterSqlite3 -> try -> prepare -> finally -> close
      const pattern = /new\s+BetterSqlite3\([^)]*\)[\s\S]*?try\s*\{[\s\S]*?verifyDb\.prepare[\s\S]*?\}\s*finally\s*\{[\s\S]*?verifyDb\.close\(\)/;
      expect(sourceContent).toMatch(pattern);
    });

    it("verifyDb 创建后应有验证查询（prepare）", () => {
      const verifyDbSection = sourceContent.match(
        /verifyDb\s*=\s*new\s+BetterSqlite3[\s\S]*?verifyDb\.close\(\)/,
      );
      expect(verifyDbSection).not.toBeNull();
      expect(verifyDbSection![0]).toMatch(/verifyDb\.prepare/);
    });
  });
});
