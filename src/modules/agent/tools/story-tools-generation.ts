/**
 * 故事生成工具（Story Generation Tools）
 *
 * 从 story-tools.ts 拆分而来，包含 AI 生成类工具：
 * - generate_style_guide：生成风格指南
 * - generate_frame_prompts：生成分镜首尾帧提示词
 * - generate_story_ideas：生成故事创意
 *
 * 设计要点：
 * - 调用 storyService / characterService / sceneService 的 public API（Result<T> 模式）
 * - 调用 generateStyleGuide / generateFramePrompts 等 story 模块生成函数
 * - 通过 DI container 获取 textProvider / imageProvider
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { container } from "@/infrastructure/di";

// ============= 工具实现 =============

/** 生成风格指南 */
export const generateStyleGuideTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_style_guide",
      description:
        "为故事生成风格指南（包含美术风格、氛围、配色方案和风格参考图）。" +
        "基于故事标题、描述、类型和关联的角色/场景，调用 LLM 推断合适的美术风格并生成风格参考图。" +
        "适用于：用户要求「生成风格指南」、「确定动画风格」、「生成风格参考图」等场景。" +
        "注意：此工具会调用 LLM 和图片生成 API，执行时间较长。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", maxLength: 100, description: "故事 ID（必填）" },
          styleDescription: {
            type: "string",
            maxLength: 1000,
            description: "自定义风格描述（如：日式赛璐珞、水彩绘本风、写实3D）。如不提供则由 AI 自动推断。",
          },
          referenceImageUrl: {
            type: "string",
            maxLength: 2048,
            description: "参考图 URL（可选，当前版本暂未直接使用，保留供后续支持参考图风格迁移）",
          },
          providerId: { type: "string", maxLength: 100, description: "指定 LLM/图片 provider ID（可选，不填用默认）" },
          modelId: { type: "string", maxLength: 100, description: "指定 LLM/图片 model ID（可选）" },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const { storyService } = await import("@/modules/story");
    const { generateStyleGuide } = await import("@/modules/story");
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const storyId = String(args.storyId);
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

    const storyResult = await storyService.getById(storyId);
    if (!storyResult.ok) {
      return { success: false, error: `获取故事失败：${storyResult.error.message}` };
    }
    const story = storyResult.value;

    // 获取故事关联的角色和场景
    const storyCharIds = story.characters || [];
    const storySceneIds = story.scenes || [];
    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);
    const characters = charResult.ok
      ? charResult.value.filter((c) => storyCharIds.includes(c.id))
      : [];
    const scenes = sceneResult.ok
      ? sceneResult.value.filter((s) => storySceneIds.includes(s.id))
      : [];

    const styleDescription = args.styleDescription ? String(args.styleDescription) : undefined;

    const result = await generateStyleGuide({
      storyTitle: story.title,
      storyDescription: story.description || "",
      genre: story.genre,
      tone: story.tone,
      characters,
      scenes,
      customArtStyle: styleDescription,
      textProvider: container.textProvider,
      imageProvider: container.imageProvider,
      providerId,
      modelId,
    });

    if (!result.ok) {
      return { success: false, error: `生成风格指南失败：${result.error.message}` };
    }

    return { success: true, data: result.value };
  },
};

/** 生成分镜首尾帧提示词 */
export const generateFramePromptsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_frame_prompts",
      description:
        "为故事分镜生成首帧和尾帧的视觉描述提示词（适合 AI 图片生成模型理解）。" +
        "可指定单个分镜（beatId），不指定则批量生成所有分镜的帧提示词。" +
        "提示词包含角色外观、场景布局、镜头信息、风格氛围等。" +
        "适用于：用户要求「生成帧提示词」、「首尾帧描述」、「批量生成帧 prompt」等场景。" +
        "注意：批量生成会逐个调用 LLM，执行时间随分镜数量线性增长。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", maxLength: 100, description: "故事 ID（必填）" },
          beatId: {
            type: "string",
            maxLength: 100,
            description: "指定分镜 ID。如不提供则为故事的所有分镜批量生成。",
          },
          providerId: { type: "string", maxLength: 100, description: "指定 LLM provider ID（可选，不填用默认）" },
          modelId: { type: "string", maxLength: 100, description: "指定 LLM model ID（可选）" },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const { storyService } = await import("@/modules/story");
    const { generateFramePrompts, batchGenerateFramePrompts } = await import("@/modules/story");
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const storyId = String(args.storyId);
    const beatId = args.beatId ? String(args.beatId) : undefined;
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

    const storyResult = await storyService.getById(storyId);
    if (!storyResult.ok) {
      return { success: false, error: `获取故事失败：${storyResult.error.message}` };
    }
    const story = storyResult.value;
    const beats = story.beats || [];

    if (beats.length === 0) {
      return { success: false, error: "故事没有分镜，请先使用 plan_story 生成分镜" };
    }

    // 获取故事关联的角色和场景
    const storyCharIds = story.characters || [];
    const storySceneIds = story.scenes || [];
    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);
    const characters = charResult.ok
      ? charResult.value.filter((c) => storyCharIds.includes(c.id))
      : [];
    const scenes = sceneResult.ok
      ? sceneResult.value.filter((s) => storySceneIds.includes(s.id))
      : [];

    const styleGuide = story.styleGuide;
    const textProvider = container.textProvider;

    if (beatId) {
      const beatIndex = beats.findIndex((b) => b.id === beatId);
      if (beatIndex < 0) {
        return { success: false, error: `未找到分镜：${beatId}` };
      }
      const beat = beats[beatIndex]!;
      const prevBeat = beatIndex > 0 ? beats[beatIndex - 1] : null;
      const nextBeat = beatIndex < beats.length - 1 ? beats[beatIndex + 1] : null;
      const prevBeatDescription = prevBeat ? prevBeat.content || prevBeat.description : undefined;
      const nextBeatDescription = nextBeat ? nextBeat.content || nextBeat.description : undefined;

      const result = await generateFramePrompts({
        beat,
        index: beatIndex,
        characters,
        scenes,
        styleGuide,
        prevBeatDescription,
        nextBeatDescription,
        textProvider,
        providerId,
        modelId,
      });
      if (!result.ok) {
        return { success: false, error: `生成帧提示词失败：${result.error.message}` };
      }
      return {
        success: true,
        data: {
          prompts: [
            {
              beatId: beat.id,
              firstFramePrompt: result.value.firstFramePrompt,
              lastFramePrompt: result.value.lastFramePrompt,
            },
          ],
        },
      };
    }

    const result = await batchGenerateFramePrompts(beats, {
      characters,
      scenes,
      styleGuide,
      textProvider,
      providerId,
      modelId,
    });
    if (!result.ok) {
      return { success: false, error: `批量生成帧提示词失败：${result.error.message}` };
    }

    const prompts = beats.map((beat) => {
      const output = result.value.get(beat.id);
      return {
        beatId: beat.id,
        firstFramePrompt: output?.firstFramePrompt ?? "",
        lastFramePrompt: output?.lastFramePrompt ?? "",
      };
    });

    return { success: true, data: { prompts } };
  },
};

/** 生成故事创意 */
export const generateStoryIdeasTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_story_ideas",
      description:
        "根据用户提供的主题，使用 AI 生成多套故事创意方案。每个方案包含标题、简介、关键场景和建议时长。" +
        "适用于：用户要求「给我一些故事创意」、「推荐几个动画故事」、「围绕这个主题想想故事」等场景。" +
        "注意：此工具调用 LLM 生成文本，执行时间约 10-30 秒。",
      parameters: {
        type: "object",
        properties: {
          theme: { type: "string", maxLength: 500, description: "故事主题（必填，如：友情、冒险、成长）" },
          count: {
            type: "number",
            minimum: 1,
            maximum: 20,
            description: "生成的方案数量，默认 3，最大 10",
            default: 3,
          },
          style: {
            type: "string",
            maxLength: 200,
            description: "风格偏好（如：温馨、热血、悬疑）",
          },
          providerId: { type: "string", maxLength: 100, description: "指定 LLM provider ID（可选，不填用默认）" },
          modelId: { type: "string", maxLength: 100, description: "指定 LLM model ID（可选）" },
        },
        required: ["theme"],
      },
    },
  },
  domain: "story",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const theme = String(args.theme);
    const count = args.count != null ? Math.min(Math.max(Number(args.count), 1), 10) : 3;
    const style = args.style ? String(args.style) : undefined;
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

    const prompt = `你是一位创意编剧。请根据以下主题生成 ${count} 个动画故事创意。

主题：${theme}
${style ? `风格偏好：${style}` : ""}

请严格按照以下 JSON 数组格式输出，不要输出任何其他内容：
[
  {
    "title": "故事标题",
    "description": "故事简介（100-200字）",
    "keyScenes": ["关键场景1", "关键场景2", "关键场景3"],
    "suggestedDuration": 60
  }
]

要求：
1. 生成 ${count} 个不同的故事创意，每个有独特的视角和情节
2. keyScenes 提供 2-4 个关键场景描述
3. suggestedDuration 是建议的动画时长（秒），通常 30-120
4. 直接输出 JSON 数组，不要添加 markdown 标记或额外说明`;

    const result = await container.textProvider.generateText(prompt, {
      maxTokens: 2048,
      temperature: 0.8,
      providerId,
      modelId,
    });
    if (!result.success) {
      return { success: false, error: result.error || "故事创意生成失败" };
    }

    const text = result.data?.text?.trim() ?? "";
    let ideas: unknown[];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return { success: false, error: "AI 返回格式错误：未找到 JSON 数组" };
      }
      ideas = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return { success: false, error: `解析故事创意失败：${e instanceof Error ? e.message : String(e)}` };
    }

    return { success: true, data: { ideas } };
  },
};
