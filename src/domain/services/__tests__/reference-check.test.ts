import { describe, it, expect } from "vitest";
import {
  checkCharacterReferences,
  checkSceneReferences,
  checkElementReferences,
} from "@/domain/services/reference-check";
import type { Story, StoryBeat } from "@/domain/schemas";

function makeBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 1,
    description: "test beat",
    duration: 5,
    characters: [],
    elementIds: [],
    characterIds: [],
    enhancedGeneration: false,
    ...overrides,
  } as StoryBeat;
}

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "story-1",
    title: "测试故事",
    description: "",
    characters: [],
    scenes: [],
    createdAt: 0,
    updatedAt: 0,
    beats: [],
    elementIds: [],
    ...overrides,
  } as Story;
}

describe("checkCharacterReferences", () => {
  it("returns canDelete true when no references", () => {
    const stories = [makeStory()];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.canDelete).toBe(true);
    expect(result.references).toHaveLength(0);
    expect(result.warningMessage).toBeUndefined();
  });

  it("returns canDelete true with empty stories array", () => {
    const result = checkCharacterReferences("char-1", "角色A", []);
    expect(result.canDelete).toBe(true);
    expect(result.references).toHaveLength(0);
  });

  it("detects reference via beat.characterIds", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ characterIds: ["char-1"] })],
      }),
    ];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].usedInBeats).toHaveLength(1);
  });

  it("detects reference via beat.characters", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ characters: ["char-1"] })],
      }),
    ];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references[0].usedInBeats).toHaveLength(1);
  });

  it("detects reference via beat.character", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ character: "char-1" })],
      }),
    ];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references[0].usedInBeats).toHaveLength(1);
  });

  it("detects reference via beat.elementIds", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ elementIds: ["char-1"] })],
      }),
    ];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references[0].usedInBeats).toHaveLength(1);
  });

  it("detects reference via beat.elementBindings", () => {
    const stories = [
      makeStory({
        beats: [
          makeBeat({ elementBindings: { "char-1": { role: "protagonist" } } }),
        ],
      }),
    ];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references[0].usedInBeats).toHaveLength(1);
  });

  it("detects direct reference via story.characters", () => {
    const stories = [
      makeStory({
        characters: ["char-1"],
      }),
    ];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].usedInBeats).toHaveLength(0);
    expect(result.references[0].usedInStories).toContain("测试故事");
  });

  it("does not match different character id", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ characterIds: ["char-2"] })],
      }),
    ];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.canDelete).toBe(true);
  });

  it("aggregates references across multiple stories", () => {
    const stories = [
      makeStory({
        id: "story-1",
        title: "故事一",
        beats: [makeBeat({ characterIds: ["char-1"] })],
      }),
      makeStory({
        id: "story-2",
        title: "故事二",
        characters: ["char-1"],
      }),
    ];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references).toHaveLength(2);
  });

  it("uses beat title as beat label", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ title: "开场", characterIds: ["char-1"] })],
      }),
    ];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.references[0].usedInBeats).toContain("开场");
  });

  it("falls back to description slice when no title", () => {
    const stories = [
      makeStory({
        beats: [
          makeBeat({
            title: undefined,
            description: "这是一段很长的描述文字用于测试回退逻辑",
            characterIds: ["char-1"],
          }),
        ],
      }),
    ];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.references[0].usedInBeats[0]).toBe("这是一段很长的描述文字用于测试回退逻辑".slice(0, 30));
  });

  it("falls back to beat id when no title and no description", () => {
    const stories = [
      makeStory({
        beats: [
          makeBeat({
            id: "beat-xyz",
            title: undefined,
            description: "",
            characterIds: ["char-1"],
          }),
        ],
      }),
    ];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.references[0].usedInBeats).toContain("beat-xyz");
  });

  it("generates warningMessage with character name", () => {
    const stories = [
      makeStory({
        title: "英雄传",
        beats: [makeBeat({ characterIds: ["char-1"] })],
      }),
    ];
    const result = checkCharacterReferences("char-1", "李明", stories);
    expect(result.warningMessage).toContain("李明");
    expect(result.warningMessage).toContain("英雄传");
  });

  it("deduplicates story names in warningMessage", () => {
    const stories = [
      makeStory({
        id: "story-1",
        title: "英雄传",
        beats: [
          makeBeat({ id: "b1", characterIds: ["char-1"] }),
          makeBeat({ id: "b2", characterIds: ["char-1"] }),
        ],
      }),
    ];
    const result = checkCharacterReferences("char-1", "李明", stories);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].usedInBeats).toHaveLength(2);
  });

  it("skips stories with null beats", () => {
    const stories = [
      makeStory({ beats: null as unknown as StoryBeat[] }),
    ];
    const result = checkCharacterReferences("char-1", "角色A", stories);
    expect(result.canDelete).toBe(true);
  });
});

describe("checkSceneReferences", () => {
  it("returns canDelete true when no references", () => {
    const stories = [makeStory()];
    const result = checkSceneReferences("scene-1", "场景A", stories);
    expect(result.canDelete).toBe(true);
    expect(result.references).toHaveLength(0);
    expect(result.warningMessage).toBeUndefined();
  });

  it("detects reference via beat.sceneId", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ sceneId: "scene-1" })],
      }),
    ];
    const result = checkSceneReferences("scene-1", "场景A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references[0].usedInBeats).toHaveLength(1);
  });

  it("detects reference via beat.scene", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ scene: "scene-1" })],
      }),
    ];
    const result = checkSceneReferences("scene-1", "场景A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references[0].usedInBeats).toHaveLength(1);
  });

  it("detects reference via beat.elementIds", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ elementIds: ["scene-1"] })],
      }),
    ];
    const result = checkSceneReferences("scene-1", "场景A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references[0].usedInBeats).toHaveLength(1);
  });

  it("detects reference via beat.elementBindings", () => {
    const stories = [
      makeStory({
        beats: [
          makeBeat({ elementBindings: { "scene-1": { role: "background" } } }),
        ],
      }),
    ];
    const result = checkSceneReferences("scene-1", "场景A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references[0].usedInBeats).toHaveLength(1);
  });

  it("detects direct reference via story.scenes", () => {
    const stories = [
      makeStory({
        scenes: ["scene-1"],
      }),
    ];
    const result = checkSceneReferences("scene-1", "场景A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].usedInBeats).toHaveLength(0);
    expect(result.references[0].usedInStories).toContain("测试故事");
  });

  it("does not match different scene id", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ sceneId: "scene-2" })],
      }),
    ];
    const result = checkSceneReferences("scene-1", "场景A", stories);
    expect(result.canDelete).toBe(true);
  });

  it("aggregates references across multiple stories", () => {
    const stories = [
      makeStory({
        id: "story-1",
        title: "故事一",
        beats: [makeBeat({ sceneId: "scene-1" })],
      }),
      makeStory({
        id: "story-2",
        title: "故事二",
        scenes: ["scene-1"],
      }),
    ];
    const result = checkSceneReferences("scene-1", "场景A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references).toHaveLength(2);
  });

  it("uses beat title as beat label", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ title: "森林场景", sceneId: "scene-1" })],
      }),
    ];
    const result = checkSceneReferences("scene-1", "场景A", stories);
    expect(result.references[0].usedInBeats).toContain("森林场景");
  });

  it("falls back to description slice when no title", () => {
    const stories = [
      makeStory({
        beats: [
          makeBeat({
            title: undefined,
            description: "幽暗的森林中传来阵阵低语",
            sceneId: "scene-1",
          }),
        ],
      }),
    ];
    const result = checkSceneReferences("scene-1", "场景A", stories);
    expect(result.references[0].usedInBeats[0]).toBe("幽暗的森林中传来阵阵低语".slice(0, 30));
  });

  it("falls back to beat id when no title and no description", () => {
    const stories = [
      makeStory({
        beats: [
          makeBeat({
            id: "beat-abc",
            title: undefined,
            description: "",
            sceneId: "scene-1",
          }),
        ],
      }),
    ];
    const result = checkSceneReferences("scene-1", "场景A", stories);
    expect(result.references[0].usedInBeats).toContain("beat-abc");
  });

  it("generates warningMessage with scene name", () => {
    const stories = [
      makeStory({
        title: "冒险记",
        beats: [makeBeat({ sceneId: "scene-1" })],
      }),
    ];
    const result = checkSceneReferences("scene-1", "古堡", stories);
    expect(result.warningMessage).toContain("古堡");
    expect(result.warningMessage).toContain("冒险记");
  });

  it("sets elementType to scene in references", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ sceneId: "scene-1" })],
      }),
    ];
    const result = checkSceneReferences("scene-1", "场景A", stories);
    expect(result.references[0].elementType).toBe("scene");
  });
});

describe("checkElementReferences", () => {
  it("returns canDelete true when no references", () => {
    const stories = [makeStory()];
    const result = checkElementReferences("elem-1", "元素A", stories);
    expect(result.canDelete).toBe(true);
    expect(result.references).toHaveLength(0);
    expect(result.warningMessage).toBeUndefined();
  });

  it("detects reference via beat.elementIds", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ elementIds: ["elem-1"] })],
      }),
    ];
    const result = checkElementReferences("elem-1", "元素A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references[0].usedInBeats).toHaveLength(1);
  });

  it("detects reference via beat.elementBindings", () => {
    const stories = [
      makeStory({
        beats: [
          makeBeat({ elementBindings: { "elem-1": { role: "prop" } } }),
        ],
      }),
    ];
    const result = checkElementReferences("elem-1", "元素A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references[0].usedInBeats).toHaveLength(1);
  });

  it("does not match different element id", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ elementIds: ["elem-2"] })],
      }),
    ];
    const result = checkElementReferences("elem-1", "元素A", stories);
    expect(result.canDelete).toBe(true);
  });

  it("defaults elementType to character", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ elementIds: ["elem-1"] })],
      }),
    ];
    const result = checkElementReferences("elem-1", "元素A", stories);
    expect(result.references[0].elementType).toBe("character");
  });

  it("accepts custom elementType", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ elementIds: ["elem-1"] })],
      }),
    ];
    const result = checkElementReferences("elem-1", "元素A", stories, "scene");
    expect(result.references[0].elementType).toBe("scene");
  });

  it("does not detect story-level references (unlike character/scene checks)", () => {
    const stories = [
      makeStory({
        characters: ["elem-1"],
        scenes: ["elem-1"],
      }),
    ];
    const result = checkElementReferences("elem-1", "元素A", stories);
    expect(result.canDelete).toBe(true);
  });

  it("aggregates references across multiple stories", () => {
    const stories = [
      makeStory({
        id: "story-1",
        title: "故事一",
        beats: [makeBeat({ elementIds: ["elem-1"] })],
      }),
      makeStory({
        id: "story-2",
        title: "故事二",
        beats: [makeBeat({ elementBindings: { "elem-1": { role: "key" } } })],
      }),
    ];
    const result = checkElementReferences("elem-1", "元素A", stories);
    expect(result.canDelete).toBe(false);
    expect(result.references).toHaveLength(2);
  });

  it("uses beat title as beat label", () => {
    const stories = [
      makeStory({
        beats: [makeBeat({ title: "关键转折", elementIds: ["elem-1"] })],
      }),
    ];
    const result = checkElementReferences("elem-1", "元素A", stories);
    expect(result.references[0].usedInBeats).toContain("关键转折");
  });

  it("falls back to description slice when no title", () => {
    const longDesc = "这是一个非常长的元素描述文字应该被截断处理";
    const stories = [
      makeStory({
        beats: [
          makeBeat({
            title: undefined,
            description: longDesc,
            elementIds: ["elem-1"],
          }),
        ],
      }),
    ];
    const result = checkElementReferences("elem-1", "元素A", stories);
    expect(result.references[0].usedInBeats[0]).toBe(longDesc.slice(0, 30));
  });

  it("falls back to beat id when no title and no description", () => {
    const stories = [
      makeStory({
        beats: [
          makeBeat({
            id: "beat-def",
            title: undefined,
            description: "",
            elementIds: ["elem-1"],
          }),
        ],
      }),
    ];
    const result = checkElementReferences("elem-1", "元素A", stories);
    expect(result.references[0].usedInBeats).toContain("beat-def");
  });

  it("generates warningMessage with element name", () => {
    const stories = [
      makeStory({
        title: "冒险记",
        beats: [makeBeat({ elementIds: ["elem-1"] })],
      }),
    ];
    const result = checkElementReferences("elem-1", "魔法剑", stories);
    expect(result.warningMessage).toContain("魔法剑");
  });

  it("counts beats correctly across multiple references", () => {
    const stories = [
      makeStory({
        id: "story-1",
        title: "故事一",
        beats: [
          makeBeat({ id: "b1", elementIds: ["elem-1"] }),
          makeBeat({ id: "b2", elementIds: ["elem-1"] }),
        ],
      }),
      makeStory({
        id: "story-2",
        title: "故事二",
        beats: [makeBeat({ id: "b3", elementIds: ["elem-1"] })],
      }),
    ];
    const result = checkElementReferences("elem-1", "元素A", stories);
    expect(result.references).toHaveLength(2);
    const totalBeats = result.references.reduce(
      (sum, r) => sum + r.usedInBeats.length,
      0,
    );
    expect(totalBeats).toBe(3);
  });
});
