import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import type { StoryStyleGuide, Character, Scene } from "@/domain/schemas";
import type { ITextProvider, IImageProvider } from "@/domain/ports";
import { container } from "@/infrastructure/di";

interface StyleGuideInput {
  storyTitle: string;
  storyDescription: string;
  genre?: string;
  tone?: string;
  characters: Character[];
  scenes: Scene[];
  customArtStyle?: string;
  customColorPalette?: string[];
  customMoodAtmosphere?: string;
  providerId?: string;
  modelId?: string;
  textProvider: ITextProvider;
  imageProvider: IImageProvider;
}

export async function generateStyleGuide(
  input: StyleGuideInput,
): Promise<Result<StoryStyleGuide>> {
  return fromAsyncThrowable(async () => {
    const {
      storyTitle,
      storyDescription,
      genre,
      tone,
      characters,
      scenes,
      customArtStyle,
      customColorPalette,
      customMoodAtmosphere,
      modelId,
      textProvider,
      imageProvider,
    } = input;

    const [artStyle, moodAtmosphere, colorPalette] = await Promise.all([
      customArtStyle || inferArtStyle(textProvider, storyTitle, storyDescription, genre, tone),
      customMoodAtmosphere || inferMoodAtmosphere(textProvider, storyTitle, storyDescription, genre, tone),
      customColorPalette || inferColorPalette(textProvider, storyTitle, storyDescription, genre, tone, customArtStyle),
    ]);

    const charDescs = characters
      .slice(0, 5)
      .map((c) => {
        const parts = [c.name];
        if (c.appearance.hairColor) parts.push(c.appearance.hairColor);
        if (c.appearance.clothing) parts.push(c.appearance.clothing);
        return parts.join("，");
      })
      .join("；");

    const sceneDescs = scenes
      .slice(0, 3)
      .map((s) => {
        const parts = [s.name];
        if (s.atmosphere) parts.push(s.atmosphere);
        return parts.join("，");
      })
      .join("；");

    const stylePrompt = `Animation style reference sheet, ${artStyle}, ${moodAtmosphere}, color palette: ${colorPalette.join(", ")}, consistent art style, high quality, detailed, ${genre || "drama"} genre, ${tone || "neutral"} tone${charDescs ? `, characters: ${charDescs}` : ""}${sceneDescs ? `, scenes: ${sceneDescs}` : ""}, style guide, concept art, mood board`;

    const imageModelId = modelId || "";
    const resolvedSize = imageModelId
      ? container.resolveImageSize(imageModelId, "style_guide")
      : "1920x1920";

    const imageResult = await imageProvider.generateImage(stylePrompt, "scene", {
      size: resolvedSize,
      ...(input.providerId ? { providerId: input.providerId } : {}),
      ...(modelId ? { modelId } : {}),
      purpose: "style_guide",
    });

    if (!imageResult.success || !imageResult.data?.imageUrl) {
      throw new Error(imageResult.error || "风格图生成失败");
    }

    return {
      styleImageUrl: imageResult.data.imageUrl,
      stylePrompt,
      colorPalette,
      artStyle,
      moodAtmosphere,
      generatedAt: new Date().toISOString(),
      source: "ai",
    };
  });
}

async function inferArtStyle(
  textProvider: ITextProvider,
  title: string,
  description: string,
  genre?: string,
  tone?: string,
): Promise<string> {
  const prompt = `根据以下动画故事信息，推断最合适的美术风格。只需输出一个简短的风格描述（如"日式赛璐珞动画"、"水彩绘本风"、"美式卡通"、"写实3D渲染"、"中国水墨风"等），不要输出其他内容。

故事标题：${title}
故事简介：${description.substring(0, 200)}
类型：${genre || "剧情"}
基调：${tone || "中性"}`;

  const result = await textProvider.generateText(prompt, {
    maxTokens: 50,
    temperature: 0.5,
  });

  if (result.success && result.data?.text) {
    return result.data.text.trim().replace(/["""'']/g, "");
  }
  return "日式赛璐珞动画";
}

async function inferMoodAtmosphere(
  textProvider: ITextProvider,
  title: string,
  description: string,
  genre?: string,
  tone?: string,
): Promise<string> {
  const prompt = `根据以下动画故事信息，推断最合适的氛围描述。只需输出一个简短的氛围描述（如"温暖明亮"、"阴暗压抑"、"梦幻朦胧"、"紧张激烈"等），不要输出其他内容。

故事标题：${title}
故事简介：${description.substring(0, 200)}
类型：${genre || "剧情"}
基调：${tone || "中性"}`;

  const result = await textProvider.generateText(prompt, {
    maxTokens: 50,
    temperature: 0.5,
  });

  if (result.success && result.data?.text) {
    return result.data.text.trim().replace(/["""'']/g, "");
  }
  return "温暖明亮";
}

async function inferColorPalette(
  textProvider: ITextProvider,
  title: string,
  description: string,
  genre?: string,
  tone?: string,
  artStyle?: string,
): Promise<string[]> {
  const prompt = `根据以下动画故事信息，推断最合适的配色方案。只需输出5-8个颜色名称（英文），用逗号分隔，不要输出其他内容。

故事标题：${title}
故事简介：${description.substring(0, 200)}
类型：${genre || "剧情"}
基调：${tone || "中性"}
美术风格：${artStyle || "未指定"}`;

  const result = await textProvider.generateText(prompt, {
    maxTokens: 100,
    temperature: 0.5,
  });

  if (result.success && result.data?.text) {
    const colors = result.data.text
      .trim()
      .replace(/["""'']/g, "")
      .split(/[,，、]/)
      .map((c) => c.trim())
      .filter(Boolean);
    return colors.length > 0 ? colors : ["warm orange", "soft blue", "cream white", "deep green", "golden yellow"];
  }
  return ["warm orange", "soft blue", "cream white", "deep green", "golden yellow"];
}

export async function generateStylePromptOnly(
  input: Omit<StyleGuideInput, "customArtStyle" | "customColorPalette" | "customMoodAtmosphere" | "textProvider" | "imageProvider"> & {
    artStyle: string;
    colorPalette: string[];
    moodAtmosphere: string;
  },
): Promise<Result<string>> {
  return fromAsyncThrowable(async () => {
    const { genre, tone, characters, scenes, artStyle, colorPalette, moodAtmosphere } = input;

    const charDescs = characters
      .slice(0, 5)
      .map((c) => c.name)
      .join("；");

    const sceneDescs = scenes
      .slice(0, 3)
      .map((s) => s.name)
      .join("；");

    return `Animation style reference sheet, ${artStyle}, ${moodAtmosphere}, color palette: ${colorPalette.join(", ")}, consistent art style, high quality, detailed, ${genre || "drama"} genre, ${tone || "neutral"} tone${charDescs ? `, characters: ${charDescs}` : ""}${sceneDescs ? `, scenes: ${sceneDescs}` : ""}, style guide, concept art, mood board`;
  });
}
