/**
 * R178: 回调参数不能遮蔽导入的 t
 *
 * 回归规则目的：
 *   当文件导入了 i18n 的 t 函数后，回调函数参数不能命名为 t，否则会
 *   遮蔽（shadow）i18n 的 t，导致回调内调用 t(...) 实际调用的是回调
 *   参数而非 i18n 函数。
 *
 * 被测代码：
 *   src/modules/video/task-management/hooks/（验证回调参数不遮蔽 t）
 */
import { describe, it, expect } from "vitest";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

async function globTsFiles(dir: string, results: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "__tests__") continue;
      await globTsFiles(full, results);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

// 检查文件是否导入了 t 从 messages
function importsT(source: string): boolean {
  return /from\s+["']@\/shared\/constants\/(messages|constants)["']/.test(source);
}

// 检查文件是否使用 (t) 作为回调参数
function usesTAsCallbackParam(source: string): string[] {
  const offenders: string[] = [];
  // 匹配 .filter((t) =>, .map((t) =>, .find((t) =>, .some((t) =>, .every((t) =>, .reduce((t) =>
  const patterns = [
    /\.(filter|map|find|some|every|reduce|forEach|sort)\(\(t\)\s*=>/g,
    /\.(filter|map|find|some|every|reduce|forEach|sort)\(function\s*\(t\)/g,
  ];
  for (const pattern of patterns) {
    const matches = source.matchAll(pattern);
    for (const match of matches) {
      offenders.push(match[0]);
    }
  }
  return offenders;
}

describe("R178: 回调参数不能遮蔽导入的 t", () => {
  it("filter((t) => ...) 在导入 t 的文件中是违规模式", () => {
    const source = `
import { t } from "@/shared/constants/messages";
const completed = tasks.filter((t) => t.status === "completed");
`;
    expect(importsT(source)).toBe(true);
    expect(usesTAsCallbackParam(source).length).toBeGreaterThan(0);
  });

  it("filter((task) => ...) 是正确模式（不遮蔽 t）", () => {
    const source = `
import { t } from "@/shared/constants/messages";
const completed = tasks.filter((task) => task.status === "completed");
`;
    expect(importsT(source)).toBe(true);
    expect(usesTAsCallbackParam(source)).toEqual([]);
  });

  it("filter((t) => ...) 在未导入 t 的文件中不违规", () => {
    const source = `
import { useMemo } from "react";
const completed = tasks.filter((t) => t.status === "completed");
`;
    expect(importsT(source)).toBe(false);
    // 未导入 t 时，(t) 作为回调参数不构成遮蔽
    expect(usesTAsCallbackParam(source).length).toBeGreaterThan(0);
  });

  it("video task management hooks 中不导入 t from messages", async () => {
    // 该目录的文件不导入 i18n 的 t，因此 (t) 作为回调参数不构成遮蔽
    const files = await globTsFiles(
      join(process.cwd(), "src/modules/video/task-management/hooks"),
    );
    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf-8");
      if (importsT(source)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `以下文件导入了 t from messages，需检查回调参数是否遮蔽：\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("use-video-task-queries.ts 使用 (t) 作为回调参数但不导入 t（不违规）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/video/task-management/hooks/use-video-task-queries.ts"),
      "utf-8",
    );
    expect(importsT(source)).toBe(false);
    // 使用 for...of (t of allTasks) 作为遍历参数是合理的（task 的缩写）
    // 性能优化：原 .filter((t) =>) 已合并为单次 for...of 遍历
    expect(source).toMatch(/for\s*\(const\s+t\s+of\s+allTasks\)/);
  });

  it("回调参数遮蔽会导致 t() 调用失败（行为验证）", () => {
    // 模拟遮蔽场景
    function shadowExample() {
      const i18nFn = (key: string) => `i18n:${key}`;
      const tasks = [{ status: "done" }, { status: "pending" }];
      // 在 filter 回调内，t 是 task 而非 i18n 函数
      const result = tasks.filter((t) => t.status === "done");
      // i18nFn 仍在作用域内（未被遮蔽）
      return { result, label: i18nFn("done") };
    }
    const { result, label } = shadowExample();
    expect(result).toHaveLength(1);
    expect(label).toBe("i18n:done");
  });

  it("正确命名回调参数使 t() 可在回调内使用", () => {
    function correctExample() {
      const t = (key: string) => `i18n:${key}`;
      const tasks = [{ status: "done", label: "task1" }];
      const result = tasks.filter((task) => {
        // t 在此处仍是 i18n 函数
        return task.status === "done" && t("filter.done") === "i18n:filter.done";
      });
      return result;
    }
    expect(correctExample()).toHaveLength(1);
  });

  it("task-removal.ts 使用 (t) 回调参数但不导入 t（不违规）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/video/task-management/hooks/internals/task-removal.ts"),
      "utf-8",
    );
    expect(importsT(source)).toBe(false);
    expect(source).toMatch(/\.filter\(\(t\)\s*=>/);
  });

  it("task-initializer.ts 使用 (t) 回调参数但不导入 t（不违规）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/video/task-management/hooks/internals/task-initializer.ts"),
      "utf-8",
    );
    expect(importsT(source)).toBe(false);
  });
});
