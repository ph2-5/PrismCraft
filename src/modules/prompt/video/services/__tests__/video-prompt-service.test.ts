import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateProfessionalVideoPrompt,
  generateEnhancedVideoPrompt,
  generateQuickVideoPrompt,
  generateSingleBeatPrompt,
} from "../video-prompt-service";
import type {
  StoryBeat,
  Character,
  Scene,
  SceneElement,
  FeatureAnchoringConfig,
  StoryElement,
  ShotInstructionTemplate,
} from "@/domain/schemas";

vi.mock("../../../base", () => ({
  buildCharacterFullDesc: vi.fn((c: Character) => `${c.name}的外貌描述`),
  buildCharacterAppearanceDesc: vi.fn((c: Character) => `${c.name}外观_${c.appearance?.clothing || ""}`),
  buildSceneAtmosphereDesc: vi.fn((s: Scene) => `${s.name}氛围`),
  buildSceneVisualDesc: vi.fn((s: Scene) => `${s.name}视觉`),
  buildElementEffectDesc: vi.fn((el: SceneElement) =>
    el.name ? `${el.name}效果` : "",
  ),
  buildFixedImageDesc: vi.fn((cfg: unknown) => (cfg ? "固定图片描述" : "")),
  buildReferenceVideoDesc: vi.fn((cfg: unknown) =>
    cfg ? "参考视频描述" : "",
  ),
  buildTemplateDesc: vi.fn((cfg: unknown) => (cfg ? "模板描述" : "")),
  CAMERA_MOVEMENT_KEYWORDS: {
    pan: "平移",
    tilt: "俯仰",
    zoom: "推拉",
    static: "静止",
    orbit: "环绕",
  },
  TRANSITION_KEYWORDS: {
    cut: "硬切",
    fade: "淡入淡出",
    dissolve: "叠化",
    wipe: "擦除",
  },
}));

vi.mock("@/domain/utils", () => ({
  shotInstructionToPrompt: vi.fn(() => "镜头指令文本"),
  getBeatCharacterIds: vi.fn((beat: { characterIds?: string[]; characters?: string[]; character?: string }) => {
    if (beat.characterIds?.length) return beat.characterIds;
    if (beat.characters?.length) return beat.characters;
    if (beat.character) return [beat.character];
    return [];
  }),
}));

vi.mock("../../../builder", () => ({
  promptBuilder: {
    buildGlobalElementDefinitions: vi.fn((els: StoryElement[]) =>
      els.length > 0 ? "全局元素定义" : "",
    ),
  },
}));

function makeStory(overrides: Record<string, unknown> = {}) {
  return {
    title: "测试故事",
    description: "测试描述",
    genre: "剧情",
    tone: "中性",
    targetDuration: 60,
    ...overrides,
  };
}

function makeCharacter(overrides: Record<string, unknown> = {}): Character {
  return {
    id: "c1",
    name: "小明",
    description: "测试角色",
    gender: "男",
    style: "写实",
    personality: [],
    appearance: {
      hairColor: "",
      hairStyle: "",
      eyeColor: "",
      height: "",
      build: "",
      clothing: "便装",
    },
    prompt: "test",
    ...overrides,
  } as Character;
}

function makeScene(overrides: Record<string, unknown> = {}): Scene {
  return {
    id: "s1",
    name: "森林",
    description: "测试场景",
    type: "outdoor",
    ...overrides,
  } as Scene;
}

function makeBeat(overrides: Record<string, unknown> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 1,
    description: "测试镜头",
    duration: 5,
    characters: [],
    elementIds: [],
    characterIds: [],
    enhancedGeneration: false,
    ...overrides,
  } as StoryBeat;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateProfessionalVideoPrompt", () => {
  it("基本输出包含故事标题、genre/tone 默认值", () => {
    const result = generateProfessionalVideoPrompt({
      story: makeStory({ title: "我的故事", genre: "", tone: "", targetDuration: 60, description: "描述" }),
      beats: [makeBeat({ title: "镜头1", content: "内容" })],
      characters: [],
      scenes: [],
    });

    expect(result).toContain("我的故事");
    expect(result).toContain("剧情");
    expect(result).toContain("中性");
  });

  it("角色描述：beat 中的角色应被解析并包含在输出中", () => {
    const result = generateProfessionalVideoPrompt({
      story: makeStory(),
      beats: [makeBeat({ characters: ["c1"], title: "镜头1", content: "内容" })],
      characters: [makeCharacter({ id: "c1", name: "小明" })],
      scenes: [],
    });

    expect(result).toContain("小明");
  });

  it("场景氛围：beat 中的场景应包含氛围描述", () => {
    const result = generateProfessionalVideoPrompt({
      story: makeStory(),
      beats: [makeBeat({ scene: "s1", title: "镜头1", content: "内容" })],
      characters: [],
      scenes: [makeScene({ id: "s1", name: "森林" })],
    });

    expect(result).toContain("森林");
  });
});

describe("generateEnhancedVideoPrompt", () => {
  it("场景元素多组：多组元素输出时间1/时间2格式", () => {
    const result = generateEnhancedVideoPrompt({
      story: makeStory(),
      beats: [
        makeBeat({
          title: "镜头1",
          description: "描述",
          sceneElements: [
            { id: "e1", name: "元素A", type: "prop", timelineGroup: 0 } as SceneElement,
            { id: "e2", name: "元素B", type: "prop", timelineGroup: 1 } as SceneElement,
          ],
        }),
      ],
      characters: [],
      scenes: [],
    });

    expect(result).toContain("时间1");
    expect(result).toContain("时间2");
  });

  it("场景元素单组：单组元素输出场景元素格式", () => {
    const result = generateEnhancedVideoPrompt({
      story: makeStory(),
      beats: [
        makeBeat({
          title: "镜头1",
          description: "描述",
          sceneElements: [
            { id: "e1", name: "元素A", type: "prop", timelineGroup: 0 } as SceneElement,
          ],
        }),
      ],
      characters: [],
      scenes: [],
    });

    expect(result).toContain("场景元素");
  });

  it("运镜关键词：CAMERA_MOVEMENT_KEYWORDS 映射", () => {
    const result = generateEnhancedVideoPrompt({
      story: makeStory(),
      beats: [
        makeBeat({
          title: "镜头1",
          description: "描述",
          camera: { movement: "pan" },
        }),
      ],
      characters: [],
      scenes: [],
    });

    expect(result).toContain("平移");
  });

  it("转场关键词：TRANSITION_KEYWORDS 映射", () => {
    const result = generateEnhancedVideoPrompt({
      story: makeStory(),
      beats: [
        makeBeat({
          title: "镜头1",
          description: "描述",
          transition: "fade",
        }),
      ],
      characters: [],
      scenes: [],
    });

    expect(result).toContain("淡入淡出");
  });
});

describe("generateQuickVideoPrompt", () => {
  it("基本输出包含 content 和角色/场景上下文", () => {
    const result = generateQuickVideoPrompt({
      story: makeStory(),
      content: "一段故事内容",
      characters: [],
      scenes: [],
    });

    expect(result).toContain("一段故事内容");
  });
});

describe("generateSingleBeatPrompt", () => {
  it("特征锚定：featureAnchoring.enabled 时输出包含锚定约束段", () => {
    const featureAnchoring: FeatureAnchoringConfig = {
      enabled: true,
      characterAnchors: [
        {
          elementId: "elem-1",
          referenceImageUrl: "http://example.com/ref.png",
          featureTags: ["发型", "服装"],
          weight: 0.8,
        },
      ],
      propAnchors: [],
      disableFrameBinding: false,
      featureConsistencyStrength: 0.9,
    };

    const result = generateSingleBeatPrompt({
      beat: makeBeat({ title: "镜头1", content: "内容" }),
      index: 0,
      characters: [],
      scenes: [],
      featureAnchoring,
    });

    expect(result).toContain("特征锚定约束");
    expect(result).toContain("80%");
    expect(result).toContain("90%");
    expect(result).toContain("已禁用");
  });

  it("服装切换：characterOutfits 映射时替换服装", () => {
    const characters: Character[] = [
      makeCharacter({
        id: "c1",
        name: "小明",
        appearance: {
          hairColor: "",
          hairStyle: "",
          eyeColor: "",
          height: "",
          build: "",
          clothing: "便装",
        },
        outfits: [
          {
            id: "outfit1",
            name: "礼服",
            clothing: "礼服",
            description: "",
            accessories: [],
          },
        ],
      }) as Character,
    ];

    const result = generateSingleBeatPrompt({
      beat: makeBeat({ characters: ["c1"], title: "镜头1", content: "内容" }),
      index: 0,
      characters,
      scenes: [],
      characterOutfits: { c1: "outfit1" },
    });

    expect(result).toContain("礼服");
    expect(result).not.toContain("便装");
  });

  it("镜头引用：reference.direction !== 'none' 时输出引用描述", () => {
    const result = generateSingleBeatPrompt({
      beat: makeBeat({
        title: "镜头1",
        content: "内容",
        reference: {
          direction: "previous",
          contentType: "last_frame",
        },
      }),
      index: 0,
      characters: [],
      scenes: [],
    });

    expect(result).toContain("上一个镜头");
    expect(result).toContain("尾帧画面");
  });

  it("shotInstruction 与 camera 互斥：有 shotInstruction 时不输出 camera 运镜", () => {
    const shotInstruction: ShotInstructionTemplate = {
      shotSize: "close",
      cameraMovement: "static",
      cameraAngle: "eye_level",
    };

    const result = generateSingleBeatPrompt({
      beat: makeBeat({
        title: "镜头1",
        content: "内容",
        camera: { movement: "pan" },
      }),
      index: 0,
      characters: [],
      scenes: [],
      shotInstruction,
    });

    expect(result).toContain("镜头指令");
    expect(result).not.toMatch(/^运镜：/m);
  });

  it("锚定 vs 非锚定结尾：有 featureAnchoring 时输出特征约束不绑定帧", () => {
    const featureAnchoring: FeatureAnchoringConfig = {
      enabled: true,
      characterAnchors: [
        {
          elementId: "elem-1",
          referenceImageUrl: "http://example.com/ref.png",
          featureTags: ["发型"],
          weight: 0.8,
        },
      ],
      propAnchors: [],
      disableFrameBinding: true,
      featureConsistencyStrength: 0.8,
    };

    const anchoredResult = generateSingleBeatPrompt({
      beat: makeBeat({ title: "镜头1", content: "内容" }),
      index: 0,
      characters: [],
      scenes: [],
      featureAnchoring,
    });

    const unanchoredResult = generateSingleBeatPrompt({
      beat: makeBeat({ title: "镜头1", content: "内容" }),
      index: 0,
      characters: [],
      scenes: [],
    });

    expect(anchoredResult).toContain("参考图仅做特征约束不绑定帧");
    expect(unanchoredResult).not.toContain("参考图仅做特征约束不绑定帧");
  });

  it("上一分镜尾帧参考：previousLastFrameUrl 存在时输出尾帧参考", () => {
    const result = generateSingleBeatPrompt({
      beat: makeBeat({ title: "镜头1", content: "内容" }),
      index: 1,
      characters: [],
      scenes: [],
      previousLastFrameUrl: "http://example.com/frame.png",
    });

    expect(result).toContain("上一分镜尾帧参考");
  });

  it("景别映射：shotType 映射为中文", () => {
    const result = generateSingleBeatPrompt({
      beat: makeBeat({ title: "镜头1", content: "内容", shotType: "close-up" }),
      index: 0,
      characters: [],
      scenes: [],
    });

    expect(result).toContain("特写");
  });

  it("镜头类型映射：type 映射为中文", () => {
    const result = generateSingleBeatPrompt({
      beat: makeBeat({ title: "镜头1", content: "内容", type: "dialogue" }),
      index: 0,
      characters: [],
      scenes: [],
    });

    expect(result).toContain("对话镜头");
  });
});
