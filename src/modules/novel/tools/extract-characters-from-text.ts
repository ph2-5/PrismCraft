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
3. **严格去重**：同一角色在文本中多次出现时，只返回一次（以首次出场为准），合并后续出场的外貌/性格信息
4. 名称规范化：使用文本中最完整的称呼（如"林晚"而非"林晚小姐"或"林通讯官"），避免别名导致重复
${existingNames.length > 0 ? `5. 以下角色已提取过，**不要再次返回**：${existingNames.join(", ")}。即使文本中再次出现这些角色，也跳过不提取` : ""}

小说文本：
${text}

请只返回 JSON 数组，每个角色一个对象。已存在的角色不要出现在结果中。`;

    const raw = await generateJsonArrayWithAI(prompt, 8192);
    if (!raw) {
      return { success: false, error: "AI 提取角色失败或返回格式解析失败" };
    }

    // 双重去重：AI 可能仍返回重复项，这里再做一次保障
    // 1. 清理 name 中的 "(已存在)" 标记（旧 prompt 的兼容）
    // 2. 按名称精确去重（保留首次出现）
    // 3. 与 existingNames 求差集
    const seenNames = new Set(existingNames.map((n) => n.trim()));
    const characters: ExtractedCharacter[] = [];
    for (const item of raw) {
      const c = (item ?? {}) as Record<string, unknown>;
      const rawName = asString(c.name) || "未知角色";
      // 清理可能存在的 "(已存在)" / "(已存在)" 后缀
      const name = rawName.replace(/\s*\(已存在\)\s*$/i, "").trim();
      if (seenNames.has(name)) {
        // 已存在（无论是 existingNames 还是本轮已加入），跳过
        continue;
      }
      seenNames.add(name);
      characters.push({
        tempId: crypto.randomUUID(),
        name,
        gender: asString(c.gender, "unknown"),
        age: typeof c.age === "number" ? c.age : undefined,
        description: asString(c.description),
        appearance: parseAppearance(c.appearance),
        personality: asStringArray(c.personality),
        firstAppearance: asString(c.firstAppearance),
        status: "new" as const,
        confirmed: false,
      });
    }

    return { success: true, data: { characters } };
  },
};
