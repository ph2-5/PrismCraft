/**
 * Novel Tool 3 — extract_scenes_from_text
 *
 * 从小说文本片段中提取所有场景信息。
 * 对每个场景提取：名称、类型、描述、氛围、时间、地点。
 * 返回 { scenes: ExtractedScene[] }。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { errorLogger } from "@/shared/error-logger";
import type { ExtractedScene } from "../domain/types";
import { generateJsonArrayWithAI, asString } from "./helpers";

export const extractScenesFromTextTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "extract_scenes_from_text",
      description:
        "从小说文本片段中提取所有场景信息。" +
        "对每个场景提取：name、type、description、atmosphere、timeOfDay、location。" +
        "支持通过 existingPlacesJson 参数去重（已提取的场景名列表）。" +
        "返回 { scenes: ExtractedScene[] }。",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "小说文本片段（必填）",
          },
          existingPlacesJson: {
            type: "string",
            description: "已提取的场景名称列表（JSON 数组字符串），用于去重。首次调用可不传。",
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

    let existingPlaces: string[] = [];
    const existingPlacesJson = asString(args.existingPlacesJson);
    if (existingPlacesJson) {
      try {
        const parsed = JSON.parse(existingPlacesJson);
        if (Array.isArray(parsed)) {
          existingPlaces = parsed.filter((v): v is string => typeof v === "string");
        }
      } catch (err) {
        // P1-3: 解析失败时记录日志，按无去重处理继续
        errorLogger.warn("[extract-scenes] existingPlacesJson 解析失败，按无去重处理", err);
      }
    }

    const prompt = `从以下小说文本中提取所有出现的场景/地点。

要求：
1. 每个场景包含：name(场景名称), type(类型：室内/室外/虚拟等), description(场景描述30-80字), atmosphere(氛围), timeOfDay(时间：白天/黄昏/夜晚等), location(具体位置)
2. **严格合并**：同一地点的多次出场合并为一个场景（如"指挥室"在多章出现只返回一次），description 综合多次描写
3. 名称规范化：使用文本中最常见的称呼（如"曙光号"而非"曙光号指挥室"+"曙光号会议室"分两次返回，应合并为"曙光号"或按显著不同地点分别返回）
${existingPlaces.length > 0 ? `4. 以下场景已提取过，**不要再次返回**：${existingPlaces.join(", ")}。即使文本中再次出现这些场景，也跳过不提取` : ""}

小说文本：
${text}

请只返回 JSON 数组，每个场景一个对象。已存在的场景不要出现在结果中。`;

    const raw = await generateJsonArrayWithAI(prompt, 8192);
    if (!raw) {
      return { success: false, error: "AI 提取场景失败或返回格式解析失败" };
    }

    // 双重去重：与 extract-characters 一致
    const seenPlaces = new Set(existingPlaces.map((n) => n.trim()));
    const scenes: ExtractedScene[] = [];
    for (const item of raw) {
      const s = (item ?? {}) as Record<string, unknown>;
      const rawName = asString(s.name) || "未知场景";
      const name = rawName.replace(/\s*\(已存在\)\s*$/i, "").trim();
      if (seenPlaces.has(name)) {
        continue;
      }
      seenPlaces.add(name);
      scenes.push({
        tempId: crypto.randomUUID(),
        name,
        type: asString(s.type),
        description: asString(s.description),
        atmosphere: asString(s.atmosphere),
        timeOfDay: asString(s.timeOfDay),
        location: asString(s.location),
        status: "new" as const,
        confirmed: false,
      });
    }

    return { success: true, data: { scenes } };
  },
};
