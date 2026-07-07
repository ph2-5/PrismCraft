/**
 * 子流程编排工具（Subworkflow Tools）
 *
 * 包含工具（9 个）：
 * - auto_create_character：一句话创建完整角色（推理设定 → 创建 → 生成图片）
 * - auto_create_scene：一句话创建完整场景（推理设定 → 创建 → 生成图片）
 * - auto_plan_storyboard：一句话生成完整分镜计划（创建故事 → 规划分镜 → 校验）
 * - auto_generate_beat_full：单分镜全自动生成（关键帧 → 首尾帧 → 视频）
 * - auto_generate_video_full：一句话完成全片生成（批量生成 → 字幕 → 配乐）
 * - auto_find_and_import_asset：AI 浏览器找素材并自动入库
 * - auto_fix_common_errors：常见错误自动修复
 * - auto_create_from_novel：小说一键转分镜
 * - auto_polish_video：视频自动润色
 *
 * 设计要点：
 * - 子流程工具是"一句话完成"的高级工具，内部组合多个基础工具/服务调用完成复杂流程
 * - 优先直接调用 service（更高效），只有需要复用基础工具的复杂逻辑时才用 toolExecutor
 * - 用 textProvider 推理生成所需参数（JSON 解析容错）
 * - 每步都 try/catch，某步失败不影响已完成的步骤
 * - 用 ctx.onProgress 通知进度
 * - 参数类型转换：args 字段为 unknown，需 String()/Number()/Boolean() 转换
 */

import type { ToolImpl, ToolCall, ToolResult, ToolContext } from "../domain/types";
import { TOOL_TIMEOUTS, toolExecutor } from "../services/tool-executor";
import { toolRegistry } from "../services/tool-registry";
import { container } from "@/infrastructure/di";

// ============= 辅助函数 =============

/** 用 textProvider 推理生成 JSON（从文本中提取第一个 JSON 对象） */
async function generateJsonWithAI(prompt: string): Promise<Record<string, unknown> | null> {
  const result = await container.textProvider.generateText(prompt, {
    maxTokens: 2048,
    temperature: 0.7,
  });
  if (!result.success || !result.data) return null;
  const text = result.data.text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 用 textProvider 推理生成 JSON 数组（从文本中提取第一个 JSON 数组） */
async function generateJsonArrayWithAI(prompt: string): Promise<unknown[] | null> {
  const result = await container.textProvider.generateText(prompt, {
    maxTokens: 4096,
    temperature: 0.7,
  });
  if (!result.success || !result.data) return null;
  const text = result.data.text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as unknown[];
  } catch {
    return null;
  }
}

/** 执行基础工具的便捷函数（透传进度回调） */
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  onProgress?: (message: string) => void,
): Promise<ToolResult> {
  // 工具不存在时优雅降级
  if (!toolRegistry.has(name)) {
    return {
      success: false,
      error: `工具 "${name}" 不存在或未注册`,
    };
  }
  const toolCall: ToolCall = {
    id: `subwf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    function: { name, arguments: JSON.stringify(args) },
  };
  const ctx: ToolContext = {
    sessionId: "subworkflow",
    onProgress: onProgress ?? (() => {}),
  };
  return toolExecutor.execute(toolCall, ctx);
}

/** 轮询视频任务状态直到完成或失败（带超时） */
async function pollVideoTask(
  taskId: string,
  timeoutMs: number,
  onProgress?: (message: string) => void,
): Promise<{ completed: boolean; videoUrl?: string; status: string; message?: string }> {
  const deadline = Date.now() + timeoutMs;
  const pollInterval = 5000; // 5 秒一次
  let lastStatus = "pending";

  while (Date.now() < deadline) {
    try {
      const result = await container.videoProvider.queryVideoStatus(taskId);
      if (result.success && result.data) {
        lastStatus = result.data.status;
        if (result.data.status === "completed") {
          return {
            completed: true,
            videoUrl: result.data.videoUrl,
            status: "completed",
          };
        }
        if (result.data.status === "failed") {
          return {
            completed: false,
            status: "failed",
            message: result.data.message ?? "视频生成失败",
          };
        }
        onProgress?.(`视频任务 ${taskId} 状态：${result.data.status}（进度：${result.data.progress ?? 0}%）`);
      }
    } catch {
      // 查询异常不中断轮询
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return {
    completed: false,
    status: lastStatus,
    message: `视频任务 ${taskId} 轮询超时（${Math.round(timeoutMs / 1000)}秒）`,
  };
}

/** 将未知值转为字符串数组 */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  if (value === undefined || value === null) return [];
  return String(value)
    .split(/[、，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ============= 工具实现 =============

/** 1. 一句话创建完整角色（推理设定 → 创建 → 生成图片） */
export const autoCreateCharacterTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_create_character",
      description:
        "一站式工具：用一句话描述自动创建完整角色。内部流程：1) 用 AI 推理生成角色完整设定（姓名/性别/年龄/性格/外观/自定义提示词）；2) 调用 characterService 创建角色记录；3) 如 autoGenerateImage=true（默认），调用 imageProvider 生成角色图片并更新缩略图。" +
        "适用于：用户要求「帮我创建一个赛博朋克风格的女性侦探」、「一句话建角色」等场景。" +
        "注意：此工具会调用 LLM 和图片生成 API，执行时间较长（通常 30 秒到 2 分钟）。",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "用户对角色的描述（必填，如「赛博朋克风格的女性侦探，冷酷干练」）",
          },
          autoGenerateImage: {
            type: "boolean",
            description: "是否自动生成角色图片，默认 true",
            default: true,
          },
          style: {
            type: "string",
            description: "风格覆盖（可选，如「日式动漫」、「写实」）。不提供则由 AI 推断",
          },
        },
        required: ["description"],
      },
    },
  },
  domain: "workflow",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args, ctx) {
    const description = String(args.description);
    const autoGenerateImage = args.autoGenerateImage !== false;
    const styleOverride = args.style ? String(args.style) : undefined;
    const steps: string[] = [];

    // Step 1: 用 textProvider 推理生成角色设定
    ctx.onProgress?.("正在用 AI 推理角色设定…");
    const prompt = `你是一位角色设计师。请根据以下描述生成角色完整设定的 JSON。

用户描述：${description}

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "name": "角色姓名（中文）",
  "gender": "性别（男性/女性/中性/无性别）",
  "age": 25,
  "personality": "性格特征，可用、分隔多个",
  "appearance": {
    "hairColor": "发色",
    "hairStyle": "发型",
    "eyeColor": "瞳色",
    "height": "身高",
    "build": "体型",
    "clothing": "服装描述"
  },
  "customPrompt": "用于 AI 图片生成的英文提示词，描述角色外观"
}

要求：
1. 姓名要有特色，符合角色风格
2. 外观要详细具体，便于生成图片
3. customPrompt 用英文，包含角色全貌、服装、风格等关键信息`;
    const settings = await generateJsonWithAI(prompt);
    if (!settings) {
      return { success: false, error: "AI 推理角色设定失败：无法解析返回的 JSON" };
    }
    steps.push("推理设定");

    // Step 2: 创建角色
    ctx.onProgress?.("正在创建角色记录…");
    const { characterService } = await import("@/modules/character");
    const appearance = (settings.appearance as Record<string, unknown> | undefined) ?? {};
    const style = styleOverride ?? (settings.style ? String(settings.style) : "");
    const createResult = await characterService.create({
      name: String(settings.name ?? `角色_${Date.now()}`),
      description,
      gender: String(settings.gender ?? ""),
      style,
      age: settings.age != null ? Number(settings.age) : undefined,
      personality: toStringArray(settings.personality),
      appearance: {
        hairColor: String(appearance.hairColor ?? ""),
        hairStyle: String(appearance.hairStyle ?? ""),
        eyeColor: String(appearance.eyeColor ?? ""),
        height: String(appearance.height ?? ""),
        build: String(appearance.build ?? ""),
        clothing: String(appearance.clothing ?? ""),
      },
      prompt: String(settings.customPrompt ?? ""),
    });
    if (!createResult.ok) {
      return {
        success: false,
        error: `创建角色失败：${createResult.error.message}`,
        data: { steps },
      };
    }
    const character = createResult.value;
    steps.push("创建角色");

    // Step 3: 生成图片（可选）
    let imageUrl: string | undefined;
    if (autoGenerateImage) {
      ctx.onProgress?.("正在生成角色图片…");
      try {
        const imagePrompt =
          String(settings.customPrompt ?? "") || `${character.name}, ${description}`;
        const imageResult = await container.imageProvider.generateImage(imagePrompt, "character", {
          purpose: "character",
        });
        if (imageResult.success && imageResult.data) {
          imageUrl = imageResult.data.imageUrl;
          // 更新角色缩略图
          const updateResult = await characterService.update(character.id, {
            id: character.id,
            thumbnailPath: imageUrl,
            generatedImage: imageUrl,
          });
          if (!updateResult.ok) {
            // 图片生成成功但更新失败，不阻断流程
            ctx.onProgress?.(`警告：角色图片已生成但更新记录失败：${updateResult.error.message}`);
          }
          steps.push("生成图片");
        } else {
          ctx.onProgress?.(`警告：角色图片生成失败：${imageResult.error ?? "未知错误"}`);
        }
      } catch (e) {
        ctx.onProgress?.(`警告：角色图片生成异常：${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      success: true,
      data: {
        characterId: character.id,
        name: character.name,
        imageUrl,
        steps,
      },
    };
  },
};

/** 2. 一句话创建完整场景（推理设定 → 创建 → 生成图片） */
export const autoCreateSceneTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_create_scene",
      description:
        "一站式工具：用一句话描述自动创建完整场景。内部流程：1) 用 AI 推理生成场景完整设定（名称/类型/时间/天气/情绪/光照/自定义提示词）；2) 调用 sceneService 创建场景记录；3) 如 autoGenerateImage=true（默认），调用 imageProvider 生成场景图片并更新缩略图。" +
        "适用于：用户要求「帮我创建一个雨夜赛博朋克街道场景」、「一句话建场景」等场景。" +
        "注意：此工具会调用 LLM 和图片生成 API，执行时间较长。",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "用户对场景的描述（必填，如「雨夜的赛博朋克街道，霓虹灯闪烁」）",
          },
          autoGenerateImage: {
            type: "boolean",
            description: "是否自动生成场景图片，默认 true",
            default: true,
          },
          style: {
            type: "string",
            description: "风格覆盖（可选）。不提供则由 AI 推断",
          },
        },
        required: ["description"],
      },
    },
  },
  domain: "workflow",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args, ctx) {
    const description = String(args.description);
    const autoGenerateImage = args.autoGenerateImage !== false;
    const steps: string[] = [];

    // Step 1: 用 textProvider 推理生成场景设定
    ctx.onProgress?.("正在用 AI 推理场景设定…");
    const prompt = `你是一位场景设计师。请根据以下描述生成场景完整设定的 JSON。

用户描述：${description}

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "name": "场景名称（中文）",
  "type": "场景类型（如：室内、室外、城市、自然）",
  "timeOfDay": "时间（如：白天、黄昏、夜晚）",
  "weather": "天气（如：晴天、雨天、雪天）",
  "mood": "情绪氛围（如：温馨、紧张、神秘）",
  "lighting": "光照描述（如：霓虹灯、月光、阳光）",
  "customPrompt": "用于 AI 图片生成的英文提示词，描述场景全貌"
}

要求：
1. 名称要简洁有特色
2. 各字段要具体，便于生成图片
3. customPrompt 用英文，包含场景、光照、氛围等关键信息`;
    const settings = await generateJsonWithAI(prompt);
    if (!settings) {
      return { success: false, error: "AI 推理场景设定失败：无法解析返回的 JSON" };
    }
    steps.push("推理设定");

    // Step 2: 创建场景
    ctx.onProgress?.("正在创建场景记录…");
    const { sceneService } = await import("@/modules/scene");
    const createResult = await sceneService.create({
      name: String(settings.name ?? `场景_${Date.now()}`),
      description,
      type: String(settings.type ?? ""),
      timeOfDay: String(settings.timeOfDay ?? ""),
      weather: String(settings.weather ?? ""),
      mood: String(settings.mood ?? ""),
      lighting: String(settings.lighting ?? ""),
      elements: [],
      colors: [],
      prompt: String(settings.customPrompt ?? ""),
    });
    if (!createResult.ok) {
      return {
        success: false,
        error: `创建场景失败：${createResult.error.message}`,
        data: { steps },
      };
    }
    const scene = createResult.value;
    steps.push("创建场景");

    // Step 3: 生成图片（可选）
    let imageUrl: string | undefined;
    if (autoGenerateImage) {
      ctx.onProgress?.("正在生成场景图片…");
      try {
        const imagePrompt =
          String(settings.customPrompt ?? "") || `${scene.name}, ${description}`;
        const imageResult = await container.imageProvider.generateImage(imagePrompt, "scene", {
          purpose: "scene",
        });
        if (imageResult.success && imageResult.data) {
          imageUrl = imageResult.data.imageUrl;
          const updateResult = await sceneService.update(scene.id, {
            id: scene.id,
            thumbnailPath: imageUrl,
            generatedImage: imageUrl,
          });
          if (!updateResult.ok) {
            ctx.onProgress?.(`警告：场景图片已生成但更新记录失败：${updateResult.error.message}`);
          }
          steps.push("生成图片");
        } else {
          ctx.onProgress?.(`警告：场景图片生成失败：${imageResult.error ?? "未知错误"}`);
        }
      } catch (e) {
        ctx.onProgress?.(`警告：场景图片生成异常：${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      success: true,
      data: {
        sceneId: scene.id,
        name: scene.name,
        imageUrl,
        steps,
      },
    };
  },
};

/** 3. 一句话生成完整分镜计划（创建故事 → 规划分镜 → 校验） */
export const autoPlanStoryboardTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_plan_storyboard",
      description:
        "一站式工具：用一句话生成完整分镜计划。内部流程：1) 创建故事；2) 如 autoPlan=true（默认），获取关联角色/场景并调用 planStory AI 规划分镜；3) 校验分镜计划完整性。" +
        "适用于：用户要求「帮我规划一个故事的分镜」、「一句话生成分镜计划」等场景。" +
        "注意：此工具会调用 LLM，执行时间较长（通常 30 秒到 2 分钟）。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "故事标题（必填）" },
          description: { type: "string", description: "故事描述/简介（必填）" },
          targetDuration: {
            type: "number",
            description: "目标时长（秒），默认 60",
            default: 60,
          },
          characterIds: {
            type: "array",
            items: { type: "string" },
            description: "关联的角色 ID 数组（可选）",
          },
          sceneIds: {
            type: "array",
            items: { type: "string" },
            description: "关联的场景 ID 数组（可选）",
          },
          autoPlan: {
            type: "boolean",
            description: "是否自动调用 AI 规划分镜，默认 true",
            default: true,
          },
        },
        required: ["title", "description"],
      },
    },
  },
  domain: "workflow",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args, ctx) {
    const title = String(args.title);
    const description = String(args.description);
    const targetDuration = args.targetDuration != null ? Number(args.targetDuration) : 60;
    const characterIds = Array.isArray(args.characterIds) ? args.characterIds.map(String) : [];
    const sceneIds = Array.isArray(args.sceneIds) ? args.sceneIds.map(String) : [];
    const autoPlan = args.autoPlan !== false;

    // Step 1: 创建故事
    ctx.onProgress?.("正在创建故事…");
    const { storyService } = await import("@/modules/story");
    const createResult = await storyService.create({
      title,
      description,
      targetDuration,
      characters: characterIds,
      scenes: sceneIds,
      beats: [],
      elementIds: [],
    });
    if (!createResult.ok) {
      return { success: false, error: `创建故事失败：${createResult.error.message}` };
    }
    const story = createResult.value;
    const storyId = story.id;

    // Step 2: 规划分镜
    if (!autoPlan) {
      return {
        success: true,
        data: {
          storyId,
          beatCount: 0,
          beats: [],
          note: "autoPlan=false，已创建故事但未规划分镜",
        },
      };
    }

    ctx.onProgress?.("正在用 AI 规划分镜…");
    const { planStory } = await import("@/modules/story/planning");
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);
    const characters = charResult.ok ? charResult.value : [];
    const scenes = sceneResult.ok ? sceneResult.value : [];

    const planResult = await planStory(story, characters, scenes, {
      enhancedGeneration: false,
      strictMode: false,
    });
    if (!planResult.ok) {
      return {
        success: false,
        error: `规划分镜失败：${planResult.error.message}`,
        data: { storyId, beatCount: 0 },
      };
    }
    const beats = planResult.value.beats;

    // 保存分镜到故事
    const updateResult = await storyService.update(storyId, { id: storyId, beats });
    if (!updateResult.ok) {
      ctx.onProgress?.(`警告：分镜已生成但保存失败：${updateResult.error.message}`);
    }

    // Step 3: 校验分镜计划
    ctx.onProgress?.("正在校验分镜计划…");
    const validationIssues: Array<{ beatId: string; issue: string; severity: string }> = [];
    const charIdSet = new Set(characters.map((c) => c.id));
    const sceneIdSet = new Set(scenes.map((s) => s.id));
    for (const beat of beats) {
      const desc = beat.content || beat.description;
      if (!desc || !desc.trim()) {
        validationIssues.push({
          beatId: beat.id,
          issue: "分镜缺少描述",
          severity: "error",
        });
      }
      if (beat.duration == null || beat.duration <= 0) {
        validationIssues.push({
          beatId: beat.id,
          issue: "分镜时长无效",
          severity: "warning",
        });
      }
      for (const cid of beat.characterIds || []) {
        if (!charIdSet.has(cid)) {
          validationIssues.push({
            beatId: beat.id,
            issue: `角色引用无效：${cid}`,
            severity: "warning",
          });
        }
      }
      if (beat.sceneId && !sceneIdSet.has(beat.sceneId)) {
        validationIssues.push({
          beatId: beat.id,
          issue: `场景引用无效：${beat.sceneId}`,
          severity: "warning",
        });
      }
    }

    return {
      success: true,
      data: {
        storyId,
        beatCount: beats.length,
        beats: beats.map((b, i) => ({
          index: i,
          id: b.id,
          title: b.title,
          description: b.content || b.description,
          duration: b.duration,
          characterIds: b.characterIds,
          sceneId: b.sceneId,
        })),
        validationIssues: validationIssues.length > 0 ? validationIssues : undefined,
        autoFixedCount: planResult.value.autoFixedCount,
      },
    };
  },
};

/** 4. 单分镜全自动生成（关键帧 → 首尾帧 → 视频） */
export const autoGenerateBeatFullTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_generate_beat_full",
      description:
        "一站式工具：单分镜全自动生成。内部流程：1) 获取故事和分镜；2) 构造 providers；3) 调用 generateBeatFullWorkflow 依次生成关键帧、首尾帧、视频；4) 更新故事的分镜媒体 URL。" +
        "适用于：用户要求「生成这个分镜」、「把这个分镜完整生成出来」等场景。" +
        "注意：此工具会调用图片和视频生成 API，执行时间较长（通常 2-10 分钟）。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID（必填）" },
          beatId: { type: "string", description: "分镜 ID（必填）" },
          providerId: { type: "string", description: "指定 provider ID（可选）" },
          modelId: { type: "string", description: "指定模型 ID（可选）" },
        },
        required: ["storyId", "beatId"],
      },
    },
  },
  domain: "workflow",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args, ctx) {
    const storyId = String(args.storyId);
    const beatId = String(args.beatId);
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;
    const steps: string[] = [];

    // Step 1: 获取故事和 beat
    ctx.onProgress?.("正在获取故事和分镜…");
    const { storyService } = await import("@/modules/story");
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const storyResult = await storyService.getById(storyId);
    if (!storyResult.ok) {
      return { success: false, error: `获取故事失败：${storyResult.error.message}` };
    }
    const story = storyResult.value;
    const beats = story.beats || [];
    const beatIndex = beats.findIndex((b) => b.id === beatId);
    if (beatIndex < 0) {
      return { success: false, error: `未找到分镜：${beatId}` };
    }
    const beat = beats[beatIndex]!;
    const prevBeat = beatIndex > 0 ? beats[beatIndex - 1]! : null;

    // 获取关联的角色和场景
    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);
    const characters = charResult.ok
      ? charResult.value.filter((c) => (story.characters || []).includes(c.id))
      : [];
    const scenes = sceneResult.ok
      ? sceneResult.value.filter((s) => (story.scenes || []).includes(s.id))
      : [];

    // Step 2: 构造 providers 并调用 generateBeatFullWorkflow
    ctx.onProgress?.("正在生成分镜（关键帧 → 首尾帧 → 视频）…");
    const { generateBeatFullWorkflow } = await import("@/modules/story/generation");
    const providers = {
      videoProvider: container.videoProvider,
      imageProvider: container.imageProvider,
      textProvider: container.textProvider,
    };

    const workflowResult = await generateBeatFullWorkflow(
      beat,
      prevBeat,
      {
        characters,
        scenes,
        styleGuide: story.styleGuide,
        beatIndex,
        prevBeatDescription: prevBeat?.content || prevBeat?.description,
        providerId,
        modelId,
      },
      providers,
      (step, progress) => {
        ctx.onProgress?.(`分镜生成进度：${step}（${Math.round(progress * 100)}%）`);
      },
    );

    if (!workflowResult.ok) {
      return {
        success: false,
        error: `分镜全自动生成失败：${workflowResult.error.message}`,
        data: { storyId, beatId, steps },
      };
    }

    const { keyframe, framePair, videoTaskId, videoMode } = workflowResult.value;
    steps.push("关键帧");
    steps.push("首尾帧");
    steps.push("视频任务");

    // Step 3: 更新故事的 beat 媒体 URL
    ctx.onProgress?.("正在更新故事分镜媒体…");
    const updatedBeats = beats.map((b, i) => {
      if (i !== beatIndex) return b;
      return {
        ...b,
        keyframe,
        framePair,
        videoGen: {
          taskId: videoTaskId,
          status: "pending" as const,
          source: "ai" as const,
          createdAt: new Date().toISOString(),
        },
      };
    });
    const updateResult = await storyService.update(storyId, { id: storyId, beats: updatedBeats });
    if (!updateResult.ok) {
      ctx.onProgress?.(`警告：媒体已生成但保存故事失败：${updateResult.error.message}`);
    }

    return {
      success: true,
      data: {
        beatId,
        keyframeUrl: keyframe.imageUrl,
        firstFrameUrl: framePair.firstFrameUrl,
        lastFrameUrl: framePair.lastFrameUrl,
        videoTaskId,
        videoMode,
        steps,
      },
    };
  },
};

/** 5. 一句话完成全片生成（批量生成 → 字幕 → 配乐） */
export const autoGenerateVideoFullTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_generate_video_full",
      description:
        "一站式工具：一句话完成全片生成。内部流程：1) 获取故事和分镜；2) 遍历分镜逐个调用 auto_generate_beat_full 逻辑生成；3) 等待所有视频任务完成（轮询）；4) 如 addSubtitles=true（默认），为每个分镜生成字幕；5) 如 addMusic=true，生成配乐（当前优雅降级）；6) 返回汇总。" +
        "适用于：用户要求「把整个故事生成视频」、「一键生成全片」等场景。" +
        "注意：此工具执行时间非常长（取决于分镜数量，通常 10-60 分钟）。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID（必填）" },
          beatIds: {
            type: "array",
            items: { type: "string" },
            description: "要生成的分镜 ID 数组（可选，不填则生成全部）",
          },
          providerId: { type: "string", description: "指定 provider ID（可选）" },
          modelId: { type: "string", description: "指定模型 ID（可选）" },
          addSubtitles: {
            type: "boolean",
            description: "是否添加字幕，默认 true",
            default: true,
          },
          addMusic: {
            type: "boolean",
            description: "是否添加配乐，默认 false（当前优雅降级）",
            default: false,
          },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "workflow",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args, ctx) {
    const storyId = String(args.storyId);
    const targetBeatIds = Array.isArray(args.beatIds) ? args.beatIds.map(String) : undefined;
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;
    const addSubtitles = args.addSubtitles !== false;
    const addMusic = args.addMusic === true;
    const steps: string[] = [];

    // Step 1: 获取故事和 beats
    ctx.onProgress?.("正在获取故事…");
    const { storyService } = await import("@/modules/story");
    const storyResult = await storyService.getById(storyId);
    if (!storyResult.ok) {
      return { success: false, error: `获取故事失败：${storyResult.error.message}` };
    }
    const story = storyResult.value;
    const allBeats = story.beats || [];
    if (allBeats.length === 0) {
      return { success: false, error: "故事没有分镜，请先使用 auto_plan_storyboard 规划分镜" };
    }
    const beatsToGenerate = targetBeatIds
      ? allBeats.filter((b) => targetBeatIds.includes(b.id))
      : allBeats;
    if (beatsToGenerate.length === 0) {
      return { success: false, error: "未找到匹配的分镜" };
    }

    // Step 2: 逐个生成
    const { generateBeatFullWorkflow } = await import("@/modules/story/generation");
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);
    const characters = charResult.ok
      ? charResult.value.filter((c) => (story.characters || []).includes(c.id))
      : [];
    const scenes = sceneResult.ok
      ? sceneResult.value.filter((s) => (story.scenes || []).includes(s.id))
      : [];

    const providers = {
      videoProvider: container.videoProvider,
      imageProvider: container.imageProvider,
      textProvider: container.textProvider,
    };

    const videoUrls: string[] = [];
    const taskIds: string[] = [];
    const failedBeats: string[] = [];
    let updatedBeats = [...allBeats];

    for (let i = 0; i < beatsToGenerate.length; i++) {
      const beat = beatsToGenerate[i]!;
      ctx.onProgress?.(`正在生成分镜 ${i + 1}/${beatsToGenerate.length}（${beat.id}）…`);
      const beatIndex = updatedBeats.findIndex((b) => b.id === beat.id);
      const prevBeat = beatIndex > 0 ? updatedBeats[beatIndex - 1]! : null;

      try {
        const workflowResult = await generateBeatFullWorkflow(
          beat,
          prevBeat,
          {
            characters,
            scenes,
            styleGuide: story.styleGuide,
            beatIndex,
            prevBeatDescription: prevBeat?.content || prevBeat?.description,
            providerId,
            modelId,
          },
          providers,
          (step, progress) => {
            ctx.onProgress?.(`分镜 ${beat.id} 进度：${step}（${Math.round(progress * 100)}%）`);
          },
        );

        if (!workflowResult.ok) {
          failedBeats.push(beat.id);
          ctx.onProgress?.(`警告：分镜 ${beat.id} 生成失败：${workflowResult.error.message}`);
          continue;
        }

        const { keyframe, framePair, videoTaskId } = workflowResult.value;
        taskIds.push(videoTaskId);
        steps.push(`分镜 ${beat.id} 已提交`);

        // 更新对应 beat
        updatedBeats = updatedBeats.map((b, idx) => {
          if (idx !== beatIndex) return b;
          return {
            ...b,
            keyframe,
            framePair,
            videoGen: {
              taskId: videoTaskId,
              status: "pending" as const,
              source: "ai" as const,
              createdAt: new Date().toISOString(),
            },
          };
        });
      } catch (e) {
        failedBeats.push(beat.id);
        ctx.onProgress?.(`警告：分镜 ${beat.id} 生成异常：${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Step 3: 等待所有视频任务完成（轮询）
    ctx.onProgress?.(`正在等待 ${taskIds.length} 个视频任务完成…`);
    const pollTimeout = TOOL_TIMEOUTS.videoTask - 60_000; // 留 1 分钟给后续步骤
    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i]!;
      ctx.onProgress?.(`轮询视频任务 ${i + 1}/${taskIds.length}（${taskId}）…`);
      const pollResult = await pollVideoTask(taskId, Math.min(pollTimeout, 5 * 60_000), ctx.onProgress);
      if (pollResult.completed && pollResult.videoUrl) {
        videoUrls.push(pollResult.videoUrl);
        // 更新对应 beat 的 videoGen
        updatedBeats = updatedBeats.map((b) => {
          if (b.videoGen?.taskId !== taskId) return b;
          return {
            ...b,
            videoGen: {
              ...b.videoGen,
              videoUrl: pollResult.videoUrl,
              status: "completed" as const,
              generatedAt: new Date().toISOString(),
            },
          };
        });
      } else {
        ctx.onProgress?.(`警告：视频任务 ${taskId} 未完成：${pollResult.message ?? pollResult.status}`);
      }
    }

    // 保存更新到故事
    const updateResult = await storyService.update(storyId, { id: storyId, beats: updatedBeats });
    if (!updateResult.ok) {
      ctx.onProgress?.(`警告：保存故事媒体失败：${updateResult.error.message}`);
    }

    // Step 4: 生成字幕（可选）
    let addedSubtitles = false;
    if (addSubtitles && videoUrls.length > 0) {
      ctx.onProgress?.("正在生成分镜字幕…");
      try {
        const subtitles = updatedBeats
          .filter((b) => b.videoGen?.videoUrl)
          .map((b, i) => ({
            text: b.content || b.description || b.title || `分镜 ${i + 1}`,
            startTime: i * (b.duration ?? 5),
            endTime: (i + 1) * (b.duration ?? 5),
          }));
        // 字幕生成（best-effort，失败不影响主流程）
        if (videoUrls[0]) {
          const subtitleResult = await executeTool(
            "add_subtitle",
            { videoPath: videoUrls[0], subtitles },
            ctx.onProgress,
          );
          addedSubtitles = subtitleResult.success;
          if (!subtitleResult.success) {
            ctx.onProgress?.(`警告：字幕添加跳过：${subtitleResult.error ?? "未知错误"}`);
          } else {
            steps.push("字幕");
          }
        }
      } catch (e) {
        ctx.onProgress?.(`警告：字幕生成异常：${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Step 5: 生成配乐（可选，优雅降级）
    let addedMusic = false;
    if (addMusic) {
      ctx.onProgress?.("正在生成配乐…");
      try {
        const musicPrompt = `为故事《${story.title}》生成背景配乐，氛围：${story.genre ?? "通用"}`;
        const musicResult = await executeTool(
          "generate_music",
          { prompt: musicPrompt, duration: story.targetDuration ?? 60 },
          ctx.onProgress,
        );
        addedMusic = musicResult.success;
        if (!musicResult.success) {
          ctx.onProgress?.(`配乐跳过：${musicResult.error ?? "当前不支持"}`);
        } else {
          steps.push("配乐");
        }
      } catch (e) {
        ctx.onProgress?.(`配乐异常：${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      success: true,
      data: {
        storyId,
        totalBeats: beatsToGenerate.length,
        completedBeats: videoUrls.length,
        failedBeats,
        videoUrls,
        addedSubtitles,
        addedMusic,
        steps,
      },
    };
  },
};

/** 6. AI 浏览器找素材并自动入库 */
export const autoFindAndImportAssetTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_find_and_import_asset",
      description:
        "一站式工具：AI 浏览器找素材并自动入库。内部流程：1) 调用 search_web_images 工具搜索图片；2) 如 autoImport=true，自动选择第一个结果并调用 download_web_asset 下载入库；3) 否则返回搜索结果列表，让用户选择后再调用 download_web_asset。" +
        "适用于：用户要求「帮我找一个赛博朋克风格的角色参考图并导入」、「从网上找个素材」等场景。" +
        "注意：需要先在设置中配置搜索 API key。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词（必填）" },
          assetType: {
            type: "string",
            enum: ["character", "scene", "prop"],
            description: "素材类型（必填）",
          },
          count: { type: "number", description: "搜索结果数量，默认 5", default: 5 },
          autoImport: {
            type: "boolean",
            description: "是否自动选择第一个结果导入，默认 false",
            default: false,
          },
        },
        required: ["query", "assetType"],
      },
    },
  },
  domain: "workflow",
  timeoutMs: TOOL_TIMEOUTS.download,
  async execute(args, ctx) {
    const query = String(args.query);
    const assetType = String(args.assetType) as "character" | "scene" | "prop";
    const count = Math.min(Math.max(Number(args.count) || 5, 1), 20);
    const autoImport = args.autoImport === true;

    // Step 1: 搜索图片
    ctx.onProgress?.(`正在搜索图片：${query}…`);
    const searchResult = await executeTool(
      "search_web_images",
      { query, count, source: "bing" },
      ctx.onProgress,
    );
    if (!searchResult.success || !searchResult.data) {
      return {
        success: false,
        error: `搜索图片失败：${searchResult.error ?? "未知错误"}`,
      };
    }
    const searchData = searchResult.data as { total: number; items: Array<Record<string, unknown>> };
    const items = searchData.items ?? [];
    if (items.length === 0) {
      return {
        success: true,
        data: { searchResults: [], importedAsset: undefined, message: "未找到搜索结果" },
      };
    }

    // Step 2: 自动导入或返回列表
    if (!autoImport) {
      return {
        success: true,
        data: {
          searchResults: items.map((it, i) => ({
            index: i,
            title: String(it.title ?? ""),
            imageUrl: String(it.imageUrl ?? ""),
            thumbnailUrl: String(it.thumbnailUrl ?? ""),
            sourceUrl: String(it.sourceUrl ?? ""),
          })),
          importedAsset: undefined,
          message: "请选择一个结果后调用 download_web_asset 导入（autoImport=false）",
        },
      };
    }

    // 自动导入第一个
    const first = items[0]!;
    const imageUrl = String(first.imageUrl ?? "");
    const name = String(first.title ?? `素材_${Date.now()}`);
    ctx.onProgress?.(`正在下载并导入：${name}…`);
    const importResult = await executeTool(
      "download_web_asset",
      { url: imageUrl, assetType, name },
      ctx.onProgress,
    );

    return {
      success: importResult.success,
      data: {
        searchResults: items.map((it, i) => ({
          index: i,
          title: String(it.title ?? ""),
          imageUrl: String(it.imageUrl ?? ""),
        })),
        importedAsset: importResult.success
          ? (importResult.data as Record<string, unknown>)
          : undefined,
        importError: importResult.success ? undefined : importResult.error,
      },
      error: importResult.success ? undefined : `导入失败：${importResult.error}`,
    };
  },
};

/** 7. 常见错误自动修复 */
export const autoFixCommonErrorsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_fix_common_errors",
      description:
        "一站式工具：常见错误自动修复。内部流程：1) 用 AI 分析错误描述，判断错误类型；2) 根据错误类型执行修复策略（API 连接错误检查配置、模型不存在列出可用模型、配额超限提示用户、视频生成失败尝试恢复任务）；3) 返回修复结果。" +
        "适用于：用户要求「帮我修复这个错误」、「这个报错怎么解决」等场景。",
      parameters: {
        type: "object",
        properties: {
          errorDescription: {
            type: "string",
            description: "错误描述（必填，完整的错误信息）",
          },
          errorContext: {
            type: "object",
            description: "错误上下文（可选，如 { toolName, storyId, taskId }）",
          },
        },
        required: ["errorDescription"],
      },
    },
  },
  domain: "workflow",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args, ctx) {
    const errorDescription = String(args.errorDescription);
    const errorContext = (args.errorContext as Record<string, unknown> | undefined) ?? {};

    // Step 1: 用 AI 分析错误类型
    ctx.onProgress?.("正在分析错误类型…");
    const prompt = `你是一位 AI 助手运维专家。请分析以下错误描述，判断错误类型并给出修复建议。

错误描述：
${errorDescription}

上下文：
${JSON.stringify(errorContext, null, 2)}

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "errorType": "api_connection | model_not_found | quota_exceeded | video_generation_failed | config_missing | unknown",
  "confidence": 0.9,
  "suggestedAction": "建议的修复动作描述"
}`;
    const analysis = await generateJsonWithAI(prompt);
    const errorType = String(analysis?.errorType ?? "unknown");
    const suggestedAction = String(analysis?.suggestedAction ?? "");

    // Step 2: 根据错误类型执行修复策略
    ctx.onProgress?.(`正在执行修复策略（${errorType}）…`);
    let fixed = false;
    let fixAction = suggestedAction;
    let message = "";

    try {
      if (errorType === "api_connection" || errorType === "config_missing") {
        // 检查配置
        const { getConfig } = await import("@/shared/file-http");
        const apiBaseUrl = await getConfig("apiBaseUrl");
        const apiKey = await getConfig("apiKey");
        if (!apiBaseUrl || !apiKey) {
          fixAction = "请在设置中配置 apiBaseUrl 和 apiKey";
          message = "API 配置缺失，请在设置中完善 API 配置";
        } else {
          // 尝试测试连接
          const testResult = await executeTool("test_connection", {}, ctx.onProgress);
          fixed = testResult.success;
          message = fixed ? "API 连接已恢复" : `API 连接测试失败：${testResult.error ?? "未知"}`;
        }
      } else if (errorType === "model_not_found") {
        // 列出可用模型
        const { loadConfig } = await import("@/shared/api-config");
        const config = await loadConfig();
        const models = config?.providers?.flatMap((p) =>
          (p.models ?? []).map((m) => `${p.id}/${m.id}`),
        ) ?? [];
        fixAction = `可用模型列表：${models.join(", ") || "无可用模型"}`;
        message = "请使用可用模型列表中的模型 ID";
      } else if (errorType === "quota_exceeded") {
        fixAction = "API 配额已超限，请升级套餐或等待配额重置";
        message = "配额超限，需用户手动处理";
      } else if (errorType === "video_generation_failed") {
        // 尝试恢复视频任务
        const taskId = errorContext.taskId ? String(errorContext.taskId) : undefined;
        if (taskId) {
          const statusResult = await container.videoProvider.queryVideoStatus(taskId);
          if (statusResult.success && statusResult.data) {
            if (statusResult.data.status === "completed" && statusResult.data.videoUrl) {
              fixed = true;
              message = `任务 ${taskId} 实际已完成，视频 URL：${statusResult.data.videoUrl}`;
            } else {
              message = `任务 ${taskId} 当前状态：${statusResult.data.status}`;
            }
          } else {
            message = `查询任务 ${taskId} 状态失败：${statusResult.error ?? "未知"}`;
          }
        } else {
          message = "未提供 taskId，无法恢复视频任务";
        }
      } else {
        message = `未知错误类型，建议操作：${suggestedAction || "请检查错误信息后重试"}`;
      }
    } catch (e) {
      message = `修复策略执行异常：${e instanceof Error ? e.message : String(e)}`;
    }

    return {
      success: true,
      data: {
        errorType,
        fixed,
        fixAction,
        message,
      },
    };
  },
};

/** 8. 小说一键转分镜 */
export const autoCreateFromNovelTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_create_from_novel",
      description:
        "一站式工具：小说一键转分镜。内部流程：1) 读取小说文本（从参数或文件）；2) 用 AI 分析小说，提取角色、场景、情节点；3) 创建故事；4) 根据提取的角色/场景创建记录；5) 用 AI 规划分镜（基于小说情节）；6) 保存分镜到故事；7) 如 autoGenerate=true，生成关键帧。" +
        "适用于：用户要求「把这段小说转成分镜」、「小说转动画」等场景。" +
        "注意：此工具会多次调用 LLM，执行时间较长（通常 1-5 分钟）。",
      parameters: {
        type: "object",
        properties: {
          novelText: {
            type: "string",
            description: "小说文本（与 novelFilePath 二选一）",
          },
          novelFilePath: {
            type: "string",
            description: "小说文件路径（与 novelText 二选一）",
          },
          title: {
            type: "string",
            description: "故事标题（可选，不提供则由 AI 推断）",
          },
          maxBeats: {
            type: "number",
            description: "最大分镜数，默认 6",
            default: 6,
          },
          autoGenerate: {
            type: "boolean",
            description: "是否自动生成关键帧图片，默认 false",
            default: false,
          },
        },
      },
    },
  },
  domain: "workflow",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args, ctx) {
    const titleOverride = args.title ? String(args.title) : undefined;
    const maxBeats = args.maxBeats != null ? Number(args.maxBeats) : 6;
    const autoGenerate = args.autoGenerate === true;
    const steps: string[] = [];

    // Step 1: 读取小说文本
    let novelText: string;
    if (args.novelText) {
      novelText = String(args.novelText);
    } else if (args.novelFilePath) {
      ctx.onProgress?.("正在读取小说文件…");
      try {
        const { readFile } = await import("@/shared/file-http");
        const fileResult = await readFile(String(args.novelFilePath));
        if (!fileResult?.success || !fileResult.data) {
          return {
            success: false,
            error: `读取小说文件失败：${fileResult?.error ?? "未知错误"}`,
          };
        }
        novelText = new TextDecoder().decode(fileResult.data);
      } catch (e) {
        return {
          success: false,
          error: `读取小说文件异常：${e instanceof Error ? e.message : String(e)}`,
        };
      }
    } else {
      return { success: false, error: "必须提供 novelText 或 novelFilePath 之一" };
    }

    // 截断过长的小说文本（避免 token 超限）
    const truncatedText = novelText.length > 8000 ? novelText.slice(0, 8000) + "…" : novelText;
    if (novelText.length > 8000) {
      ctx.onProgress?.(`警告：小说文本过长（${novelText.length} 字符），已截断到 8000 字符`);
    }

    // Step 2: 用 AI 分析小说，提取角色、场景、情节点
    ctx.onProgress?.("正在用 AI 分析小说内容…");
    const analysisPrompt = `你是一位剧本改编专家。请分析以下小说文本，提取角色、场景和故事信息。

小说文本：
${truncatedText}

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "title": "故事标题（中文，简洁有特色）",
  "description": "故事简介（100-200字）",
  "genre": "故事类型（如：剧情、喜剧、悬疑、奇幻）",
  "characters": [
    {
      "name": "角色姓名",
      "gender": "性别",
      "age": 25,
      "description": "角色描述",
      "personality": "性格特征",
      "appearance": {
        "hairColor": "发色",
        "hairStyle": "发型",
        "eyeColor": "瞳色",
        "height": "身高",
        "build": "体型",
        "clothing": "服装"
      },
      "customPrompt": "用于 AI 图片生成的英文提示词"
    }
  ],
  "scenes": [
    {
      "name": "场景名称",
      "type": "场景类型",
      "timeOfDay": "时间",
      "weather": "天气",
      "mood": "情绪",
      "lighting": "光照",
      "description": "场景描述",
      "customPrompt": "用于 AI 图片生成的英文提示词"
    }
  ],
  "plotPoints": [
    "情节点1",
    "情节点2",
    "情节点3"
  ]
}

要求：
1. 提取 1-5 个主要角色
2. 提取 1-5 个主要场景
3. plotPoints 提供 3-8 个关键情节节点
4. customPrompt 用英文，便于图片生成`;
    const analysis = await generateJsonWithAI(analysisPrompt);
    if (!analysis) {
      return { success: false, error: "AI 分析小说失败：无法解析返回的 JSON" };
    }
    steps.push("分析小说");

    const title = titleOverride ?? String(analysis.title ?? `小说改编_${Date.now()}`);
    const description = String(analysis.description ?? "");
    const genre = analysis.genre ? String(analysis.genre) : undefined;
    const extractedCharacters = Array.isArray(analysis.characters)
      ? (analysis.characters as Record<string, unknown>[])
      : [];
    const extractedScenes = Array.isArray(analysis.scenes)
      ? (analysis.scenes as Record<string, unknown>[])
      : [];
    const plotPoints = Array.isArray(analysis.plotPoints)
      ? (analysis.plotPoints as string[]).map(String)
      : [];

    // Step 3: 创建角色和场景记录
    ctx.onProgress?.(`正在创建 ${extractedCharacters.length} 个角色和 ${extractedScenes.length} 个场景…`);
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const createdCharacterIds: string[] = [];
    const createdCharacters: Array<{ id: string; name: string }> = [];
    for (const charData of extractedCharacters) {
      try {
        const appearance = (charData.appearance as Record<string, unknown> | undefined) ?? {};
        const r = await characterService.create({
          name: String(charData.name ?? `角色_${Date.now()}`),
          description: String(charData.description ?? ""),
          gender: String(charData.gender ?? ""),
          style: genre ?? "",
          age: charData.age != null ? Number(charData.age) : undefined,
          personality: toStringArray(charData.personality),
          appearance: {
            hairColor: String(appearance.hairColor ?? ""),
            hairStyle: String(appearance.hairStyle ?? ""),
            eyeColor: String(appearance.eyeColor ?? ""),
            height: String(appearance.height ?? ""),
            build: String(appearance.build ?? ""),
            clothing: String(appearance.clothing ?? ""),
          },
          prompt: String(charData.customPrompt ?? ""),
        });
        if (r.ok) {
          createdCharacterIds.push(r.value.id);
          createdCharacters.push({ id: r.value.id, name: r.value.name });
        }
      } catch {
        // 单个角色创建失败不影响其他
      }
    }

    const createdSceneIds: string[] = [];
    const createdScenes: Array<{ id: string; name: string }> = [];
    for (const sceneData of extractedScenes) {
      try {
        const r = await sceneService.create({
          name: String(sceneData.name ?? `场景_${Date.now()}`),
          description: String(sceneData.description ?? ""),
          type: String(sceneData.type ?? ""),
          timeOfDay: String(sceneData.timeOfDay ?? ""),
          weather: String(sceneData.weather ?? ""),
          mood: String(sceneData.mood ?? ""),
          lighting: String(sceneData.lighting ?? ""),
          elements: [],
          colors: [],
          prompt: String(sceneData.customPrompt ?? ""),
        });
        if (r.ok) {
          createdSceneIds.push(r.value.id);
          createdScenes.push({ id: r.value.id, name: r.value.name });
        }
      } catch {
        // 单个场景创建失败不影响其他
      }
    }
    steps.push(`创建 ${createdCharacterIds.length} 角色 + ${createdSceneIds.length} 场景`);

    // Step 4: 创建故事
    ctx.onProgress?.("正在创建故事…");
    const { storyService } = await import("@/modules/story");
    const createStoryResult = await storyService.create({
      title,
      description,
      genre,
      targetDuration: 60,
      characters: createdCharacterIds,
      scenes: createdSceneIds,
      beats: [],
      elementIds: [],
    });
    if (!createStoryResult.ok) {
      return {
        success: false,
        error: `创建故事失败：${createStoryResult.error.message}`,
        data: { createdCharacters, createdScenes, steps },
      };
    }
    const story = createStoryResult.value;

    // Step 5: 用 AI 规划分镜（基于小说情节）
    ctx.onProgress?.("正在用 AI 规划分镜…");
    const beatPlanPrompt = `你是一位分镜设计师。请根据以下小说情节和角色/场景信息，规划 ${maxBeats} 个分镜。

故事标题：${title}
故事简介：${description}

角色列表：
${createdCharacters.map((c, i) => `${i + 1}. ID: ${c.id}, 姓名: ${c.name}`).join("\n")}

场景列表：
${createdScenes.map((s, i) => `${i + 1}. ID: ${s.id}, 名称: ${s.name}`).join("\n")}

情节点：
${plotPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

请严格按照以下 JSON 数组格式输出 ${maxBeats} 个分镜，不要输出任何其他内容：
[
  {
    "title": "分镜标题",
    "description": "分镜描述（详细描述这一镜的画面内容）",
    "duration": 8,
    "characterIds": ["角色ID"],
    "sceneId": "场景ID",
    "shotType": "景别（wide/medium/close/extreme_close/extreme_wide/low/high/birdseye/wormseye）",
    "cameraAngle": "镜头角度",
    "cameraMovement": "镜头运动"
  }
]

要求：
1. 生成 ${maxBeats} 个分镜
2. 每个分镜的 duration 在 3-15 秒之间
3. characterIds 和 sceneId 必须使用上面提供的真实 ID
4. 分镜要覆盖所有情节点，节奏合理`;
    const beatsData = await generateJsonArrayWithAI(beatPlanPrompt);
    if (!beatsData || beatsData.length === 0) {
      // 回退到 planStory
      ctx.onProgress?.("AI 分镜规划失败，回退到 planStory…");
      const { planStory } = await import("@/modules/story/planning");
      const [charResult, sceneResult] = await Promise.all([
        characterService.getAll(),
        sceneService.getAll(),
      ]);
      const allCharacters = charResult.ok ? charResult.value : [];
      const allScenes = sceneResult.ok ? sceneResult.value : [];
      const planResult = await planStory(story, allCharacters, allScenes, {});
      if (planResult.ok) {
        const beats = planResult.value.beats.slice(0, maxBeats);
        await storyService.update(story.id, { id: story.id, beats });
        steps.push("规划分镜（planStory 回退）");
        return {
          success: true,
          data: {
            storyId: story.id,
            createdCharacters,
            createdScenes,
            beatCount: beats.length,
            steps,
          },
        };
      }
      return {
        success: false,
        error: "AI 分镜规划失败且 planStory 回退也失败",
        data: { storyId: story.id, createdCharacters, createdScenes, steps },
      };
    }

    // 构造 StoryBeat 数组
    const { storyBeatSchema } = await import("@/domain/schemas");
    const beats = beatsData.slice(0, maxBeats).map((raw, i) => {
      const b = raw as Record<string, unknown>;
      return {
        id: `beat_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        sequence: i,
        order: i,
        description: String(b.description ?? ""),
        content: String(b.description ?? ""),
        title: b.title ? String(b.title) : undefined,
        duration: b.duration != null ? Number(b.duration) : 8,
        type: "scene" as const,
        characterIds: Array.isArray(b.characterIds)
          ? (b.characterIds as unknown[]).map(String)
          : [],
        sceneId: b.sceneId ? String(b.sceneId) : undefined,
        elementIds: [],
        shotType: b.shotType ? String(b.shotType) : undefined,
        camera: {
          angle: b.cameraAngle ? String(b.cameraAngle) : undefined,
          movement: b.cameraMovement ? String(b.cameraMovement) : undefined,
        },
      };
    });

    // Step 6: 保存分镜到故事
    ctx.onProgress?.("正在保存分镜到故事…");
    // 用 schema 解析做一次校验/默认值填充（容错）
    const validBeats = beats
      .map((b) => {
        const parsed = storyBeatSchema.safeParse(b);
        return parsed.success ? parsed.data : null;
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);

    const saveResult = await storyService.update(story.id, { id: story.id, beats: validBeats });
    if (!saveResult.ok) {
      ctx.onProgress?.(`警告：分镜已生成但保存失败：${saveResult.error.message}`);
    }
    steps.push(`规划 ${validBeats.length} 个分镜`);

    // Step 7: 自动生成关键帧（可选）
    let generatedKeyframes = 0;
    if (autoGenerate && validBeats.length > 0) {
      ctx.onProgress?.("正在生成关键帧…");
      const { generateBeatKeyframe } = await import("@/modules/story/generation");
      const providers = {
        videoProvider: container.videoProvider,
        imageProvider: container.imageProvider,
        textProvider: container.textProvider,
      };
      for (let i = 0; i < validBeats.length; i++) {
        const beat = validBeats[i]!;
        ctx.onProgress?.(`生成关键帧 ${i + 1}/${validBeats.length}…`);
        try {
          const kfResult = await generateBeatKeyframe(
            beat,
            i > 0 ? validBeats[i - 1]! : null,
            {
              characters: [],
              scenes: [],
              styleGuide: story.styleGuide,
            },
            providers,
          );
          if (kfResult.ok) {
            validBeats[i] = { ...beat, keyframe: kfResult.value };
            generatedKeyframes++;
          }
        } catch {
          // 单个关键帧生成失败不影响其他
        }
      }
      // 保存更新后的关键帧
      if (generatedKeyframes > 0) {
        await storyService.update(story.id, { id: story.id, beats: validBeats });
        steps.push(`生成 ${generatedKeyframes} 个关键帧`);
      }
    }

    return {
      success: true,
      data: {
        storyId: story.id,
        createdCharacters,
        createdScenes,
        beatCount: validBeats.length,
        generatedKeyframes,
        steps,
      },
    };
  },
};

/** 9. 视频自动润色 */
export const autoPolishVideoTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_polish_video",
      description:
        "一站式工具：视频自动润色。内部流程：1) 如 addSubtitles=true（默认），用 AI 根据故事生成分镜字幕文本并调用 add_subtitle 工具添加字幕；2) 如 addMusic=true，调用 generate_music（当前优雅降级）；3) 如 colorGrade != none，调用 apply_filter（当前对视频不可用，优雅降级）；4) 返回润色结果。" +
        "适用于：用户要求「给视频加字幕」、「润色视频」、「给视频配乐」等场景。",
      parameters: {
        type: "object",
        properties: {
          videoPath: { type: "string", description: "视频文件路径（必填）" },
          storyId: { type: "string", description: "故事 ID（可选，用于生成字幕文本）" },
          addSubtitles: {
            type: "boolean",
            description: "是否添加字幕，默认 true",
            default: true,
          },
          addMusic: {
            type: "boolean",
            description: "是否添加配乐，默认 false",
            default: false,
          },
          colorGrade: {
            type: "string",
            enum: ["none", "warm", "cool", "cinematic"],
            description: "调色风格，默认 none（当前对视频不可用，优雅降级）",
            default: "none",
          },
        },
        required: ["videoPath"],
      },
    },
  },
  domain: "workflow",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args, ctx) {
    const videoPath = String(args.videoPath);
    const storyId = args.storyId ? String(args.storyId) : undefined;
    const addSubtitles = args.addSubtitles !== false;
    const addMusic = args.addMusic === true;
    const colorGrade = String(args.colorGrade || "none") as "none" | "warm" | "cool" | "cinematic";
    const steps: string[] = [];
    let outputPath = videoPath;

    // Step 1: 生成字幕（可选）
    let addedSubtitles = false;
    if (addSubtitles) {
      ctx.onProgress?.("正在生成字幕…");
      try {
        let subtitles: Array<{ text: string; startTime: number; endTime: number }> = [];

        if (storyId) {
          // 用故事分镜生成字幕
          const { storyService } = await import("@/modules/story");
          const storyResult = await storyService.getById(storyId);
          if (storyResult.ok) {
            const story = storyResult.value;
            const beats = story.beats || [];
            let currentTime = 0;
            subtitles = beats.map((b) => {
              const duration = b.duration ?? 5;
              const sub = {
                text: b.content || b.description || b.title || "",
                startTime: currentTime,
                endTime: currentTime + duration,
              };
              currentTime += duration;
              return sub;
            });
          }
        }

        // 如果没有故事或分镜为空，用 AI 生成字幕
        if (subtitles.length === 0) {
          ctx.onProgress?.("用 AI 生成字幕文本…");
          const subtitlePrompt = `请为一段视频生成字幕。视频路径：${videoPath}。
请生成 3-5 句字幕，按时间顺序排列。严格按 JSON 数组格式输出：
[{"text": "字幕文本", "startTime": 0, "endTime": 3}]`;
          const subsData = await generateJsonArrayWithAI(subtitlePrompt);
          if (subsData) {
            subtitles = subsData.map((s) => {
              const sub = s as Record<string, unknown>;
              return {
                text: String(sub.text ?? ""),
                startTime: Number(sub.startTime ?? 0),
                endTime: Number(sub.endTime ?? 3),
              };
            });
          }
        }

        if (subtitles.length > 0) {
          const subtitleResult = await executeTool(
            "add_subtitle",
            { videoPath, subtitles },
            ctx.onProgress,
          );
          addedSubtitles = subtitleResult.success;
          if (subtitleResult.success) {
            const data = subtitleResult.data as Record<string, unknown> | undefined;
            if (data?.outputPath) {
              outputPath = String(data.outputPath);
            }
            steps.push("字幕");
          } else {
            ctx.onProgress?.(`字幕添加跳过：${subtitleResult.error ?? "未知"}`);
          }
        } else {
          ctx.onProgress?.("字幕生成跳过：无法生成字幕文本");
        }
      } catch (e) {
        ctx.onProgress?.(`字幕生成异常：${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Step 2: 生成配乐（可选，优雅降级）
    let addedMusic = false;
    if (addMusic) {
      ctx.onProgress?.("正在生成配乐…");
      try {
        const musicResult = await executeTool(
          "generate_music",
          { prompt: "温馨的背景音乐", duration: 60 },
          ctx.onProgress,
        );
        addedMusic = musicResult.success;
        if (musicResult.success) {
          steps.push("配乐");
        } else {
          ctx.onProgress?.(`配乐跳过：${musicResult.error ?? "当前不支持"}`);
        }
      } catch (e) {
        ctx.onProgress?.(`配乐异常：${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Step 3: 调色（可选，对视频当前不可用，优雅降级）
    let colorGraded = false;
    if (colorGrade !== "none") {
      ctx.onProgress?.(`正在应用调色（${colorGrade}）…`);
      // apply_filter 仅支持图片，对视频不可用 — 优雅降级
      ctx.onProgress?.(
        `提示：apply_filter 当前仅支持图片，视频调色功能暂未实现（colorGrade=${colorGrade}）`,
      );
      colorGraded = false;
    }

    return {
      success: true,
      data: {
        outputPath,
        addedSubtitles,
        addedMusic,
        colorGraded,
        steps,
      },
    };
  },
};

/** 导出所有子流程工具 */
export const subworkflowTools: ToolImpl[] = [
  autoCreateCharacterTool,
  autoCreateSceneTool,
  autoPlanStoryboardTool,
  autoGenerateBeatFullTool,
  autoGenerateVideoFullTool,
  autoFindAndImportAssetTool,
  autoFixCommonErrorsTool,
  autoCreateFromNovelTool,
  autoPolishVideoTool,
];
