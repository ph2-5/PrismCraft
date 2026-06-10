import { describe, it, expect } from "vitest";
import {
  challengingPrompts,
  storyBeatTestData,
  getPromptById,
  getBeatTestDataById,
  getPromptsByComplexity,
  getPromptsByTestType,
} from "../test-helpers/test-prompts";
import { generateBeatImagePrompt, generateSimpleBeatImagePrompt } from "@/domain/utils/beat-prompt-builder";
import { shotInstructionToPrompt } from "@/domain/utils/shot-prompt";
import type { StoryBeat, Character, Scene, ShotInstructionTemplate } from "@/domain/schemas";

describe("Challenging Prompts Test Suite", () => {
  describe("Prompt Test Data Validation", () => {
    it("should have unique IDs", () => {
      const ids = challengingPrompts.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("should have valid complexity levels", () => {
      const validComplexities = ["low", "medium", "high", "extreme"];
      for (const prompt of challengingPrompts) {
        expect(validComplexities).toContain(prompt.complexity);
      }
    });

    it("should have valid test types", () => {
      const validTypes = ["basic", "complex", "edge", "integration"];
      for (const prompt of challengingPrompts) {
        expect(validTypes).toContain(prompt.testType);
      }
    });

    it("should have expected features defined", () => {
      for (const prompt of challengingPrompts) {
        expect(prompt.expectedFeatures.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Prompt Retrieval Functions", () => {
    it("getPromptById should return correct prompt", () => {
      const prompt = getPromptById("complex-character-interaction");
      expect(prompt).toBeDefined();
      expect(prompt?.name).toBe("复杂角色交互");
    });

    it("getPromptById should return undefined for unknown ID", () => {
      const prompt = getPromptById("unknown-prompt");
      expect(prompt).toBeUndefined();
    });

    it("getPromptsByComplexity should filter correctly", () => {
      const extremePrompts = getPromptsByComplexity("extreme");
      expect(extremePrompts.length).toBeGreaterThan(0);
      for (const prompt of extremePrompts) {
        expect(prompt.complexity).toBe("extreme");
      }
    });

    it("getPromptsByTestType should filter correctly", () => {
      const edgePrompts = getPromptsByTestType("edge");
      expect(edgePrompts.length).toBeGreaterThan(0);
      for (const prompt of edgePrompts) {
        expect(prompt.testType).toBe("edge");
      }
    });
  });

  describe("Beat Prompt Generation with Test Data", () => {
    const beatData = storyBeatTestData[0]!;

    it("should generate beat image prompt correctly", () => {
      const beat: StoryBeat = {
        id: beatData.beat.id,
        sequence: beatData.beat.sequence,
        description: beatData.beat.description ?? "",
        title: beatData.beat.title,
        content: beatData.beat.content,
        scene: beatData.beat.scene,
        shotType: beatData.beat.shotType,
        camera: {
          angle: beatData.beat.cameraAngle,
          movement: beatData.beat.cameraMovement,
        },
        duration: beatData.beat.duration,
        elementIds: [],
        characterIds: [beatData.beat.character].filter(Boolean) as string[],
        enhancedGeneration: true,
      };

      const characters: Character[] = beatData.characters?.map((c) => ({
        id: c.id,
        name: c.name,
        gender: c.gender ?? "",
        age: c.age,
        style: c.style ?? "",
        appearance: c.appearance || {},
        description: c.description ?? "",
        personality: c.personality || [],
        prompt: "",
        useCount: 0,
        tags: [] as string[],
      })) as unknown as Character[] || [];

      const scenes: Scene[] = beatData.scenes?.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? "",
        type: s.type ?? "",
        timeOfDay: s.timeOfDay ?? "",
        weather: s.weather ?? "",
        atmosphere: s.atmosphere,
        mood: s.mood ?? "",
        lighting: s.lighting ?? "",
        elements: s.elements || [],
        colors: s.colors || [],
        prompt: "",
        useCount: 0,
        tags: [] as string[],
      })) as unknown as Scene[] || [];

      const prompt = generateBeatImagePrompt({
        beat,
        characters,
        scenes,
        isEnhanced: true,
      });

      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(beatData.characters?.[0]?.name || "");
      expect(prompt).toContain(beatData.scenes?.[0]?.name || "");
    });

    it("should generate simple beat image prompt correctly", () => {
      const beat: StoryBeat = {
        id: beatData.beat.id,
        sequence: beatData.beat.sequence,
        description: beatData.beat.description ?? "",
        title: beatData.beat.title,
        content: beatData.beat.content,
        scene: beatData.beat.scene,
        elementIds: [],
        characterIds: [beatData.beat.character].filter(Boolean) as string[],
        enhancedGeneration: false,
      };

      const characters: Character[] = beatData.characters?.map((c) => ({
        id: c.id,
        name: c.name,
        gender: c.gender ?? "",
        age: c.age,
        style: c.style ?? "",
        appearance: c.appearance || {},
        description: c.description ?? "",
        personality: c.personality || [],
        prompt: "",
        useCount: 0,
        tags: [] as string[],
      })) as unknown as Character[] || [];

      const scenes: Scene[] = beatData.scenes?.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? "",
        type: s.type ?? "",
        timeOfDay: s.timeOfDay ?? "",
        weather: s.weather ?? "",
        atmosphere: s.atmosphere,
        mood: s.mood ?? "",
        lighting: s.lighting ?? "",
        elements: s.elements || [],
        colors: s.colors || [],
        prompt: "",
        useCount: 0,
        tags: [] as string[],
      })) as unknown as Scene[] || [];

      const prompt = generateSimpleBeatImagePrompt(beat, characters, scenes, "首帧");

      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain("首帧");
    });
  });

  describe("Shot Instruction to Prompt", () => {
    it("should handle extreme camera angles from test prompts", () => {
      const extremePrompt = getPromptById("extreme-camera-angles");
      expect(extremePrompt).toBeDefined();

      const instructions: ShotInstructionTemplate[] = [
        { shotSize: "extreme_wide", cameraMovement: "crane_down", cameraAngle: "birds_eye" },
        { shotSize: "extreme_close", cameraMovement: "static", cameraAngle: "worms_eye" },
        { shotSize: "wide", cameraMovement: "orbit", cameraAngle: "dutch" },
      ];

      for (const instruction of instructions) {
        const prompt = shotInstructionToPrompt(instruction);
        expect(typeof prompt).toBe("string");
        expect(prompt.length).toBeGreaterThan(0);
      }
    });

    it("should handle complex camera movements", () => {
      const actionPrompt = getPromptById("action-sequence");
      expect(actionPrompt).toBeDefined();

      const movements = ["push", "pull", "pan", "tracking", "orbit"];
      for (const movement of movements) {
        const prompt = shotInstructionToPrompt({
          shotSize: "medium",
          cameraMovement: movement as ShotInstructionTemplate["cameraMovement"],
          cameraAngle: "eye_level",
        });
        expect(prompt).toContain(movement);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long prompts", () => {
      const longPrompt = getPromptById("long-prompt-compression");
      expect(longPrompt).toBeDefined();
      expect(longPrompt?.prompt.length).toBeGreaterThan(500);
    });

    it("should handle abstract/surreal prompts", () => {
      const abstractPrompt = getPromptById("ambiguous-scene");
      expect(abstractPrompt).toBeDefined();
      expect(abstractPrompt?.expectedFeatures).toContain("surreal");
    });

    it("should handle multi-style prompts", () => {
      const stylePrompt = getPromptById("multi-style-mix");
      expect(stylePrompt).toBeDefined();
      const styleFeatures = ["watercolor", "pixel art", "3D render", "anime"];
      for (const feature of styleFeatures) {
        expect(stylePrompt?.expectedFeatures).toContain(feature);
      }
    });
  });

  describe("Multi-Character Scenarios", () => {
    it("should handle beat with multiple characters", () => {
      const multiCharData = getBeatTestDataById("beat-multi-character-interaction");
      expect(multiCharData).toBeDefined();
      if (!multiCharData) return;
      expect(multiCharData.characters?.length).toBe(3);

      const beat: StoryBeat = {
        id: multiCharData.beat.id,
        sequence: multiCharData.beat.sequence,
        description: multiCharData.beat.description ?? "",
        title: multiCharData.beat.title,
        content: multiCharData.beat.content,
        characterIds: multiCharData.beat.characters ?? [],
        scene: multiCharData.beat.scene,
        elementIds: [],
        enhancedGeneration: false,
      };

      const characters: Character[] = multiCharData.characters?.map((c) => ({
        id: c.id,
        name: c.name,
        gender: c.gender ?? "",
        age: c.age,
        style: c.style ?? "",
        appearance: c.appearance || {},
        description: c.description ?? "",
        personality: c.personality || [],
        prompt: "",
        useCount: 0,
        tags: [] as string[],
      })) as unknown as Character[] || [];

      const scenes: Scene[] = multiCharData.scenes?.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? "",
        type: s.type ?? "",
        timeOfDay: s.timeOfDay ?? "",
        atmosphere: s.atmosphere,
        mood: s.mood ?? "",
        lighting: s.lighting ?? "",
        elements: s.elements || [],
        colors: s.colors || [],
        prompt: "",
        useCount: 0,
        tags: [] as string[],
      })) as unknown as Scene[] || [];

      const prompt = generateBeatImagePrompt({
        beat,
        characters,
        scenes,
        isEnhanced: true,
      });

      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });
  });
});
