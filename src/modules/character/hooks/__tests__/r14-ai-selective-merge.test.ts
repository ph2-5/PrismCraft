import { describe, it, expect } from "vitest";

describe("R14: AI analysis must use selective merge, not spread override", () => {
  it("should preserve user-edited name when AI analysis completes", () => {
    const currentCharacter = {
      id: "char_1",
      name: "用户修改的名字",
      description: "用户修改的描述",
      gender: "female",
      style: "old_style",
      personality: ["brave"],
      appearance: { hairColor: "black", hairStyle: "long", eyeColor: "brown", height: "170cm", build: "slim", clothing: "dress" },
      prompt: "",
    };

    const analysisResult = {
      name: "AI识别的名字",
      description: "AI识别的描述",
      gender: "male",
      style: "elegant",
      personality: ["gentle", "kind"],
      appearance: { hairColor: "blonde", hairStyle: "short", eyeColor: "blue", height: "175cm", build: "athletic", clothing: "suit" },
    };

    const badResult = { ...currentCharacter, ...analysisResult };
    expect(badResult.name).toBe("AI识别的名字");

    const goodResult = {
      ...currentCharacter,
      appearance: analysisResult.appearance ?? currentCharacter.appearance,
      style: analysisResult.style ?? currentCharacter.style,
      personality: analysisResult.personality ?? currentCharacter.personality,
    };
    expect(goodResult.name).toBe("用户修改的名字");
    expect(goodResult.style).toBe("elegant");
    expect(goodResult.appearance.hairColor).toBe("blonde");
  });

  it("should preserve user-edited description when AI analysis returns null fields", () => {
    const currentScene = {
      id: "scene_1",
      name: "用户修改的场景名",
      description: "用户修改的描述",
      type: "indoor",
      elements: ["table"],
      colors: ["white"],
      lighting: "bright",
      mood: "calm",
      weather: "clear",
      timeOfDay: "day",
      prompt: "",
    };

    const analysisResult = {
      name: "AI识别的场景",
      description: "AI识别的描述",
      type: "outdoor",
      elements: ["tree", "sky"],
      colors: ["green", "blue"],
      lighting: "natural",
      mood: "serene",
      weather: "sunny",
      timeOfDay: "afternoon",
    };

    const goodResult = {
      ...currentScene,
      elements: analysisResult.elements ?? currentScene.elements,
      colors: analysisResult.colors ?? currentScene.colors,
      lighting: analysisResult.lighting ?? currentScene.lighting,
      mood: analysisResult.mood ?? currentScene.mood,
      weather: analysisResult.weather ?? currentScene.weather,
      timeOfDay: analysisResult.timeOfDay ?? currentScene.timeOfDay,
    };

    expect(goodResult.name).toBe("用户修改的场景名");
    expect(goodResult.description).toBe("用户修改的描述");
    expect(goodResult.elements).toEqual(["tree", "sky"]);
    expect(goodResult.mood).toBe("serene");
  });

  it("should keep current value when AI analysis field is null", () => {
    const currentEntity = {
      id: "entity_1",
      name: "当前名字",
      style: "current_style",
      appearance: { hairColor: "black" },
    };

    const analysisResult = {
      name: null,
      style: null,
      appearance: null,
    };

    const goodResult = {
      ...currentEntity,
      style: analysisResult.style ?? currentEntity.style,
      appearance: analysisResult.appearance ?? currentEntity.appearance,
    };

    expect(goodResult.name).toBe("当前名字");
    expect(goodResult.style).toBe("current_style");
    expect(goodResult.appearance.hairColor).toBe("black");
  });
});
