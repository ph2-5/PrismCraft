import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Character, Scene } from "@/domain/schemas";
import type { ITextProvider, IImageProvider } from "@/domain/ports";

const { resolveImageSizeMock } = vi.hoisted(() => ({
  resolveImageSizeMock: vi.fn((_modelId: string, _purpose: string) => "1024x1024"),
}));

vi.mock("@/shared/model-capabilities", () => ({
  resolveImageSize: resolveImageSizeMock,
}));

import { generateStyleGuide, generateStylePromptOnly } from "../style-guide-service";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "小明",
    description: "男主角",
    gender: "男",
    style: "写实",
    personality: ["勇敢"],
    appearance: {
      hairColor: "黑",
      hairStyle: "短发",
      eyeColor: "棕",
      height: "175cm",
      build: "健壮",
      clothing: "蓝色外套",
    },
    prompt: "",
    ...overrides,
  };
}

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    name: "客厅",
    description: "明亮的客厅",
    type: "室内",
    timeOfDay: "白天",
    weather: "晴",
    mood: "温馨",
    lighting: "自然光",
    elements: [],
    colors: [],
    prompt: "",
    atmosphere: "温暖",
    ...overrides,
  };
}

function makeTextProvider(): ITextProvider & { generateText: ReturnType<typeof vi.fn> } {
  return { generateText: vi.fn() } as unknown as ITextProvider & { generateText: ReturnType<typeof vi.fn> };
}

function makeImageProvider(): IImageProvider & { generateImage: ReturnType<typeof vi.fn> } {
  return {
    generateImage: vi.fn(),
    analyzeImage: vi.fn(),
  } as unknown as IImageProvider & { generateImage: ReturnType<typeof vi.fn> };
}

describe("style-guide-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveImageSizeMock.mockReset();
    resolveImageSizeMock.mockImplementation(() => "1024x1024");
  });

  describe("generateStyleGuide", () => {
    it("全部 custom 值提供时跳过 infer 调用并返回 ok 结果", async () => {
      const textProvider = makeTextProvider();
      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "https://example.com/style.png" },
      });

      const result = await generateStyleGuide({
        storyTitle: "测试故事",
        storyDescription: "故事简介",
        genre: "action",
        tone: "tense",
        characters: [makeCharacter()],
        scenes: [makeScene()],
        customArtStyle: "水彩绘本风",
        customMoodAtmosphere: "梦幻朦胧",
        customColorPalette: ["red", "blue", "green"],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(true);
      expect(textProvider.generateText).not.toHaveBeenCalled();
      if (result.ok) {
        expect(result.value.artStyle).toBe("水彩绘本风");
        expect(result.value.moodAtmosphere).toBe("梦幻朦胧");
        expect(result.value.colorPalette).toEqual(["red", "blue", "green"]);
        expect(result.value.styleImageUrl).toBe("https://example.com/style.png");
        expect(result.value.stylePrompt).toContain("水彩绘本风");
        expect(result.value.stylePrompt).toContain("梦幻朦胧");
        expect(result.value.stylePrompt).toContain("color palette: red, blue, green");
        expect(result.value.stylePrompt).toContain("action genre");
        expect(result.value.stylePrompt).toContain("tense tone");
        expect(result.value.stylePrompt).toContain("characters: 小明，黑，蓝色外套");
        expect(result.value.stylePrompt).toContain("scenes: 客厅，温暖");
        expect(result.value.source).toBe("ai");
        expect(result.value.generatedAt).toBeTruthy();
      }
    });

    it("custom 全部 undefined 时调用 textProvider 三次推断", async () => {
      const textProvider = makeTextProvider();
      textProvider.generateText
        .mockResolvedValueOnce({ success: true, data: { text: "美式卡通" } })
        .mockResolvedValueOnce({ success: true, data: { text: "紧张激烈" } })
        .mockResolvedValueOnce({ success: true, data: { text: "red, green, blue, yellow, purple" } });

      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "https://example.com/style.png" },
      });

      const result = await generateStyleGuide({
        storyTitle: "测试",
        storyDescription: "描述",
        characters: [],
        scenes: [],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(true);
      expect(textProvider.generateText).toHaveBeenCalledTimes(3);
      if (result.ok) {
        expect(result.value.artStyle).toBe("美式卡通");
        expect(result.value.moodAtmosphere).toBe("紧张激烈");
        expect(result.value.colorPalette).toEqual(["red", "green", "blue", "yellow", "purple"]);
      }
    });

    it("inferArtStyle 失败时返回默认 '日式赛璐珞动画'", async () => {
      const textProvider = makeTextProvider();
      textProvider.generateText
        .mockResolvedValueOnce({ success: false, error: "fail" })
        .mockResolvedValueOnce({ success: true, data: { text: "温暖明亮" } })
        .mockResolvedValueOnce({ success: true, data: { text: "red, blue" } });

      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      const result = await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.artStyle).toBe("日式赛璐珞动画");
      }
    });

    it("inferMoodAtmosphere 失败时返回默认 '温暖明亮'", async () => {
      const textProvider = makeTextProvider();
      textProvider.generateText
        .mockResolvedValueOnce({ success: true, data: { text: "美式卡通" } })
        .mockResolvedValueOnce({ success: false, error: "fail" })
        .mockResolvedValueOnce({ success: true, data: { text: "red" } });

      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      const result = await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.moodAtmosphere).toBe("温暖明亮");
      }
    });

    it("inferColorPalette 失败时返回默认 5 色", async () => {
      const textProvider = makeTextProvider();
      textProvider.generateText
        .mockResolvedValueOnce({ success: true, data: { text: "美式卡通" } })
        .mockResolvedValueOnce({ success: true, data: { text: "温暖明亮" } })
        .mockResolvedValueOnce({ success: false, error: "fail" });

      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      const result = await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.colorPalette).toEqual([
          "warm orange",
          "soft blue",
          "cream white",
          "deep green",
          "golden yellow",
        ]);
      }
    });

    it("inferColorPalette 解析出空数组时返回默认 5 色", async () => {
      const textProvider = makeTextProvider();
      textProvider.generateText
        .mockResolvedValueOnce({ success: true, data: { text: "美式卡通" } })
        .mockResolvedValueOnce({ success: true, data: { text: "温暖明亮" } })
        .mockResolvedValueOnce({ success: true, data: { text: "  ,  ,  " } });

      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      const result = await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.colorPalette).toHaveLength(5);
      }
    });

    it("inferColorPalette 支持中英文逗号与顿号分隔", async () => {
      const textProvider = makeTextProvider();
      textProvider.generateText
        .mockResolvedValueOnce({ success: true, data: { text: "美式卡通" } })
        .mockResolvedValueOnce({ success: true, data: { text: "温暖明亮" } })
        .mockResolvedValueOnce({ success: true, data: { text: "red，green、blue,yellow" } });

      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      const result = await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.colorPalette).toEqual(["red", "green", "blue", "yellow"]);
      }
    });

    it("inferText 返回值会去除引号", async () => {
      const textProvider = makeTextProvider();
      textProvider.generateText
        .mockResolvedValueOnce({ success: true, data: { text: '"\'水彩绘本风\'"' } })
        .mockResolvedValueOnce({ success: true, data: { text: "温暖明亮" } })
        .mockResolvedValueOnce({ success: true, data: { text: "red" } });

      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      const result = await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.artStyle).toBe("水彩绘本风");
      }
    });

    it("imageProvider.generateImage 失败时返回 err Result", async () => {
      const textProvider = makeTextProvider();
      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: false,
        error: "image gen error",
      });

      const result = await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        customArtStyle: "x",
        customMoodAtmosphere: "y",
        customColorPalette: ["c1"],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("image gen error");
      }
    });

    it("imageProvider.generateImage 返回 success 但无 imageUrl 时返回 err", async () => {
      const textProvider = makeTextProvider();
      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "" },
      });

      const result = await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        customArtStyle: "x",
        customMoodAtmosphere: "y",
        customColorPalette: ["c1"],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("风格图生成失败");
      }
    });

    it("characters 多于 5 个时只取前 5 个", async () => {
      const textProvider = makeTextProvider();
      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      const characters = Array.from({ length: 8 }, (_, i) =>
        makeCharacter({ id: `c${i}`, name: `角色${i}` }),
      );

      const result = await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters,
        scenes: [],
        customArtStyle: "x",
        customMoodAtmosphere: "y",
        customColorPalette: ["c1"],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(true);
      expect(imageProvider.generateImage).toHaveBeenCalledTimes(1);
      const prompt = imageProvider.generateImage.mock.calls[0]![0] as string;
      expect(prompt).toContain("角色0");
      expect(prompt).toContain("角色4");
      expect(prompt).not.toContain("角色5");
      expect(prompt).not.toContain("角色6");
      expect(prompt).not.toContain("角色7");
    });

    it("scenes 多于 3 个时只取前 3 个", async () => {
      const textProvider = makeTextProvider();
      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      const scenes = Array.from({ length: 5 }, (_, i) =>
        makeScene({ id: `s${i}`, name: `场景${i}` }),
      );

      const result = await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes,
        customArtStyle: "x",
        customMoodAtmosphere: "y",
        customColorPalette: ["c1"],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(true);
      const prompt = imageProvider.generateImage.mock.calls[0]![0] as string;
      expect(prompt).toContain("场景0");
      expect(prompt).toContain("场景2");
      expect(prompt).not.toContain("场景3");
      expect(prompt).not.toContain("场景4");
    });

    it("genre/tone 为 undefined 时使用默认值 drama/neutral", async () => {
      const textProvider = makeTextProvider();
      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      const result = await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        customArtStyle: "x",
        customMoodAtmosphere: "y",
        customColorPalette: ["c1"],
        textProvider,
        imageProvider,
      });

      expect(result.ok).toBe(true);
      const prompt = imageProvider.generateImage.mock.calls[0]![0] as string;
      expect(prompt).toContain("drama genre");
      expect(prompt).toContain("neutral tone");
    });

    it("modelId 提供时调用 resolveImageSize", async () => {
      const textProvider = makeTextProvider();
      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        customArtStyle: "x",
        customMoodAtmosphere: "y",
        customColorPalette: ["c1"],
        modelId: "test-model",
        textProvider,
        imageProvider,
      });

      expect(resolveImageSizeMock).toHaveBeenCalledWith("test-model", "style_guide");
      const options = imageProvider.generateImage.mock.calls[0]![2] as {
        size: string;
        modelId: string;
        purpose: string;
      };
      expect(options.size).toBe("1024x1024");
      expect(options.modelId).toBe("test-model");
      expect(options.purpose).toBe("style_guide");
    });

    it("modelId 未提供时使用默认 1920x1920 且不调用 resolveImageSize", async () => {
      const textProvider = makeTextProvider();
      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        customArtStyle: "x",
        customMoodAtmosphere: "y",
        customColorPalette: ["c1"],
        textProvider,
        imageProvider,
      });

      expect(resolveImageSizeMock).not.toHaveBeenCalled();
      const options = imageProvider.generateImage.mock.calls[0]![2] as { size: string };
      expect(options.size).toBe("1920x1920");
    });

    it("providerId 提供时传入 generateImage options", async () => {
      const textProvider = makeTextProvider();
      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        customArtStyle: "x",
        customMoodAtmosphere: "y",
        customColorPalette: ["c1"],
        providerId: "prov-1",
        modelId: "model-1",
        textProvider,
        imageProvider,
      });

      const options = imageProvider.generateImage.mock.calls[0]![2] as {
        providerId: string;
        modelId: string;
      };
      expect(options.providerId).toBe("prov-1");
      expect(options.modelId).toBe("model-1");
    });

    it("providerId 未提供时不包含 providerId 字段", async () => {
      const textProvider = makeTextProvider();
      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        customArtStyle: "x",
        customMoodAtmosphere: "y",
        customColorPalette: ["c1"],
        textProvider,
        imageProvider,
      });

      const options = imageProvider.generateImage.mock.calls[0]![2] as {
        providerId?: string;
        modelId?: string;
      };
      expect(options.providerId).toBeUndefined();
      expect(options.modelId).toBeUndefined();
    });

    it("无 characters/scenes 时 prompt 不包含 characters/scenes 段", async () => {
      const textProvider = makeTextProvider();
      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        customArtStyle: "x",
        customMoodAtmosphere: "y",
        customColorPalette: ["c1"],
        textProvider,
        imageProvider,
      });

      const prompt = imageProvider.generateImage.mock.calls[0]![0] as string;
      expect(prompt).not.toContain("characters:");
      expect(prompt).not.toContain("scenes:");
    });

    it("character appearance 字段为空时不追加多余逗号", async () => {
      const textProvider = makeTextProvider();
      const imageProvider = makeImageProvider();
      imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "url" },
      });

      await generateStyleGuide({
        storyTitle: "t",
        storyDescription: "d",
        characters: [
          makeCharacter({
            name: "无名",
            appearance: {
              hairColor: "",
              hairStyle: "",
              eyeColor: "",
              height: "",
              build: "",
              clothing: "",
            },
          }),
        ],
        scenes: [],
        customArtStyle: "x",
        customMoodAtmosphere: "y",
        customColorPalette: ["c1"],
        textProvider,
        imageProvider,
      });

      const prompt = imageProvider.generateImage.mock.calls[0]![0] as string;
      expect(prompt).toContain("characters: 无名");
      expect(prompt).not.toContain("characters: 无名，");
    });
  });

  describe("generateStylePromptOnly", () => {
    it("正常生成 prompt 字符串", async () => {
      const result = await generateStylePromptOnly({
        storyTitle: "t",
        storyDescription: "d",
        genre: "comedy",
        tone: "light",
        characters: [makeCharacter({ name: "小红" })],
        scenes: [makeScene({ name: "厨房" })],
        artStyle: "水彩风",
        moodAtmosphere: "明亮",
        colorPalette: ["red", "blue"],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain("Animation style reference sheet");
        expect(result.value).toContain("水彩风");
        expect(result.value).toContain("明亮");
        expect(result.value).toContain("color palette: red, blue");
        expect(result.value).toContain("comedy genre");
        expect(result.value).toContain("light tone");
        expect(result.value).toContain("characters: 小红");
        expect(result.value).toContain("scenes: 厨房");
        expect(result.value).toContain("style guide, concept art, mood board");
      }
    });

    it("characters 多于 5 个时只取前 5 个", async () => {
      const characters = Array.from({ length: 8 }, (_, i) =>
        makeCharacter({ id: `c${i}`, name: `角色${i}` }),
      );

      const result = await generateStylePromptOnly({
        storyTitle: "t",
        storyDescription: "d",
        characters,
        scenes: [],
        artStyle: "x",
        moodAtmosphere: "y",
        colorPalette: ["c1"],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain("角色0");
        expect(result.value).toContain("角色4");
        expect(result.value).not.toContain("角色5");
      }
    });

    it("scenes 多于 3 个时只取前 3 个", async () => {
      const scenes = Array.from({ length: 5 }, (_, i) =>
        makeScene({ id: `s${i}`, name: `场景${i}` }),
      );

      const result = await generateStylePromptOnly({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes,
        artStyle: "x",
        moodAtmosphere: "y",
        colorPalette: ["c1"],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain("场景0");
        expect(result.value).toContain("场景2");
        expect(result.value).not.toContain("场景3");
      }
    });

    it("genre/tone 为 undefined 时使用默认值 drama/neutral", async () => {
      const result = await generateStylePromptOnly({
        storyTitle: "t",
        storyDescription: "d",
        characters: [],
        scenes: [],
        artStyle: "x",
        moodAtmosphere: "y",
        colorPalette: ["c1"],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain("drama genre");
        expect(result.value).toContain("neutral tone");
      }
    });
  });
});
