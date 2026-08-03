/**
 * 参考图一致性检查（Story Reference Check）
 *
 * 职责：统计故事/分镜中引用指定角色或场景的数量（返回 isReferenced /
 * referencingStories / totalBeats），用于展示参考关系与一致性校验。
 *
 * 注意：本文件与 src/domain/services/reference-check.ts（删除前引用检查）
 * 同名并存，但功能完全不同：
 *   - 本文件（shared-logic 层）：checkCharacterReferences(id, stories) → ReferenceResult
 *   - domain 侧：checkCharacterReferences(id, name, stories) → DeleteCheckResult
 * 引用时请按需选择，勿混用。
 */

export interface Story {
  id: string;
  title?: string;
  characters?: string[];
  scenes?: string[];
  beats?: StoryBeat[];
}

interface StoryBeat {
  characters?: string[];
  character?: string;
  sceneId?: string;
}

export interface ReferenceResult {
  isReferenced: boolean;
  referencingStories: { storyId: string; storyTitle: string; beatCount: number }[];
  totalBeats: number;
}

function checkElementReferences(
  elementId: string,
  stories: Story[],
  options: {
    storyListField?: "characters" | "scenes";
    beatMatcher: (beat: StoryBeat) => boolean;
  },
): ReferenceResult {
  const referencingStories: ReferenceResult["referencingStories"] = [];
  let totalBeats = 0;

  stories.forEach((story) => {
    const isInStoryList = options.storyListField
      && story[options.storyListField]
      && story[options.storyListField]!.includes(elementId);

    const matchingBeats = (story.beats || []).filter(options.beatMatcher);

    if (isInStoryList || matchingBeats.length > 0) {
      referencingStories.push({
        storyId: story.id,
        storyTitle: story.title || "未命名故事",
        beatCount: matchingBeats.length,
      });
      totalBeats += matchingBeats.length;
    }
  });

  return {
    isReferenced: referencingStories.length > 0,
    referencingStories,
    totalBeats,
  };
}

export function checkCharacterReferences(
  characterId: string,
  stories: Story[],
): ReferenceResult {
  return checkElementReferences(characterId, stories, {
    storyListField: "characters",
    beatMatcher: (beat) =>
      (beat.characters && beat.characters.includes(characterId)) ||
      beat.character === characterId,
  });
}

export function checkSceneReferences(
  sceneId: string,
  stories: Story[],
): ReferenceResult {
  return checkElementReferences(sceneId, stories, {
    storyListField: "scenes",
    beatMatcher: (beat) => beat.sceneId === sceneId,
  });
}

export function checkMultipleCharacterReferences(
  characterIds: string[],
  stories: Story[],
): Record<string, ReferenceResult> {
  const results: Record<string, ReferenceResult> = {};
  characterIds.forEach((id) => {
    results[id] = checkCharacterReferences(id, stories);
  });
  return results;
}

export function checkMultipleSceneReferences(
  sceneIds: string[],
  stories: Story[],
): Record<string, ReferenceResult> {
  const results: Record<string, ReferenceResult> = {};
  sceneIds.forEach((id) => {
    results[id] = checkSceneReferences(id, stories);
  });
  return results;
}
