import { describe, it, expect } from "vitest";
import {
  checkCharacterReferences,
  checkSceneReferences,
  checkElementReferences,
} from "@/domain/services/reference-check";
import type { Story } from "@/domain/schemas";

function buildStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "story-1",
    title: "测试故事",
    description: "一个测试故事",
    characters: [],
    scenes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    beats: [],
    elementIds: [],
    status: "in_progress",
    ...overrides,
  };
}

describe("reference-check-service", () => {
  describe("checkCharacterReferences", () => {
    it("未被引用的角色应可删除", () => {
      const stories = [buildStory()];
      const result = checkCharacterReferences("char-1", "角色A", stories);
      expect(result.canDelete).toBe(true);
      expect(result.references).toHaveLength(0);
    });

    it("被 story.characters 引用时应不可删除", () => {
      const stories = [buildStory({ characters: ["char-1"] })];
      const result = checkCharacterReferences("char-1", "角色A", stories);
      expect(result.canDelete).toBe(false);
      expect(result.references).toHaveLength(1);
    });

    it("被 beat.characterIds 引用时应不可删除", () => {
      const stories = [
        buildStory({
          beats: [
            {
              id: "beat-1",
              sequence: 1,
              description: "测试分镜",
              type: "action",
              characterIds: ["char-1"],
              sceneId: undefined,
              elementIds: [],
              shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
            },
          ],
        }),
      ];
      const result = checkCharacterReferences("char-1", "角色A", stories);
      expect(result.canDelete).toBe(false);
    });

    it("被 beat.characterIds (旧格式 characters) 引用时应不可删除", () => {
      const stories = [
        buildStory({
          beats: [
            {
              id: "beat-1",
              sequence: 1,
              description: "测试分镜",
              type: "action",
              characterIds: ["char-1"],
              sceneId: undefined,
              elementIds: [],
              shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
            },
          ],
        }),
      ];
      const result = checkCharacterReferences("char-1", "角色A", stories);
      expect(result.canDelete).toBe(false);
    });

    it("被 beat.elementIds 引用时应不可删除", () => {
      const stories = [
        buildStory({
          beats: [
            {
              id: "beat-1",
              sequence: 1,
              description: "测试分镜",
              type: "action",
              characterIds: [],
              sceneId: undefined,
              elementIds: ["char-1"],
              shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
            },
          ],
        }),
      ];
      const result = checkCharacterReferences("char-1", "角色A", stories);
      expect(result.canDelete).toBe(false);
    });

    it("被 beat.elementBindings 引用时应不可删除", () => {
      const stories = [
        buildStory({
          beats: [
            {
              id: "beat-1",
              sequence: 1,
              description: "测试分镜",
              type: "action",
              characterIds: [],
              sceneId: undefined,
              elementIds: [],
              elementBindings: { "char-1": { role: "character" } },
              shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
            },
          ],
        }),
      ];
      const result = checkCharacterReferences("char-1", "角色A", stories);
      expect(result.canDelete).toBe(false);
    });

    it("应生成正确的警告消息", () => {
      const stories = [buildStory({ title: "故事A", characters: ["char-1"] })];
      const result = checkCharacterReferences("char-1", "角色A", stories);
      expect(result.warningMessage).toContain("角色A");
      expect(result.warningMessage).toContain("故事A");
    });

    it("多个故事引用时应去重故事名称", () => {
      const stories = [
        buildStory({ title: "故事A", characters: ["char-1"] }),
        buildStory({ title: "故事B", characters: ["char-1"] }),
      ];
      const result = checkCharacterReferences("char-1", "角色A", stories);
      expect(result.canDelete).toBe(false);
      expect(result.warningMessage).toContain("故事A");
      expect(result.warningMessage).toContain("故事B");
    });

    it("空故事列表应可删除", () => {
      const result = checkCharacterReferences("char-1", "角色A", []);
      expect(result.canDelete).toBe(true);
    });

    it("引用信息应包含正确的类型", () => {
      const stories = [buildStory({ characters: ["char-1"] })];
      const result = checkCharacterReferences("char-1", "角色A", stories);
      expect(result.references[0]!.elementType).toBe("character");
      expect(result.references[0]!.elementId).toBe("char-1");
      expect(result.references[0]!.elementName).toBe("角色A");
    });
  });

  describe("checkSceneReferences", () => {
    it("未被引用的场景应可删除", () => {
      const stories = [buildStory()];
      const result = checkSceneReferences("scene-1", "场景A", stories);
      expect(result.canDelete).toBe(true);
    });

    it("被 story.scenes 引用时应不可删除", () => {
      const stories = [buildStory({ scenes: ["scene-1"] })];
      const result = checkSceneReferences("scene-1", "场景A", stories);
      expect(result.canDelete).toBe(false);
    });

    it("被 beat.sceneId 引用时应不可删除", () => {
      const stories = [
        buildStory({
          beats: [
            {
              id: "beat-1",
              sequence: 1,
              description: "测试分镜",
              type: "action",
              characterIds: [],
              sceneId: "scene-1",
              elementIds: [],
              shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
            },
          ],
        }),
      ];
      const result = checkSceneReferences("scene-1", "场景A", stories);
      expect(result.canDelete).toBe(false);
    });

    it("被 beat.sceneId 引用时应不可删除（scene 字段已清理）", () => {
      const stories = [
        buildStory({
          beats: [
            {
              id: "beat-1",
              sequence: 1,
              description: "测试分镜",
              type: "action",
              characterIds: [],
              sceneId: "scene-1",
              elementIds: [],
              shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
            },
          ],
        }),
      ];
      const result = checkSceneReferences("scene-1", "场景A", stories);
      expect(result.canDelete).toBe(false);
    });

    it("被 beat.elementIds 引用时应不可删除", () => {
      const stories = [
        buildStory({
          beats: [
            {
              id: "beat-1",
              sequence: 1,
              description: "测试分镜",
              type: "action",
              characterIds: [],
              sceneId: undefined,
              elementIds: ["scene-1"],
              shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
            },
          ],
        }),
      ];
      const result = checkSceneReferences("scene-1", "场景A", stories);
      expect(result.canDelete).toBe(false);
    });

    it("应生成正确的警告消息", () => {
      const stories = [buildStory({ title: "故事A", scenes: ["scene-1"] })];
      const result = checkSceneReferences("scene-1", "场景A", stories);
      expect(result.warningMessage).toContain("场景A");
      expect(result.warningMessage).toContain("故事A");
    });

    it("引用信息应包含正确的类型", () => {
      const stories = [buildStory({ scenes: ["scene-1"] })];
      const result = checkSceneReferences("scene-1", "场景A", stories);
      expect(result.references[0]!.elementType).toBe("scene");
    });

    it("空故事列表应可删除", () => {
      const result = checkSceneReferences("scene-1", "场景A", []);
      expect(result.canDelete).toBe(true);
    });
  });

  describe("checkElementReferences", () => {
    it("未被引用的元素应可删除", () => {
      const stories = [buildStory()];
      const result = checkElementReferences("elem-1", "元素A", stories);
      expect(result.canDelete).toBe(true);
    });

    it("被 beat.elementIds 引用时应不可删除", () => {
      const stories = [
        buildStory({
          beats: [
            {
              id: "beat-1",
              sequence: 1,
              description: "测试分镜",
              type: "action",
              characterIds: [],
              sceneId: undefined,
              elementIds: ["elem-1"],
              shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
            },
          ],
        }),
      ];
      const result = checkElementReferences("elem-1", "元素A", stories);
      expect(result.canDelete).toBe(false);
    });

    it("被 beat.elementBindings 引用时应不可删除", () => {
      const stories = [
        buildStory({
          beats: [
            {
              id: "beat-1",
              sequence: 1,
              description: "测试分镜",
              type: "action",
              characterIds: [],
              sceneId: undefined,
              elementIds: [],
              elementBindings: { "elem-1": { role: "prop" } },
              shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
            },
          ],
        }),
      ];
      const result = checkElementReferences("elem-1", "元素A", stories);
      expect(result.canDelete).toBe(false);
    });

    it("默认 elementType 应为 character", () => {
      const stories = [
        buildStory({
          beats: [
            {
              id: "beat-1",
              sequence: 1,
              description: "测试分镜",
              type: "action",
              characterIds: [],
              sceneId: undefined,
              elementIds: ["elem-1"],
              shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
            },
          ],
        }),
      ];
      const result = checkElementReferences("elem-1", "元素A", stories);
      expect(result.references[0]!.elementType).toBe("character");
    });

    it("指定 elementType 为 scene 时应正确记录", () => {
      const stories = [
        buildStory({
          beats: [
            {
              id: "beat-1",
              sequence: 1,
              description: "测试分镜",
              type: "action",
              characterIds: [],
              sceneId: undefined,
              elementIds: ["elem-1"],
              shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
            },
          ],
        }),
      ];
      const result = checkElementReferences("elem-1", "元素A", stories, "scene");
      expect(result.references[0]!.elementType).toBe("scene");
    });

    it("应生成正确的警告消息", () => {
      const stories = [
        buildStory({
          title: "故事A",
          beats: [
            {
              id: "beat-1",
              sequence: 1,
              description: "测试分镜",
              type: "action",
              characterIds: [],
              sceneId: undefined,
              elementIds: ["elem-1"],
              shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
            },
          ],
        }),
      ];
      const result = checkElementReferences("elem-1", "元素A", stories);
      expect(result.warningMessage).toContain("元素A");
    });

    it("空故事列表应可删除", () => {
      const result = checkElementReferences("elem-1", "元素A", []);
      expect(result.canDelete).toBe(true);
    });
  });
});
