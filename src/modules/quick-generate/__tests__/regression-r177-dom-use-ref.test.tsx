/**
 * R177: DOM 操作必须用 useRef
 *
 * 回归规则目的：
 *   React 组件内对 DOM 元素的操作（如 .click()、.focus()）必须通过 useRef
 *   引用元素，不能使用 document.getElementById。document.getElementById
 *   在虚拟 DOM 之外操作，可能导致引用过期、SSR 不兼容、多实例冲突。
 *
 * 被测代码：
 *   验证规则模式（通过渲染示例 + 源码扫描）
 */
import { describe, it, expect, vi, beforeEach, vi as vitest } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

function FileInputWithRef() {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={inputRef} type="file" aria-label="文件选择" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="触发文件选择"
      >
        选择文件
      </button>
    </>
  );
}

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

describe("R177: DOM 操作必须用 useRef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useRef 引用的 input 可被 ref.current 访问（GOOD 示例）", () => {
    render(<FileInputWithRef />);
    const input = screen.getByLabelText("文件选择");
    expect(input).not.toBeNull();
    expect(input.tagName).toBe("INPUT");
  });

  it("点击按钮触发 input.click()（通过 ref）", () => {
    const clickSpy = vitest.spyOn(HTMLInputElement.prototype, "click");
    render(<FileInputWithRef />);
    const button = screen.getByRole("button", { name: "触发文件选择" });
    fireEvent.click(button);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("main.tsx 是唯一允许 document.getElementById 的文件（入口点）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/main.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/document\.getElementById/);
    // main.tsx 是入口点，ReactDOM.createRoot 用 getElementById 是合理的
  });

  it("src/ 下组件文件不含 document.getElementById", async () => {
    const files = await globTsFiles(join(process.cwd(), "src"));
    const offenders: string[] = [];
    for (const file of files) {
      // 跳过入口文件 main.tsx
      if (file.endsWith("main.tsx")) continue;
      const source = await readFile(file, "utf-8");
      if (/document\.getElementById/.test(source)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `以下文件使用了 document.getElementById（应改用 useRef）：\n${offenders.join("\n")}`,
    ).toEqual([]);
  }, 30000);

  it("useRef 模式在项目中广泛使用", async () => {
    const files = await globTsFiles(join(process.cwd(), "src"));
    let useRefCount = 0;
    for (const file of files) {
      const source = await readFile(file, "utf-8");
      useRefCount += (source.match(/useRef</g) || []).length;
    }
    expect(useRefCount).toBeGreaterThan(0);
  }, 30000);

  it("Modal.tsx 使用 useRef 引用 modal 容器（非 getElementById）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/Modal.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/useRef/);
    expect(source).not.toMatch(/document\.getElementById/);
  });

  it("ref.current?.focus() 模式（非 document.getElementById().focus()）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/Modal.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/modalRef\.current\?\.focus/);
  });

  it("Tabs.tsx 使用 useRef 引用 tab 按钮数组", async () => {
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/Tabs.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/useRef/);
    expect(source).not.toMatch(/document\.getElementById/);
  });
});
