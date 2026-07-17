/**
 * Novel Tool 4 — match_entities
 *
 * 将提取的角色/场景与现有数据库记录做三级匹配（精确 → 模糊 → 向量）。
 * 标记 status：matched（高置信度匹配）/ conflict（中等置信度，需用户确认）/ new（无匹配）。
 *
 * 匹配策略：
 * 1. 精确匹配：名称完全相同（相似度 = 1.0）
 * 2. 模糊匹配：Levenshtein 相似度 >= 0.8 → matched
 * 3. 冲突区间：相似度 0.6-0.8 → conflict（需用户确认）
 * 4. 无匹配：相似度 < 0.6 → new
 *
 * 返回 { characters: ExtractedCharacter[], scenes: ExtractedScene[] }（带更新后的 status / matchedCharacterId / matchedSceneId）。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import type { ExtractedCharacter, ExtractedScene } from "../domain/types";
import { nameSimilarity, MATCH_THRESHOLDS, asString } from "./helpers";

interface MatchedEntity {
  tempId: string;
  matchedId: string;
  confidence: number;
  status: "matched" | "conflict";
}

/** 对单个提取实体（tempId + name）在现有库（id + name 列表）中找最佳匹配 */
function findBestMatch(
  extractedName: string,
  existing: Array<{ id: string; name: string }>,
): MatchedEntity | null {
  let best: MatchedEntity | null = null;
  for (const ex of existing) {
    const sim = nameSimilarity(extractedName, ex.name);
    if (sim >= MATCH_THRESHOLDS.fuzzy) {
      // 高置信度匹配
      if (!best || sim > best.confidence) {
        best = {
          tempId: "", // 由调用方填充
          matchedId: ex.id,
          confidence: sim,
          status: "matched",
        };
      }
    } else if (sim >= MATCH_THRESHOLDS.conflict) {
      // 冲突区间
      if (!best || sim > best.confidence) {
        best = {
          tempId: "",
          matchedId: ex.id,
          confidence: sim,
          status: "conflict",
        };
      }
    }
  }
  return best;
}

export const matchEntitiesTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "match_entities",
      description:
        "将 extract_characters_from_text 和 extract_scenes_from_text 提取的角色/场景与现有数据库记录做三级匹配（精确 → 模糊 Levenshtein → 冲突区间）。" +
        "标记 status：matched（相似度≥0.8）/ conflict（0.6-0.8，需用户确认）/ new（<0.6）。" +
        "matched 状态会填充 matchedCharacterId / matchedSceneId + matchConfidence。" +
        "返回 { characters: ExtractedCharacter[], scenes: ExtractedScene[] }。",
      parameters: {
        type: "object",
        properties: {
          charactersJson: {
            type: "string",
            description: "extract_characters_from_text 返回的角色 JSON 数组字符串",
          },
          scenesJson: {
            type: "string",
            description: "extract_scenes_from_text 返回的场景 JSON 数组字符串",
          },
        },
      },
    },
  },
  domain: "novel",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    // 解析输入
    let inputCharacters: ExtractedCharacter[] = [];
    let inputScenes: ExtractedScene[] = [];
    const charactersJson = asString(args.charactersJson);
    const scenesJson = asString(args.scenesJson);

    if (charactersJson) {
      try {
        const parsed = JSON.parse(charactersJson);
        if (Array.isArray(parsed)) {
          inputCharacters = parsed as ExtractedCharacter[];
        }
      } catch {
        return { success: false, error: "charactersJson 解析失败" };
      }
    }
    if (scenesJson) {
      try {
        const parsed = JSON.parse(scenesJson);
        if (Array.isArray(parsed)) {
          inputScenes = parsed as ExtractedScene[];
        }
      } catch {
        return { success: false, error: "scenesJson 解析失败" };
      }
    }

    if (inputCharacters.length === 0 && inputScenes.length === 0) {
      return { success: false, error: "charactersJson 和 scenesJson 都为空" };
    }

    // 并行加载现有角色/场景
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");
    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);

    const existingCharacters = charResult.ok
      ? charResult.value.map((c) => ({ id: c.id, name: c.name }))
      : [];
    const existingScenes = sceneResult.ok
      ? sceneResult.value.map((s) => ({ id: s.id, name: s.name }))
      : [];

    // 匹配角色
    const matchedCharacters: ExtractedCharacter[] = inputCharacters.map((ec) => {
      const best = findBestMatch(ec.name, existingCharacters);
      if (!best) {
        return { ...ec, status: "new" as const };
      }
      return {
        ...ec,
        status: best.status,
        matchedCharacterId: best.matchedId,
        matchConfidence: best.confidence,
      };
    });

    // 匹配场景
    const matchedScenes: ExtractedScene[] = inputScenes.map((es) => {
      const best = findBestMatch(es.name, existingScenes);
      if (!best) {
        return { ...es, status: "new" as const };
      }
      return {
        ...es,
        status: best.status,
        matchedSceneId: best.matchedId,
        matchConfidence: best.confidence,
      };
    });

    return {
      success: true,
      data: {
        characters: matchedCharacters,
        scenes: matchedScenes,
      },
    };
  },
};
