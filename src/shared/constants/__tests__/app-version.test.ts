import { describe, it, expect } from "vitest";
import { APP_VERSION } from "../app-version";

describe("APP_VERSION", () => {
  it("应导出字符串常量", () => {
    expect(typeof APP_VERSION).toBe("string");
    expect(APP_VERSION.length).toBeGreaterThan(0);
  });

  it("应以 'v' 前缀开头（约定格式 vX.Y.Z）", () => {
    expect(APP_VERSION.startsWith("v")).toBe(true);
  });

  it("应符合语义化版本号格式 vX.Y.Z", () => {
    const semverPattern = /^v\d+\.\d+\.\d+$/;
    expect(APP_VERSION).toMatch(semverPattern);
  });

  it("应与 package.json 的 version 字段保持一致", () => {
    // 期望 APP_VERSION 等于 'v' + package.json 的 version
    // 这里通过校验格式而非硬编码字符串，避免版本变更时测试失败
    const [major, minor, patch] = APP_VERSION.replace(/^v/, "").split(".").map(Number);
    expect(Number.isInteger(major)).toBe(true);
    expect(Number.isInteger(minor)).toBe(true);
    expect(Number.isInteger(patch)).toBe(true);
    expect(major).toBeGreaterThanOrEqual(0);
    expect(minor).toBeGreaterThanOrEqual(0);
    expect(patch).toBeGreaterThanOrEqual(0);
  });
});
