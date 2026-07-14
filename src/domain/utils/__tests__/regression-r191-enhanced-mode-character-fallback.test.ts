/**
 * R191 回归测试：增强模式角色描述回退逻辑
 *
 * 背景：2026-07-14 重构 generateBeatImagePrompt 时，将增强模式条件
 * 从 `isEnhanced && sceneElements.length > 0` 错误简化为 `isEnhanced`，
 * 导致 `isEnhanced=true` 但 `sceneElements` 为空时走了 buildEnhancedElementsSection
 * （返回空数组），而非 buildCharacterSection（返回角色描述），角色描述丢失。
 *
 * 修复（commit 488c0a5）：恢复分离条件判断：
 * - 元素描述：`isEnhanced && sceneElements.length > 0` → buildEnhancedElementsSection
 * - 否则：buildCharacterSection
 * - 镜头指令：`isEnhanced` → buildResolvedShotSection（独立判断）
 *
 * 本测试确保上述条件不再被错误合并。
 *
 * 注意：R190 编号已被 SSRF Guard 规则占用（见 .trae/rules/regression/index.md），
 * 本测试使用 R191。
 */
import { describe, it, expect } from "vitest";
import { generateBeatImagePrompt } from "@/domain/utils/beat-prompt-builder";
import type { StoryBeat, Character, Scene, SceneElement, ShotInstructionTemplate } from "@/domain/schemas";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "测试角色",
    description: "一个勇敢的战士",
    gender: "女性",
    age: 25,
    style: "anime",
    personality: ["勇敢"],
    appearance: {
      hairColor: "银色",
      hairStyle: "长发",
      eyeColor: "蓝色",
      height: "170cm",
      build: "纤细",
      clothing: "战斗服",
    },
    prompt: "",
    ...overrides,
  };
}

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    name: "森林场景",
    description: "一片神秘的古老森林",
    type: "自然",
    timeOfDay: "黄昏",
    weather: "晴朗",
    mood: "神秘",
    lighting: "自然光",
    elements: ["古树", "溪流"],
    colors: ["绿色", "金色"],
    prompt: "",
    ...overrides,
  };
}

function makeBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 0,
    description: "",
    duration: 5,
    characterIds: [],
    elementIds: [],
    ...overrides,
  };
}

const TEST_SHOT_INSTRUCTION: ShotInstructionTemplate = {
  shotSize: "medium",
  cameraMovement: "static",
  cameraAngle: "eye_level",
};

describe("R191: 增强模式角色描述回退逻辑", () => {
  describe("isEnhanced=true 且 sceneElements 为空时", () => {
    it("sceneElements 为空数组时应保留角色描述（bug 重现：角色描述丢失）", () => {
      const char = makeCharacter();
      const beat = makeBeat({
        characterIds: ["char-1"],
        sceneElements: [], // 空数组
        enhancedGeneration: true,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
        isEnhanced: true,
      });

      // 角色描述必须存在
      expect(prompt).toContain("测试角色");
      expect(prompt).toContain("银色发色");
      expect(prompt).toContain("穿着战斗服");
      // 不应出现"画面内容："前缀（那是增强元素模式的标记）
      expect(prompt).not.toContain("画面内容：");
    });

    it("sceneElements 为 undefined 时应保留角色描述", () => {
      const char = makeCharacter();
      const beat = makeBeat({
        characterIds: ["char-1"],
        // sceneElements 不设置（undefined）
        enhancedGeneration: true,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
        isEnhanced: true,
      });

      expect(prompt).toContain("测试角色");
      expect(prompt).toContain("银色发色");
      expect(prompt).not.toContain("画面内容：");
    });

    it("sceneElements 为空时镜头指令仍应存在（独立判断）", () => {
      const char = makeCharacter();
      const beat = makeBeat({
        characterIds: ["char-1"],
        sceneElements: [],
        enhancedGeneration: true,
        shotInstruction: TEST_SHOT_INSTRUCTION,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
        isEnhanced: true,
      });

      // 角色描述存在
      expect(prompt).toContain("测试角色");
      // 镜头指令也应存在（medium shot）
      expect(prompt).toContain("medium shot");
    });

    it("sceneElements 为空且有场景时应同时包含场景和角色描述", () => {
      const char = makeCharacter();
      const scene = makeScene();
      const beat = makeBeat({
        sceneId: "scene-1",
        characterIds: ["char-1"],
        sceneElements: [],
        enhancedGeneration: true,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [scene],
        isEnhanced: true,
      });

      // 场景描述
      expect(prompt).toContain("森林场景");
      expect(prompt).toContain("古树");
      // 角色描述
      expect(prompt).toContain("测试角色");
      expect(prompt).toContain("银色发色");
    });
  });

  describe("isEnhanced=true 且 sceneElements 非空时", () => {
    it("应使用增强元素描述而非普通角色描述", () => {
      const char = makeCharacter();
      const element: SceneElement = {
        id: "el-1",
        name: "战士",
        type: "existing_character",
        characterId: "char-1",
      };
      const beat = makeBeat({
        sceneElements: [element],
        enhancedGeneration: true,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
        isEnhanced: true,
      });

      // 应走增强元素路径，包含"画面内容："前缀
      expect(prompt).toContain("画面内容：");
      // 角色信息通过元素路径包含
      expect(prompt).toContain("测试角色");
      expect(prompt).toContain("女性");
      // 不应走普通角色路径（无"角色："前缀）
      expect(prompt).not.toMatch(/^角色：/m);
    });

    it("镜头指令应同时存在", () => {
      const char = makeCharacter();
      const element: SceneElement = {
        id: "el-1",
        name: "战士",
        type: "existing_character",
        characterId: "char-1",
      };
      const beat = makeBeat({
        sceneElements: [element],
        enhancedGeneration: true,
        shotInstruction: TEST_SHOT_INSTRUCTION,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
        isEnhanced: true,
      });

      expect(prompt).toContain("画面内容：");
      expect(prompt).toContain("medium shot");
    });
  });

  describe("isEnhanced=false 时", () => {
    it("应使用普通角色描述，无镜头指令", () => {
      const char = makeCharacter();
      const beat = makeBeat({
        characterIds: ["char-1"],
        sceneElements: [], // 即使有 sceneElements，非增强模式也忽略
        enhancedGeneration: false,
        shotInstruction: TEST_SHOT_INSTRUCTION, // 即使有 shotInstruction，非增强模式也不解析
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
        isEnhanced: false,
      });

      // 角色描述存在
      expect(prompt).toContain("测试角色");
      // 不应走增强元素路径
      expect(prompt).not.toContain("画面内容：");
      // 非增强模式不应解析 beat.shotInstruction（但 shotInstruction 参数会单独处理）
      // 注意：shotInstruction 参数是独立的，不受 isEnhanced 影响
    });

    it("isEnhanced=undefined 时应等同于 false", () => {
      const char = makeCharacter();
      const beat = makeBeat({
        characterIds: ["char-1"],
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
        // isEnhanced 不设置
      });

      expect(prompt).toContain("测试角色");
      expect(prompt).not.toContain("画面内容：");
    });
  });

  describe("边界情况", () => {
    it("多角色 + 增强模式 + 空场景元素时所有角色应保留", () => {
      const char1 = makeCharacter({ id: "char-1", name: "角色A" });
      const char2 = makeCharacter({
        id: "char-2",
        name: "角色B",
        appearance: { hairColor: "黑色", hairStyle: "短发", eyeColor: "", height: "", build: "", clothing: "长袍" },
      });
      const beat = makeBeat({
        characterIds: ["char-1", "char-2"],
        sceneElements: [],
        enhancedGeneration: true,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char1, char2],
        scenes: [],
        isEnhanced: true,
      });

      expect(prompt).toContain("角色A");
      expect(prompt).toContain("角色B");
      expect(prompt).toContain("黑色发色");
      expect(prompt).toContain("银色发色");
    });

    it("空角色 + 空场景元素 + 增强模式时应生成有效 prompt（无 undefined）", () => {
      const beat = makeBeat({
        characterIds: [],
        sceneElements: [],
        enhancedGeneration: true,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [],
        scenes: [],
        isEnhanced: true,
      });

      // 不应出现 undefined
      expect(prompt).not.toContain("undefined");
      // 不应出现空括号
      expect(prompt).not.toContain("（）");
    });
  });
});
