/**
 * Q2-1: 章节识别工具（纯函数）。
 *
 * 通过正则识别中/英文章节标题，建立 chapter 层级并计算字符偏移。
 * 不依赖 AI，纯本地文本分析，零外部依赖。
 *
 * 支持的章节标题格式：
 * - 中文章节：第一章 / 第123回 / 第三节 / 卷一 / 第四部 / 第五篇
 * - 英文章节：Chapter 1 / CHAPTER 12
 *
 * 字符偏移语义：
 * - startChar = 章节标题在全文中的起始偏移（包含标题行）
 * - endChar = 下一个章节标题的起始偏移（不包含下一个标题），或全文长度（最后一个章节）
 * - 若未识别到章节，返回空数组（调用方按整文处理）
 */

import type { NovelChapter } from "../domain/types";

/**
 * 中文章节标题正则：
 * - 第X章/节/回/卷/部/篇，X 可为中文数字或阿拉伯数字
 * - 卷X/部X/篇X（无"第"字开头）
 *
 * 注意：使用 Unicode 中文数字范围 \u4e00-\u9fa5 + 数字。
 */
const CHAPTER_TITLE_PATTERNS: RegExp[] = [
  // 第X章/节/回/卷/部/篇（X 为中文数字或阿拉伯数字）
  // g 标志必需：使 exec() 在 while 循环中逐个匹配，否则无限循环返回第一个匹配导致 OOM
  /^[\t ]*第[一二三四五六七八九十百千零〇两\d]+[章节回卷部篇][\s:：、．\.]?[\t ]*(.*)$/gm,
  // 卷X/部X/篇X（无"第"字，单字前缀，避免误匹配"卷心菜"等）
  /^[\t ]*[卷部篇][一二三四五六七八九十百千零〇两\d]+[\s:：、．\.]?[\t ]*(.*)$/gm,
  // Chapter X（英文，大小写不敏感）
  /^[\t ]*Chapter\s+\d+[.:：:：\s]?[\t ]*(.*)$/gim,
];

/**
 * 检测小说文本中的章节，返回 NovelChapter[]。
 *
 * @param text 小说全文
 * @returns 章节列表（按出现顺序），若无章节标题则返回空数组
 */
export function detectChapters(text: string): NovelChapter[] {
  if (!text || text.length === 0) return [];

  // 收集所有章节标题匹配（含标题行完整文本、起始偏移、行尾偏移）
  interface RawMatch {
    titleLine: string;
    startChar: number;
    titleEndChar: number; // 标题行结束（含换行符）的位置
  }
  const matches: RawMatch[] = [];

  for (const pattern of CHAPTER_TITLE_PATTERNS) {
    // 重置 lastIndex（防止 /g 标志导致的状态残留）
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const startChar = m.index;
      const titleLine = m[0];
      // 标题行结束位置 = 匹配末尾
      const titleEndChar = startChar + titleLine.length;
      matches.push({ titleLine: titleLine.trim(), startChar, titleEndChar });
      // 防止零长度匹配导致死循环
      if (titleLine.length === 0) {
        pattern.lastIndex = startChar + 1;
      }
    }
  }

  if (matches.length === 0) return [];

  // 按出现位置排序，去重（同一位置可能被多个 pattern 匹配）
  matches.sort((a, b) => a.startChar - b.startChar);
  const deduped: RawMatch[] = [];
  for (const m of matches) {
    const last = deduped[deduped.length - 1];
    if (last && m.startChar === last.startChar) continue;
    deduped.push(m);
  }

  // 构建 NovelChapter[]
  const chapters: NovelChapter[] = deduped.map((m, i) => {
    const nextMatch = deduped[i + 1];
    const endChar = nextMatch ? nextMatch.startChar : text.length;
    return {
      id: `chapter-${i + 1}-${m.startChar}`,
      index: i + 1,
      title: m.titleLine,
      startChar: m.startChar,
      endChar,
      segmentIds: [],
    };
  });

  return chapters;
}

/**
 * 根据字符偏移确定所属章节。
 *
 * @param chapters 章节列表（已排序）
 * @param charOffset 字符偏移
 * @returns 所属章节（index/title），若不在任何章节内则返回 null
 */
export function findChapterByOffset(
  chapters: NovelChapter[],
  charOffset: number,
): { index: number; title: string } | null {
  for (const ch of chapters) {
    if (charOffset >= ch.startChar && charOffset < ch.endChar) {
      return { index: ch.index, title: ch.title };
    }
  }
  return null;
}
