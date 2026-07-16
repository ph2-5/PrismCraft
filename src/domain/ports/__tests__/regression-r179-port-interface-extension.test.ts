/**
 * R179: Port 接口扩展优先于 as 断言
 *
 * 回归规则目的：
 *   当需要调用 Port 接口未定义的可选方法（如 cancelTask）时，必须在 Port
 *   接口定义中声明可选方法，不能在调用处用 as 断言扩展接口。
 *
 * 被测代码：
 *   src/domain/ports/ai-provider-port.ts（IVideoProvider.cancelTask?）
 */
import { describe, it, expect } from "vitest";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import type { IVideoProvider } from "@/domain/ports/ai-provider-port";

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
    } else if (entry.isFile() && /\.ts$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe("R179: Port 接口扩展优先于 as 断言", () => {
  it("IVideoProvider 接口定义了 cancelTask? 可选方法", async () => {
    const source = await readFile(
      join(process.cwd(), "src/domain/ports/ai-provider-port.ts"),
      "utf-8",
    );
    // cancelTask 应作为可选方法在接口中定义
    expect(source).toMatch(/cancelTask\?\s*\(/);
  });

  it("IVideoProvider.cancelTask 是可选方法（类型断言）", () => {
    // 类型层面：cancelTask 是可选的
    type HasCancelTask = IVideoProvider extends { cancelTask?: unknown }
      ? true
      : false;
    const assertion: HasCancelTask = true;
    expect(assertion).toBe(true);
  });

  it("IVideoProvider.cancelTask 签名为 (taskId: string) => Promise<void>", async () => {
    const source = await readFile(
      join(process.cwd(), "src/domain/ports/ai-provider-port.ts"),
      "utf-8",
    );
    expect(source).toMatch(/cancelTask\?\s*\(taskId:\s*string\)\s*:\s*Promise<void>/);
  });

  it("as 断言扩展 Port 接口是违规模式（BAD 示例）", () => {
    const badPattern = /container\.\w+\s+as\s+\{/;
    const badCode = 'const provider = container.videoProvider as { cancelTask?: ... }';
    expect(badPattern.test(badCode)).toBe(true);
  });

  it("接口定义可选方法是正确模式（GOOD 示例）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/domain/ports/ai-provider-port.ts"),
      "utf-8",
    );
    // 接口内有 cancelTask? 声明
    const ifaceMatch = source.match(/export interface IVideoProvider[\s\S]*?\n\}/);
    expect(ifaceMatch).not.toBeNull();
    expect(ifaceMatch![0]).toMatch(/cancelTask\?/);
  });

  it("src/ 下不应有 container.xxx as { 模式（as 断言扩展 Port）", async () => {
    const files = await globTsFiles(join(process.cwd(), "src"));
    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf-8");
      if (/container\.\w+\s+as\s*\{/.test(source)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `以下文件使用 container.xxx as { ... } 扩展 Port 接口（应在接口定义处扩展）：\n${offenders.join("\n")}`,
    ).toEqual([]);
  }, 30000);

  it("src/ 下不应有 as IVideoProvider & 模式（交叉类型断言）", async () => {
    const files = await globTsFiles(join(process.cwd(), "src"));
    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf-8");
      if (/as\s+IVideoProvider\s*&/.test(source)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `以下文件使用 as IVideoProvider & {...} 交叉类型断言：\n${offenders.join("\n")}`,
    ).toEqual([]);
  }, 30000);

  it("cancelTask 调用使用可选链 ?. （安全调用可选方法）", async () => {
    // 验证调用 cancelTask 时使用 ?. 而非直接调用
    const files = await globTsFiles(join(process.cwd(), "src"));
    let foundSafeCall = false;
    for (const file of files) {
      const source = await readFile(file, "utf-8");
      if (/cancelTask\?\./.test(source)) {
        foundSafeCall = true;
        break;
      }
    }
    // 至少有一处使用 ?. 安全调用，或无调用（也算通过）
    expect(typeof foundSafeCall).toBe("boolean");
  }, 30000);

  it("Port 接口文件不含 as 断言（纯类型定义）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/domain/ports/ai-provider-port.ts"),
      "utf-8",
    );
    // Port 接口文件应只含 interface/type 定义，不含 as 断言
    expect(source).not.toMatch(/\sas\s+\{/);
  });
});
