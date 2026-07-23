/**
 * prompt/builder 测试
 *
 * 覆盖三个文件：
 * - prompt-builder.ts：PromptBuilder 类的 6 个构建方法
 * - quick-mode.ts：generateQuickModeVideoPrompt 及选项函数
 * - story-plan.ts：generateStoryPlanPrompt
 */

import { describe, it, expect } from "vitest";
import { PromptBuilder, promptBuilder } from "../prompt-builder";
import { generateQuickModeVideoPrompt, AVAILABLE_STYLES } from "../quick-mode";
import { generateStoryPlanPrompt } from "../story-plan";
import type {
  StoryElement,
  StoryBeat,
  FeatureAnchoringConfig,
  ShotReference,
  ShotInstructionTemplate,
  Character,
  Scene,
} from "@/domain/schemas";

// ── 工厂函数 ──────────────────────────────────────────────────────

const makeElement = (
  overrides: Partial<StoryElement> = {},
): StoryElement => ({
  id: "elem-1",
  type: "character",
  name: "主角",
  description: "一个勇敢的角色",
  bindings: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeBeat = (overrides: Partial<StoryBeat> = {}): StoryBeat => ({
  id: "beat-1",
  sequence: 1,
  description: "主角走进森林",
  characterIds: [],
  elementIds: [],
  ...overrides,
});

const makeCharacter = (overrides: Partial<Character> = {}): Character => ({
  id: "char-1",
  name: "测试角色",
  gender: "女性",
  age: 25,
  style: "anime",
  personality: ["勇敢", "聪明"],
  description: "一个测试角色",
  appearance: {
    hairColor: "银色",
    hairStyle: "长发",
    eyeColor: "蓝色",
    height: "170cm",
    build: "纤细",
    clothing: "战斗服",
  },
  outfits: [],
  prompt: "",
  ...overrides,
});

const makeScene = (overrides: Partial<Scene> = {}): Scene => ({
  id: "scene-1",
  name: "测试场景",
  type: "室内",
  description: "一个测试场景",
  timeOfDay: "黄昏",
  weather: "晴朗",
  mood: "平静",
  lighting: "自然光",
  elements: ["桌子", "椅子"],
  colors: ["暖色调"],
  camera: { angle: "平视", movement: "固定" },
  prompt: "",
  ...overrides,
});

const makeFeatureAnchoring = (
  overrides: Partial<FeatureAnchoringConfig> = {},
): FeatureAnchoringConfig => ({
  enabled: true,
  characterAnchors: [
    {
      elementId: "elem-1",
      referenceImageUrl: "/ref.png",
      featureTags: ["silver hair", "blue eyes"],
      weight: 0.9,
    },
  ],
  ...overrides,
});

const makeShotInstruction = (
  overrides: Partial<ShotInstructionTemplate> = {},
): ShotInstructionTemplate => ({
  shotSize: "medium",
  cameraMovement: "static",
  cameraAngle: "eye_level",
  ...overrides,
});

const makeShotReference = (
  overrides: Partial<ShotReference> = {},
): ShotReference => ({
  direction: "previous",
  contentType: "last_frame",
  ...overrides,
});

// ── PromptBuilder 类 ─────────────────────────────────────────────

describe("PromptBuilder — buildGlobalElementDefinitions", () => {
  const builder = new PromptBuilder();

  it("空数组返回空字符串", () => {
    expect(builder.buildGlobalElementDefinitions([])).toBe("");
  });

  it("包含全局元素定义标题", () => {
    const result = builder.buildGlobalElementDefinitions([makeElement()]);
    expect(result).toContain("【全局元素定义 - 跨分镜保持一致】");
    expect(result).toContain("全局唯一标识");
  });

  it("为每个元素生成 ID、类型标签和名称行", () => {
    const result = builder.buildGlobalElementDefinitions([
      makeElement({ id: "e1", type: "character", name: "主角" }),
      makeElement({ id: "e2", type: "prop", name: "宝剑", description: "" }),
    ]);
    expect(result).toContain("e1（角色）：主角");
    expect(result).toContain("e2（道具）：宝剑");
  });

  it("effect 类型元素标签为 '特效'", () => {
    const result = builder.buildGlobalElementDefinitions([
      makeElement({ id: "e3", type: "effect", name: "火焰" }),
    ]);
    expect(result).toContain("e3（特效）：火焰");
  });

  it("character 元素包含外观描述行", () => {
    const result = builder.buildGlobalElementDefinitions([
      makeElement({
        type: "character",
        characterConfig: {
          appearance: {
            hairColor: "金色",
            hairStyle: "短发",
            eyeColor: "绿色",
            build: "健壮",
            clothing: "盔甲",
          },
        },
      }),
    ]);
    expect(result).toContain("外观");
    expect(result).toContain("金色发色");
    expect(result).toContain("短发发型");
    expect(result).toContain("绿色眼睛");
    expect(result).toContain("健壮身材");
    expect(result).toContain("穿着盔甲");
  });

  it("prop 元素包含外观描述行", () => {
    const result = builder.buildGlobalElementDefinitions([
      makeElement({ type: "prop", description: "一把发光的圣剑" }),
    ]);
    expect(result).toContain("外观：一把发光的圣剑");
  });

  it("元素带图片绑定时包含参考图描述", () => {
    const result = builder.buildGlobalElementDefinitions([
      makeElement({
        bindings: [
          {
            type: "image",
            url: "https://example.com/char.png",
            name: "角色参考",
            uploadedAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    ]);
    expect(result).toContain("参考图：https://example.com/char.png");
    expect(result).toContain("一致性约束");
  });

  it("元素带本地图片绑定时使用 fallback 描述", () => {
    const result = builder.buildGlobalElementDefinitions([
      makeElement({
        bindings: [
          {
            type: "image",
            url: "/local/path.png",
            name: "角色参考",
            uploadedAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    ]);
    expect(result).toContain("参考图：已附加");
    expect(result).toContain("通过 reference 通道传输");
  });

  it("元素带 featureAnchor 时包含核心特征", () => {
    const result = builder.buildGlobalElementDefinitions([
      makeElement({
        featureAnchor: {
          elementId: "elem-1",
          elementType: "character",
          referenceImageUrl: "/ref.png",
          featureTags: ["银发", "蓝眼"],
          confidence: 0.95,
          extractedAt: "2026-01-01T00:00:00Z",
        },
      }),
    ]);
    expect(result).toContain("核心特征：银发、蓝眼");
    expect(result).toContain("特征置信度：95%");
  });
});

describe("PromptBuilder — buildFeatureAnchoredPrompt", () => {
  const builder = new PromptBuilder();

  it("包含全局元素定义", () => {
    const result = builder.buildFeatureAnchoredPrompt(
      makeBeat(),
      [makeElement()],
      makeFeatureAnchoring(),
    );
    expect(result).toContain("【全局元素定义 - 跨分镜保持一致】");
  });

  it("包含特征锚定型独立生成标题", () => {
    const result = builder.buildFeatureAnchoredPrompt(
      makeBeat({ sequence: 3 }),
      [],
      makeFeatureAnchoring(),
    );
    expect(result).toContain("【特征锚定型独立生成】");
    expect(result).toContain("独立生成第3分镜");
  });

  it("包含特征锚定约束", () => {
    const result = builder.buildFeatureAnchoredPrompt(
      makeBeat(),
      [],
      makeFeatureAnchoring(),
    );
    expect(result).toContain("【特征锚定约束】");
    expect(result).toContain("角色参考图");
    expect(result).toContain("严格继承参考图中角色的外观");
    expect(result).toContain("一致性权重：90%");
  });

  it("characterAnchors 包含 featureTags 时注入核心特征", () => {
    const result = builder.buildFeatureAnchoredPrompt(
      makeBeat(),
      [],
      makeFeatureAnchoring({
        characterAnchors: [
          {
            elementId: "elem-1",
            referenceImageUrl: "/ref.png",
            featureTags: ["银发", "蓝眼"],
            weight: 0.8,
          },
        ],
      }),
    );
    expect(result).toContain("核心特征：银发、蓝眼");
  });

  it("previewImageUrl 存在时包含分镜预览图描述", () => {
    const result = builder.buildFeatureAnchoredPrompt(
      makeBeat(),
      [],
      makeFeatureAnchoring({ previewImageUrl: "/preview.png" }),
    );
    expect(result).toContain("分镜预览图");
    expect(result).toContain("构图和画面参考");
  });

  it("传入 shotInstruction 时包含镜头指令", () => {
    const result = builder.buildFeatureAnchoredPrompt(
      makeBeat(),
      [],
      makeFeatureAnchoring(),
      makeShotInstruction({ shotSize: "close", cameraMovement: "push" }),
    );
    expect(result).toContain("【镜头指令】");
  });

  it("不传 shotInstruction 时不包含镜头指令", () => {
    const result = builder.buildFeatureAnchoredPrompt(
      makeBeat(),
      [],
      makeFeatureAnchoring(),
    );
    expect(result).not.toContain("【镜头指令】");
  });

  it("shot.elementIds 匹配的元素出现在本分镜元素使用中", () => {
    const result = builder.buildFeatureAnchoredPrompt(
      makeBeat({ elementIds: ["e1"] }),
      [makeElement({ id: "e1", name: "主角" })],
      makeFeatureAnchoring(),
    );
    expect(result).toContain("【本分镜元素使用】");
    expect(result).toContain("e1（角色）：主角");
  });

  it("shot.promptLayers 存在时包含提示词层级", () => {
    const result = builder.buildFeatureAnchoredPrompt(
      makeBeat({
        promptLayers: {
          coreElements: "主角和宝剑",
          cameraAction: "推镜头",
          styleAtmosphere: "紧张氛围",
        },
      }),
      [],
      makeFeatureAnchoring(),
    );
    expect(result).toContain("【提示词层级】");
    expect(result).toContain("核心元素：主角和宝剑");
    expect(result).toContain("镜头动作：推镜头");
    expect(result).toContain("风格氛围：紧张氛围");
  });

  it("包含一致性约束段落", () => {
    const result = builder.buildFeatureAnchoredPrompt(
      makeBeat(),
      [],
      makeFeatureAnchoring({ featureConsistencyStrength: 0.8 }),
    );
    expect(result).toContain("【一致性约束】");
    expect(result).toContain("特征一致性强度：80%");
    expect(result).toContain("帧绑定：已禁用");
  });
});

describe("PromptBuilder — buildFirstShotPrompt", () => {
  const builder = new PromptBuilder();

  it("包含全局风格约束", () => {
    const result = builder.buildFirstShotPrompt(makeBeat(), []);
    expect(result).toContain("【全局风格约束】");
    expect(result).toContain("视觉基准");
  });

  it("包含本分镜元素使用", () => {
    const result = builder.buildFirstShotPrompt(
      makeBeat({ elementIds: ["e1"] }),
      [makeElement({ id: "e1", name: "主角" })],
    );
    expect(result).toContain("【本分镜元素使用】");
    expect(result).toContain("e1（角色）：主角");
  });

  it("包含镜头描述", () => {
    const result = builder.buildFirstShotPrompt(
      makeBeat({ content: "主角站在山顶", duration: 5 }),
      [],
    );
    expect(result).toContain("【镜头描述】");
    expect(result).toContain("内容：主角站在山顶");
    expect(result).toContain("时长：5秒");
  });

  it("包含基准声明", () => {
    const result = builder.buildFirstShotPrompt(makeBeat(), []);
    expect(result).toContain("【基准声明】");
    expect(result).toContain("视觉基准");
  });

  it("camera.distance 存在时包含距离", () => {
    const result = builder.buildFirstShotPrompt(
      makeBeat({ camera: { distance: "远距离" } }),
      [],
    );
    expect(result).toContain("距离：远距离");
  });
});

describe("PromptBuilder — buildInheritancePrompt", () => {
  const builder = new PromptBuilder();

  it("包含继承约束并引用上一分镜序号", () => {
    const result = builder.buildInheritancePrompt(
      makeBeat({ sequence: 2 }),
      [],
      makeBeat({ sequence: 1 }),
    );
    expect(result).toContain("【继承约束】");
    expect(result).toContain("完全继承第1分镜");
  });

  it("包含本分镜元素使用", () => {
    const result = builder.buildInheritancePrompt(
      makeBeat({ elementIds: ["e1"] }),
      [makeElement({ id: "e1", name: "主角" })],
      makeBeat({ sequence: 1 }),
    );
    expect(result).toContain("【本分镜元素使用】");
    expect(result).toContain("e1（角色）：主角");
  });

  it("包含镜头变化", () => {
    const result = builder.buildInheritancePrompt(
      makeBeat({ content: "主角转身离开", duration: 3 }),
      [],
      makeBeat({ sequence: 1 }),
    );
    expect(result).toContain("【镜头变化】");
    expect(result).toContain("内容：主角转身离开");
    expect(result).toContain("时长：3秒");
  });
});

describe("PromptBuilder — buildIndependentShotPrompt", () => {
  const builder = new PromptBuilder();

  it("包含独立生成标题", () => {
    const result = builder.buildIndependentShotPrompt(
      makeBeat({ sequence: 5 }),
      [],
    );
    expect(result).toContain("【独立生成】");
    expect(result).toContain("独立生成第5分镜");
  });

  it("包含本分镜元素使用", () => {
    const result = builder.buildIndependentShotPrompt(
      makeBeat({ elementIds: ["e1"] }),
      [makeElement({ id: "e1", name: "主角" })],
    );
    expect(result).toContain("【本分镜元素使用】");
    expect(result).toContain("e1（角色）：主角");
  });

  it("无 reference 时不包含引用规则", () => {
    const result = builder.buildIndependentShotPrompt(makeBeat(), []);
    expect(result).not.toContain("【引用规则】");
  });

  it("有 reference 和 referenceShot 时包含引用规则", () => {
    const result = builder.buildIndependentShotPrompt(
      makeBeat(),
      [],
      makeShotReference({ direction: "previous", contentType: "last_frame" }),
      makeBeat({ sequence: 2 }),
    );
    expect(result).toContain("【引用规则】");
    expect(result).toContain("引用来源：上一分镜");
    expect(result).toContain("引用内容：尾帧");
  });

  it("reference.segmentDuration 存在时包含片段时长", () => {
    const result = builder.buildIndependentShotPrompt(
      makeBeat(),
      [],
      makeShotReference({ segmentDuration: 5 }),
      makeBeat({ sequence: 2 }),
    );
    expect(result).toContain("片段时长：5秒");
  });

  it("包含镜头内容", () => {
    const result = builder.buildIndependentShotPrompt(
      makeBeat({ content: "战斗场景", duration: 8 }),
      [],
    );
    expect(result).toContain("【镜头内容】");
    expect(result).toContain("内容：战斗场景");
    expect(result).toContain("时长：8秒");
  });

  it("包含一致性约束", () => {
    const result = builder.buildIndependentShotPrompt(makeBeat(), []);
    expect(result).toContain("【一致性约束】");
    expect(result).toContain("画面风格、光影、元素外观完全一致");
  });
});

describe("PromptBuilder — buildCrossReferencePrompt", () => {
  const builder = new PromptBuilder();

  it("包含跨镜引用标题", () => {
    const result = builder.buildCrossReferencePrompt(
      makeBeat(),
      [],
      makeShotReference({ direction: "previous", contentType: "last_frame" }),
      makeBeat({ sequence: 1, content: "主角站在门前" }),
    );
    expect(result).toContain("【跨镜引用】");
    expect(result).toContain("引用方向：上一分镜");
    expect(result).toContain("引用类型：尾帧画面");
  });

  it("包含被引用分镜内容", () => {
    const result = builder.buildCrossReferencePrompt(
      makeBeat(),
      [],
      makeShotReference(),
      makeBeat({ sequence: 3, content: "爆炸场景" }),
    );
    expect(result).toContain("被引用分镜内容：爆炸场景");
  });

  it("被引用分镜无 content 时使用 description", () => {
    const result = builder.buildCrossReferencePrompt(
      makeBeat(),
      [],
      makeShotReference(),
      makeBeat({ sequence: 3, description: "描述内容" }),
    );
    expect(result).toContain("被引用分镜内容：描述内容");
  });

  it("direction 为 custom 时显示指定分镜序号", () => {
    const result = builder.buildCrossReferencePrompt(
      makeBeat(),
      [],
      makeShotReference({ direction: "custom" }),
      makeBeat({ sequence: 7 }),
    );
    expect(result).toContain("指定分镜（第7分镜）");
  });

  it("direction 为 next 时显示下一分镜", () => {
    const result = builder.buildCrossReferencePrompt(
      makeBeat(),
      [],
      makeShotReference({ direction: "next" }),
      makeBeat({ sequence: 5 }),
    );
    expect(result).toContain("引用方向：下一分镜");
  });

  it("包含一致性约束", () => {
    const result = builder.buildCrossReferencePrompt(
      makeBeat(),
      [],
      makeShotReference(),
      makeBeat({ sequence: 1 }),
    );
    expect(result).toContain("【一致性约束】");
    expect(result).toContain("无跳变、无穿帮");
  });

  it("包含当前分镜元素使用", () => {
    const result = builder.buildCrossReferencePrompt(
      makeBeat({ elementIds: ["e1"] }),
      [makeElement({ id: "e1", name: "主角" })],
      makeShotReference(),
      makeBeat({ sequence: 1 }),
    );
    expect(result).toContain("【当前分镜】");
    expect(result).toContain("e1（角色）：主角");
  });

  it("reference.segmentDuration 存在时包含引用时长", () => {
    const result = builder.buildCrossReferencePrompt(
      makeBeat(),
      [],
      makeShotReference({ segmentDuration: 10 }),
      makeBeat({ sequence: 1 }),
    );
    expect(result).toContain("引用时长：10秒");
  });
});

describe("PromptBuilder — promptBuilder 单例", () => {
  it("promptBuilder 是 PromptBuilder 实例", () => {
    expect(promptBuilder).toBeInstanceOf(PromptBuilder);
  });

  it("promptBuilder 单例方法可用", () => {
    const result = promptBuilder.buildFirstShotPrompt(makeBeat(), []);
    expect(result).toContain("【基准声明】");
  });
});

// ── quick-mode ───────────────────────────────────────────────────

describe("quick-mode — generateQuickModeVideoPrompt", () => {
  it("包含视频内容", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "角色在森林中奔跑",
      duration: 5,
      resolution: "1080p",
      style: "anime",
    });
    expect(result).toContain("角色在森林中奔跑");
    expect(result).toContain("【视频内容】");
  });

  it("有角色时包含核心角色和角色要求", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
      characters: [makeCharacter()],
    });
    expect(result).toContain("【核心角色】");
    expect(result).toContain("测试角色");
    expect(result).toContain("【角色要求】");
    expect(result).toContain("形象、服装、特征完全一致");
  });

  it("无角色时不包含核心角色", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
    });
    expect(result).not.toContain("【核心角色】");
  });

  it("有场景时包含固定场景和场景要求", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
      scene: makeScene(),
    });
    expect(result).toContain("【固定场景】");
    expect(result).toContain("测试场景");
    expect(result).toContain("【场景要求】");
    expect(result).toContain("场景环境、光线、空间结构完全一致");
  });

  it("无场景时不包含固定场景", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
    });
    expect(result).not.toContain("【固定场景】");
  });

  it("包含画面风格", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
    });
    expect(result).toContain("【画面风格】");
    expect(result).toContain("日本动漫风格");
  });

  it("包含技术参数（分辨率和时长）", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 10,
      resolution: "4K",
      style: "realistic",
    });
    expect(result).toContain("【技术参数】");
    expect(result).toContain("3840x2160");
    expect(result).toContain("10秒");
  });

  it("未知分辨率时回退到 1080p", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "unknown",
      style: "anime",
    });
    expect(result).toContain("1920x1080");
  });

  it("有参考图时包含参考素材", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
      referenceImage: "http://ref.png",
    });
    expect(result).toContain("【参考素材】");
  });

  it("无参考图时不包含参考素材", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
    });
    expect(result).not.toContain("【参考素材】");
  });

  it("默认开启智能优化", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
    });
    expect(result).toContain("【智能优化】");
  });

  it("显式关闭智能优化", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
      enableSmartOptimization: false,
    });
    expect(result).not.toContain("【智能优化】");
  });

  it("包含质量标签", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
    });
    expect(result).toContain("【质量要求】");
    expect(result).toContain("high quality");
    expect(result).toContain("cinematic");
  });

  it("包含基础禁止内容", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
    });
    expect(result).toContain("【禁止内容】");
    expect(result).toContain("no clipping");
    expect(result).toContain("no watermark");
  });

  it("有 negativePrompt 时追加到禁止内容", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
      negativePrompt: "no cats, no dogs",
    });
    expect(result).toContain("no cats, no dogs");
  });

  it("角色有 generatedImage 时加入参考图一致性备注", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
      characters: [makeCharacter({ generatedImage: "http://char.png" })],
    });
    expect(result).toContain("保持角色形象与参考图片完全一致");
  });

  it("场景有 generatedImage 时加入参考图一致性备注", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "anime",
      scene: makeScene({ generatedImage: "http://scene.png" }),
    });
    expect(result).toContain("保持场景与参考图片完全一致");
  });

  it("未知 style 直接使用字符串", () => {
    const result = generateQuickModeVideoPrompt({
      prompt: "测试",
      duration: 5,
      resolution: "1080p",
      style: "自定义风格",
    });
    expect(result).toContain("自定义风格");
  });
});

describe("quick-mode — AVAILABLE_STYLES", () => {
  it("是非空数组", () => {
    expect(Array.isArray(AVAILABLE_STYLES)).toBe(true);
    expect(AVAILABLE_STYLES.length).toBeGreaterThan(0);
  });

  it("包含常见风格", () => {
    expect(AVAILABLE_STYLES).toContain("realistic");
    expect(AVAILABLE_STYLES).toContain("anime");
    expect(AVAILABLE_STYLES).toContain("cinematic");
    expect(AVAILABLE_STYLES).toContain("cyberpunk");
  });
});

// ── story-plan ───────────────────────────────────────────────────

describe("story-plan — generateStoryPlanPrompt", () => {
  it("包含故事标题、简介、类型和基调", () => {
    const result = generateStoryPlanPrompt({
      title: "星际旅行",
      description: "一段穿越银河的冒险",
      genre: "科幻",
      tone: "史诗",
      targetDuration: 60,
      characters: [],
      scenes: [],
    });
    expect(result).toContain("星际旅行");
    expect(result).toContain("穿越银河的冒险");
    expect(result).toContain("科幻");
    expect(result).toContain("史诗");
    expect(result).toContain("60");
  });

  it("包含类型节奏指导", () => {
    const result = generateStoryPlanPrompt({
      title: "测试",
      description: "测试",
      genre: "喜剧",
      tone: "轻松",
      targetDuration: 30,
      characters: [],
      scenes: [],
    });
    expect(result).toContain("喜剧节奏");
    expect(result).toContain("误会叠加");
  });

  it("未知类型回退到剧情节奏", () => {
    const result = generateStoryPlanPrompt({
      title: "测试",
      description: "测试",
      genre: "unknown-genre",
      tone: "neutral",
      targetDuration: 30,
      characters: [],
      scenes: [],
    });
    expect(result).toContain("剧情片节奏");
  });

  it("包含基调指导", () => {
    const result = generateStoryPlanPrompt({
      title: "测试",
      description: "测试",
      genre: "剧情",
      tone: "温馨",
      targetDuration: 30,
      characters: [],
      scenes: [],
    });
    expect(result).toContain("温馨细腻");
  });

  it("未知基调回退到中性", () => {
    const result = generateStoryPlanPrompt({
      title: "测试",
      description: "测试",
      genre: "剧情",
      tone: "unknown-tone",
      targetDuration: 30,
      characters: [],
      scenes: [],
    });
    expect(result).toContain("中性基调");
  });

  it("有角色时包含角色描述", () => {
    const result = generateStoryPlanPrompt({
      title: "测试",
      description: "测试",
      genre: "剧情",
      tone: "中性",
      targetDuration: 30,
      characters: [makeCharacter({ name: "主角A" })],
      scenes: [],
    });
    expect(result).toContain("已有角色");
    expect(result).toContain("主角A");
  });

  it("有场景时包含场景描述", () => {
    const result = generateStoryPlanPrompt({
      title: "测试",
      description: "测试",
      genre: "剧情",
      tone: "中性",
      targetDuration: 30,
      characters: [],
      scenes: [makeScene({ name: "古堡" })],
    });
    expect(result).toContain("已有场景");
    expect(result).toContain("古堡");
  });

  it("空标题和空描述使用默认值", () => {
    const result = generateStoryPlanPrompt({
      title: "",
      description: "",
      genre: "",
      tone: "",
      targetDuration: 0,
      characters: [],
      scenes: [],
    });
    expect(result).toContain("未命名");
    expect(result).toContain("无");
  });

  it("包含 JSON 格式说明", () => {
    const result = generateStoryPlanPrompt({
      title: "测试",
      description: "测试",
      genre: "剧情",
      tone: "中性",
      targetDuration: 60,
      characters: [],
      scenes: [],
    });
    expect(result).toContain("JSON");
    expect(result).toContain("duration");
    expect(result).toContain("content");
  });

  it("包含镜头数量建议", () => {
    const result = generateStoryPlanPrompt({
      title: "测试",
      description: "测试",
      genre: "剧情",
      tone: "中性",
      targetDuration: 60,
      characters: [],
      scenes: [],
    });
    expect(result).toContain("镜头数量建议");
  });

  it("包含 duration 总和约束", () => {
    const result = generateStoryPlanPrompt({
      title: "测试",
      description: "测试",
      genre: "剧情",
      tone: "中性",
      targetDuration: 60,
      characters: [],
      scenes: [],
    });
    expect(result).toContain("duration 总和必须等于目标总时长");
  });

  it("targetDuration 为 0 时使用默认值 60", () => {
    const result = generateStoryPlanPrompt({
      title: "测试",
      description: "测试",
      genre: "剧情",
      tone: "中性",
      targetDuration: 0,
      characters: [],
      scenes: [],
    });
    expect(result).toContain("60 秒");
  });
});
