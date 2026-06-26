/**
 * R176: 数据常量层双用途字段（value + labelKey）
 *
 * 回归规则目的：
 *   数据常量需同时支持 prompt 构造（中文 value）和 UI 显示（i18n labelKey）
 *   时，必须使用 { value, labelKey } 结构而非 { value, label }。value 是
 *   发送给 AI 的中文 prompt 字符串（不可翻译），labelKey 是点分 i18n key
 *   用于 UI 显示。
 *
 * 被测代码：
 *   src/modules/character/constants.ts（styleSuggestions 已迁移）
 *   验证 { value, labelKey } 模式
 */
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";
import { styleSuggestions, type StyleOption } from "../constants";

const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/;

describe("R176: 数据常量层双用途字段（value + labelKey）", () => {
  it("styleSuggestions 使用 { value, labelKey } 结构（GOOD 示例）", () => {
    expect(styleSuggestions.length).toBeGreaterThan(0);
    for (const opt of styleSuggestions) {
      expect(typeof (opt as StyleOption).value).toBe("string");
      expect(typeof (opt as StyleOption).labelKey).toBe("string");
    }
  });

  it("value 是中文字符串（用于 prompt 构造）", () => {
    for (const opt of styleSuggestions) {
      expect(
        CJK_REGEX.test(opt.value),
        `value "${opt.value}" 应包含中文（prompt-facing）`,
      ).toBe(true);
    }
  });

  it("labelKey 是点分 i18n key（用于 UI 显示）", () => {
    for (const opt of styleSuggestions) {
      expect(opt.labelKey).toMatch(/^\w+\./);
      expect(CJK_REGEX.test(opt.labelKey)).toBe(false);
    }
  });

  it("labelKey 以 'styleOption.' 前缀开头", () => {
    for (const opt of styleSuggestions) {
      expect(opt.labelKey.startsWith("styleOption.")).toBe(true);
    }
  });

  it("styleSuggestions 不含 label 字段（旧结构）", () => {
    for (const opt of styleSuggestions) {
      expect("label" in opt).toBe(false);
      expect("labelKey" in opt).toBe(true);
    }
  });

  it("constants.ts 源码中 styleSuggestions 使用 labelKey 而非 label", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/character/constants.ts"),
      "utf-8",
    );
    const arrMatch = source.match(/export const styleSuggestions[\s\S]*?\];/);
    expect(arrMatch).not.toBeNull();
    const arrBody = arrMatch![0];
    // 不应有纯 label: 字段（排除 labelKey）
    const labelOnlyLines = arrBody
      .split("\n")
      .filter((l) => /\blabel\s*:/.test(l) && !/\blabelKey\s*:/.test(l));
    expect(labelOnlyLines.length).toBe(0);
  });

  it("StyleOption 接口定义 value 和 labelKey 两个 string 字段", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/character/constants.ts"),
      "utf-8",
    );
    const ifaceMatch = source.match(/export interface StyleOption[\s\S]*?\n\}/);
    expect(ifaceMatch).not.toBeNull();
    const iface = ifaceMatch![0];
    expect(iface).toMatch(/value:\s*string/);
    expect(iface).toMatch(/labelKey:\s*string/);
    expect(iface).not.toMatch(/label:\s*string/);
  });

  it("value 在数组内唯一（避免重复 prompt 选项）", () => {
    const values = styleSuggestions.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("labelKey 在数组内唯一（避免 i18n key 冲突）", () => {
    const keys = styleSuggestions.map((o) => o.labelKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("双用途字段模式：value（prompt）与 labelKey（UI）分离", () => {
    // 验证 value 和 labelKey 是不同的字符串（value 中文，labelKey 英文 key）
    for (const opt of styleSuggestions) {
      expect(opt.value).not.toBe(opt.labelKey);
      // value 含中文，labelKey 不含中文
      expect(CJK_REGEX.test(opt.value)).toBe(true);
      expect(CJK_REGEX.test(opt.labelKey)).toBe(false);
    }
  });
});
