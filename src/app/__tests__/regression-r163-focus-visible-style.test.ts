/**
 * R163: Global :focus-visible Style MUST Live in globals.css
 *
 * 回归规则目的：
 *   src/app/globals.css 必须定义 :focus-visible 规则（outline: 2px solid var(--ring, ...)）
 *   以及 button:focus:not(:focus-visible) / a:focus:not(:focus-visible) 抑制鼠标点击焦点环。
 *   单一来源，避免各组件自己定义 focus 样式导致漂移。
 *
 * 被测代码：
 *   src/app/globals.css
 */
import { describe, it, expect } from "vitest";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

async function globCss(dir: string, results: string[] = []): Promise<string[]> {
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
      await globCss(full, results);
    } else if (entry.isFile() && /\.css$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe("R163: 全局 :focus-visible 样式必须在 globals.css 中定义", () => {
  it("globals.css 包含 :focus-visible 规则", async () => {
    const source = await readFile(
      join(process.cwd(), "src/app/globals.css"),
      "utf-8",
    );
    expect(source).toMatch(/:focus-visible\s*\{/);
  });

  it("globals.css 的 :focus-visible 规则包含 outline 声明", async () => {
    const source = await readFile(
      join(process.cwd(), "src/app/globals.css"),
      "utf-8");
    // 提取 :focus-visible 块
    const blockMatch = source.match(
      /:focus-visible\s*\{[^}]*\}/,
    );
    expect(blockMatch).not.toBeNull();
    const block = blockMatch![0];
    expect(block).toMatch(/outline\s*:/);
  });

  it("globals.css 包含 button:focus:not(:focus-visible) 抑制鼠标焦点环", async () => {
    const source = await readFile(
      join(process.cwd(), "src/app/globals.css"),
      "utf-8",
    );
    expect(source).toMatch(/button:focus:not\(:focus-visible\)/);
  });

  it("globals.css 包含 a:focus:not(:focus-visible) 抑制鼠标焦点环", async () => {
    const source = await readFile(
      join(process.cwd(), "src/app/globals.css"),
      "utf-8",
    );
    expect(source).toMatch(/a:focus:not\(:focus-visible\)/);
  });

  it(":focus-visible 块内使用 var(--ring, var(--primary)) 作为 outline 颜色", async () => {
    const source = await readFile(
      join(process.cwd(), "src/app/globals.css"),
      "utf-8",
    );
    const blockMatch = source.match(/:focus-visible\s*\{[^}]*\}/);
    expect(blockMatch).not.toBeNull();
    const block = blockMatch![0];
    // 必须使用 var(--ring, ...) 或 var(--primary) —— 不应硬编码颜色
    expect(block).toMatch(/var\(--ring/);
  });

  it("全局仅有一处 :focus-visible 规则定义（单一来源）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/app/globals.css"),
      "utf-8",
    );
    const matches = source.match(/:focus-visible\s*\{/g) ?? [];
    // 至少 1 处；但不应超过 2 处（允许一处 :focus-visible + 一处 :not(:focus-visible)）
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("其他 CSS 文件不应重新定义 :focus-visible 规则（应继承全局）", async () => {
    // 扫描所有 src/**/*.css，确认 :focus-visible 规则块只在 globals.css
    const cssFiles = await globCss(join(process.cwd(), "src"));
    const offenders: string[] = [];
    for (const file of cssFiles) {
      if (file.endsWith("globals.css")) continue;
      const source = await readFile(file, "utf-8");
      if (/:focus-visible\s*\{/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders, `其他 CSS 文件不应重定义 :focus-visible：${offenders.join(", ")}`).toEqual([]);
  });
});
