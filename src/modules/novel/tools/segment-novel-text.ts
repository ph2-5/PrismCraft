/**
 * Novel Tool 1 — segment_novel_text
 *
 * 将小说文本自动分段为适合视频制作的故事段落。
 * 每段包含：标题、摘要、预估时长、关键事件。
 * 支持大文本：内部自动分块处理后合并重叠段落（通过 prevSegmentsJson 参数）。
 *
 * Q2-1: 修正字符偏移追踪。原实现硬编码 startChar=0/endChar=text.length，导致所有 segment
 * 都覆盖整个原文，偏移追踪失效。现改为：要求 AI 返回首句文本（firstSentence），
 * 在原文中查找真实偏移；找不到时回退到顺序累加偏移（按段落长度累计）。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import type { NovelSegment } from "../domain/types";
import { generateJsonArrayWithAI, asString, asNumber, asStringArray } from "./helpers";

export const segmentNovelTextTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "segment_novel_text",
      description:
        "将小说文本自动分段为适合视频制作的故事段落。" +
        "每段包含：标题、摘要、预估视频时长（秒）、关键事件列表。" +
        "支持大文本：通过 prevSegmentsJson 参数传入前一块的分段结果，可自动去重合并重叠段落。" +
        "返回 { segments: NovelSegment[] }。",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "小说文本片段（必填）",
          },
          prevSegmentsJson: {
            type: "string",
            description: "前一块的分析结果（JSON 字符串），用于去重合并。首次调用可不传。",
          },
        },
        required: ["text"],
      },
    },
  },
  domain: "novel",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const text = asString(args.text);
    if (!text) {
      return { success: false, error: "参数 text 不能为空" };
    }
    const prevSegmentsJson = asString(args.prevSegmentsJson);

    const prompt = `以下是一段小说文本，请分析并分成适合视频制作的故事段落。

要求：
1. 按故事节奏和场景变化分段，每段对应一个视频分镜单元
2. 每段给出：title（标题，10字内）、summary（摘要，50字内）、estimatedDuration（预估视频时长，秒数）、keyEvents（关键事件列表）、firstSentence（该段在原文中的第一句话，用于精确定位偏移，必须与原文完全一致）
3. 以 JSON 数组格式返回，字段：title, summary, estimatedDuration(number), keyEvents(string[]), firstSentence(string)
${prevSegmentsJson ? `4. 前一段的已有分段：${prevSegmentsJson}。请检查本块开头是否与前一块末尾重叠，如有重叠请从本块中排除已处理的段落。` : ""}

小说文本：
${text}

请只返回 JSON 数组，不要加任何解释。`;

    const raw = await generateJsonArrayWithAI(prompt, 4000);
    if (!raw) {
      return { success: false, error: "AI 分段失败或返回格式解析失败" };
    }

    // Q2-1: 修正字符偏移追踪
    // 策略：用 AI 返回的 firstSentence 在原文中查找真实偏移；
    // 找不到时按剩余段落数均分剩余文本，保证偏移单调递增、无重叠、覆盖全文。
    let cursor = 0; // 下一次搜索的起始游标
    const totalSegments = raw.length;
    const segments: NovelSegment[] = raw.map((item, i) => {
      const s = (item ?? {}) as Record<string, unknown>;
      const title = asString(s.title) || `段落${i + 1}`;
      const summary = asString(s.summary);
      const estimatedDuration = asNumber(s.estimatedDuration, 30);
      const keyEvents = asStringArray(s.keyEvents);
      const firstSentence = asString(s.firstSentence);

      let startChar: number;
      if (firstSentence && firstSentence.length > 0) {
        // 在 cursor 之后查找 firstSentence（避免匹配到前面的重复句子）
        const found = text.indexOf(firstSentence, cursor);
        if (found >= 0) {
          startChar = found;
          // 推进游标到首句之后，避免下次重复匹配
          cursor = found + firstSentence.length;
        } else {
          // 找不到 firstSentence，用当前游标作为起始
          startChar = cursor;
          // 按剩余段落数均分剩余文本，推进游标
          const remainingSegments = totalSegments - i - 1;
          if (remainingSegments > 0) {
            const remainingLength = text.length - cursor;
            const segmentLength = Math.max(1, Math.floor(remainingLength / remainingSegments));
            cursor = Math.min(text.length, cursor + segmentLength);
          }
        }
      } else {
        // 无 firstSentence，用当前游标作为起始
        startChar = cursor;
        // 按剩余段落数均分剩余文本，推进游标
        const remainingSegments = totalSegments - i - 1;
        if (remainingSegments > 0) {
          const remainingLength = text.length - cursor;
          const segmentLength = Math.max(1, Math.floor(remainingLength / remainingSegments));
          cursor = Math.min(text.length, cursor + segmentLength);
        }
      }

      return {
        id: crypto.randomUUID(),
        title,
        summary,
        startChar,
        endChar: text.length, // 占位，后处理修正为下一个 segment 的 startChar
        estimatedDuration,
        keyEvents,
        text: "", // 占位，后处理切片
      };
    });

    // Q2-1: 后处理 — 修正每个 segment 的 endChar 为下一个 segment 的 startChar
    // 保证 segment 首尾相连，覆盖全文，无重叠无遗漏
    for (let i = 0; i < segments.length - 1; i++) {
      const current = segments[i];
      const next = segments[i + 1];
      if (!current || !next) continue;
      current.endChar = next.startChar;
      current.text = text.slice(current.startChar, current.endChar);
    }
    // 最后一个 segment 的 endChar 设为全文长度
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      if (last) {
        last.endChar = text.length;
        last.text = text.slice(last.startChar, last.endChar);
      }
    }

    return { success: true, data: { segments } };
  },
};
