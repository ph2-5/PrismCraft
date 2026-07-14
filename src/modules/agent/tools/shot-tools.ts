/**
 * 分镜生成工具（Shot Tools）
 *
 * 包含工具：
 * - generate_beat_keyframe：生成分镜关键帧（预览图）
 * - generate_beat_frame_pair：生成分镜首尾帧
 * - generate_beat_video：生成分镜视频（异步任务，仅返回 taskId）
 * - batch_generate：批量生成（关键帧/帧对/视频）
 * - regenerate_beat：重生成（用户对结果不满意时使用）
 *
 * 设计要点：
 * - 通过 DI container 构造 ProviderDeps（videoProvider/imageProvider/textProvider）
 * - storyService / characterService / sceneService 通过动态 import 获取（避免循环依赖）
 * - 分镜生成函数从 @/modules/storyboard 动态 import
 * - Result 模式：{ ok, value } | { ok: false, error }
 * - 前置条件检查：frame_pair 需要 keyframe.imageUrl，video 需要 framePair.firstFrameUrl
 * - 成功后通过 storyService.updateBeatMediaUrls 持久化媒体 URL 到数据库
 */

import type { ToolImpl, ToolResult } from "../domain/types";
import { TOOL_TIMEOUTS } from "../domain/constants";
import { container } from "@/infrastructure/di";
import type { Story, StoryBeat, Character, Scene } from "@/domain/schemas";

// ============= 辅助类型 =============

interface BeatContext {
  story: Story;
  beat: StoryBeat;
  prevBeat: StoryBeat | null;
}

// ============= 辅助函数 =============

/** 构造 ProviderDeps（从 DI container 获取 provider 实例） */
function buildProviders() {
  return {
    videoProvider: container.videoProvider,
    imageProvider: container.imageProvider,
    textProvider: container.textProvider,
  };
}

/**
 * 获取故事、分镜及前一个分镜（用于连贯性生成）
 * 前一个分镜是 beats 数组中位于当前分镜之前的那个（按数组顺序）
 */
async function resolveBeatContext(
  storyId: string,
  beatId: string,
): Promise<{ ok: true; value: BeatContext } | { ok: false; error: string }> {
  const { storyService } = await import("@/modules/storyboard");
  const storyResult = await storyService.getById(storyId);
  if (!storyResult.ok) {
    return { ok: false, error: `获取故事失败：${storyResult.error.message}` };
  }
  const story = storyResult.value;
  const beatIdx = story.beats.findIndex((b) => b.id === beatId);
  if (beatIdx === -1) {
    return {
      ok: false,
      error: `未找到分镜（beatId=${beatId}），故事中现有 ${story.beats.length} 个分镜`,
    };
  }
  const beat = story.beats[beatIdx]!;
  const prevBeat = beatIdx > 0 ? story.beats[beatIdx - 1]! : null;
  return { ok: true, value: { story, beat, prevBeat } };
}

/** 获取角色和场景列表（用于构建生成提示词） */
async function getCharactersAndScenes(): Promise<{ characters: Character[]; scenes: Scene[] }> {
  const { characterService } = await import("@/modules/character");
  const { sceneService } = await import("@/modules/scene");
  const [charResult, sceneResult] = await Promise.all([
    characterService.getAll(),
    sceneService.getAll(),
  ]);
  return {
    characters: charResult.ok ? charResult.value : [],
    scenes: sceneResult.ok ? sceneResult.value : [],
  };
}

/** 持久化 beat 媒体 URL 到数据库 */
async function persistBeatMediaUrls(
  updates: Array<{
    id: string;
    keyframeImageUrl?: string;
    firstFrameImageUrl?: string;
    lastFrameImageUrl?: string;
    videoUrl?: string;
  }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { storyService } = await import("@/modules/storyboard");
  try {
    await storyService.updateBeatMediaUrls(updates);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 在故事中查找分镜及其前一个分镜（不重新查询故事） */
function findBeatInStory(
  story: Story,
  beatId: string,
): { beat: StoryBeat; prevBeat: StoryBeat | null } | null {
  const beatIdx = story.beats.findIndex((b) => b.id === beatId);
  if (beatIdx === -1) return null;
  const beat = story.beats[beatIdx]!;
  const prevBeat = beatIdx > 0 ? story.beats[beatIdx - 1]! : null;
  return { beat, prevBeat };
}

// ============= 核心生成逻辑（可被多个工具复用） =============

/** 生成分镜关键帧核心逻辑 */
async function generateKeyframeCore(
  ctx: BeatContext,
  options: {
    customPrompt?: string;
    providerId?: string;
    modelId?: string;
  },
): Promise<ToolResult> {
  const { beat, prevBeat } = ctx;
  const { characters, scenes } = await getCharactersAndScenes();
  const providers = buildProviders();

  const { generateBeatKeyframe } = await import("@/modules/storyboard");
  const result = await generateBeatKeyframe(
    beat,
    prevBeat,
    {
      characterRefs: beat.characterIds,
      sceneRef: beat.sceneId,
      customPrompt: options.customPrompt,
      providerId: options.providerId,
      modelId: options.modelId,
      characters,
      scenes,
    },
    providers,
  );

  if (!result.ok) {
    return { success: false, error: `生成关键帧失败：${result.error.message}` };
  }

  const persistResult = await persistBeatMediaUrls([
    { id: beat.id, keyframeImageUrl: result.value.imageUrl },
  ]);
  if (!persistResult.ok) {
    return { success: false, error: `关键帧已生成但持久化失败：${persistResult.error}` };
  }

  return {
    success: true,
    data: {
      imageUrl: result.value.imageUrl,
      prompt: result.value.prompt,
      beatId: beat.id,
    },
  };
}

/** 生成分镜首尾帧核心逻辑 */
async function generateFramePairCore(
  ctx: BeatContext,
  options: {
    customFirstFramePrompt?: string;
    customLastFramePrompt?: string;
    providerId?: string;
    modelId?: string;
  },
): Promise<ToolResult> {
  const { beat } = ctx;

  if (!beat.keyframe?.imageUrl) {
    return { success: false, error: "请先生成关键帧，再生成首尾帧" };
  }

  const { characters, scenes } = await getCharactersAndScenes();
  const providers = buildProviders();

  const { generateBeatFramePair } = await import("@/modules/storyboard");
  const result = await generateBeatFramePair(
    beat,
    {
      characterRefs: beat.characterIds,
      sceneRef: beat.sceneId,
      customFirstFramePrompt: options.customFirstFramePrompt,
      customLastFramePrompt: options.customLastFramePrompt,
      providerId: options.providerId,
      modelId: options.modelId,
      characters,
      scenes,
      autoGeneratePrompts: true,
    },
    providers,
  );

  if (!result.ok) {
    return { success: false, error: `生成首尾帧失败：${result.error.message}` };
  }

  const persistResult = await persistBeatMediaUrls([
    {
      id: beat.id,
      firstFrameImageUrl: result.value.firstFrameUrl,
      lastFrameImageUrl: result.value.lastFrameUrl,
    },
  ]);
  if (!persistResult.ok) {
    return { success: false, error: `首尾帧已生成但持久化失败：${persistResult.error}` };
  }

  return {
    success: true,
    data: {
      firstFrameUrl: result.value.firstFrameUrl,
      lastFrameUrl: result.value.lastFrameUrl,
      firstFramePrompt: result.value.firstFramePrompt,
      lastFramePrompt: result.value.lastFramePrompt,
      beatId: beat.id,
    },
  };
}

/** 生成分镜视频核心逻辑（异步任务，通常仅返回 taskId） */
async function generateVideoCore(
  ctx: BeatContext,
  options: {
    customPrompt?: string;
    providerId?: string;
    modelId?: string;
  },
): Promise<ToolResult> {
  const { beat, prevBeat } = ctx;

  // 前置条件：首帧必须存在（生成的或上传的）
  const firstFrameUrl = beat.framePair?.firstFrameUrl || beat.uploadedFramePair?.firstFrame;
  if (!firstFrameUrl) {
    return { success: false, error: "请先生成首帧（首尾帧），再生成视频" };
  }

  const providers = buildProviders();

  const { generateBeatVideo } = await import("@/modules/storyboard");
  const result = await generateBeatVideo(
    beat,
    {
      characterRefs: beat.characterIds,
      sceneRef: beat.sceneId,
      prompt: options.customPrompt,
      providerId: options.providerId,
      modelId: options.modelId,
      prevBeat,
    },
    providers,
  );

  if (!result.ok) {
    return { success: false, error: `生成视频失败：${result.error.message}` };
  }

  // 视频任务通常是异步的，仅当同步返回 videoUrl 时才持久化
  // taskId/status 由视频任务管理系统跟踪，不通过 updateBeatMediaUrls 持久化
  if (result.value.videoUrl) {
    await persistBeatMediaUrls([{ id: beat.id, videoUrl: result.value.videoUrl }]);
  }

  return {
    success: true,
    data: {
      taskId: result.value.taskId,
      videoUrl: result.value.videoUrl,
      status: result.value.status,
      videoMode: result.value.videoMode,
      beatId: beat.id,
    },
  };
}

// ============= 工具实现 =============

/** 1. 生成分镜关键帧 */
export const generateBeatKeyframeTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_beat_keyframe",
      description:
        "为指定分镜生成关键帧（预览图）。基于分镜描述、绑定的角色和场景自动构建提示词。成功后会持久化到故事数据库。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID" },
          beatId: { type: "string", description: "分镜 ID" },
          customPrompt: { type: "string", description: "自定义提示词（覆盖自动生成的提示词）" },
          providerId: { type: "string", description: "指定 AI 服务商 ID" },
          modelId: { type: "string", description: "指定模型 ID" },
        },
        required: ["storyId", "beatId"],
      },
    },
  },
  domain: "shot",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const storyId = String(args.storyId);
    const beatId = String(args.beatId);

    const ctxResult = await resolveBeatContext(storyId, beatId);
    if (!ctxResult.ok) {
      return { success: false, error: ctxResult.error };
    }

    return generateKeyframeCore(ctxResult.value, {
      customPrompt: args.customPrompt ? String(args.customPrompt) : undefined,
      providerId: args.providerId ? String(args.providerId) : undefined,
      modelId: args.modelId ? String(args.modelId) : undefined,
    });
  },
};

/** 2. 生成分镜首尾帧 */
export const generateBeatFramePairTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_beat_frame_pair",
      description:
        "为指定分镜生成首尾帧（基于关键帧）。前置条件：必须先生成关键帧。成功后会持久化到故事数据库。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID" },
          beatId: { type: "string", description: "分镜 ID" },
          customFirstFramePrompt: { type: "string", description: "自定义首帧提示词" },
          customLastFramePrompt: { type: "string", description: "自定义尾帧提示词" },
          providerId: { type: "string", description: "指定 AI 服务商 ID" },
          modelId: { type: "string", description: "指定模型 ID" },
        },
        required: ["storyId", "beatId"],
      },
    },
  },
  domain: "shot",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const storyId = String(args.storyId);
    const beatId = String(args.beatId);

    const ctxResult = await resolveBeatContext(storyId, beatId);
    if (!ctxResult.ok) {
      return { success: false, error: ctxResult.error };
    }

    return generateFramePairCore(ctxResult.value, {
      customFirstFramePrompt: args.customFirstFramePrompt
        ? String(args.customFirstFramePrompt)
        : undefined,
      customLastFramePrompt: args.customLastFramePrompt
        ? String(args.customLastFramePrompt)
        : undefined,
      providerId: args.providerId ? String(args.providerId) : undefined,
      modelId: args.modelId ? String(args.modelId) : undefined,
    });
  },
};

/** 3. 生成分镜视频 */
export const generateBeatVideoTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_beat_video",
      description:
        "为指定分镜生成视频（异步任务）。前置条件：必须先生成首尾帧。返回 taskId 用于轮询任务状态，视频完成后由任务系统自动同步 URL。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID" },
          beatId: { type: "string", description: "分镜 ID" },
          customPrompt: { type: "string", description: "自定义视频生成提示词" },
          providerId: { type: "string", description: "指定 AI 服务商 ID" },
          modelId: { type: "string", description: "指定模型 ID" },
        },
        required: ["storyId", "beatId"],
      },
    },
  },
  domain: "shot",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args) {
    const storyId = String(args.storyId);
    const beatId = String(args.beatId);

    const ctxResult = await resolveBeatContext(storyId, beatId);
    if (!ctxResult.ok) {
      return { success: false, error: ctxResult.error };
    }

    return generateVideoCore(ctxResult.value, {
      customPrompt: args.customPrompt ? String(args.customPrompt) : undefined,
      providerId: args.providerId ? String(args.providerId) : undefined,
      modelId: args.modelId ? String(args.modelId) : undefined,
    });
  },
};

/** 4. 批量生成（关键帧/帧对/视频） */
export const batchGenerateTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "batch_generate",
      description:
        "批量生成多个分镜的媒体资源。可指定分镜 ID 列表，不指定则对故事中所有分镜执行。操作类型：keyframe（关键帧）、frame_pair（首尾帧）、video（视频）。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID" },
          operation: {
            type: "string",
            enum: ["keyframe", "frame_pair", "video"],
            description: "生成操作类型",
          },
          beatIds: {
            type: "array",
            items: { type: "string" },
            maxItems: 20,
            description: "指定分镜 ID 列表（最多 20 个，不填则对全部分镜执行，但不超过 20 个）",
          },
          providerId: { type: "string", description: "指定 AI 服务商 ID" },
          modelId: { type: "string", description: "指定模型 ID" },
        },
        required: ["storyId", "operation"],
      },
    },
  },
  domain: "shot",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args) {
    const storyId = String(args.storyId);
    const operation = String(args.operation) as "keyframe" | "frame_pair" | "video";
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

    const { storyService } = await import("@/modules/storyboard");
    const storyResult = await storyService.getById(storyId);
    if (!storyResult.ok) {
      return { success: false, error: `获取故事失败：${storyResult.error.message}` };
    }
    const story = storyResult.value;

    // 确定目标分镜列表
    const targetBeatIds: string[] = Array.isArray(args.beatIds) && args.beatIds.length > 0
      ? args.beatIds.map((id) => String(id))
      : story.beats.map((b) => b.id);

    // 数量上限保护（防止 LLM 批量生成过多内容）
    if (targetBeatIds.length > 20) {
      return {
        success: false,
        error: `分镜数量超限（最多 20 个，实际 ${targetBeatIds.length} 个）。请缩小范围或分批执行。`,
      };
    }

    const results: Array<Record<string, unknown>> = [];
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const beatId of targetBeatIds) {
      const found = findBeatInStory(story, beatId);
      if (!found) {
        results.push({ beatId, success: false, error: "未找到该分镜" });
        totalFailed++;
        continue;
      }

      const ctx: BeatContext = { story, beat: found.beat, prevBeat: found.prevBeat };

      let result: ToolResult;
      if (operation === "keyframe") {
        result = await generateKeyframeCore(ctx, { providerId, modelId });
      } else if (operation === "frame_pair") {
        result = await generateFramePairCore(ctx, { providerId, modelId });
      } else {
        result = await generateVideoCore(ctx, { providerId, modelId });
      }

      if (result.success) {
        results.push({ beatId, success: true, ...(result.data as object) });
        totalSuccess++;
      } else {
        results.push({ beatId, success: false, error: result.error });
        totalFailed++;
      }
    }

    return {
      success: true,
      data: {
        operation,
        results,
        totalSuccess,
        totalFailed,
        total: targetBeatIds.length,
      },
    };
  },
};

/** 5. 重生成（用户对结果不满意时使用） */
export const regenerateBeatTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "regenerate_beat",
      description:
        "重新生成指定分镜的媒体资源（覆盖旧结果）。会先清除旧结果再重新生成。target 指定重生成目标：keyframe、frame_pair 或 video。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", maxLength: 100, description: "故事 ID" },
          beatId: { type: "string", maxLength: 100, description: "分镜 ID" },
          target: {
            type: "string",
            enum: ["keyframe", "frame_pair", "video"],
            description: "重生成目标",
          },
          customPrompt: {
            type: "string",
            maxLength: 5000,
            description: "新的提示词（keyframe/video 时作为生成提示词，frame_pair 时作为首帧提示词）",
          },
          providerId: { type: "string", maxLength: 100, description: "指定 AI 服务商 ID" },
          modelId: { type: "string", maxLength: 100, description: "指定模型 ID" },
        },
        required: ["storyId", "beatId", "target"],
      },
    },
  },
  domain: "shot",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args) {
    const storyId = String(args.storyId);
    const beatId = String(args.beatId);
    const target = String(args.target) as "keyframe" | "frame_pair" | "video";
    const customPrompt = args.customPrompt ? String(args.customPrompt) : undefined;
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

    const ctxResult = await resolveBeatContext(storyId, beatId);
    if (!ctxResult.ok) {
      return { success: false, error: ctxResult.error };
    }

    const { story, beat, prevBeat } = ctxResult.value;

    // 清除旧结果（确保生成函数不使用旧数据）
    const clearedBeat: StoryBeat =
      target === "keyframe"
        ? { ...beat, keyframe: undefined }
        : target === "frame_pair"
          ? { ...beat, framePair: undefined }
          : { ...beat, videoGen: undefined };

    const ctx: BeatContext = { story, beat: clearedBeat, prevBeat };

    let result: ToolResult;
    if (target === "keyframe") {
      result = await generateKeyframeCore(ctx, { customPrompt, providerId, modelId });
    } else if (target === "frame_pair") {
      result = await generateFramePairCore(ctx, {
        customFirstFramePrompt: customPrompt,
        providerId,
        modelId,
      });
    } else {
      result = await generateVideoCore(ctx, { customPrompt, providerId, modelId });
    }

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: { regenerated: true, target, ...(result.data as object) },
    };
  },
};

/** 导出所有分镜生成工具 */
export const shotTools: ToolImpl[] = [
  generateBeatKeyframeTool,
  generateBeatFramePairTool,
  generateBeatVideoTool,
  batchGenerateTool,
  regenerateBeatTool,
];
