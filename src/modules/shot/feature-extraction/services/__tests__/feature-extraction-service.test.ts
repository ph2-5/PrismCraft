import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractCharacterFeatures,
  buildFeatureTags,
  buildFeatureAnchor,
  buildFeatureAnchoringConfig,
  validateReferenceImageQuality,
} from "@/modules/shot";
import type { Character, StoryBeat, StoryElement } from "@/domain/schemas";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "角色A",
    description: "一个勇敢的战士",
    gender: "male",
    style: "realistic",
    personality: ["勇敢"],
    appearance: {
      hairColor: "",
      hairStyle: "",
      eyeColor: "",
      height: "",
      build: "",
      clothing: "",
    },
    prompt: "a brave warrior",
    ...overrides,
  } as Character;
}

function makeElement(overrides: Record<string, unknown> = {}): StoryElement {
  return {
    id: "elem-1",
    type: "character",
    name: "角色A",
    description: "主角",
    bindings: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  } as StoryElement;
}

function makeBeat(overrides: Record<string, unknown> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 1,
    description: "A scene",
    duration: 5,
    characters: [],
    elementIds: [],
    characterIds: [],
    enhancedGeneration: false,
    ...overrides,
  } as StoryBeat;
}

describe("extractCharacterFeatures", () => {
  it("完整外观应提取所有特征", () => {
    const character = makeCharacter({
      appearance: {
        hairColor: "黑色",
        hairStyle: "短发",
        eyeColor: "棕色",
        height: "180cm",
        build: "健壮",
        clothing: "铠甲",
      },
    });

    const features = extractCharacterFeatures(character);

    expect(features).toBeDefined();
    expect(features!.hairColor).toBe("黑色");
    expect(features!.hairStyle).toBe("短发");
    expect(features!.eyeColor).toBe("棕色");
    expect(features!.build).toBe("健壮");
    expect(features!.clothing).toBe("铠甲");
  });

  it("部分外观应只提取存在的特征", () => {
    const character = makeCharacter({
      appearance: {
        hairColor: "金色",
        hairStyle: "",
        eyeColor: "蓝色",
        height: "",
        build: "",
        clothing: "",
      },
    });

    const features = extractCharacterFeatures(character);

    expect(features).toBeDefined();
    expect(features!.hairColor).toBe("金色");
    expect(features!.eyeColor).toBe("蓝色");
    expect(features!.hairStyle).toBeUndefined();
    expect(features!.build).toBeUndefined();
  });

  it("无外观时应返回 undefined", () => {
    const character = makeCharacter({
      appearance: undefined,
    });

    const features = extractCharacterFeatures(character);

    expect(features).toBeUndefined();
  });

  it("描述中包含颜色关键词应提取调色板", () => {
    const character = makeCharacter({
      description: "穿着红色披风和黑色铠甲的战士",
      appearance: {
        hairColor: "",
        hairStyle: "",
        eyeColor: "",
        height: "",
        build: "",
        clothing: "",
      },
    });

    const features = extractCharacterFeatures(character);

    expect(features).toBeDefined();
    expect(features!.colorPalette).toContain("红色");
    expect(features!.colorPalette).toContain("黑色");
  });

  it("空外观和空描述应返回 undefined", () => {
    const character = makeCharacter({
      description: "",
      appearance: {
        hairColor: "",
        hairStyle: "",
        eyeColor: "",
        height: "",
        build: "",
        clothing: "",
      },
    });

    const features = extractCharacterFeatures(character);

    expect(features).toBeUndefined();
  });

  it("language=en 时应提取英文颜色关键词", () => {
    const character = makeCharacter({
      description: "A warrior wearing a red cape and black armor",
      appearance: {
        hairColor: "",
        hairStyle: "",
        eyeColor: "",
        height: "",
        build: "",
        clothing: "",
      },
    });

    const features = extractCharacterFeatures(character, "en");

    expect(features).toBeDefined();
    expect(features!.colorPalette).toContain("red");
    expect(features!.colorPalette).toContain("black");
  });

  it("language=zh 时应提取中文颜色关键词", () => {
    const character = makeCharacter({
      description: "穿着红色披风和黑色铠甲的战士",
      appearance: {
        hairColor: "",
        hairStyle: "",
        eyeColor: "",
        height: "",
        build: "",
        clothing: "",
      },
    });

    const features = extractCharacterFeatures(character, "zh");

    expect(features).toBeDefined();
    expect(features!.colorPalette).toContain("红色");
    expect(features!.colorPalette).toContain("黑色");
  });

  it("language=en 时英文颜色不应匹配中文关键词", () => {
    const character = makeCharacter({
      description: "穿着红色披风和黑色铠甲的战士",
      appearance: {
        hairColor: "",
        hairStyle: "",
        eyeColor: "",
        height: "",
        build: "",
        clothing: "",
      },
    });

    const features = extractCharacterFeatures(character, "en");

    expect(features?.colorPalette).toBeUndefined();
  });

  it("language=zh 时中文颜色不应匹配英文关键词", () => {
    const character = makeCharacter({
      description: "A warrior wearing a red cape and black armor",
      appearance: {
        hairColor: "",
        hairStyle: "",
        eyeColor: "",
        height: "",
        build: "",
        clothing: "",
      },
    });

    const features = extractCharacterFeatures(character, "zh");

    expect(features?.colorPalette).toBeUndefined();
  });
});

describe("buildFeatureTags", () => {
  it("角色类型应生成角色标签", () => {
    const element = makeElement({ type: "character", name: "角色A" });
    const character = makeCharacter({
      name: "角色A",
      appearance: {
        hairColor: "黑色",
        hairStyle: "长发",
        eyeColor: "蓝色",
        height: "",
        build: "",
        clothing: "铠甲",
      },
      style: "写实",
    });

    const tags = buildFeatureTags(element, character);

    expect(tags).toContain("角色:角色A");
    expect(tags).toContain("发色:黑色");
    expect(tags).toContain("服装:铠甲");
    expect(tags).toContain("风格:写实");
  });

  it("道具类型应生成道具标签", () => {
    const element = makeElement({
      type: "prop",
      name: "宝剑",
      description: "一把闪闪发光的宝剑",
    });

    const tags = buildFeatureTags(element);

    expect(tags).toContain("道具:宝剑");
    expect(tags).toContain("描述:一把闪闪发光的宝剑");
  });

  it("其他类型应生成通用标签", () => {
    const element = makeElement({
      type: "effect",
      name: "火焰",
      description: "燃烧的火焰特效",
    });

    const tags = buildFeatureTags(element);

    expect(tags).toContain("名称:火焰");
    expect(tags).toContain("描述:燃烧的火焰特效");
  });

  it("描述超过 50 字符应截断", () => {
    const longDesc = "这是一段非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的描述";
    const element = makeElement({
      type: "prop",
      name: "道具",
      description: longDesc,
    });

    const tags = buildFeatureTags(element);

    const descTag = tags.find((t) => t.startsWith("描述:"));
    expect(descTag!.length).toBeLessThanOrEqual(53);
  });

  it("language=en 时应使用英文前缀", () => {
    const element = makeElement({ type: "character", name: "Hero" });
    const character = makeCharacter({
      name: "Hero",
      appearance: {
        hairColor: "black",
        hairStyle: "long",
        eyeColor: "blue",
        height: "",
        build: "",
        clothing: "armor",
      },
      style: "realistic",
    });

    const tags = buildFeatureTags(element, character, "en");

    expect(tags).toContain("Character:Hero");
    expect(tags).toContain("Hair:black");
    expect(tags).toContain("Hairstyle:long");
    expect(tags).toContain("Eyes:blue");
    expect(tags).toContain("Clothing:armor");
    expect(tags).toContain("Style:realistic");
  });

  it("language=zh 时应使用中文前缀", () => {
    const element = makeElement({ type: "character", name: "角色A" });
    const character = makeCharacter({
      name: "角色A",
      appearance: {
        hairColor: "黑色",
        hairStyle: "长发",
        eyeColor: "蓝色",
        height: "",
        build: "",
        clothing: "铠甲",
      },
    });

    const tags = buildFeatureTags(element, character, "zh");

    expect(tags).toContain("角色:角色A");
    expect(tags).toContain("发色:黑色");
    expect(tags).toContain("发型:长发");
    expect(tags).toContain("眼色:蓝色");
    expect(tags).toContain("服装:铠甲");
  });

  it("language=en 时道具类型应使用英文前缀", () => {
    const element = makeElement({
      type: "prop",
      name: "Sword",
      description: "A shining sword",
    });

    const tags = buildFeatureTags(element, undefined, "en");

    expect(tags).toContain("Prop:Sword");
    expect(tags).toContain("Description:A shining sword");
  });

  it("language=en 时其他类型应使用英文前缀", () => {
    const element = makeElement({
      type: "effect",
      name: "Fire",
      description: "Burning fire effect",
    });

    const tags = buildFeatureTags(element, undefined, "en");

    expect(tags).toContain("Name:Fire");
    expect(tags).toContain("Description:Burning fire effect");
  });
});

describe("buildFeatureAnchor", () => {
  it("有主绑定时应使用主绑定 URL 和高置信度", () => {
    const element = makeElement({
      bindings: [
        { type: "image", url: "https://example.com/primary.png", name: "主图", uploadedAt: "2024-01-01T00:00:00Z", isPrimary: true },
        { type: "image", url: "https://example.com/secondary.png", name: "副图", uploadedAt: "2024-01-01T00:00:00Z" },
      ],
    });

    const anchor = buildFeatureAnchor(element);

    expect(anchor.referenceImageUrl).toBe("https://example.com/primary.png");
    expect(anchor.confidence).toBe(0.8);
  });

  it("无主绑定但有绑定时应使用第一个绑定和中等置信度", () => {
    const element = makeElement({
      bindings: [
        { type: "image", url: "https://example.com/first.png", name: "第一张图", uploadedAt: "2024-01-01T00:00:00Z" },
      ],
    });

    const anchor = buildFeatureAnchor(element);

    expect(anchor.referenceImageUrl).toBe("https://example.com/first.png");
    expect(anchor.confidence).toBe(0.8);
  });

  it("无绑定时应使用空 URL 和低置信度", () => {
    const element = makeElement({ bindings: [] });

    const anchor = buildFeatureAnchor(element);

    expect(anchor.referenceImageUrl).toBe("");
    expect(anchor.confidence).toBe(0.3);
  });

  it("角色类型元素应提取角色特征", () => {
    const element = makeElement({ type: "character", name: "角色A" });
    const character = makeCharacter({
      name: "角色A",
      appearance: {
        hairColor: "金色",
        hairStyle: "",
        eyeColor: "",
        height: "",
        build: "",
        clothing: "",
      },
    });

    const anchor = buildFeatureAnchor(element, character);

    expect(anchor.characterFeatures).toBeDefined();
    expect(anchor.characterFeatures!.hairColor).toBe("金色");
  });

  it("非角色类型元素不应提取角色特征", () => {
    const element = makeElement({ type: "prop", name: "宝剑" });

    const anchor = buildFeatureAnchor(element);

    expect(anchor.characterFeatures).toBeUndefined();
  });
});

describe("buildFeatureAnchoringConfig", () => {
  it("有绑定元素应生成配置", () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [
      makeElement({
        id: "elem-1",
        type: "character",
        name: "角色A",
        bindings: [
          { type: "image", url: "https://example.com/ref.png", name: "参考图", uploadedAt: "2024-01-01T00:00:00Z", isPrimary: true },
        ],
      }),
    ];
    const characters = [makeCharacter({ name: "角色A" })];

    const config = buildFeatureAnchoringConfig(beat, elements, characters);

    expect(config.enabled).toBe(true);
    expect(config.characterAnchors).toHaveLength(1);
    expect(config.characterAnchors[0]!.elementId).toBe("elem-1");
    expect(config.characterAnchors[0]!.referenceImageUrl).toBe("https://example.com/ref.png");
    expect(config.disableFrameBinding).toBe(true);
    expect(config.featureConsistencyStrength).toBe(0.8);
  });

  it("无绑定元素应生成禁用配置", () => {
    const beat = makeBeat({ elementIds: [] });
    const elements: StoryElement[] = [];
    const characters: Character[] = [];

    const config = buildFeatureAnchoringConfig(beat, elements, characters);

    expect(config.enabled).toBe(false);
    expect(config.characterAnchors).toHaveLength(0);
  });

  it("混合类型应分别放入 characterAnchors 和 propAnchors", () => {
    const beat = makeBeat({ elementIds: ["elem-1", "elem-2"] });
    const elements = [
      makeElement({
        id: "elem-1",
        type: "character",
        name: "角色A",
        bindings: [
          { type: "image", url: "https://example.com/char.png", name: "角色图", uploadedAt: "2024-01-01T00:00:00Z", isPrimary: true },
        ],
      }),
      makeElement({
        id: "elem-2",
        type: "prop",
        name: "宝剑",
        description: "一把宝剑",
        bindings: [
          { type: "image", url: "https://example.com/prop.png", name: "道具图", uploadedAt: "2024-01-01T00:00:00Z", isPrimary: true },
        ],
      }),
    ];
    const characters: Character[] = [];

    const config = buildFeatureAnchoringConfig(beat, elements, characters);

    expect(config.characterAnchors).toHaveLength(1);
    expect(config.propAnchors).toBeDefined();
    expect(config.propAnchors).toHaveLength(1);
  });

  it("元素无绑定时应跳过该元素", () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", bindings: [] })];
    const characters: Character[] = [];

    const config = buildFeatureAnchoringConfig(beat, elements, characters);

    expect(config.characterAnchors).toHaveLength(0);
    expect(config.enabled).toBe(false);
  });

  it("应使用 beat 的 keyframe 作为 previewImageUrl", () => {
    const beat = makeBeat({
      elementIds: ["elem-1"],
      keyframe: { imageUrl: "https://example.com/keyframe.png" },
    });
    const elements = [
      makeElement({
        id: "elem-1",
        type: "character",
        name: "角色A",
        bindings: [
          { type: "image", url: "https://example.com/ref.png", name: "参考图", uploadedAt: "2024-01-01T00:00:00Z", isPrimary: true },
        ],
      }),
    ];
    const characters: Character[] = [];

    const config = buildFeatureAnchoringConfig(beat, elements, characters);

    expect(config.previewImageUrl).toBe("https://example.com/keyframe.png");
  });
});

describe("validateReferenceImageQuality", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("非浏览器环境应返回默认有效结果", async () => {
    const originalImage = window.Image;
    Object.defineProperty(window, "Image", { value: undefined, writable: true, configurable: true });

    const result = await validateReferenceImageQuality("https://example.com/img.png", "character");

    expect(result.isValid).toBe(true);
    expect(result.resolution).toEqual({ width: 0, height: 0 });
    expect(result.clarityScore).toBe(1);
    expect(result.issues).toHaveLength(0);

    window.Image = originalImage;
  });

  it("在浏览器环境中加载成功的高分辨率图片应返回有效结果", async () => {
    const originalWindow = globalThis.window;
    const originalImage = globalThis.Image;

    const mockImageConstructor = vi.fn().mockImplementation(function(this: {
      _listeners: Record<string, (() => void)[]>;
      _src: string;
      _crossOrigin: string;
      width: number;
      height: number;
      addEventListener: (event: string, fn: () => void) => void;
    }) {
      this._listeners = {} as Record<string, (() => void)[]>;
      this._src = "";
      this._crossOrigin = "";
      this.width = 0;
      this.height = 0;
      Object.defineProperty(this, "crossOrigin", {
        set(v: string) { this._crossOrigin = v; },
        get() { return this._crossOrigin; },
      });
      Object.defineProperty(this, "src", {
        set(v: string) {
          this._src = v;
          setTimeout(() => {
            Object.defineProperty(this, "width", { value: 1024, writable: false });
            Object.defineProperty(this, "height", { value: 1024, writable: false });
            if (this._listeners.load) this._listeners.load.forEach((fn: () => void) => fn());
          }, 0);
        },
        get() { return this._src; },
      });
      this.addEventListener = function(event: string, fn: () => void) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event]!.push(fn);
      };
      Object.defineProperty(this, "onload", {
        set(fn: () => void) { this.addEventListener("load", fn); },
      });
      Object.defineProperty(this, "onerror", {
        set(fn: () => void) { this.addEventListener("error", fn); },
      });
    });

    globalThis.Image = mockImageConstructor as unknown as typeof Image;

    try {
      const result = await validateReferenceImageQuality("https://example.com/img.png", "character");

      expect(result.isValid).toBe(true);
      expect(result.resolution).toEqual({ width: 1024, height: 1024 });
      expect(result.issues).toHaveLength(0);
    } finally {
      globalThis.window = originalWindow;
      globalThis.Image = originalImage;
    }
  });

  it("在浏览器环境中加载低分辨率图片应返回问题", async () => {
    const originalWindow = globalThis.window;
    const originalImage = globalThis.Image;

    const mockImageConstructor = vi.fn().mockImplementation(function(this: {
      _listeners: Record<string, (() => void)[]>;
      _src: string;
      _crossOrigin: string;
      width: number;
      height: number;
      addEventListener: (event: string, fn: () => void) => void;
    }) {
      this._listeners = {} as Record<string, (() => void)[]>;
      this._src = "";
      this._crossOrigin = "";
      this.width = 0;
      this.height = 0;
      Object.defineProperty(this, "crossOrigin", {
        set(v: string) { this._crossOrigin = v; },
        get() { return this._crossOrigin; },
      });
      Object.defineProperty(this, "src", {
        set(v: string) {
          this._src = v;
          setTimeout(() => {
            Object.defineProperty(this, "width", { value: 100, writable: false });
            Object.defineProperty(this, "height", { value: 100, writable: false });
            if (this._listeners.load) this._listeners.load.forEach((fn: () => void) => fn());
          }, 0);
        },
        get() { return this._src; },
      });
      this.addEventListener = function(event: string, fn: () => void) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event]!.push(fn);
      };
      Object.defineProperty(this, "onload", {
        set(fn: () => void) { this.addEventListener("load", fn); },
      });
      Object.defineProperty(this, "onerror", {
        set(fn: () => void) { this.addEventListener("error", fn); },
      });
    });

    globalThis.Image = mockImageConstructor as unknown as typeof Image;

    try {
      const result = await validateReferenceImageQuality("https://example.com/small.png", "character");

      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    } finally {
      globalThis.window = originalWindow;
      globalThis.Image = originalImage;
    }
  });

  it("在浏览器环境中加载失败应返回无效结果", async () => {
    const originalWindow = globalThis.window;
    const originalImage = globalThis.Image;

    const mockImageConstructor = vi.fn().mockImplementation(function(this: {
      _listeners: Record<string, (() => void)[]>;
      _src: string;
      _crossOrigin: string;
      width: number;
      height: number;
      addEventListener: (event: string, fn: () => void) => void;
    }) {
      this._listeners = {} as Record<string, (() => void)[]>;
      this._src = "";
      this._crossOrigin = "";
      this.width = 0;
      this.height = 0;
      Object.defineProperty(this, "crossOrigin", {
        set(v: string) { this._crossOrigin = v; },
        get() { return this._crossOrigin; },
      });
      Object.defineProperty(this, "src", {
        set(v: string) {
          this._src = v;
          setTimeout(() => {
            if (this._listeners.error) this._listeners.error.forEach((fn: () => void) => fn());
          }, 0);
        },
        get() { return this._src; },
      });
      this.addEventListener = function(event: string, fn: () => void) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event]!.push(fn);
      };
      Object.defineProperty(this, "onload", {
        set(fn: () => void) { this.addEventListener("load", fn); },
      });
      Object.defineProperty(this, "onerror", {
        set(fn: () => void) { this.addEventListener("error", fn); },
      });
    });

    globalThis.Image = mockImageConstructor as unknown as typeof Image;

    try {
      const result = await validateReferenceImageQuality("https://example.com/broken.png", "character");

      expect(result.isValid).toBe(false);
      expect(result.clarityScore).toBe(0);
      expect(result.issues).toContain("图片加载失败，请检查图片URL是否有效");
    } finally {
      globalThis.window = originalWindow;
      globalThis.Image = originalImage;
    }
  });
});
