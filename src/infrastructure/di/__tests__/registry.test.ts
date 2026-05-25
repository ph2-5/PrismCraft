import { describe, it, expect } from "vitest";
import { ModuleRegistry } from "@/infrastructure/di/registry";
import { createToken } from "@/infrastructure/di/types";

describe("ModuleRegistry", () => {
  it("应能注册和解析 token", () => {
    const registry = new ModuleRegistry();
    const token = createToken("testService", () => ({ value: 42 }));
    registry.register(token);
    const result = registry.resolve(token);
    expect(result.value).toBe(42);
  });

  it("singleton 模式应缓存实例", () => {
    const registry = new ModuleRegistry();
    let callCount = 0;
    const token = createToken("singleton", () => { callCount++; return { id: callCount }; });
    registry.register(token, "singleton");
    const a = registry.resolve(token);
    const b = registry.resolve(token);
    expect(a).toBe(b);
    expect(callCount).toBe(1);
  });

  it("解析未注册的 token 应抛出错误", () => {
    const registry = new ModuleRegistry();
    const token = createToken("unregistered", () => null);
    expect(() => registry.resolve(token)).toThrow("No registration found");
  });

  it("应检测循环依赖", () => {
    const registry = new ModuleRegistry();
    const tokenA = createToken("a", (c) => {
      c.resolve(createToken("b", () => null));
      return {};
    });
    const tokenB = createToken("b", (c) => {
      c.resolve(createToken("a", () => null));
      return {};
    });
    registry.register(tokenA);
    registry.register(tokenB);
    expect(() => registry.resolve(tokenA)).toThrow("Circular dependency");
  });

  it("has 应正确返回注册状态", () => {
    const registry = new ModuleRegistry();
    const token = createToken("exists", () => true);
    expect(registry.has("exists")).toBe(false);
    registry.register(token);
    expect(registry.has("exists")).toBe(true);
  });

  it("reset 应清理缓存", () => {
    const registry = new ModuleRegistry();
    let count = 0;
    const token = createToken("resetTest", () => ({ count: ++count }));
    registry.register(token);
    const a = registry.resolve(token);
    registry.reset();
    const b = registry.resolve(token);
    expect(a).not.toBe(b);
    expect(count).toBe(2);
  });
});
