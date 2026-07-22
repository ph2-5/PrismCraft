import { describe, it, expect } from "vitest";
import {
  extractJsonObject,
  extractJsonArray,
  safeParseJson,
  extractAndParseJsonObject,
  extractAndParseJsonArray,
} from "../index";

describe("json 工具", () => {
  describe("extractJsonObject", () => {
    it("应从纯文本中提取第一个 JSON 对象片段", () => {
      const text = "前导文本 {\"a\":1} 尾部";
      expect(extractJsonObject(text)).toBe("{\"a\":1}");
    });

    it("应提取包含嵌套大括号的对象片段", () => {
      const text = "数据 {\"a\":{\"b\":2}} 结束";
      expect(extractJsonObject(text)).toBe("{\"a\":{\"b\":2}}");
    });

    it("应提取跨多行的对象片段", () => {
      const text = "result: {\n  \"k\": \"v\"\n}\n trailing";
      expect(extractJsonObject(text)).toBe("{\n  \"k\": \"v\"\n}");
    });

    it("应返回第一个匹配（多对象文本）", () => {
      const text = "{\"a\":1} 中间 {\"b\":2}";
      expect(extractJsonObject(text)).toBe("{\"a\":1} 中间 {\"b\":2}");
    });

    it("文本中无 { 时应返回 null", () => {
      expect(extractJsonObject("纯文本无大括号")).toBeNull();
    });

    it("文本中只有 } 时应返回 null（无匹配）", () => {
      expect(extractJsonObject("只有 } 结束符")).toBeNull();
    });
  });

  describe("extractJsonArray", () => {
    it("应从文本中提取数组片段", () => {
      const text = "结果 [1,2,3] 完成";
      expect(extractJsonArray(text)).toBe("[1,2,3]");
    });

    it("应提取包含对象的数组片段", () => {
      const text = "list [{\"k\":1},{\"k\":2}]";
      expect(extractJsonArray(text)).toBe("[{\"k\":1},{\"k\":2}]");
    });

    it("应提取跨行数组片段", () => {
      const text = "arr [\n  1,\n  2\n]";
      expect(extractJsonArray(text)).toBe("[\n  1,\n  2\n]");
    });

    it("无 [ 时应返回 null", () => {
      expect(extractJsonArray("no brackets here")).toBeNull();
    });

    it("只有 [ 时应返回 null", () => {
      expect(extractJsonArray("[ alone")).toBeNull();
    });
  });

  describe("safeParseJson", () => {
    it("应正确解析合法 JSON 字符串", () => {
      expect(safeParseJson("{\"a\":1}")).toEqual({ a: 1 });
    });

    it("应解析数组 JSON 字符串", () => {
      expect(safeParseJson("[1,2,3]")).toEqual([1, 2, 3]);
    });

    it("应解析原始值（数字）", () => {
      expect(safeParseJson("42")).toBe(42);
    });

    it("非法 JSON 时应返回 null（不抛异常）", () => {
      expect(safeParseJson("not json")).toBeNull();
    });

    it("应支持泛型类型断言", () => {
      const result = safeParseJson<{ name: string }>("{\"name\":\"test\"}");
      expect(result?.name).toBe("test");
    });

    it("空字符串应返回 null", () => {
      expect(safeParseJson("")).toBeNull();
    });
  });

  describe("extractAndParseJsonObject", () => {
    it("应从纯文本提取并解析对象", () => {
      const result = extractAndParseJsonObject<{ a: number }>("结果是 {\"a\":1} 结束");
      expect(result).toEqual({ a: 1 });
    });

    it("应从 markdown 代码块中提取对象", () => {
      const text = "响应:\n```json\n{\"b\":2}\n```\n结束";
      expect(extractAndParseJsonObject<{ b: number }>(text)).toEqual({ b: 2 });
    });

    it("应从无 json 标记的代码块提取对象", () => {
      const text = "```{\"c\":3}```";
      expect(extractAndParseJsonObject<{ c: number }>(text)).toEqual({ c: 3 });
    });

    it("首尾大括号兜底应提取对象", () => {
      const text = "包裹 {\"d\":4} 内容";
      expect(extractAndParseJsonObject<{ d: number }>(text)).toEqual({ d: 4 });
    });

    it("非法 JSON 对象时应返回 null", () => {
      expect(extractAndParseJsonObject("{not valid}")).toBeNull();
    });

    it("文本中无对象时应返回 null", () => {
      expect(extractAndParseJsonObject("无 JSON")).toBeNull();
    });

    it("直接匹配成功时不应触发兜底逻辑", () => {
      // 正则 \{[\s\S]*\} 贪婪，会匹配到最后一个 }，故仅放一个 JSON 对象
      const text = "prefix {\"v\":1} suffix";
      const result = extractAndParseJsonObject<{ v: number }>(text);
      expect(result).toEqual({ v: 1 });
    });

    it("代码块内对象不合法时回退到首尾大括号", () => {
      const text = "```\nbad json\n```\n{\"f\":6}";
      expect(extractAndParseJsonObject<{ f: number }>(text)).toEqual({ f: 6 });
    });
  });

  describe("extractAndParseJsonArray", () => {
    it("应从纯文本提取并解析数组", () => {
      const result = extractAndParseJsonArray<number>("arr [1,2,3]");
      expect(result).toEqual([1, 2, 3]);
    });

    it("应从 markdown 代码块提取数组", () => {
      const text = "```json\n[4,5]\n```";
      expect(extractAndParseJsonArray<number>(text)).toEqual([4, 5]);
    });

    it("首尾中括号兜底应提取数组", () => {
      const text = "data [6,7] end";
      expect(extractAndParseJsonArray<number>(text)).toEqual([6, 7]);
    });

    it("解析到对象（非数组）时应返回 null", () => {
      const text = "{\"x\":1}";
      expect(extractAndParseJsonArray(text)).toBeNull();
    });

    it("无数组时应返回 null", () => {
      expect(extractAndParseJsonArray("no array")).toBeNull();
    });

    it("代码块内为非数组时应回退到首尾中括号", () => {
      const text = "```{\"x\":1}```\n[8,9]";
      expect(extractAndParseJsonArray<number>(text)).toEqual([8, 9]);
    });

    it("应支持对象数组", () => {
      const text = "[{\"k\":\"a\"},{\"k\":\"b\"}]";
      const result = extractAndParseJsonArray<{ k: string }>(text);
      expect(result).toEqual([{ k: "a" }, { k: "b" }]);
    });
  });
});
