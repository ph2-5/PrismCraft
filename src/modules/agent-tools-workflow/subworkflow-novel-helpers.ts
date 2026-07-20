/**
 * 小说转分镜工具专用辅助函数（Subworkflow Novel Helpers）
 *
 * 从 subworkflow-novel-tools.ts 拆出，降低主文件行数。
 * 包含角色/场景创建相关的纯函数与单个创建函数。
 */

import type { CreateCharacterInput, CreateSceneInput } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import { toStringArray } from "./subworkflow-helpers";

/** 构造单个角色的创建参数 */
export function buildCharacterCreateParams(
  charData: Record<string, unknown>,
  genre: string | undefined,
): CreateCharacterInput {
  const appearance = (charData.appearance as Record<string, unknown> | undefined) ?? {};
  return {
    name: String(charData.name ?? `角色_${Date.now()}`),
    description: String(charData.description ?? ""),
    gender: String(charData.gender ?? ""),
    style: genre ?? "",
    age: charData.age != null ? Number(charData.age) : undefined,
    personality: toStringArray(charData.personality),
    appearance: {
      hairColor: String(appearance.hairColor ?? ""),
      hairStyle: String(appearance.hairStyle ?? ""),
      eyeColor: String(appearance.eyeColor ?? ""),
      height: String(appearance.height ?? ""),
      build: String(appearance.build ?? ""),
      clothing: String(appearance.clothing ?? ""),
    },
    prompt: String(charData.customPrompt ?? ""),
  };
}

/** 构造单个场景的创建参数 */
export function buildSceneCreateParams(
  sceneData: Record<string, unknown>,
): CreateSceneInput {
  return {
    name: String(sceneData.name ?? `场景_${Date.now()}`),
    description: String(sceneData.description ?? ""),
    type: String(sceneData.type ?? ""),
    timeOfDay: String(sceneData.timeOfDay ?? ""),
    weather: String(sceneData.weather ?? ""),
    mood: String(sceneData.mood ?? ""),
    lighting: String(sceneData.lighting ?? ""),
    elements: [],
    colors: [],
    prompt: String(sceneData.customPrompt ?? ""),
  };
}

/** 创建单个角色，失败返回 null */
export async function createSingleCharacter(
  characterService: typeof import("@/modules/character").characterService,
  charData: Record<string, unknown>,
  genre: string | undefined,
): Promise<{ id: string; name: string } | null> {
  try {
    const r = await characterService.create(buildCharacterCreateParams(charData, genre));
    return r.ok ? { id: r.value.id, name: r.value.name } : null;
  } catch (err) {
    errorLogger.warn("[SubworkflowNovel] 创建角色失败", err);
    return null;
  }
}

/** 创建单个场景，失败返回 null */
export async function createSingleScene(
  sceneService: typeof import("@/modules/scene").sceneService,
  sceneData: Record<string, unknown>,
): Promise<{ id: string; name: string } | null> {
  try {
    const r = await sceneService.create(buildSceneCreateParams(sceneData));
    return r.ok ? { id: r.value.id, name: r.value.name } : null;
  } catch {
    return null;
  }
}

/** 创建角色和场景记录 */
export async function createCharactersAndScenes(
  extractedCharacters: Record<string, unknown>[],
  extractedScenes: Record<string, unknown>[],
  genre: string | undefined,
  onProgress?: (msg: string) => void,
): Promise<{
  characterIds: string[];
  characters: Array<{ id: string; name: string }>;
  sceneIds: string[];
  scenes: Array<{ id: string; name: string }>;
}> {
  onProgress?.(`正在创建 ${extractedCharacters.length} 个角色和 ${extractedScenes.length} 个场景…`);
  const { characterService } = await import("@/modules/character");
  const { sceneService } = await import("@/modules/scene");

  const characters: Array<{ id: string; name: string }> = [];
  for (const charData of extractedCharacters) {
    const created = await createSingleCharacter(characterService, charData, genre);
    if (created) characters.push(created);
  }
  const characterIds = characters.map((c) => c.id);

  const scenes: Array<{ id: string; name: string }> = [];
  for (const sceneData of extractedScenes) {
    const created = await createSingleScene(sceneService, sceneData);
    if (created) scenes.push(created);
  }
  const sceneIds = scenes.map((s) => s.id);

  return { characterIds, characters, sceneIds, scenes };
}
