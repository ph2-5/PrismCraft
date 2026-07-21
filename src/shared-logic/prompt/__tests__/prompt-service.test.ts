import { describe, it, expect } from "vitest";
import {
  generateCharacterImagePrompt,
  generateCharacterDetailedPromptInstruction,
  generateSceneImagePrompt,
  generateScenePromptOptimization,
  generateVideoPrompt,
  generateSingleBeatPrompt,
  generateQuickModeVideoPrompt,
  generateKeyframePrompt,
  generateFirstFramePrompt,
  generateLastFramePrompt,
  generateStoryPlanPrompt,
  generateCharacterAnalysisPrompt,
  generateSceneAnalysisPrompt,
  type BeatInput,
  type VideoPromptParams,
} from "../prompt-service";

describe("prompt-service: generateCharacterImagePrompt", () => {
  it("应在缺少 name 时使用默认 'a character' 文案", () => {
    const result = generateCharacterImagePrompt({});
    expect(result).toContain("A character portrait of a character");
  });

  it("应包含 name / gender / age / appearance 等字段", () => {
    const result = generateCharacterImagePrompt({
      name: "Alice",
      gender: "female",
      age: 25,
      appearance: {
        hairColor: "black",
        hairStyle: "long",
        eyeColor: "blue",
        build: "slim",
        clothing: "red dress",
        accessories: "hat",
      },
    });
    expect(result).toContain("Alice");
    expect(result).toContain("female");
    expect(result).toContain("25 years old");
    expect(result).toContain("black hair");
    expect(result).toContain("long");
    expect(result).toContain("blue eyes");
    expect(result).toContain("slim");
    expect(result).toContain("wearing red dress");
    expect(result).toContain("hat");
  });

  it("style='anime' 时应替换为 STYLE_KEYWORDS.anime 关键字", () => {
    const result = generateCharacterImagePrompt({ name: "X", style: "anime" });
    expect(result).toContain("anime style");
  });

  it("未知 style 应保留原值", () => {
    const result = generateCharacterImagePrompt({ name: "X", style: "unknownStyle" });
    expect(result).toContain("unknownStyle");
  });

  it("personality 为字符串时应直接拼接", () => {
    const result = generateCharacterImagePrompt({
      name: "X",
      personality: "brave",
    });
    expect(result).toContain("personality: brave");
  });

  it("personality 为数组时应以逗号连接", () => {
    const result = generateCharacterImagePrompt({
      name: "X",
      personality: ["brave", "kind"],
    });
    expect(result).toContain("personality: brave, kind");
  });

  it("应附加 QUALITY_TAGS_IMAGE 关键字", () => {
    const result = generateCharacterImagePrompt({ name: "X" });
    expect(result).toContain("masterpiece");
    expect(result).toContain("best quality");
  });
});

describe("prompt-service: generateCharacterDetailedPromptInstruction", () => {
  it("应包含 'Character:' 前缀和角色描述（gender/age）", () => {
    const result = generateCharacterDetailedPromptInstruction({
      name: "Alice",
      gender: "female",
      age: 25,
    });
    expect(result).toContain("Character:");
    expect(result).toContain("female");
    expect(result).toContain("25岁");
  });

  it("buildCharacterFullDesc 不包含 name 字段（仅描述属性）", () => {
    const result = generateCharacterDetailedPromptInstruction({
      name: "Alice",
      gender: "female",
    });
    // CharacterInput.name 不会出现在 prompt 中，因为 buildCharacterFullDesc 只关心外貌
    expect(result).not.toContain("Alice");
  });

  it("应包含 5 条 'Requirements:' 编号指令", () => {
    const result = generateCharacterDetailedPromptInstruction({});
    expect(result).toContain("Requirements:");
    expect(result).toContain("1. Describe appearance");
    expect(result).toContain("5. Output only the prompt text");
  });
});

describe("prompt-service: generateSceneImagePrompt", () => {
  it("应在缺少 name 时使用默认 'a location' 文案", () => {
    const result = generateSceneImagePrompt({});
    expect(result).toContain("A scene of a location");
  });

  it("type='indoor' 时应使用 SCENE_TYPE_MAP.indoor 关键字", () => {
    const result = generateSceneImagePrompt({ name: "Room", type: "indoor" });
    expect(result).toContain("indoor scene");
  });

  it("未知 type 应保留原值", () => {
    const result = generateSceneImagePrompt({ name: "X", type: "custom-type" });
    expect(result).toContain("custom-type");
  });

  it("mood='happy' / lighting='natural' 应映射到对应关键字", () => {
    const result = generateSceneImagePrompt({
      name: "X",
      mood: "happy",
      lighting: "natural",
    });
    expect(result).toContain("cheerful");
    expect(result).toContain("natural lighting");
  });

  it("elements 为字符串数组时应直接拼接", () => {
    const result = generateSceneImagePrompt({
      name: "X",
      elements: ["table", "chair"],
    });
    expect(result).toContain("elements: table, chair");
  });

  it("elements 为 JSON 字符串时应解析后拼接", () => {
    const result = generateSceneImagePrompt({
      name: "X",
      elements: JSON.stringify(["table", "chair"]),
    });
    expect(result).toContain("elements: table, chair");
  });

  it("elements 为无效 JSON 字符串时应被忽略（不抛错）", () => {
    expect(() =>
      generateSceneImagePrompt({ name: "X", elements: "invalid json" }),
    ).not.toThrow();
    const result = generateSceneImagePrompt({ name: "X", elements: "invalid json" });
    expect(result).not.toContain("elements:");
  });

  it("应附加 QUALITY_TAGS_IMAGE 关键字", () => {
    const result = generateSceneImagePrompt({ name: "X" });
    expect(result).toContain("masterpiece");
  });
});

describe("prompt-service: generateScenePromptOptimization", () => {
  it("应包含 'Original:' 前缀和传入的 description", () => {
    const result = generateScenePromptOptimization("a dark room");
    expect(result).toContain("Original: a dark room");
  });

  it("应包含 5 条编号 Requirements", () => {
    const result = generateScenePromptOptimization("");
    expect(result).toContain("1. Add specific visual details");
    expect(result).toContain("5. Output only the optimized prompt");
  });

  it("空字符串 description 也应被接受", () => {
    expect(() => generateScenePromptOptimization("")).not.toThrow();
  });
});

describe("prompt-service: generateVideoPrompt", () => {
  it("无 characters/scenes/elements 时应只输出 [Quality Requirements] 段", () => {
    const result = generateVideoPrompt({});
    expect(result).toContain("[Quality Requirements]");
    expect(result).not.toContain("[Core Characters]");
    expect(result).not.toContain("[Fixed Scenes]");
  });

  it("characters 非空时应输出 [Core Characters] 段", () => {
    const result = generateVideoPrompt({
      characters: [{ name: "Alice", gender: "female", age: 25 }],
    });
    expect(result).toContain("[Core Characters]");
    expect(result).toContain("Alice");
    expect(result).toContain("[Character Requirements]");
  });

  it("characters 带 generatedImage 时应输出 [Important] 引用图像提示", () => {
    const result = generateVideoPrompt({
      characters: [
        { name: "Bob", generatedImage: "http://example.com/bob.png" },
      ],
    });
    expect(result).toContain("[Important] Keep character appearance");
    expect(result).toContain("Bob");
  });

  it("scenes 非空时应输出 [Fixed Scenes] 段", () => {
    const result = generateVideoPrompt({
      scenes: [{ name: "Forest", timeOfDay: "evening" }],
    });
    expect(result).toContain("[Fixed Scenes]");
    expect(result).toContain("Forest");
  });

  it("elements 非空时应输出 [Global Element Definitions] 段", () => {
    const result = generateVideoPrompt({
      elements: [
        { id: "el-1", name: "Sword", type: "prop", featureAnchor: { featureTags: ["metal"] } },
      ],
    });
    expect(result).toContain("[Global Element Definitions]");
    expect(result).toContain("el-1 (Prop): Sword");
    expect(result).toContain("visual features: metal");
  });

  it("beat 含 shotInstruction / duration 时应输出对应段（PR 3：旧 shotType/camera fallback 已删除）", () => {
    const result = generateVideoPrompt({
      beat: {
        content: "fight scene",
        shotInstruction: { shotSize: "wide", cameraAngle: "low", cameraMovement: "push" },
        duration: 5,
      } as BeatInput,
    });
    expect(result).toContain("[Video Content]");
    expect(result).toContain("fight scene");
    expect(result).toContain("[Shot Type] wide shot");
    expect(result).toContain("[Camera Angle] low");
    expect(result).toContain("[Camera Movement] push in");
    expect(result).toContain("[Duration] 5s");
  });

  it("shotInstruction 字段应原样追加在 [Shot Instruction] 段", () => {
    const result = generateVideoPrompt({
      shotInstruction: "custom-shot-1",
    });
    expect(result).toContain("[Shot Instruction] custom-shot-1");
  });

  it("未知 shotSize / cameraMovement 应保留原值（PR 3：通过 shotInstruction 字段）", () => {
    const result = generateVideoPrompt({
      beat: {
        shotInstruction: { shotSize: "unknown-shot", cameraMovement: "unknown-move" },
      } as BeatInput,
    });
    expect(result).toContain("[Shot Type] unknown-shot");
    expect(result).toContain("[Camera Movement] unknown-move");
  });
});

describe("prompt-service: generateSingleBeatPrompt", () => {
  it("应与 generateVideoPrompt 等效（直接委托）", () => {
    const params: VideoPromptParams = {
      beat: { content: "scene content" } as BeatInput,
    };
    const single = generateSingleBeatPrompt(params);
    const direct = generateVideoPrompt(params);
    expect(single).toBe(direct);
  });
});

describe("prompt-service: generateQuickModeVideoPrompt", () => {
  it("无 characters/scene 时应只包含 prompt 内容、style、resolution、quality", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "running scene",
      duration: 10,
    });
    expect(result).toContain("[Video Content]");
    expect(result).toContain("running scene");
    expect(result).toContain("[Visual Style]");
    expect(result).toContain("[Technical Parameters]");
    expect(result).toContain("video duration 10s");
  });

  it("style='anime' 时应使用对应 STYLE_PRESETS 描述", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "x",
      style: "anime",
    });
    expect(result).toContain("Japanese anime style");
  });

  it("未知 style 时应原样输出 style 字符串", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "x",
      style: "custom-style",
    });
    expect(result).toContain("custom-style");
  });

  it("resolution='4K' 时应使用对应 RESOLUTION_CONFIG", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "x",
      resolution: "4K",
    });
    expect(result).toContain("4K Ultra HD resolution");
  });

  it("resolution 缺失时应默认 1080p", () => {
    const result = generateQuickModeVideoPrompt({ prompt: "x" });
    expect(result).toContain("1920x1080 Full HD resolution");
  });

  it("characters 非空时应输出 [Core Characters] 段（用 description 优先 name）", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "x",
      characters: [
        { name: "Alice", description: "tall woman", generatedImage: "http://x/a.png" },
      ],
    });
    expect(result).toContain("[Core Characters]");
    expect(result).toContain("Alice: tall woman");
    expect(result).toContain("[Important] Keep character appearance");
  });

  it("scene 非空时应输出 [Fixed Scenes] 段和 [Scene Requirements]", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "x",
      scene: { name: "Forest", timeOfDay: "evening" },
    });
    expect(result).toContain("[Fixed Scenes]");
    expect(result).toContain("Forest");
    expect(result).toContain("[Scene Requirements]");
  });

  it("referenceImage 存在时应输出 [Reference Material] 段", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "x",
      referenceImage: "http://example.com/ref.png",
    });
    expect(result).toContain("[Reference Material]");
  });
});

describe("prompt-service: generateKeyframePrompt", () => {
  it("空参数时应只输出基础要求和 quality tags", () => {
    const result = generateKeyframePrompt({});
    expect(result).toContain("Generate a high-quality storyboard preview image");
    expect(result).toContain("masterpiece");
  });

  it("shotRequirement 应输出 Shot size / Camera angle / Camera movement / Action", () => {
    const result = generateKeyframePrompt({
      content: "scene content",
      shotRequirement: {
        shotSize: "wide",
        cameraAngle: "low",
        cameraMovement: "push",
        action: "running",
      },
    });
    expect(result).toContain("Visual content: scene content");
    expect(result).toContain("Shot size: wide");
    expect(result).toContain("Camera angle: low");
    expect(result).toContain("Camera movement: push");
    expect(result).toContain("Action: running");
  });

  it("prevKeyframe 存在时应输出保持一致提示", () => {
    const result = generateKeyframePrompt({
      prevKeyframe: "prev-keyframe-data",
    });
    expect(result).toContain("Maintain the same color tone");
  });
});

describe("prompt-service: generateFirstFramePrompt / generateLastFramePrompt", () => {
  it("firstFrame 应包含 'first frame' 描述", () => {
    const result = generateFirstFramePrompt({
      keyframePrompt: "preview prompt",
      actionDescription: "starting",
    });
    expect(result).toContain("first frame");
    expect(result).toContain("preview prompt");
    expect(result).toContain("Action start state: starting");
  });

  it("lastFrame 带 duration 时应输出 'Final state after approximately Xs'", () => {
    const result = generateLastFramePrompt({
      actionDescription: "ending",
      duration: 5,
    });
    expect(result).toContain("Action end state: ending");
    expect(result).toContain("Final state after approximately 5 seconds");
  });

  it("lastFrame 无 duration 时不应输出 duration 段", () => {
    const result = generateLastFramePrompt({});
    expect(result).not.toContain("Final state after approximately");
  });
});

describe("prompt-service: generateStoryPlanPrompt", () => {
  it("应包含 story 标题、genre、tone、target duration 等字段", () => {
    const result = generateStoryPlanPrompt({
      title: "My Story",
      description: "An epic tale",
      genre: "action",
      tone: "epic",
      targetDuration: 60,
    });
    expect(result).toContain("Story title: My Story");
    expect(result).toContain("Story genre: action");
    expect(result).toContain("Story tone: epic");
    expect(result).toContain("Target total duration: 60 seconds");
    expect(result).toContain("Genre pacing guide:");
    expect(result).toContain("Tone guide:");
  });

  it("缺省 targetDuration 时应默认 60 秒", () => {
    const result = generateStoryPlanPrompt({ title: "X" });
    expect(result).toContain("Target total duration: 60 seconds");
    expect(result).toContain("60 seconds");
  });

  it("genre='comedy' 时应输出 comedy 的 pacing 指南", () => {
    const result = generateStoryPlanPrompt({ title: "X", genre: "comedy" });
    expect(result).toContain("Comedy pacing");
  });

  it("tone='dark' 时应输出 dark 的 tone 指南", () => {
    const result = generateStoryPlanPrompt({ title: "X", tone: "dark" });
    expect(result).toContain("Heavy and oppressive");
  });

  it("characters 非空时应输出 'Existing characters:' 段", () => {
    const result = generateStoryPlanPrompt({
      title: "X",
      characters: [{ name: "Alice", gender: "female" }],
    });
    expect(result).toContain("Existing characters:");
    expect(result).toContain("Alice");
  });

  it("scenes 非空时应输出 'Existing scenes:' 段", () => {
    const result = generateStoryPlanPrompt({
      title: "X",
      scenes: [{ name: "Forest", type: "outdoor" }],
    });
    expect(result).toContain("Existing scenes:");
    expect(result).toContain("Forest");
  });
});

describe("prompt-service: generateCharacterAnalysisPrompt / generateSceneAnalysisPrompt", () => {
  it("generateCharacterAnalysisPrompt 应返回 JSON 格式描述", () => {
    const result = generateCharacterAnalysisPrompt();
    expect(result).toContain("Analyze the character");
    expect(result).toContain("\"name\"");
    expect(result).toContain("\"gender\"");
    expect(result).toContain("\"appearance\"");
  });

  it("generateSceneAnalysisPrompt 应返回 JSON 格式描述", () => {
    const result = generateSceneAnalysisPrompt();
    expect(result).toContain("Analyze the scene");
    expect(result).toContain("\"name\"");
    expect(result).toContain("\"type\"");
    expect(result).toContain("\"elements\"");
  });

  it("两个 analysis prompt 应是确定性的（无随机性）", () => {
    expect(generateCharacterAnalysisPrompt()).toBe(generateCharacterAnalysisPrompt());
    expect(generateSceneAnalysisPrompt()).toBe(generateSceneAnalysisPrompt());
  });
});
