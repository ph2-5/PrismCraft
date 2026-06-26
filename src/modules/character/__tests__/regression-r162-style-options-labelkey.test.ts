/**
 * R162: Config-Layer Display Strings MUST Use labelKey, But Prompt-Building value MUST Stay as the Chinese String
 *
 * 回归规则目的：
 *   src/modules/character/constants.ts 的 styleSuggestions 必须暴露 {value, labelKey}
 *   结构。value 是发送给 AI 的中文 prompt 字符串（不能翻译），labelKey 是点分
 *   i18n key（"styleOption.*"）用于 UI 显示。这同时支持 i18n 和 prompt 语义稳定。
 *
 * 被测代码：
 *   src/modules/character/constants.ts
 */
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";
import { styleSuggestions, type StyleOption } from "../constants";

const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/;

describe("R162: styleSuggestions 必须是 {value, labelKey} 结构", () => {
  it("styleSuggestions 是非空数组", () => {
    expect(Array.isArray(styleSuggestions)).toBe(true);
    expect(styleSuggestions.length).toBeGreaterThan(0);
  });

  it("每个 entry 都有 value 和 labelKey 字符串字段", () => {
    for (const opt of styleSuggestions) {
      expect(typeof (opt as StyleOption).value).toBe("string");
      expect(typeof (opt as StyleOption).labelKey).toBe("string");
      expect((opt as StyleOption).value.length).toBeGreaterThan(0);
      expect((opt as StyleOption).labelKey.length).toBeGreaterThan(0);
    }
  });

  it("每个 labelKey 都以 'styleOption.' 开头（点分 i18n key）", () => {
    for (const opt of styleSuggestions) {
      expect(opt.labelKey.startsWith("styleOption.")).toBe(true);
    }
  });

  it("每个 value 是中文字符串（prompt 必须用中文 value）", () => {
    // value 必须是 CJK 字符串 —— 这是发送给 AI 的 prompt value
    for (const opt of styleSuggestions) {
      expect(
        CJK_REGEX.test(opt.value),
        `value "${opt.value}" 应包含中文字符（prompt-facing value 必须保留中文）`,
      ).toBe(true);
    }
  });

  it("labelKey 不含中文字符（纯 i18n key）", () => {
    for (const opt of styleSuggestions) {
      expect(CJK_REGEX.test(opt.labelKey)).toBe(false);
    }
  });

  it("每个 entry 不应包含 label 字段（旧结构应为 labelKey）", () => {
    for (const opt of styleSuggestions) {
      // labelKey 应存在，label 字段不应存在
      expect("label" in opt).toBe(false);
      expect("labelKey" in opt).toBe(true);
    }
  });

  it("value 在数组内唯一（避免重复 prompt 选项）", () => {
    const values = styleSuggestions.map((o) => o.value);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("labelKey 在数组内唯一（避免 i18n key 冲突）", () => {
    const keys = styleSuggestions.map((o) => o.labelKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("constants.ts 源码不包含 label: 字段（只用 labelKey:）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/character/constants.ts"),
      "utf-8",
    );
    // 在 styleSuggestions 数组定义内不应出现 label: 字段
    const arrMatch = source.match(
      /export const styleSuggestions[\s\S]*?\];/,
    );
    expect(arrMatch).not.toBeNull();
    const arrBody = arrMatch![0];
    // 排除 labelKey 的匹配，单独检查纯 label: 字段
    const labelOnlyLines = arrBody
      .split("\n")
      .filter((l) => /\blebel\b/.test(l) === false)
      .filter((l) => /\blabel\s*:/.test(l) && !/\blabelKey\s*:/.test(l));
    expect(labelOnlyLines.length, `不应有 label: 字段，只用 labelKey:}`).toBe(0);
  });
});
