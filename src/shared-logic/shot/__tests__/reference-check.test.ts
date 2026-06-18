import { describe, it, expect } from "vitest";
import {
  checkCharacterReferences,
  checkSceneReferences,
  checkMultipleCharacterReferences,
  checkMultipleSceneReferences,
  type Story,
} from "../reference-check";

describe("reference-check", () => {
  describe("checkCharacterReferences", () => {
    it("应该检测角色在故事 characters 列表中的引用", () => {
      const stories: Story[] = [
        {
          id: "story-1",
          title: "故事一",
          characters: ["c1", "c2"],
        },
      ];
      const result = checkCharacterReferences("c1", stories);
      expect(result.isReferenced).toBe(true);
      expect(result.referencingStories).toHaveLength(1);
      expect(result.referencingStories[0]!.storyId).toBe("story-1");
      expect(result.referencingStories[0]!.storyTitle).toBe("故事一");
      expect(result.referencingStories[0]!.beatCount).toBe(0);
      expect(result.totalBeats).toBe(0);
    });

    it("应该检测角色在 beats.characters 中的引用", () => {
      const stories: Story[] = [
        {
          id: "story-1",
          title: "故事一",
          beats: [
            { characters: ["c1", "c2"] },
            { characters: ["c1"] },
          ],
        },
      ];
      const result = checkCharacterReferences("c1", stories);
      expect(result.isReferenced).toBe(true);
      expect(result.totalBeats).toBe(2);
      expect(result.referencingStories[0]!.beatCount).toBe(2);
    });

    it("应该检测角色在 beats.character（单数）中的引用", () => {
      const stories: Story[] = [
        {
          id: "story-1",
          title: "故事一",
          beats: [{ character: "c1" }],
        },
      ];
      const result = checkCharacterReferences("c1", stories);
      expect(result.isReferenced).toBe(true);
      expect(result.totalBeats).toBe(1);
    });

    it("角色未被引用时应返回 isReferenced=false", () => {
      const stories: Story[] = [
        {
          id: "story-1",
          title: "故事一",
          characters: ["c2"],
          beats: [{ character: "c2" }],
        },
      ];
      const result = checkCharacterReferences("c1", stories);
      expect(result.isReferenced).toBe(false);
      expect(result.referencingStories).toHaveLength(0);
      expect(result.totalBeats).toBe(0);
    });

    it("空故事列表时应返回未引用", () => {
      const result = checkCharacterReferences("c1", []);
      expect(result.isReferenced).toBe(false);
      expect(result.totalBeats).toBe(0);
    });

    it("故事无标题时应使用'未命名故事'作为标题", () => {
      const stories: Story[] = [
        {
          id: "story-1",
          characters: ["c1"],
        },
      ];
      const result = checkCharacterReferences("c1", stories);
      expect(result.referencingStories[0]!.storyTitle).toBe("未命名故事");
    });

    it("应该聚合多个故事中的引用", () => {
      const stories: Story[] = [
        {
          id: "story-1",
          title: "故事一",
          beats: [{ character: "c1" }, { character: "c1" }],
        },
        {
          id: "story-2",
          title: "故事二",
          beats: [{ character: "c1" }],
        },
        {
          id: "story-3",
          title: "故事三",
          beats: [{ character: "c2" }],
        },
      ];
      const result = checkCharacterReferences("c1", stories);
      expect(result.isReferenced).toBe(true);
      expect(result.referencingStories).toHaveLength(2);
      expect(result.totalBeats).toBe(3);
    });
  });

  describe("checkSceneReferences", () => {
    it("应该检测场景在故事 scenes 列表中的引用", () => {
      const stories: Story[] = [
        {
          id: "story-1",
          title: "故事一",
          scenes: ["s1", "s2"],
        },
      ];
      const result = checkSceneReferences("s1", stories);
      expect(result.isReferenced).toBe(true);
      expect(result.referencingStories[0]!.storyId).toBe("story-1");
    });

    it("应该检测场景在 beats.scene 中的引用", () => {
      const stories: Story[] = [
        {
          id: "story-1",
          title: "故事一",
          beats: [{ scene: "s1" }, { scene: "s1" }, { scene: "s2" }],
        },
      ];
      const result = checkSceneReferences("s1", stories);
      expect(result.isReferenced).toBe(true);
      expect(result.totalBeats).toBe(2);
    });

    it("场景未被引用时应返回 isReferenced=false", () => {
      const stories: Story[] = [
        {
          id: "story-1",
          title: "故事一",
          scenes: ["s2"],
          beats: [{ scene: "s2" }],
        },
      ];
      const result = checkSceneReferences("s1", stories);
      expect(result.isReferenced).toBe(false);
    });

    it("空故事列表时应返回未引用", () => {
      const result = checkSceneReferences("s1", []);
      expect(result.isReferenced).toBe(false);
    });
  });

  describe("checkMultipleCharacterReferences", () => {
    it("应该批量检测多个角色的引用情况", () => {
      const stories: Story[] = [
        {
          id: "story-1",
          title: "故事一",
          characters: ["c1"],
          beats: [{ character: "c2" }],
        },
      ];
      const result = checkMultipleCharacterReferences(
        ["c1", "c2", "c3"],
        stories,
      );
      expect(Object.keys(result)).toHaveLength(3);
      expect(result["c1"]!.isReferenced).toBe(true);
      expect(result["c2"]!.isReferenced).toBe(true);
      expect(result["c3"]!.isReferenced).toBe(false);
    });

    it("空 ID 列表时应返回空对象", () => {
      const result = checkMultipleCharacterReferences([], []);
      expect(result).toEqual({});
    });
  });

  describe("checkMultipleSceneReferences", () => {
    it("应该批量检测多个场景的引用情况", () => {
      const stories: Story[] = [
        {
          id: "story-1",
          title: "故事一",
          scenes: ["s1"],
          beats: [{ scene: "s2" }],
        },
      ];
      const result = checkMultipleSceneReferences(["s1", "s2", "s3"], stories);
      expect(Object.keys(result)).toHaveLength(3);
      expect(result["s1"]!.isReferenced).toBe(true);
      expect(result["s2"]!.isReferenced).toBe(true);
      expect(result["s3"]!.isReferenced).toBe(false);
    });

    it("空 ID 列表时应返回空对象", () => {
      const result = checkMultipleSceneReferences([], []);
      expect(result).toEqual({});
    });
  });
});
