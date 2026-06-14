import { describe, it, expect, beforeEach, vi } from "vitest";
import { integrationFactories } from "../factories";
import { isValidTransition, isStuck, VALID_TRANSITIONS, STUCK_TASK_THRESHOLD_MS } from "@/modules/video/task-management";
import { getModelCapabilities, getVideoGenerationStrategy } from "@/shared/model-capabilities";
import type { Character, Scene, Story } from "@/domain/schemas";

const { mockGenerateText, mockDiContainer } = vi.hoisted(() => {
  const mockGenerateText = vi.fn();
  const mockDiContainer = {
    textProvider: { generateText: mockGenerateText },
    imageProvider: {
      generateImage: vi.fn(),
      analyzeImage: vi.fn(),
    },
    videoProvider: {
      generateVideo: vi.fn(),
      queryVideoStatus: vi.fn(),
      generateKeyframe: vi.fn(),
      generateFramePair: vi.fn(),
      generateVideoWithFrames: vi.fn(),
    },
    imageApi: { analyze: vi.fn() },
    videoApi: { generate: vi.fn(), queryStatus: vi.fn() },
    textApi: { generate: vi.fn() },
    videoTaskStorage: {
      createVideoTask: vi.fn(),
      updateVideoTask: vi.fn(),
      getVideoTaskById: vi.fn(),
      getAllVideoTasks: vi.fn(),
      deleteVideoTask: vi.fn(),
    },
    characterStorage: {
      getCharacterById: vi.fn(),
      getAllCharacters: vi.fn(),
      createCharacter: vi.fn(),
      updateCharacter: vi.fn(),
      deleteCharacter: vi.fn(),
    },
    sceneStorage: {
      getSceneById: vi.fn(),
      getAllScenes: vi.fn(),
      createScene: vi.fn(),
      updateScene: vi.fn(),
      deleteScene: vi.fn(),
    },
    storyStorage: {
      getStoryById: vi.fn(),
      getAllStories: vi.fn(),
      createStory: vi.fn(),
      updateStory: vi.fn(),
      deleteStory: vi.fn(),
    },
    elementStorage: {
      getElementById: vi.fn(),
      getAllElements: vi.fn(),
      createElement: vi.fn(),
      updateElement: vi.fn(),
      deleteElement: vi.fn(),
    },
    eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
  };
  return { mockGenerateText, mockDiContainer };
});

vi.mock("@/infrastructure/di", () => ({
  container: mockDiContainer,
  resolve: vi.fn(),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}));

import { generateStoryPlanWithValidation } from "@/modules/shot/shot-generation/story-generation-pipeline";
import { buildPromptLayers } from "@/modules/shot/shot-instruction/services/shot-instruction-service";
import { buildFeatureAnchoringConfig, buildFeatureTags } from "@/modules/shot/feature-extraction/services/feature-extraction-service";
import { checkVisualConsistency, parseConsistencyAnalysisFromStructured } from "@/modules/shot/consistency-check/services/consistency-check-service";

describe("Full Pipeline Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Story → Shot → Video pipeline", () => {
    it("generates story plan from text input", async () => {
      const story: Partial<Story> = integrationFactories.story({
        description: "一个关于冒险的故事",
        genre: "adventure",
        targetDuration: 60,
      });
      const characters: Character[] = [
        integrationFactories.character({ id: "char_001", name: "主角" }),
      ];
      const scenes: Scene[] = [
        integrationFactories.scene({ id: "scene_001", name: "室内" }),
      ];

      mockGenerateText.mockResolvedValue({
        success: true,
        data: { text: integrationFactories.validStoryPlanText() },
      });

      const result = await generateStoryPlanWithValidation(
        story,
        characters,
        scenes,
        [],
        { enhancedGeneration: false },
      );

      expect(result.beats.length).toBeGreaterThanOrEqual(2);
      expect(result.beats[0]!.title).toBe("开场");
      expect(result.beats[0]!.content).toBeTruthy();
      expect(result.beats[0]!.duration).toBe(5);
      expect(result.beats[0]!.shotType).toBe("medium");
      expect(result.beats[0]!.camera?.angle).toBe("eye_level");
      expect(result.beats[0]!.camera?.movement).toBe("static");
      expect(result.retryCount).toBe(0);
    });

    it("generates story plan in English for foreign models", async () => {
      const story: Partial<Story> = integrationFactories.story({
        description: "An adventure story",
        genre: "adventure",
        targetDuration: 60,
      });
      const characters: Character[] = [
        integrationFactories.character({ id: "char_001", name: "Hero" }),
      ];
      const scenes: Scene[] = [
        integrationFactories.scene({ id: "scene_001", name: "Indoor" }),
      ];

      const englishPlan = JSON.stringify([
        {
          t: "Opening",
          c: "The hero enters the room and looks around nervously",
          st: "medium",
          ca: "eye_level",
          cm: "static",
          d: 5,
          tp: "action",
        },
      ]);

      mockGenerateText.mockResolvedValue({
        success: true,
        data: { text: englishPlan },
      });

      const result = await generateStoryPlanWithValidation(
        story,
        characters,
        scenes,
        [],
        { enhancedGeneration: false, promptLanguage: "en" },
      );

      expect(result.beats.length).toBe(1);
      expect(result.beats[0]!.title).toBe("Opening");
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
    });

    it("skips lastFrame for models that don't support it", async () => {
      const story: Partial<Story> = integrationFactories.story({
        description: "测试故事",
        genre: "drama",
        targetDuration: 60,
      });
      const characters: Character[] = [
        integrationFactories.character({ id: "char_001" }),
      ];
      const scenes: Scene[] = [
        integrationFactories.scene({ id: "scene_001" }),
      ];

      mockGenerateText.mockResolvedValue({
        success: true,
        data: { text: integrationFactories.validStoryPlanText() },
      });

      const result = await generateStoryPlanWithValidation(
        story,
        characters,
        scenes,
        [],
        { enhancedGeneration: false, videoModelId: "veo-2.0" },
      );

      const caps = getModelCapabilities("veo-2.0");
      if (!caps.supportsLastFrame) {
        for (const beat of result.beats) {
          expect(beat.lastFramePrompt).toBeUndefined();
        }
      }
    });

    it("retries with lower temperature on validation failure", async () => {
      const story: Partial<Story> = integrationFactories.story({
        description: "测试故事",
        genre: "drama",
        targetDuration: 60,
      });
      const characters: Character[] = [];
      const scenes: Scene[] = [];

      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            data: { text: "this is not valid JSON at all" },
          });
        }
        return Promise.resolve({
          success: true,
          data: { text: integrationFactories.validStoryPlanText() },
        });
      });

      const result = await generateStoryPlanWithValidation(
        story,
        characters,
        scenes,
        [],
        { enhancedGeneration: true, maxRetries: 3 },
      );

      expect(result.retryCount).toBeGreaterThanOrEqual(1);
      expect(result.beats.length).toBeGreaterThanOrEqual(1);
      expect(mockGenerateText.mock.calls.length).toBeGreaterThanOrEqual(2);

      const firstCallTemp = mockGenerateText.mock.calls[0]![1] as { temperature?: number };
      const secondCallTemp = mockGenerateText.mock.calls[1]![1] as { temperature?: number };
      if (firstCallTemp.temperature !== undefined && secondCallTemp.temperature !== undefined) {
        expect(secondCallTemp.temperature).toBeLessThanOrEqual(firstCallTemp.temperature);
      }
    });

    it("builds prompt layers from shot instruction", () => {
      const layers = buildPromptLayers({
        characterAnchors: [
          { elementName: "主角", featureTags: ["角色:主角", "发色:黑色", "服装:蓝色外套"] },
          { elementName: "配角", featureTags: ["角色:配角", "发色:红色"] },
        ],
        shotInstruction: integrationFactories.shotInstruction(),
        customDescription: "角色走进房间",
        styleAtmosphere: "紧张悬疑",
        language: "zh",
      });

      expect(layers.coreElements).toContain("主角");
      expect(layers.coreElements).toContain("配角");
      expect(layers.coreElements).toContain("核心特征不变");
      expect(layers.cameraAction).toBeTruthy();
      expect(layers.styleAtmosphere).toContain("紧张悬疑");
    });

    it("builds prompt layers in English", () => {
      const layers = buildPromptLayers({
        characterAnchors: [
          { elementName: "Hero", featureTags: ["Character:Hero", "Hair:black", "Clothing:blue jacket"] },
          { elementName: "Villain", featureTags: ["Character:Villain", "Hair:red", "Clothing:black cloak"] },
        ],
        shotInstruction: integrationFactories.shotInstruction(),
        customDescription: "Hero enters the room",
        styleAtmosphere: "suspenseful",
        language: "en",
      });

      expect(layers.coreElements).toContain("Hero");
      expect(layers.coreElements).toContain("Villain");
      expect(layers.coreElements).toContain("strictly maintain");
      expect(layers.coreElements).toContain("core features unchanged");
      expect(layers.styleAtmosphere).toContain("suspenseful");
      expect(layers.coreElements).toContain(";");
    });

    it("extracts features and builds anchoring config", () => {
      const character = integrationFactories.character({
        id: "char_001",
        name: "主角",
        appearance: integrationFactories.characterAppearance({
          hairColor: "黑色",
          hairStyle: "短发",
          eyeColor: "棕色",
          clothing: "蓝色外套",
        }),
      });

      const element = integrationFactories.storyElement({
        id: "char_001",
        type: "character",
        name: "主角",
        description: "一位穿着蓝色外套的年轻人",
      });

      const beat = integrationFactories.storyBeat({
        elementIds: [element.id],
        elementBindings: {
          [element.id]: integrationFactories.beatElementBinding(),
        },
      });

      const config = buildFeatureAnchoringConfig(beat, [element], [character], "zh");

      expect(config.enabled).toBe(true);
      expect(config.characterAnchors.length).toBe(1);
      expect(config.characterAnchors[0]!.elementId).toBe(element.id);
      expect(config.characterAnchors[0]!.featureTags.length).toBeGreaterThan(0);
      expect(config.characterAnchors[0]!.featureTags.some(t => t.includes("角色"))).toBe(true);
    });

    it("extracts features in English", () => {
      const character = integrationFactories.character({
        id: "char_002",
        name: "Hero",
        description: "A young person wearing a blue jacket",
        appearance: integrationFactories.characterAppearance({
          hairColor: "black",
          hairStyle: "short",
          eyeColor: "brown",
          clothing: "blue jacket",
        }),
      });

      const element = integrationFactories.storyElement({
        id: "char_002",
        type: "character",
        name: "Hero",
        description: "A young person wearing a blue jacket",
      });

      const tags = buildFeatureTags(element, character, "en");

      expect(tags.some(t => t.startsWith("Character:"))).toBe(true);
      expect(tags.some(t => t.startsWith("Hair:"))).toBe(true);
      expect(tags.some(t => t.startsWith("Clothing:"))).toBe(true);
    });

    it("checks visual consistency with structured output", async () => {
      const element = integrationFactories.storyElement({
        id: "elem_001",
        name: "主角",
        type: "character",
      });

      const beat = integrationFactories.storyBeat({
        elementIds: [element.id],
        elementBindings: {
          [element.id]: integrationFactories.beatElementBinding(),
        },
      });

      const structuredOutput = {
        scores: [
          { name: "主角", score: 0.9, issues: [] },
        ],
        overallScore: 0.9,
        recommendation: "accept" as const,
      };

      const result = await checkVisualConsistency({
        beat,
        elements: [element],
        structuredOutput,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(true);
        expect(result.value.overallScore).toBe(0.9);
        expect(result.value.recommendation).toBe("accept");
        expect(result.value.characterScores.length).toBe(1);
        expect(result.value.characterScores[0]!.elementId).toBe(element.id);
      }
    });

    it("handles consistency check parse failure gracefully", () => {
      const element = integrationFactories.storyElement({
        id: "elem_002",
        name: "角色A",
        type: "character",
      });

      const result = parseConsistencyAnalysisFromStructured(
        { scores: "not an array", overallScore: "not a number" } as unknown as Parameters<typeof parseConsistencyAnalysisFromStructured>[0],
        [element],
      );

      expect(result.passed).toBe(false);
      expect(result.overallScore).toBe(0.5);
      expect(result.recommendation).toBe("adjust");
      expect(result.characterScores.length).toBe(1);
      expect(result.characterScores[0]!.elementName).toBe("角色A");
    });
  });

  describe("Video task lifecycle", () => {
    it("validates state transitions", () => {
      expect(isValidTransition("pending", "generating")).toBe(true);
      expect(isValidTransition("pending", "failed")).toBe(true);
      expect(isValidTransition("pending", "cancelled")).toBe(true);
      expect(isValidTransition("pending", "timeout")).toBe(true);
      expect(isValidTransition("pending", "completed")).toBe(false);
      expect(isValidTransition("pending", "retrying")).toBe(false);

      expect(isValidTransition("generating", "completed")).toBe(true);
      expect(isValidTransition("generating", "failed")).toBe(true);
      expect(isValidTransition("generating", "cancelled")).toBe(true);
      expect(isValidTransition("generating", "timeout")).toBe(true);
      expect(isValidTransition("generating", "pending")).toBe(false);

      expect(isValidTransition("completed", "pending")).toBe(true);
      expect(isValidTransition("completed", "failed")).toBe(false);
      expect(isValidTransition("completed", "cancelled")).toBe(false);

      expect(isValidTransition("failed", "retrying")).toBe(true);
      expect(isValidTransition("failed", "cancelled")).toBe(true);
      expect(isValidTransition("failed", "pending")).toBe(false);
      expect(isValidTransition("failed", "generating")).toBe(false);

      expect(isValidTransition("cancelled", "pending")).toBe(false);
      expect(isValidTransition("cancelled", "generating")).toBe(false);
      expect(VALID_TRANSITIONS.cancelled).toEqual([]);

      expect(isValidTransition("retrying", "generating")).toBe(true);
      expect(isValidTransition("retrying", "completed")).toBe(true);
      expect(isValidTransition("retrying", "failed")).toBe(true);
      expect(isValidTransition("retrying", "pending")).toBe(false);

      expect(isValidTransition("timeout", "retrying")).toBe(true);
      expect(isValidTransition("timeout", "failed")).toBe(true);
      expect(isValidTransition("timeout", "cancelled")).toBe(true);
    });

    it("detects stuck tasks", () => {
      const now = Date.now();
      const stuckTask = integrationFactories.videoTask({
        status: "generating",
        updatedAt: new Date(now - STUCK_TASK_THRESHOLD_MS - 60000).toISOString(),
      });
      expect(isStuck(stuckTask, now)).toBe(true);

      const activeTask = integrationFactories.videoTask({
        status: "generating",
        updatedAt: new Date(now - 1000).toISOString(),
      });
      expect(isStuck(activeTask, now)).toBe(false);

      const completedTask = integrationFactories.videoTask({
        status: "completed",
        updatedAt: new Date(now - STUCK_TASK_THRESHOLD_MS - 60000).toISOString(),
      });
      expect(isStuck(completedTask, now)).toBe(false);
    });

    it("prevents double completion", () => {
      expect(isValidTransition("completed", "completed")).toBe(false);
      expect(VALID_TRANSITIONS.completed).not.toContain("completed");
    });
  });

  describe("API configuration", () => {
    it("resolves model capabilities from registry", () => {
      const klingCaps = getModelCapabilities("kling-v2-master");
      expect(klingCaps).toBeDefined();
      expect(typeof klingCaps.maxReferences).toBe("number");
      expect(typeof klingCaps.supportsLastFrame).toBe("boolean");

      const seedanceCaps = getModelCapabilities("seedance-2.0-pro");
      expect(seedanceCaps).toBeDefined();
      expect(typeof seedanceCaps.characterRefMode).toBe("string");
    });

    it("returns conservative defaults for unknown models", () => {
      const caps = getModelCapabilities("totally-unknown-model-xyz");
      expect(caps).toBeDefined();
      expect(caps.maxReferences).toBe(4);
      expect(caps.supportsLastFrame).toBe(true);
      expect(caps.supportsCharacterRef).toBe(true);
      expect(caps.supportsSceneRef).toBe(true);
      expect(caps.characterRefMode).toBe("text_append");
      expect(caps.sceneRefMode).toBe("text_append");
    });

    it("determines video generation strategy", () => {
      const klingStrategy = getVideoGenerationStrategy("kling-v2-master");
      expect(klingStrategy).toBeDefined();
      expect(typeof klingStrategy.useCharacterRef).toBe("boolean");
      expect(typeof klingStrategy.useSceneRef).toBe("boolean");
      expect(typeof klingStrategy.useLastFrame).toBe("boolean");
      expect(typeof klingStrategy.promptLanguage).toBe("string");
      expect(["en", "zh", "auto"]).toContain(klingStrategy.promptLanguage);

      const seedanceStrategy = getVideoGenerationStrategy("doubao-seedance-2-0-260128");
      expect(seedanceStrategy).toBeDefined();
      expect(seedanceStrategy.characterRefMode).toBe("bake_into_first");

      const unknownStrategy = getVideoGenerationStrategy("unknown-model");
      expect(unknownStrategy).toBeDefined();
      expect(unknownStrategy.useFirstFrame).toBe(true);
    });
  });
});
