/**
 * R159: validateApiKey MUST Return errorKey (i18n key), NOT Hardcoded Chinese Strings
 *
 * 回归规则目的：
 *   src/infrastructure/ai-providers/api-config/detect.ts 的 validateApiKey
 *   必须返回 { valid: boolean; errorKey?: string }，errorKey 是点分 i18n key
 *   （如 "provider.apiKey.empty"），不能是中文字符串。调用方通过 t(errorKey)
 *   翻译。这样保持 detect.ts 为纯函数，不依赖渲染进程的 i18n 模块。
 *
 * 历史问题：
 *   原返回类型 { valid; error?: string }，error 字段直接放中文（如
 *   "API Key 不能为空"），导致英文 locale 用户看到中文错误。
 *
 * 被测代码：
 *   src/infrastructure/ai-providers/api-config/detect.ts
 */
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";
import { validateApiKey } from "@/infrastructure/ai-providers/api-config/detect";

const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const ERROR_KEY_PREFIX = /^provider\.apiKey\./;

describe("R159: validateApiKey 必须返回 errorKey（i18n key）而非中文字符串", () => {
  it("空 key 返回 errorKey='provider.apiKey.empty'", () => {
    const result = validateApiKey("");
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe("provider.apiKey.empty");
    expect(CJK_REGEX.test(result.errorKey!)).toBe(false);
  });

  it("短 key (<10) 返回 errorKey='provider.apiKey.tooShort'", () => {
    const result = validateApiKey("abc");
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe("provider.apiKey.tooShort");
  });

  it("超长 key (>512) 返回 errorKey='provider.apiKey.tooLong'", () => {
    const result = validateApiKey("a".repeat(513));
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe("provider.apiKey.tooLong");
  });

  it("占位符 key 返回 errorKey='provider.apiKey.placeholderDetected'", () => {
    expect(validateApiKey("your_api_key_here").errorKey).toBe("provider.apiKey.placeholderDetected");
    expect(validateApiKey("placeholder_key_12345678").errorKey).toBe("provider.apiKey.placeholderDetected");
  });

  it("控制字符 key 返回 errorKey='provider.apiKey.invalidChars'", () => {
    const result = validateApiKey("sk-test\x00key-1234567890");
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe("provider.apiKey.invalidChars");
  });

  it("合法 key 返回 valid=true 且 errorKey=undefined", () => {
    const result = validateApiKey("sk-1234567890abcdef1234567890abcdef");
    expect(result.valid).toBe(true);
    expect(result.errorKey).toBeUndefined();
  });

  it("所有 errorKey 都以 'provider.apiKey.' 开头（点分 i18n 命名）", () => {
    const inputs = ["", "abc", "a".repeat(513), "your_key", "placeholder_x", "sk-\x00key1234567890"];
    for (const input of inputs) {
      const result = validateApiKey(input);
      if (!result.valid) {
        expect(result.errorKey).toMatch(ERROR_KEY_PREFIX);
      }
    }
  });

  it("所有 errorKey 都不含 CJK 字符（纯 i18n key）", () => {
    const inputs = ["", "abc", "a".repeat(513), "your_key", "placeholder_x", "sk-\x00key1234567890"];
    for (const input of inputs) {
      const result = validateApiKey(input);
      if (!result.valid && result.errorKey) {
        expect(CJK_REGEX.test(result.errorKey)).toBe(false);
      }
    }
  });

  it("detect.ts 源码 validateApiKey 函数体内不含中文字符", async () => {
    const source = await readFile(
      join(process.cwd(), "src/infrastructure/ai-providers/api-config/detect.ts"),
      "utf-8",
    );
    // 提取 validateApiKey 函数体（从函数签名到下一个 export function 或文件结尾）
    const match = source.match(
      /export function validateApiKey[\s\S]*?\n\}/,
    );
    expect(match).not.toBeNull();
    const fnBody = match![0];
    // 函数体内不应出现中文字符（注释也禁止，避免误以为可以硬编码）
    expect(CJK_REGEX.test(fnBody)).toBe(false);
  });
});
