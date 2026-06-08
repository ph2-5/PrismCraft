import { describe, it, expect } from "vitest";

interface TestBeat {
  id?: string;
  characterIds?: string[];
  characters?: string[];
  character?: string;
  scene?: string;
  sceneId?: string;
  [key: string]: unknown;
}

interface TestStory {
  id: string;
  characters?: string[];
  scenes?: string[];
  beats?: TestBeat[];
  [key: string]: unknown;
}

interface CleanedStory extends TestStory {
  characters: string[];
  scenes: string[];
  beats: TestBeat[];
}

function cleanCharacterFromStories(
  stories: TestStory[],
  characterId: string,
): CleanedStory[] {
  return stories.map((story) => {
    const updatedBeats = (story.beats || []).map((beat) => {
      const updated = { ...beat };
      if (updated.characterIds?.includes(characterId)) {
        updated.characterIds = updated.characterIds.filter(
          (cid: string) => cid !== characterId,
        );
      }
      if (updated.characters?.includes(characterId)) {
        updated.characters = updated.characters.filter(
          (cid: string) => cid !== characterId,
        );
      }
      if (updated.character === characterId) {
        delete updated.character;
      }
      return updated;
    });
    const updatedCharacters = (story.characters || []).filter(
      (cid: string) => cid !== characterId,
    );
    return {
      ...story,
      characters: updatedCharacters,
      beats: updatedBeats,
    } as CleanedStory;
  });
}

function cleanSceneFromStories(stories: TestStory[], sceneId: string): CleanedStory[] {
  return stories.map((story) => {
    const updatedBeats = (story.beats || []).map((beat) => {
      const updated = { ...beat };
      if (updated.scene === sceneId) {
        delete updated.scene;
      }
      if (updated.sceneId === sceneId) {
        delete updated.sceneId;
      }
      return updated;
    });
    const updatedScenes = (story.scenes || []).filter(
      (sid: string) => sid !== sceneId,
    );
    return { ...story, scenes: updatedScenes, beats: updatedBeats } as CleanedStory;
  });
}

describe("级联清理 - 删除角色时清理 story beats 引用", () => {
  it("应从 characterIds 数组中移除已删除角色ID", () => {
    const stories = [
      {
        id: "s1",
        characters: ["c1", "c2"],
        beats: [
          { id: "b1", characterIds: ["c1", "c2"], characters: [], character: undefined },
          { id: "b2", characterIds: ["c2"], characters: [], character: undefined },
        ],
      },
    ];

    const result = cleanCharacterFromStories(stories, "c1");

    expect(result[0]!.beats[0]!.characterIds).toEqual(["c2"]);
    expect(result[0]!.beats[1]!.characterIds).toEqual(["c2"]);
  });

  it("应从 characters 数组中移除已删除角色ID", () => {
    const stories = [
      {
        id: "s1",
        characters: ["c1", "c3"],
        beats: [
          { id: "b1", characterIds: [], characters: ["c1", "c3"], character: undefined },
        ],
      },
    ];

    const result = cleanCharacterFromStories(stories, "c1");

    expect(result[0]!.beats[0]!.characters).toEqual(["c3"]);
  });

  it("应从 character 单值字段中删除已删除角色ID", () => {
    const stories = [
      {
        id: "s1",
        characters: ["c1"],
        beats: [
          { id: "b1", characterIds: [], characters: [], character: "c1" },
        ],
      },
    ];

    const result = cleanCharacterFromStories(stories, "c1");

    expect(result[0]!.beats[0]!.character).toBeUndefined();
  });

  it("应从 story.characters 数组中移除已删除角色ID", () => {
    const stories = [
      {
        id: "s1",
        characters: ["c1", "c2", "c3"],
        beats: [],
      },
    ];

    const result = cleanCharacterFromStories(stories, "c2");

    expect(result[0]!.characters).toEqual(["c1", "c3"]);
  });

  it("不应影响不包含已删除角色的故事", () => {
    const stories = [
      {
        id: "s1",
        characters: ["c2"],
        beats: [{ id: "b1", characterIds: ["c2"], characters: [], character: undefined }],
      },
    ];

    const result = cleanCharacterFromStories(stories, "c1");

    expect(result[0]!.characters).toEqual(["c2"]);
    expect(result[0]!.beats[0]!.characterIds).toEqual(["c2"]);
  });

  it("应同时清理多个故事中的引用", () => {
    const stories = [
      {
        id: "s1",
        characters: ["c1"],
        beats: [{ id: "b1", characterIds: ["c1"], characters: [], character: undefined }],
      },
      {
        id: "s2",
        characters: ["c1", "c2"],
        beats: [{ id: "b2", characterIds: ["c1", "c2"], characters: [], character: undefined }],
      },
    ];

    const result = cleanCharacterFromStories(stories, "c1");

    expect(result[0]!.characters).toEqual([]);
    expect(result[0]!.beats[0]!.characterIds).toEqual([]);
    expect(result[1]!.characters).toEqual(["c2"]);
    expect(result[1]!.beats[0]!.characterIds).toEqual(["c2"]);
  });

  it("应同时清理三种角色引用字段", () => {
    const stories = [
      {
        id: "s1",
        characters: ["c1"],
        beats: [
          {
            id: "b1",
            characterIds: ["c1"],
            characters: ["c1"],
            character: "c1",
          },
        ],
      },
    ];

    const result = cleanCharacterFromStories(stories, "c1");

    expect(result[0]!.characters).toEqual([]);
    expect(result[0]!.beats[0]!.characterIds).toEqual([]);
    expect(result[0]!.beats[0]!.characters).toEqual([]);
    expect(result[0]!.beats[0]!.character).toBeUndefined();
  });

  it("空 beats 数组不应报错", () => {
    const stories = [
      { id: "s1", characters: ["c1"], beats: undefined },
    ];

    const result = cleanCharacterFromStories(stories, "c1");

    expect(result[0]!.characters).toEqual([]);
  });
});

describe("级联清理 - 删除场景时清理 story beats 引用", () => {
  it("应从 beat.scene 中移除已删除场景ID", () => {
    const stories = [
      {
        id: "s1",
        beats: [
          { id: "b1", scene: "sc1", sceneId: undefined },
          { id: "b2", scene: "sc2", sceneId: undefined },
        ],
      },
    ];

    const result = cleanSceneFromStories(stories, "sc1");

    expect(result[0]!.beats[0]!.scene).toBeUndefined();
    expect(result[0]!.beats[1]!.scene).toBe("sc2");
  });

  it("应从 beat.sceneId 中移除已删除场景ID", () => {
    const stories = [
      {
        id: "s1",
        beats: [
          { id: "b1", scene: undefined, sceneId: "sc1" },
          { id: "b2", scene: undefined, sceneId: "sc2" },
        ],
      },
    ];

    const result = cleanSceneFromStories(stories, "sc1");

    expect(result[0]!.beats[0]!.sceneId).toBeUndefined();
    expect(result[0]!.beats[1]!.sceneId).toBe("sc2");
  });

  it("应同时清理 scene 和 sceneId 两个字段", () => {
    const stories = [
      {
        id: "s1",
        beats: [
          { id: "b1", scene: "sc1", sceneId: "sc1" },
        ],
      },
    ];

    const result = cleanSceneFromStories(stories, "sc1");

    expect(result[0]!.beats[0]!.scene).toBeUndefined();
    expect(result[0]!.beats[0]!.sceneId).toBeUndefined();
  });

  it("不应影响不包含已删除场景的故事", () => {
    const stories = [
      {
        id: "s1",
        beats: [
          { id: "b1", scene: "sc2", sceneId: "sc2" },
        ],
      },
    ];

    const result = cleanSceneFromStories(stories, "sc1");

    expect(result[0]!.beats[0]!.scene).toBe("sc2");
    expect(result[0]!.beats[0]!.sceneId).toBe("sc2");
  });

  it("空 beats 数组不应报错", () => {
    const stories = [
      { id: "s1", beats: undefined },
    ];

    const result = cleanSceneFromStories(stories, "sc1");

    expect(result[0]!.beats).toEqual([]);
  });

  it("应从 story.scenes 数组中移除已删除场景ID", () => {
    const stories = [
      {
        id: "s1",
        scenes: ["sc1", "sc2", "sc3"],
        beats: [],
      },
    ];

    const result = cleanSceneFromStories(stories, "sc2");

    expect(result[0]!.scenes).toEqual(["sc1", "sc3"]);
  });

  it("应同时清理 story.scenes 和 beats 中的场景引用", () => {
    const stories = [
      {
        id: "s1",
        scenes: ["sc1", "sc2"],
        beats: [
          { id: "b1", scene: "sc1", sceneId: "sc1" },
          { id: "b2", scene: "sc2", sceneId: "sc2" },
        ],
      },
    ];

    const result = cleanSceneFromStories(stories, "sc1");

    expect(result[0]!.scenes).toEqual(["sc2"]);
    expect(result[0]!.beats[0]!.scene).toBeUndefined();
    expect(result[0]!.beats[0]!.sceneId).toBeUndefined();
    expect(result[0]!.beats[1]!.scene).toBe("sc2");
  });

  it("story.scenes 为 undefined 时不应报错", () => {
    const stories = [
      { id: "s1", scenes: undefined, beats: [] },
    ];

    const result = cleanSceneFromStories(stories, "sc1");

    expect(result[0]!.scenes).toEqual([]);
  });
});
