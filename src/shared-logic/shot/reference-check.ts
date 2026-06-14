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
    beatMatcher: (beat) => beat.scene === sceneId,
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
