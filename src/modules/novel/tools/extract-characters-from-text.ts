/**
 * Novel Tool 2 — extract_characters_from_text
 *
 * 从小说文本片段中提取所有角色信息。
 * 对每个角色提取：名称、性别、年龄、外貌描述（CharacterAppearance 6 字段）、性格特点、首次出场位置。
 * 返回 { characters: ExtractedCharacter[] }。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { errorLogger } from "@/shared/error-logger";
import type { ExtractedCharacter } from "../domain/types";
import type { CharacterAppearance } from "@/domain/schemas/character";
import { generateJsonArrayWithAI, asString, asStringArray } from "./helpers";

/** 从 AI 返回的原始对象中解析 CharacterAppearance（6 字段全部 default ""） */
function parseAppearance(raw: unknown): CharacterAppearance {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    hairColor: asString(obj.hairColor),
    hairStyle: asString(obj.hairStyle),
    eyeColor: asString(obj.eyeColor),
    height: asString(obj.height),
    build: asString(obj.build),
    clothing: asString(obj.clothing),
  };
}

export const extractCharactersFromTextTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "extract_characters_from_text",
      description:
        "从小说文本片段中提取所有角色信息。" +
        "对每个角色提取：name、gender、age、description、appearance（hairColor/hairStyle/eyeColor/height/build/clothing）、personality、firstAppearance。" +
        "支持通过 existingNamesJson 参数去重（已提取的角色名列表）。" +
        "返回 { characters: ExtractedCharacter[] }。",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "小说文本片段（必填）",
          },
          existingNamesJson: {
            type: "string",
            description: "已提取的角色名称列表（JSON 数组字符串），用于去重。首次调用可不传。",
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

    let existingNames: string[] = [];
    const existingNamesJson = asString(args.existingNamesJson);
    if (existingNamesJson) {
      try {
        const parsed = JSON.parse(existingNamesJson);
        if (Array.isArray(parsed)) {
          existingNames = parsed.filter((v): v is string => typeof v === "string");
        }
      } catch (err) {
        // P1-3: 解析失败时记录日志，按无去重处理继续
        errorLogger.warn("[extract-characters] existingNamesJson 解析失败，按无去重处理", err);
      }
    }

    const prompt = `从以下小说文本中提取所有有名字或有明确描写的角色。

要求：
1. 每个角色包含：name, gender(male/female/other/unknown), age(数字或null), description(外貌特征30-80字), appearance(对象：hairColor/hairStyle/eyeColor/height/build/clothing), personality(性格特征数组), firstAppearance(首次出场上下文20字)
2. 只提取有意义的角色（有名有姓或功能明确），路人/群众角色不提取
${existingNames.length > 0 ? `3. 已提取的角色：${existingNames.join(", ")}。如果发现同一角色，请在 name 后加 "(已存在)" 标记` : ""}

小说文本：
${text}

请只返回 JSON 数组，每个角色一个对象。`;

    const raw = await generateJsonArrayWithAI(prompt, 3000);
    if (!raw) {
      return { success: false, error: "AI 提取角色失败或返回格式解析失败" };
    }

    const characters: ExtractedCharacter[] = raw.map((item) => {
      const c = (item ?? {}) as Record<string, unknown>;
      return {
        tempId: crypto.randomUUID(),
        name: asString(c.name) || "未知角色",
        gender: asString(c.gender, "unknown"),
        age: typeof c.age === "number" ? c.age : undefined,
        description: asString(c.description),
        appearance: parseAppearance(c.appearance),
        personality: asStringArray(c.personality),
        firstAppearance: asString(c.firstAppearance),
        status: "new" as const,
        confirmed: false,
      };
    });

    return { success: true, data: { characters } };
  },
};
