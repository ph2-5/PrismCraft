/**
 * R135: secureConfigRouteSchema 必须使用 operation 字段
 * 回归防护: 确保 secureConfigRouteSchema 使用 `operation` 字段（与 handler 一致），
 *           而非 `action` 字段。防止 schema 与 handler 字段不匹配导致配置操作被跳过。
 *
 * 攻击场景：若 schema 使用 `action` 而 handler 读取 `operation`，则所有 secure-config
 * 请求都会因缺少 `operation` 字段而校验失败，或更危险地，schema 校验通过但 handler
 * 读取到 undefined，导致配置未被正确保存/加载。
 */
import { describe, it, expect } from "vitest";
import { secureConfigRouteSchema } from "../schemas";

describe("R135: secureConfigRouteSchema 必须使用 operation 字段", () => {
  it("secureConfigRouteSchema 应已导出", () => {
    expect(secureConfigRouteSchema).toBeDefined();
    expect(typeof secureConfigRouteSchema.safeParse).toBe("function");
  });

  it("{ operation: 'save' } 应通过校验", () => {
    const result = secureConfigRouteSchema.safeParse({ operation: "save" });
    expect(result.success).toBe(true);
  });

  it("{ operation: 'load' } 应通过校验", () => {
    const result = secureConfigRouteSchema.safeParse({ operation: "load" });
    expect(result.success).toBe(true);
  });

  it("{ operation: 'clear' } 应通过校验", () => {
    const result = secureConfigRouteSchema.safeParse({ operation: "clear" });
    expect(result.success).toBe(true);
  });

  it("{ operation: 'get' } 不应通过校验（handler 不支持 get，enum 已移除）", () => {
    const result = secureConfigRouteSchema.safeParse({ operation: "get" });
    expect(result.success).toBe(false);
  });

  it("{ action: 'save' } 不应通过校验（缺少 operation 字段）", () => {
    // schema 使用 operation 而非 action，所以仅有 action 应校验失败
    const result = secureConfigRouteSchema.safeParse({ action: "save" });
    expect(result.success).toBe(false);
  });

  it("{ operation: 'invalid' } 不应通过校验", () => {
    const result = secureConfigRouteSchema.safeParse({ operation: "invalid" });
    expect(result.success).toBe(false);
  });

  it("空对象不应通过校验（缺少 operation 必填字段）", () => {
    const result = secureConfigRouteSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("带 operation 和额外字段的请求应通过校验（passthrough）", () => {
    const result = secureConfigRouteSchema.safeParse({
      operation: "save",
      config: { apiKey: "test" },
      providerId: "openai",
    });
    expect(result.success).toBe(true);
  });

  it("operation 字段是必填的（非 optional）", () => {
    // 提供 operation: undefined 应校验失败
    const result = secureConfigRouteSchema.safeParse({
      operation: undefined,
      config: {},
    });
    expect(result.success).toBe(false);
  });
});
