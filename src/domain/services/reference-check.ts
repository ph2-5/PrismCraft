import type { Story } from "@/domain/schemas";

/**
 * 删除前引用检查（Delete-Reference Check）
 *
 * 职责：判断角色/场景是否被故事或分镜引用，用于删除前的确认提示
 * （返回 canDelete / references / warningMessage）。
 *
 * 注意：本文件与 src/shared-logic/shot/reference-check.ts（参考图一致性检查）
 * 同名并存，但功能完全不同：
 *   - 本文件（domain 层）：checkCharacterReferences(id, name, stories) → DeleteCheckResult
 *   - shared-logic 侧：checkCharacterReferences(id, stories) → ReferenceResult
 * 引用时请按需选择，勿混用。
 */

export interface ReferenceInfo {
  elementId: string;
  elementType: "character" | "scene";
  elementName: string;
  usedInBeats: string[];
  usedInStories: string[];
}

export interface DeleteCheckResult {
  canDelete: boolean;
  references: ReferenceInfo[];
  warningMessage?: string;
}

export function checkCharacterReferences(
  characterId: string,
  characterName: string,
  stories: Story[],
): DeleteCheckResult {
  const references: ReferenceInfo[] = [];

  for (const story of stories) {
    const usedInBeats: string[] = [];

    if (story.beats) {
      for (const beat of story.beats) {
        const isReferenced =
          beat.characterIds?.includes(characterId) ||
          beat.elementIds?.includes(characterId) ||
          (beat.elementBindings && characterId in beat.elementBindings);

        if (isReferenced) {
          usedInBeats.push(beat.title || beat.description?.slice(0, 30) || beat.id);
        }
      }
    }

    const isDirectRef = story.characters?.includes(characterId);

    if (usedInBeats.length > 0 || isDirectRef) {
      references.push({
        elementId: characterId,
        elementType: "character",
        elementName: characterName,
        usedInBeats,
        usedInStories: [story.title],
      });
    }
  }

  if (references.length === 0) {
    return { canDelete: true, references: [] };
  }

  const storyNames = [...new Set(references.flatMap((r) => r.usedInStories))];
  const beatCount = references.reduce((sum, r) => sum + r.usedInBeats.length, 0);

  return {
    canDelete: false,
    references,
    warningMessage: `角色 "${characterName}" 被 ${storyNames.length} 个故事中的 ${beatCount} 个分镜引用：${storyNames.join("、")}`,
  };
}

export function checkSceneReferences(
  sceneId: string,
  sceneName: string,
  stories: Story[],
): DeleteCheckResult {
  const references: ReferenceInfo[] = [];

  for (const story of stories) {
    const usedInBeats: string[] = [];

    if (story.beats) {
      for (const beat of story.beats) {
        const isReferenced =
          beat.sceneId === sceneId ||
          beat.elementIds?.includes(sceneId) ||
          (beat.elementBindings && sceneId in beat.elementBindings);

        if (isReferenced) {
          usedInBeats.push(beat.title || beat.description?.slice(0, 30) || beat.id);
        }
      }
    }

    const isDirectRef = story.scenes?.includes(sceneId);

    if (usedInBeats.length > 0 || isDirectRef) {
      references.push({
        elementId: sceneId,
        elementType: "scene",
        elementName: sceneName,
        usedInBeats,
        usedInStories: [story.title],
      });
    }
  }

  if (references.length === 0) {
    return { canDelete: true, references: [] };
  }

  const storyNames = [...new Set(references.flatMap((r) => r.usedInStories))];
  const beatCount = references.reduce((sum, r) => sum + r.usedInBeats.length, 0);

  return {
    canDelete: false,
    references,
    warningMessage: `场景 "${sceneName}" 被 ${storyNames.length} 个故事中的 ${beatCount} 个分镜引用：${storyNames.join("、")}`,
  };
}

export function checkElementReferences(
  elementId: string,
  elementName: string,
  stories: Story[],
  elementType: "character" | "scene" = "character",
): DeleteCheckResult {
  const references: ReferenceInfo[] = [];

  for (const story of stories) {
    const usedInBeats: string[] = [];

    if (story.beats) {
      for (const beat of story.beats) {
        const isReferenced =
          beat.elementIds?.includes(elementId) ||
          (beat.elementBindings && elementId in beat.elementBindings);

        if (isReferenced) {
          usedInBeats.push(beat.title || beat.description?.slice(0, 30) || beat.id);
        }
      }
    }

    if (usedInBeats.length > 0) {
      references.push({
        elementId,
        elementType,
        elementName,
        usedInBeats,
        usedInStories: [story.title],
      });
    }
  }

  if (references.length === 0) {
    return { canDelete: true, references: [] };
  }

  const storyNames = [...new Set(references.flatMap((r) => r.usedInStories))];
  const beatCount = references.reduce((sum, r) => sum + r.usedInBeats.length, 0);

  return {
    canDelete: false,
    references,
    warningMessage: `元素 "${elementName}" 被 ${storyNames.length} 个故事中的 ${beatCount} 个分镜引用`,
  };
}
