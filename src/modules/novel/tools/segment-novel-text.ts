/**
 * Novel Tool 1 — segment_novel_text
 *
 * 将小说文本自动分段为适合视频制作的故事段落。
 * 每段包含：标题、摘要、预估时长、关键事件。
 * 支持大文本：内部自动分块处理后合并重叠段落（通过 prevSegmentsJson 参数）。
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
2. 每段给出：title（标题，10字内）、summary（摘要，50字内）、estimatedDuration（预估视频时长，秒数）、keyEvents（关键事件列表）
3. 以 JSON 数组格式返回，字段：title, summary, estimatedDuration(number), keyEvents(string[])
${prevSegmentsJson ? `4. 前一段的已有分段：${prevSegmentsJson}。请检查本块开头是否与前一块末尾重叠，如有重叠请从本块中排除已处理的段落。` : ""}

小说文本：
${text}

请只返回 JSON 数组，不要加任何解释。`;

    const raw = await generateJsonArrayWithAI(prompt, 4000);
    if (!raw) {
      return { success: false, error: "AI 分段失败或返回格式解析失败" };
    }

    const segments: NovelSegment[] = raw.map((item, i) => {
      const s = (item ?? {}) as Record<string, unknown>;
      return {
        id: crypto.randomUUID(),
        title: asString(s.title) || `段落${i + 1}`,
        summary: asString(s.summary),
        startChar: 0,
        endChar: text.length,
        estimatedDuration: asNumber(s.estimatedDuration, 30),
        keyEvents: asStringArray(s.keyEvents),
        text: "",
      };
    });

    return { success: true, data: { segments } };
  },
};
