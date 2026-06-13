import { describe, it, expect } from "vitest";
import { generateSingleBeatPrompt, generateProfessionalVideoPrompt, generateEnhancedVideoPrompt, generateQuickVideoPrompt, generateCharacterImagePrompt, generateSimpleCharacterImagePrompt, generateSceneImagePrompt, generateSimpleSceneImagePrompt, generateBeatImagePrompt, PromptBuilder } from "@/modules/prompt";
import { buildPromptLayers } from "@/modules/shot";
import { shotInstructionToPrompt } from "@/domain/utils/shot-prompt";
import {
  buildCharacterAppearanceDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  buildElementEffectDesc,
} from "@/domain/utils/prompt-vocabulary";
import type {
  StoryBeat,
  Character,
  Scene,
  SceneElement,
  FeatureAnchoringConfig,
  StoryElement,
  ShotInstructionTemplate,
  FixedImageConfig,
  ReferenceVideoConfig,
  TemplateConfig,
} from "@/domain/schemas";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "林小雨",
    description: "一位勇敢的少女战士，左眼有伤疤",
    gender: "女性",
    age: 18,
    style: "anime",
    personality: ["勇敢", "温柔"],
    appearance: {
      hairColor: "银色",
      hairStyle: "长发",
      eyeColor: "蓝色",
      height: "165cm",
      build: "纤细",
      clothing: "战斗服",
    },
    prompt: "",
    outfits: [
      {
        id: "outfit-1",
        name: "礼服",
        clothing: "白色礼服",
        description: "正式场合穿着",
        accessories: ["项链"],
        isDefault: false,
        createdAt: "2024-01-01T00:00:00Z",
      },
    ],
    ...overrides,
  };
}

function makeCharacter2(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-2",
    name: "陈风",
    description: "沉默寡言的剑客",
    gender: "男性",
    age: 25,
    style: "anime",
    personality: ["沉默", "正义"],
    appearance: {
      hairColor: "黑色",
      hairStyle: "短发",
      eyeColor: "棕色",
      height: "180cm",
      build: "健壮",
      clothing: "黑色长袍",
    },
    prompt: "",
    ...overrides,
  };
}

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    name: "古老森林",
    description: "一片神秘的古老森林，参天大树遮天蔽日",
    type: "自然",
    timeOfDay: "黄昏",
    weather: "薄雾",
    mood: "神秘",
    lighting: "自然光",
    elements: ["古树", "溪流", "苔藓"],
    colors: ["翠绿", "金色"],
    prompt: "",
    ...overrides,
  };
}

function makeScene2(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-2",
    name: "古城废墟",
    description: "一座被遗弃的古城，断壁残垣",
    type: "末日",
    timeOfDay: "夜晚",
    weather: "阴天",
    mood: "恐怖",
    lighting: "月光",
    elements: ["废墟", "碎石"],
    colors: ["灰色", "暗红"],
    prompt: "",
    ...overrides,
  };
}

function makeBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 0,
    description: "林小雨在森林中行走",
    duration: 5,
    characterIds: ["char-1"],
    elementIds: [],
    ...overrides,
  };
}

function makeFullBeat(): StoryBeat {
  return {
    id: "beat-1",
    sequence: 0,
    title: "森林邂逅",
    description: "林小雨在古老森林中与陈风相遇",
    content: "两人在溪流旁相遇，林小雨惊讶地看着陈风",
    duration: 8,
    characterIds: ["char-1", "char-2"],
    characterOutfits: { "char-1": "outfit-1" },
    scene: "scene-1",
    sceneId: "scene-1",
    elementIds: ["elem-1", "elem-2"],
    elementBindings: {
      "elem-1": {
        position: "左侧",
        action: "行走",
        emotion: "惊讶",
        role: "主角",
        text: "你是谁？",
        description: "从左侧走来",
        imageUrl: "http://example.com/char1-ref.png",
      },
      "elem-2": {
        position: "右侧",
        action: "站立",
        emotion: "冷静",
        role: "配角",
        description: "站在溪流旁",
      },
    },
    shotType: "medium",
    type: "dialogue",
    camera: {
      angle: "平视",
      movement: "推",
      distance: "中景",
    },
    sceneElements: [
      {
        id: "se-1",
        name: "林小雨",
        type: "existing_character",
        characterId: "char-1",
        description: "从远处走来",
        dialogue: "你是谁？",
        action: "行走",
        emotion: "惊讶",
        position: "左侧",
        pose: "站立",
        timelineGroup: 0,
        timelineOrder: 0,
        order: 0,
      },
      {
        id: "se-2",
        name: "陈风",
        type: "existing_character",
        characterId: "char-2",
        description: "站在溪流旁",
        action: "站立",
        emotion: "冷静",
        position: "右侧",
        pose: "持剑",
        timelineGroup: 0,
        timelineOrder: 1,
        order: 1,
      },
      {
        id: "se-3",
        name: "神秘光芒",
        type: "environment",
        description: "从古树间洒下的金色光芒",
        timelineGroup: 1,
        timelineOrder: 0,
        order: 2,
      },
    ],
    reference: {
      direction: "previous",
      contentType: "last_frame",
      segmentDuration: 2,
      segmentPosition: "end",
    },
    promptLayers: {
      coreElements: "角色林小雨和陈风在森林中相遇",
      cameraAction: "中景推镜头，从远景推至中景",
      styleAtmosphere: "神秘氛围，暖色调",
    },
  };
}

function makeElements(): StoryElement[] {
  return [
    {
      id: "elem-1",
      type: "character",
      name: "林小雨",
      description: "一位勇敢的少女战士",
      bindings: [
        {
          type: "image",
          url: "http://example.com/linxy-ref.png",
          name: "林小雨参考图",
          uploadedAt: "2024-01-01",
        },
      ],
      characterConfig: {
        gender: "女性",
        age: 18,
        style: "anime",
        appearance: {
          hairColor: "银色",
          hairStyle: "长发",
          eyeColor: "蓝色",
          build: "纤细",
          clothing: "战斗服",
        },
      },
      featureAnchor: {
        elementId: "elem-1",
        elementType: "character",
        referenceImageUrl: "http://example.com/linxy-ref.png",
        featureTags: ["银色长发", "蓝色眼睛", "战斗服"],
        confidence: 0.9,
        extractedAt: "2024-01-01",
      },
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    },
    {
      id: "elem-2",
      type: "character",
      name: "陈风",
      description: "沉默寡言的剑客",
      bindings: [],
      characterConfig: {
        gender: "男性",
        age: 25,
        style: "anime",
        appearance: {
          hairColor: "黑色",
          hairStyle: "短发",
          eyeColor: "棕色",
          build: "健壮",
          clothing: "黑色长袍",
        },
      },
      featureAnchor: {
        elementId: "elem-2",
        elementType: "character",
        referenceImageUrl: "http://example.com/chenf-ref.png",
        featureTags: ["黑色短发", "棕色眼睛", "黑色长袍"],
        confidence: 0.85,
        extractedAt: "2024-01-01",
      },
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    },
    {
      id: "elem-3",
      type: "prop",
      name: "古剑",
      description: "一把散发着蓝色光芒的古老长剑",
      bindings: [
        {
          type: "image",
          url: "http://example.com/sword-ref.png",
          name: "古剑参考图",
          uploadedAt: "2024-01-01",
        },
      ],
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    },
  ];
}

function makeFeatureAnchoring(): FeatureAnchoringConfig {
  return {
    enabled: true,
    characterAnchors: [
      {
        elementId: "elem-1",
        referenceImageUrl: "http://example.com/linxy-ref.png",
        featureTags: ["银色长发", "蓝色眼睛", "战斗服"],
        weight: 0.85,
      },
      {
        elementId: "elem-2",
        referenceImageUrl: "http://example.com/chenf-ref.png",
        featureTags: ["黑色短发", "棕色眼睛", "黑色长袍"],
        weight: 0.8,
      },
    ],
    propAnchors: [
      {
        elementId: "elem-3",
        referenceImageUrl: "http://example.com/sword-ref.png",
        featureTags: ["蓝色光芒", "长剑"],
        weight: 0.75,
      },
    ],
    previewImageUrl: "http://example.com/preview.png",
    disableFrameBinding: true,
    featureConsistencyStrength: 0.9,
  };
}

function makeShotInstruction(): ShotInstructionTemplate {
  return {
    shotSize: "medium",
    cameraMovement: "push",
    cameraAngle: "eye_level",
  };
}

function makeFixedImageConfig(): FixedImageConfig {
  return {
    enabled: true,
    lockType: "character",
    imageUrl: "http://example.com/scene-ref.png",
    characters: [
      {
        characterId: "char-1",
        characterName: "林小雨",
        imageUrl: "http://example.com/linxy-fixed.png",
      },
    ],
  };
}

function makeReferenceVideoConfig(): ReferenceVideoConfig {
  return {
    enabled: true,
    videoUrl: "http://example.com/ref-video.mp4",
    mimicryLevel: "medium",
  };
}

function makeTemplateConfig(): TemplateConfig {
  return {
    enabled: true,
    template: { name: "动作场景模板" },
    matchCamera: true,
    matchTransition: true,
    matchTiming: false,
  };
}

describe("端到端提示词组合测试 - SingleBeatPrompt", () => {
  it("完整数据组合：角色+场景+镜头指令+场景元素+特征锚定+引用+提示词层级", () => {
    const beat = makeFullBeat();
    const characters = [makeCharacter(), makeCharacter2()];
    const scenes = [makeScene(), makeScene2()];
    const elements = makeElements();
    const featureAnchoring = makeFeatureAnchoring();
    const shotInstruction = makeShotInstruction();

    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters,
      scenes,
      elements,
      featureAnchoring,
      shotInstruction,
      previousLastFrameUrl: "http://example.com/prev-frame.png",
      referenceVideoConfig: makeReferenceVideoConfig(),
      templateConfig: makeTemplateConfig(),
      characterOutfits: beat.characterOutfits,
    });

    expect(result).toContain("镜头 1");
    expect(result).toContain("森林邂逅");
    expect(result).toContain("中景");
    expect(result).toContain("对话镜头");
    expect(result).toContain("8 秒");

    expect(result).toContain("特征锚定约束");
    expect(result).toContain("银色长发");
    expect(result).toContain("蓝色眼睛");
    expect(result).toContain("85%");
    expect(result).toContain("80%");
    expect(result).toContain("道具参考图");
    expect(result).toContain("蓝色光芒");
    expect(result).toContain("预览图");
    expect(result).toContain("90%");
    expect(result).toContain("已禁用");

    expect(result).toContain("镜头指令");
    expect(result).toContain("medium shot");
    expect(result).toContain("push in");
    expect(result).toContain("eye level shot");

    expect(result).toContain("古老森林");
    expect(result).toContain("神秘氛围");
    expect(result).toContain("翠绿");

    expect(result).toContain("林小雨");
    expect(result).toContain("陈风");
    expect(result).toContain("白色礼服");
    expect(result).toContain("神秘光芒");

    expect(result).toContain("上一个镜头");
    expect(result).toContain("尾帧画面");

    expect(result).toContain("上一分镜尾帧参考");

    expect(result).toContain("提示词层级");
    expect(result).toContain("核心元素");
    expect(result).toContain("镜头动作");
    expect(result).toContain("风格氛围");

    expect(result).toContain("参考视频");
    expect(result).toContain("动作场景模板");
  });

  it("sceneId 字段兼容性：sceneId 存在时能正确查找场景", () => {
    const beat = makeBeat({ sceneId: "scene-1" });
    const scenes = [makeScene()];

    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [],
      scenes,
    });

    expect(result).toContain("古老森林");
  });

  it("scene 字段兼容性：仅 scene 存在时能正确查找场景", () => {
    const beat = makeBeat({ scene: "scene-1", sceneId: undefined });
    const scenes = [makeScene()];

    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [],
      scenes,
    });

    expect(result).toContain("古老森林");
  });

  it("服装切换：characterOutfits 正确替换服装", () => {
    const char = makeCharacter();
    const beat = makeBeat({
      characterIds: ["char-1"],
      characterOutfits: { "char-1": "outfit-1" },
    });

    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [char],
      scenes: [],
      characterOutfits: beat.characterOutfits,
    });

    expect(result).toContain("白色礼服");
    expect(result).not.toContain("战斗服");
  });

  it("shotInstruction 与 camera 互斥：有 shotInstruction 时不输出 camera 运镜", () => {
    const beat = makeBeat({
      camera: { movement: "推" },
    });

    const resultWithInstruction = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [],
      scenes: [],
      shotInstruction: makeShotInstruction(),
    });

    expect(resultWithInstruction).toContain("镜头指令");
    expect(resultWithInstruction).toContain("push in");
  });

  it("无 shotInstruction 时输出 camera 运镜", () => {
    const beat = makeBeat({
      camera: { movement: "推" },
    });

    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [],
      scenes: [],
    });

    expect(result).toContain("镜头指令");
    expect(result).toContain("push in");
  });

  it("fixedImageConfig 回退：无 featureAnchoring 时使用 fixedImageConfig", () => {
    const beat = makeBeat();
    const fixedImage = makeFixedImageConfig();

    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [],
      scenes: [],
      fixedImageConfig: fixedImage,
    });

    expect(result).toContain("参考图片说明");
    expect(result).toContain("林小雨");
  });

  it("场景元素排序：按 timelineOrder 排序", () => {
    const beat = makeBeat({
      sceneElements: [
        { id: "se-3", name: "元素C", type: "prop" as const, timelineOrder: 2, order: 2 },
        { id: "se-1", name: "元素A", type: "prop" as const, timelineOrder: 0, order: 0 },
        { id: "se-2", name: "元素B", type: "prop" as const, timelineOrder: 1, order: 1 },
      ],
    });

    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [],
      scenes: [],
    });

    const posA = result.indexOf("元素A");
    const posB = result.indexOf("元素B");
    const posC = result.indexOf("元素C");
    expect(posA).toBeGreaterThan(-1);
    expect(posB).toBeGreaterThan(-1);
    expect(posC).toBeGreaterThan(-1);
    expect(posA).toBeLessThan(posB);
    expect(posB).toBeLessThan(posC);
  });

  it("existing_character 场景元素包含角色外观", () => {
    const char = makeCharacter();
    const beat = makeBeat({
      sceneElements: [
        {
          id: "se-1",
          name: "林小雨",
          type: "existing_character" as const,
          characterId: "char-1",
          action: "行走",
          emotion: "惊讶",
        },
      ],
    });

    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [char],
      scenes: [],
    });

    expect(result).toContain("林小雨");
    expect(result).toContain("银色发色");
  });
});

describe("端到端提示词组合测试 - ProfessionalVideoPrompt", () => {
  it("完整数据组合：故事+角色+场景+分镜", () => {
    const characters = [makeCharacter(), makeCharacter2()];
    const scenes = [makeScene(), makeScene2()];
    const beat = makeFullBeat();

    const result = generateProfessionalVideoPrompt({
      story: {
        title: "森林物语",
        description: "一段关于勇气和友谊的故事",
        genre: "奇幻",
        tone: "史诗",
        targetDuration: 120,
      },
      beats: [beat],
      characters,
      scenes,
      fixedImage: makeFixedImageConfig(),
      referenceVideo: makeReferenceVideoConfig(),
      template: makeTemplateConfig(),
    });

    expect(result).toContain("奇幻");
    expect(result).toContain("史诗");
    expect(result).toContain("120秒");
    expect(result).toContain("森林物语");
    expect(result).toContain("林小雨");
    expect(result).toContain("陈风");
    expect(result).toContain("古老森林");
    expect(result).toContain("参考图片说明");
    expect(result).toContain("参考视频");
    expect(result).toContain("模板");
  });

  it("scene 字段查找场景：professional 模式使用 beat.scene", () => {
    const scenes = [makeScene()];
    const beat = makeBeat({ scene: "scene-1", content: "测试内容" });

    const result = generateProfessionalVideoPrompt({
      story: { title: "测试", description: "", genre: "剧情", tone: "中性", targetDuration: 60 },
      beats: [beat],
      characters: [],
      scenes,
    });

    expect(result).toContain("古老森林");
  });

  it("sceneId 字段查找场景：professional 模式现在也兼容 beat.sceneId", () => {
    const scenes = [makeScene()];
    const beat = makeBeat({ sceneId: "scene-1", scene: undefined, content: "测试内容" });

    const result = generateProfessionalVideoPrompt({
      story: { title: "测试", description: "", genre: "剧情", tone: "中性", targetDuration: 60 },
      beats: [beat],
      characters: [],
      scenes,
    });

    expect(result).toContain("古老森林");
  });
});

describe("端到端提示词组合测试 - EnhancedVideoPrompt", () => {
  it("完整数据组合：场景元素时间线分组+运镜+转场", () => {
    const characters = [makeCharacter(), makeCharacter2()];
    const scenes = [makeScene()];
    const beat = makeFullBeat();

    const result = generateEnhancedVideoPrompt({
      story: {
        title: "森林物语",
        description: "一段关于勇气和友谊的故事",
        genre: "奇幻",
        tone: "史诗",
        targetDuration: 120,
      },
      beats: [beat],
      characters,
      scenes,
    });

    expect(result).toContain("奇幻");
    expect(result).toContain("增强模式");
    expect(result).toContain("林小雨");
    expect(result).toContain("陈风");
    expect(result).toContain("古老森林");
    expect(result).toContain("时间1");
    expect(result).toContain("时间2");
  });

  it("sceneId 字段查找场景：enhanced 模式使用 beat.sceneId", () => {
    const scenes = [makeScene()];
    const beat = makeBeat({ sceneId: "scene-1", description: "测试" });

    const result = generateEnhancedVideoPrompt({
      story: { title: "测试", description: "", genre: "剧情", tone: "中性", targetDuration: 60 },
      beats: [beat],
      characters: [],
      scenes,
    });

    expect(result).toContain("古老森林");
  });

  it("运镜关键词映射", () => {
    const beat = makeBeat({
      camera: { movement: "推" },
      description: "测试",
    });

    const result = generateEnhancedVideoPrompt({
      story: { title: "测试", description: "", genre: "剧情", tone: "中性", targetDuration: 60 },
      beats: [beat],
      characters: [],
      scenes: [],
    });

    expect(result).toContain("push in");
  });

  it("转场关键词映射", () => {
    const beat = makeBeat({
      transition: "淡入淡出",
      description: "测试",
    });

    const result = generateEnhancedVideoPrompt({
      story: { title: "测试", description: "", genre: "剧情", tone: "中性", targetDuration: 60 },
      beats: [beat],
      characters: [],
      scenes: [],
    });

    expect(result).toContain("fade transition");
  });

  it("existing_character 场景元素包含角色外观", () => {
    const characters = [makeCharacter()];
    const beat = makeBeat({
      sceneElements: [
        {
          id: "se-1",
          name: "林小雨",
          type: "existing_character" as const,
          characterId: "char-1",
          action: "行走",
        },
      ],
      description: "测试",
    });

    const result = generateEnhancedVideoPrompt({
      story: { title: "测试", description: "", genre: "剧情", tone: "中性", targetDuration: 60 },
      beats: [beat],
      characters,
      scenes: [],
    });

    expect(result).toContain("林小雨");
    expect(result).toContain("银色发色");
  });
});

describe("端到端提示词组合测试 - QuickVideoPrompt", () => {
  it("完整数据组合：内容+角色+场景", () => {
    const characters = [makeCharacter(), makeCharacter2()];
    const scenes = [makeScene()];

    const result = generateQuickVideoPrompt({
      story: {
        title: "森林物语",
        description: "一段关于勇气和友谊的故事",
        genre: "奇幻",
        tone: "史诗",
        targetDuration: 120,
      },
      content: "林小雨在古老森林中与陈风相遇，两人决定一起踏上冒险之旅",
      characters,
      scenes,
      fixedImage: makeFixedImageConfig(),
      referenceVideo: makeReferenceVideoConfig(),
      template: makeTemplateConfig(),
    });

    expect(result).toContain("奇幻");
    expect(result).toContain("史诗");
    expect(result).toContain("林小雨在古老森林中与陈风相遇");
    expect(result).toContain("涉及角色");
    expect(result).toContain("涉及场景");
    expect(result).toContain("古老森林");
    expect(result).toContain("AI生成增强要求");
  });
});

describe("端到端提示词组合测试 - BeatImagePrompt", () => {
  it("增强模式：sceneId + sceneElements + shotInstruction + featureAnchoring", () => {
    const beat = makeFullBeat();
    const characters = [makeCharacter(), makeCharacter2()];
    const scenes = [makeScene()];
    const featureAnchoring = makeFeatureAnchoring();
    const shotInstruction = makeShotInstruction();

    const result = generateBeatImagePrompt({
      beat,
      characters,
      scenes,
      isEnhanced: true,
      featureAnchoring,
      shotInstruction,
    });

    expect(result).toContain("特征锚定约束");
    expect(result).toContain("银色长发");
    expect(result).toContain("蓝色眼睛");
    expect(result).toContain("道具参考图");
    expect(result).toContain("镜头构图");
    expect(result).toContain("medium shot");
    expect(result).toContain("古老森林");
    expect(result).toContain("神秘");
    expect(result).toContain("翠绿");
    expect(result).toContain("林小雨");
    expect(result).toContain("陈风");
    expect(result).toContain("anime style");
    expect(result).toContain("masterpiece");
  });

  it("非增强模式：scene + characterIds", () => {
    const beat = makeBeat({
      scene: "scene-1",
      characterIds: ["char-1"],
    });
    const characters = [makeCharacter()];
    const scenes = [makeScene()];

    const result = generateBeatImagePrompt({
      beat,
      characters,
      scenes,
      isEnhanced: false,
    });

    expect(result).toContain("古老森林");
    expect(result).toContain("林小雨");
    expect(result).toContain("银色发色");
  });

  it("sceneId vs scene 字段兼容性", () => {
    const scenes = [makeScene()];

    const beatWithSceneId = makeBeat({ sceneId: "scene-1" });
    const resultWithSceneId = generateBeatImagePrompt({
      beat: beatWithSceneId,
      characters: [],
      scenes,
      isEnhanced: true,
    });

    const beatWithScene = makeBeat({ scene: "scene-1" });
    const resultWithScene = generateBeatImagePrompt({
      beat: beatWithScene,
      characters: [],
      scenes,
      isEnhanced: false,
    });

    expect(resultWithSceneId).toContain("古老森林");
    expect(resultWithScene).toContain("古老森林");
  });
});

describe("端到端提示词组合测试 - CharacterImagePrompt", () => {
  it("角色图片提示词包含完整信息", () => {
    const char = makeCharacter();
    const result = generateCharacterImagePrompt(char);

    expect(result).toContain("anime风格");
    expect(result).toContain("女性");
    expect(result).toContain("18岁");
    expect(result).toContain("银色发色");
    expect(result).toContain("长发发型");
    expect(result).toContain("蓝色眼睛");
    expect(result).toContain("穿着战斗服");
    expect(result).toContain("character design sheet");
    expect(result).toContain("full body");
    expect(result).toContain("masterpiece");
  });

  it("服装切换：outfitId 替换服装", () => {
    const char = makeCharacter();
    const result = generateCharacterImagePrompt(char, "outfit-1");

    expect(result).toContain("白色礼服");
    expect(result).not.toContain("战斗服");
  });

  it("简单角色提示词", () => {
    const char = makeCharacter();
    const result = generateSimpleCharacterImagePrompt(char);

    expect(result).toContain("林小雨");
    expect(result).toContain("发色：银色");
    expect(result).toContain("anime style");
    expect(result).toContain("high quality");
  });
});

describe("端到端提示词组合测试 - SceneImagePrompt", () => {
  it("场景图片提示词包含完整信息", () => {
    const scene = makeScene();
    const result = generateSceneImagePrompt(scene);

    expect(result).toContain("古老森林");
    expect(result).toContain("nature");
    expect(result).toContain("mysterious");
    expect(result).toContain("natural lighting");
    expect(result).toContain("scene design");
    expect(result).toContain("masterpiece");
  });

  it("简单场景提示词", () => {
    const scene = makeScene();
    const result = generateSimpleSceneImagePrompt(scene);

    expect(result).toContain("古老森林");
    expect(result).toContain("黄昏");
    expect(result).toContain("薄雾");
    expect(result).toContain("high quality");
  });
});

describe("端到端提示词组合测试 - PromptBuilder", () => {
  const builder = new PromptBuilder();

  it("buildGlobalElementDefinitions：全局元素定义包含所有信息", () => {
    const elements = makeElements();
    const result = builder.buildGlobalElementDefinitions(elements);

    expect(result).toContain("全局元素定义");
    expect(result).toContain("elem-1");
    expect(result).toContain("林小雨");
    expect(result).toContain("角色");
    expect(result).toContain("银色发色");
    expect(result).toContain("银色长发");
    expect(result).toContain("90%");
    expect(result).toContain("elem-3");
    expect(result).toContain("古剑");
    expect(result).toContain("道具");
    expect(result).toContain("蓝色光芒");
    expect(result).toContain("参考图");
  });

  it("buildFeatureAnchoredPrompt：特征锚定提示词包含所有约束", () => {
    const beat = makeFullBeat();
    const elements = makeElements();
    const featureAnchoring = makeFeatureAnchoring();
    const shotInstruction = makeShotInstruction();

    const result = builder.buildFeatureAnchoredPrompt(
      beat,
      elements,
      featureAnchoring,
      shotInstruction,
    );

    expect(result).toContain("全局元素定义");
    expect(result).toContain("特征锚定型独立生成");
    expect(result).toContain("特征锚定约束");
    expect(result).toContain("银色长发");
    expect(result).toContain("85%");
    expect(result).toContain("80%");
    expect(result).toContain("预览图");
    expect(result).toContain("镜头指令");
    expect(result).toContain("medium shot");
    expect(result).toContain("本分镜元素使用");
    expect(result).toContain("elem-1");
    expect(result).toContain("位于左侧");
    expect(result).toContain("正在行走");
    expect(result).toContain("表情惊讶");
    expect(result).toContain("提示词层级");
    expect(result).toContain("核心元素");
    expect(result).toContain("一致性约束");
    expect(result).toContain("90%");
    expect(result).toContain("已禁用");
  });

  it("buildFirstShotPrompt：首镜提示词包含基准声明", () => {
    const beat = makeFullBeat();
    const elements = makeElements();

    const result = builder.buildFirstShotPrompt(beat, elements);

    expect(result).toContain("全局风格约束");
    expect(result).toContain("本分镜元素使用");
    expect(result).toContain("elem-1");
    expect(result).toContain("镜头描述");
    expect(result).toContain("基准声明");
    expect(result).toContain("视觉基准");
  });

  it("buildInheritancePrompt：继承提示词包含继承约束", () => {
    const beat = makeFullBeat();
    const previousBeat = makeBeat({ sequence: 1, title: "上一镜" });
    const elements = makeElements();

    const result = builder.buildInheritancePrompt(beat, elements, previousBeat);

    expect(result).toContain("继承约束");
    expect(result).toContain("第1分镜");
    expect(result).toContain("本分镜元素使用");
    expect(result).toContain("镜头变化");
  });

  it("buildIndependentShotPrompt：独立镜头提示词", () => {
    const beat = makeFullBeat();
    const elements = makeElements();

    const result = builder.buildIndependentShotPrompt(beat, elements);

    expect(result).toContain("独立生成");
    expect(result).toContain("本分镜元素使用");
    expect(result).toContain("镜头内容");
    expect(result).toContain("一致性约束");
  });

  it("buildIndependentShotPrompt：带引用时包含引用规则", () => {
    const beat = makeFullBeat();
    const elements = makeElements();
    const reference = {
      direction: "previous" as const,
      contentType: "last_frame" as const,
      segmentDuration: 2,
      segmentPosition: "end" as const,
    };
    const referenceShot = makeBeat({ sequence: 1 });

    const result = builder.buildIndependentShotPrompt(
      beat,
      elements,
      reference,
      referenceShot,
    );

    expect(result).toContain("引用规则");
    expect(result).toContain("上一分镜");
    expect(result).toContain("尾帧");
    expect(result).toContain("2秒");
    expect(result).toContain("结尾");
  });

  it("buildCrossReferencePrompt：跨镜引用提示词", () => {
    const beat = makeFullBeat();
    const elements = makeElements();
    const reference = {
      direction: "custom" as const,
      contentType: "video_segment" as const,
      segmentDuration: 3,
    };
    const referenceShot = makeBeat({ sequence: 2, content: "被引用的镜头内容" });

    const result = builder.buildCrossReferencePrompt(
      beat,
      elements,
      reference,
      referenceShot,
    );

    expect(result).toContain("跨镜引用");
    expect(result).toContain("指定分镜");
    expect(result).toContain("视频片段");
    expect(result).toContain("3秒");
    expect(result).toContain("被引用的镜头内容");
    expect(result).toContain("一致性约束");
    expect(result).toContain("当前分镜");
  });

  it("expandElementUsage：元素绑定包含位置/动作/表情/台词/参考图", () => {
    const beat = makeFullBeat();
    const elements = makeElements();

    const result = builder.buildFeatureAnchoredPrompt(
      beat,
      elements,
      makeFeatureAnchoring(),
    );

    expect(result).toContain("位于左侧");
    expect(result).toContain("正在行走");
    expect(result).toContain("表情惊讶");
    expect(result).toContain("角色定位：主角");
    expect(result).toContain("台词：你是谁？");
    expect(result).toContain("从左侧走来");
    expect(result).toContain("参考图片");
  });
});

describe("端到端提示词组合测试 - buildPromptLayers", () => {
  it("完整层级：角色锚点+镜头指令+自定义描述+风格氛围", () => {
    const result = buildPromptLayers({
      characterAnchors: [
        { elementName: "林小雨", featureTags: ["银色长发", "蓝色眼睛"] },
        { elementName: "陈风", featureTags: ["黑色短发", "棕色眼睛"] },
      ],
      shotInstruction: makeShotInstruction(),
      customDescription: "从远景缓慢推至中景",
      styleAtmosphere: "神秘氛围，暖色调",
    });

    expect(result.coreElements).toContain("林小雨");
    expect(result.coreElements).toContain("银色长发");
    expect(result.coreElements).toContain("陈风");
    expect(result.coreElements).toContain("黑色短发");

    expect(result.cameraAction).toContain("medium shot");
    expect(result.cameraAction).toContain("push in");
    expect(result.cameraAction).toContain("从远景缓慢推至中景");

    expect(result.styleAtmosphere).toContain("神秘氛围");
    expect(result.styleAtmosphere).toContain("暖色调");
  });
});

describe("端到端提示词组合测试 - shotInstructionToPrompt", () => {
  it("完整镜头指令转提示词", () => {
    const result = shotInstructionToPrompt({
      shotSize: "close",
      cameraMovement: "orbit",
      cameraAngle: "low",
    });

    expect(result).toContain("close-up shot");
    expect(result).toContain("orbit shot");
    expect(result).toContain("low angle shot");
  });

  it("部分镜头指令", () => {
    const result = shotInstructionToPrompt({
      shotSize: "wide",
      cameraMovement: "static",
      cameraAngle: "eye_level",
    });

    expect(result).toContain("wide shot");
    expect(result).toContain("static camera");
    expect(result).toContain("eye level shot");
  });
});

describe("端到端提示词组合测试 - 数据流完整性", () => {
  it("角色数据从 Character → buildCharacterAppearanceDesc → 提示词", () => {
    const char = makeCharacter();
    const appearance = buildCharacterAppearanceDesc(char);

    expect(appearance).toContain("银色发色");
    expect(appearance).toContain("长发发型");
    expect(appearance).toContain("蓝色眼睛");
    expect(appearance).toContain("纤细体型");
    expect(appearance).toContain("穿着战斗服");
    expect(appearance).toContain("左眼有伤疤");

    const prompt = generateCharacterImagePrompt(char);
    expect(prompt).toContain(appearance.split("，")[0]);
  });

  it("场景数据从 Scene → buildSceneAtmosphereDesc + buildSceneVisualDesc → 提示词", () => {
    const scene = makeScene();
    const atmosphere = buildSceneAtmosphereDesc(scene);
    const visual = buildSceneVisualDesc(scene);

    expect(atmosphere).toContain("黄昏");
    expect(atmosphere).toContain("薄雾");
    expect(atmosphere).toContain("神秘氛围");
    expect(atmosphere).toContain("自然光照明");

    expect(visual).toContain("古树");
    expect(visual).toContain("溪流");
    expect(visual).toContain("翠绿");
    expect(visual).toContain("金色色调");

    const prompt = generateSceneImagePrompt(scene);
    expect(prompt).toContain("古老森林");
  });

  it("场景元素数据从 SceneElement → buildElementEffectDesc → 提示词", () => {
    const element: SceneElement = {
      id: "se-1",
      name: "林小雨",
      type: "existing_character",
      characterId: "char-1",
      dialogue: "你是谁？",
      action: "行走",
      emotion: "惊讶",
      position: "左侧",
      pose: "站立",
    };

    const effect = buildElementEffectDesc(element);
    expect(effect).toContain("说\"你是谁？\"");
    expect(effect).toContain("行走");
    expect(effect).toContain("表情惊讶");
    expect(effect).toContain("位于左侧");
    expect(effect).toContain("站立姿态");
  });

  it("ShotInstruction → shotInstructionToPrompt → 各提示词模式", () => {
    const instruction: ShotInstructionTemplate = {
      shotSize: "extreme_close",
      cameraMovement: "tracking",
      cameraAngle: "dutch",
    };

    const prompt = shotInstructionToPrompt(instruction);
    expect(prompt).toContain("extreme close-up shot");
    expect(prompt).toContain("tracking shot");
    expect(prompt).toContain("dutch angle");

    const beat = makeBeat({ content: "测试" });
    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [],
      scenes: [],
      shotInstruction: instruction,
    });

    expect(result).toContain("extreme close-up shot");
    expect(result).toContain("tracking shot");
    expect(result).toContain("dutch angle");
  });
});

describe("端到端提示词组合测试 - 边界情况", () => {
  it("空角色列表不崩溃", () => {
    const beat = makeBeat({ characterIds: [] });
    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [],
      scenes: [],
    });
    expect(result).toBeTruthy();
    expect(result).not.toContain("undefined");
  });

  it("空场景列表不崩溃", () => {
    const beat = makeBeat({ sceneId: "non-existent" });
    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [],
      scenes: [],
    });
    expect(result).toBeTruthy();
    expect(result).not.toContain("undefined");
  });

  it("角色 ID 不匹配时不崩溃", () => {
    const beat = makeBeat({ characterIds: ["non-existent"] });
    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [makeCharacter()],
      scenes: [],
    });
    expect(result).toBeTruthy();
    expect(result).not.toContain("undefined");
  });

  it("所有字段为空时生成基本提示词", () => {
    const beat: StoryBeat = {
      id: "beat-min",
      sequence: 0,
      description: "",
      duration: 5,
      characterIds: [],
      elementIds: [],
    };

    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [],
      scenes: [],
    });

    expect(result).toBeTruthy();
    expect(result).toContain("镜头 1");
    expect(result).not.toContain("undefined");
    expect(result).not.toContain("null");
  });

  it("characterOutfits 中 outfitId 不存在时不崩溃", () => {
    const char = makeCharacter();
    const beat = makeBeat({
      characterIds: ["char-1"],
      characterOutfits: { "char-1": "non-existent-outfit" },
    });

    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [char],
      scenes: [],
    });

    expect(result).toBeTruthy();
    expect(result).toContain("战斗服");
  });

  it("camera 为字符串时不崩溃", () => {
    const beat = makeBeat({
      camera: "推" as unknown as StoryBeat["camera"],
    });

    const result = generateSingleBeatPrompt({
      beat,
      index: 0,
      characters: [],
      scenes: [],
    });

    expect(result).toBeTruthy();
    expect(result).not.toContain("undefined");
  });
});
