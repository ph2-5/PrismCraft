/**
 * Q2-1: chapter-detector 单元测试
 *
 * 覆盖章节识别正则、字符偏移计算、findChapterByOffset 查找逻辑。
 */

import { describe, it, expect } from "vitest";
import { detectChapters, findChapterByOffset } from "../chapter-detector";

describe("detectChapters", () => {
  it("空文本返回空数组", () => {
    expect(detectChapters("")).toEqual([]);
  });

  it("无章节标题的文本返回空数组", () => {
    const text = "这是一段普通的小说文本，没有任何章节标题。\n\n只是普通的段落而已。";
    expect(detectChapters(text)).toEqual([]);
  });

  it("识别中文章节标题（第一章）", () => {
    const text = "第一章 风起云涌\n\n这是第一章的内容。\n\n第二章 山雨欲来\n\n这是第二章的内容。";
    const chapters = detectChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.index).toBe(1);
    expect(chapters[0]!.title).toContain("第一章");
    expect(chapters[0]!.startChar).toBe(0);
    expect(chapters[1]!.index).toBe(2);
    expect(chapters[1]!.title).toContain("第二章");
    expect(chapters[1]!.endChar).toBe(text.length);
  });

  it("识别中文章节标题（第23回）", () => {
    const text = "第23回 暗夜惊雷\n\n内容\n\n第24回 黎明破晓\n\n内容";
    const chapters = detectChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toContain("第23回");
    expect(chapters[1]!.title).toContain("第24回");
  });

  it("识别中文章节标题（第三节）", () => {
    const text = "第三节 转折点\n\n内容";
    const chapters = detectChapters(text);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.title).toContain("第三节");
  });

  it("识别中文卷标题（卷一）", () => {
    const text = "卷一 开端\n\n内容\n\n卷二 发展\n\n内容";
    const chapters = detectChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toContain("卷一");
    expect(chapters[1]!.title).toContain("卷二");
  });

  it("识别英文章节标题（Chapter 1）", () => {
    const text = "Chapter 1: The Beginning\n\nContent here.\n\nChapter 2: The End\n\nMore content.";
    const chapters = detectChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toContain("Chapter 1");
    expect(chapters[1]!.title).toContain("Chapter 2");
  });

  it("识别英文大写章节标题（CHAPTER 12）", () => {
    const text = "CHAPTER 12. The Climax\n\nContent.";
    const chapters = detectChapters(text);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.title).toContain("CHAPTER 12");
  });

  it("章节偏移正确：首尾相连，覆盖全文", () => {
    const text = "第一章 开始\n\n内容A\n\n第二章 结束\n\n内容B";
    const chapters = detectChapters(text);
    expect(chapters).toHaveLength(2);
    // 第一章从 0 开始
    expect(chapters[0]!.startChar).toBe(0);
    // 第一章的 endChar = 第二章的 startChar
    expect(chapters[0]!.endChar).toBe(chapters[1]!.startChar);
    // 第二章的 endChar = 全文长度
    expect(chapters[1]!.endChar).toBe(text.length);
  });

  it("章节内容可正确切片", () => {
    const text = "第一章 开始\n\n这是第一章的内容。\n\n第二章 结束\n\n这是第二章的内容。";
    const chapters = detectChapters(text);
    expect(chapters).toHaveLength(2);
    const chapter1Text = text.slice(chapters[0]!.startChar, chapters[0]!.endChar);
    const chapter2Text = text.slice(chapters[1]!.startChar, chapters[1]!.endChar);
    expect(chapter1Text).toContain("第一章");
    expect(chapter1Text).toContain("这是第一章的内容");
    expect(chapter2Text).toContain("第二章");
    expect(chapter2Text).toContain("这是第二章的内容");
    // 章节不重叠
    expect(chapter1Text).not.toContain("这是第二章的内容");
    expect(chapter2Text).not.toContain("这是第一章的内容");
  });

  it("segmentIds 初始为空数组", () => {
    const text = "第一章 开始\n\n内容";
    const chapters = detectChapters(text);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.segmentIds).toEqual([]);
  });

  it("多个连续章节（5个）", () => {
    const text = [
      "第一章 一",
      "内容1",
      "第二章 二",
      "内容2",
      "第三章 三",
      "内容3",
      "第四章 四",
      "内容4",
      "第五章 五",
      "内容5",
    ].join("\n\n");
    const chapters = detectChapters(text);
    expect(chapters).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(chapters[i]!.index).toBe(i + 1);
    }
    // 验证偏移链式正确
    for (let i = 0; i < 4; i++) {
      expect(chapters[i]!.endChar).toBe(chapters[i + 1]!.startChar);
    }
    expect(chapters[4]!.endChar).toBe(text.length);
  });

  it("章节标题前有缩进或空白", () => {
    const text = "  第一章 开始\n\n内容\n\n\t第二章 结束\n\n内容";
    const chapters = detectChapters(text);
    expect(chapters).toHaveLength(2);
  });
});

describe("findChapterByOffset", () => {
  it("空章节列表返回 null", () => {
    expect(findChapterByOffset([], 100)).toBeNull();
  });

  it("偏移在第一个章节内", () => {
    const text = "第一章 开始\n\n内容A\n\n第二章 结束\n\n内容B";
    const chapters = detectChapters(text);
    // 偏移 5 在第一章内
    const result = findChapterByOffset(chapters, 5);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(1);
    expect(result!.title).toContain("第一章");
  });

  it("偏移在第二个章节内", () => {
    const text = "第一章 开始\n\n内容A\n\n第二章 结束\n\n内容B";
    const chapters = detectChapters(text);
    // 偏移在第二章标题处
    const chapter2Start = chapters[1]!.startChar;
    const result = findChapterByOffset(chapters, chapter2Start + 5);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(2);
  });

  it("偏移在章节边界上", () => {
    const text = "第一章 开始\n\n内容A\n\n第二章 结束\n\n内容B";
    const chapters = detectChapters(text);
    // 第一章的 startChar（边界包含）
    const ch1Start = chapters[0]!.startChar;
    expect(findChapterByOffset(chapters, ch1Start)?.index).toBe(1);
    // 第一章的 endChar = 第二章的 startChar（边界不包含，属于下一章）
    const ch1End = chapters[0]!.endChar;
    expect(findChapterByOffset(chapters, ch1End)?.index).toBe(2);
  });

  it("偏移超出范围返回 null", () => {
    const text = "第一章 开始\n\n内容";
    const chapters = detectChapters(text);
    // 偏移等于全文长度（超出最后一个章节的 endChar-1）
    expect(findChapterByOffset(chapters, text.length)).toBeNull();
  });
});
