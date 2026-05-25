/**
 * @deprecated 此模块与 src/ 中的实现重复，计划迁移到共享服务层。
 * 对应的 src/ 实现: src/modules/shot/reference-check-service.ts
 * 参见: src/infrastructure/server/ 用于服务端共享逻辑
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
  scene?: string;
}

interface ReferenceResult {
  isReferenced: boolean;
  referencingStories: { storyId: string; storyTitle: string; beatCount: number }[];
  totalBeats: number;
}

export function checkCharacterReferences(
  characterId: string,
  stories: Story[],
): ReferenceResult {
  const referencingStories: ReferenceResult["referencingStories"] = [];
  let totalBeats = 0;

  stories.forEach((story) => {
    const isInStoryChars =
      story.characters && story.characters.includes(characterId);

    const beatsWithChar = (story.beats || []).filter((beat) => {
      const inCharacters =
        beat.characters && beat.characters.includes(characterId);
      const inCharacter = beat.character === characterId;
      return inCharacters || inCharacter;
    });

    if (isInStoryChars || beatsWithChar.length > 0) {
      referencingStories.push({
        storyId: story.id,
        storyTitle: story.title || "未命名故事",
        beatCount: beatsWithChar.length,
      });
      totalBeats += beatsWithChar.length;
    }
  });

  return {
    isReferenced: referencingStories.length > 0,
    referencingStories,
    totalBeats,
  };
}

export function checkSceneReferences(
  sceneId: string,
  stories: Story[],
): ReferenceResult {
  const referencingStories: ReferenceResult["referencingStories"] = [];
  let totalBeats = 0;

  stories.forEach((story) => {
    const isInStoryScenes =
      story.scenes && story.scenes.includes(sceneId);

    const beatsWithScene = (story.beats || []).filter((beat) => {
      return beat.scene === sceneId;
    });

    if (isInStoryScenes || beatsWithScene.length > 0) {
      referencingStories.push({
        storyId: story.id,
        storyTitle: story.title || "未命名故事",
        beatCount: beatsWithScene.length,
      });
      totalBeats += beatsWithScene.length;
    }
  });

  return {
    isReferenced: referencingStories.length > 0,
    referencingStories,
    totalBeats,
  };
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
