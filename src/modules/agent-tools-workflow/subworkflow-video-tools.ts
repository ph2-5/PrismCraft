/**
 * 子流程工具 — 视频生成相关（Subworkflow Video Tools）
 *
 * 包含工具：
 * - auto_generate_beat_full：单分镜全自动生成（关键帧 → 首尾帧 → 视频）
 * - auto_generate_video_full：一句话完成全片生成（批量生成 → 字幕 → 配乐）
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import type { StoryBeat, Story, Character, Scene } from "@/domain/schemas";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";
import { executeTool, pollVideoTask } from "./subworkflow-helpers";

// ============= 辅助函数（内部使用，不导出） =============

/** providers 类型（与 generateBeatFullWorkflow 期望的 ProviderDeps 结构兼容） */
type BeatProviders = {
  videoProvider: typeof container.videoProvider;
  imageProvider: typeof container.imageProvider;
  textProvider: typeof container.textProvider;
};

/** 获取故事和待生成的 beats 列表 */
async function getStoryBeatsForGeneration(
  storyId: string,
  targetBeatIds: string[] | undefined,
  onProgress?: (msg: string) => void,
): Promise<{ ok: true; story: Story; beatsToGenerate: StoryBeat[] } | { ok: false; error: string }> {
  onProgress?.("正在获取故事…");
  const { storyService } = await import("@/modules/storyboard");
  const storyResult = await storyService.getById(storyId);
  if (!storyResult.ok) {
    return { ok: false, error: `获取故事失败：${storyResult.error.message}` };
  }
  const story = storyResult.value;
  const allBeats = story.beats || [];
  if (allBeats.length === 0) {
    return { ok: false, error: "故事没有分镜，请先使用 auto_plan_storyboard 规划分镜" };
  }
  const beatsToGenerate = targetBeatIds
    ? allBeats.filter((b) => targetBeatIds.includes(b.id))
    : allBeats;
  if (beatsToGenerate.length === 0) {
    return { ok: false, error: "未找到匹配的分镜" };
  }
  return { ok: true, story, beatsToGenerate };
}

/** 获取与故事关联的角色和场景 */
async function getStoryRelatedEntities(story: Story): Promise<{ characters: Character[]; scenes: Scene[] }> {
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
  return { characters, scenes };
}

/** 构造 providers 对象（从 DI container） */
function buildBeatProviders(): BeatProviders {
  return {
    videoProvider: container.videoProvider,
    imageProvider: container.imageProvider,
    textProvider: container.textProvider,
  };
}

/** 生成单个分镜视频任务，返回 taskId 等信息或失败 */
async function generateBeatVideoTask(params: {
  beat: StoryBeat;
  prevBeat: StoryBeat | null;
  beatIndex: number;
  story: Story;
  characters: Character[];
  scenes: Scene[];
  providers: BeatProviders;
  providerId: string | undefined;
  modelId: string | undefined;
  onProgress?: (msg: string) => void;
}): Promise<{ ok: true; keyframe: NonNullable<StoryBeat["keyframe"]>; framePair: NonNullable<StoryBeat["framePair"]>; videoTaskId: string } | { ok: false; error: string }> {
  const { beat, prevBeat, beatIndex, story, characters, scenes, providers, providerId, modelId, onProgress } = params;
  const { generateBeatFullWorkflow } = await import("@/modules/storyboard");
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
      onProgress?.(`分镜 ${beat.id} 进度：${step}（${Math.round(progress * 100)}%）`);
    },
  );
  if (!workflowResult.ok) {
    return { ok: false, error: workflowResult.error.message };
  }
  const { keyframe, framePair, videoTaskId } = workflowResult.value;
  return { ok: true, keyframe, framePair, videoTaskId };
}

/** 用生成的媒体信息更新 beats 数组中对应 beat */
function updateBeatWithVideoTask(
  updatedBeats: StoryBeat[],
  beatIndex: number,
  keyframe: NonNullable<StoryBeat["keyframe"]>,
  framePair: NonNullable<StoryBeat["framePair"]>,
  videoTaskId: string,
): StoryBeat[] {
  return updatedBeats.map((b, idx) => {
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
}

/** 遍历所有 beats 逐个生成视频任务 */
async function generateAllBeats(params: {
  beatsToGenerate: StoryBeat[];
  allBeats: StoryBeat[];
  story: Story;
  characters: Character[];
  scenes: Scene[];
  providers: BeatProviders;
  providerId: string | undefined;
  modelId: string | undefined;
  steps: string[];
  onProgress?: (msg: string) => void;
}): Promise<{ taskIds: string[]; failedBeats: string[]; updatedBeats: StoryBeat[] }> {
  const { beatsToGenerate, allBeats, story, characters, scenes, providers, providerId, modelId, steps, onProgress } = params;
  const taskIds: string[] = [];
  const failedBeats: string[] = [];
  let updatedBeats = [...allBeats];

  for (let i = 0; i < beatsToGenerate.length; i++) {
    const beat = beatsToGenerate[i]!;
    onProgress?.(`正在生成分镜 ${i + 1}/${beatsToGenerate.length}（${beat.id}）…`);
    const beatIndex = updatedBeats.findIndex((b) => b.id === beat.id);
    const prevBeat = beatIndex > 0 ? updatedBeats[beatIndex - 1]! : null;

    try {
      const result = await generateBeatVideoTask({
        beat,
        prevBeat,
        beatIndex,
        story,
        characters,
        scenes,
        providers,
        providerId,
        modelId,
        onProgress,
      });
      if (!result.ok) {
        failedBeats.push(beat.id);
        onProgress?.(`警告：分镜 ${beat.id} 生成失败：${result.error}`);
        continue;
      }
      taskIds.push(result.videoTaskId);
      steps.push(`分镜 ${beat.id} 已提交`);
      updatedBeats = updateBeatWithVideoTask(
        updatedBeats,
        beatIndex,
        result.keyframe,
        result.framePair,
        result.videoTaskId,
      );
    } catch (e) {
      failedBeats.push(beat.id);
      onProgress?.(`警告：分镜 ${beat.id} 生成异常：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { taskIds, failedBeats, updatedBeats };
}

/** 轮询所有视频任务，返回完成的视频 URL 和更新后的 beats */
async function pollAllVideoTasks(
  taskIds: string[],
  updatedBeats: StoryBeat[],
  onProgress?: (msg: string) => void,
): Promise<{ videoUrls: string[]; updatedBeats: StoryBeat[] }> {
  onProgress?.(`正在等待 ${taskIds.length} 个视频任务完成…`);
  const pollTimeout = TOOL_TIMEOUTS.videoTask - 60_000; // 留 1 分钟给后续步骤
  const videoUrls: string[] = [];
  let beats = [...updatedBeats];

  for (let i = 0; i < taskIds.length; i++) {
    const taskId = taskIds[i]!;
    onProgress?.(`轮询视频任务 ${i + 1}/${taskIds.length}（${taskId}）…`);
    const pollResult = await pollVideoTask(taskId, Math.min(pollTimeout, 5 * 60_000), onProgress);
    if (pollResult.completed && pollResult.videoUrl) {
      videoUrls.push(pollResult.videoUrl);
      beats = beats.map((b) => {
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
      onProgress?.(`警告：视频任务 ${taskId} 未完成：${pollResult.message ?? pollResult.status}`);
    }
  }

  return { videoUrls, updatedBeats: beats };
}

/** 生成字幕（best-effort，失败不影响主流程） */
async function processSubtitles(
  videoUrls: string[],
  updatedBeats: StoryBeat[],
  onProgress?: (msg: string) => void,
): Promise<boolean> {
  if (videoUrls.length === 0) return false;
  onProgress?.("正在生成分镜字幕…");
  try {
    const subtitles = updatedBeats
      .filter((b) => b.videoGen?.videoUrl)
      .map((b, i) => ({
        text: b.content || b.description || b.title || `分镜 ${i + 1}`,
        startTime: i * (b.duration ?? 5),
        endTime: (i + 1) * (b.duration ?? 5),
      }));
    if (!videoUrls[0]) return false;
    const subtitleResult = await executeTool(
      "add_subtitle",
      { videoPath: videoUrls[0], subtitles },
      onProgress,
    );
    if (!subtitleResult.success) {
      onProgress?.(`警告：字幕添加跳过：${subtitleResult.error ?? "未知错误"}`);
      return false;
    }
    return true;
  } catch (e) {
    onProgress?.(`警告：字幕生成异常：${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** 生成配乐（best-effort，优雅降级） */
async function processMusic(
  story: Story,
  onProgress?: (msg: string) => void,
): Promise<boolean> {
  onProgress?.("正在生成配乐…");
  try {
    const musicPrompt = `为故事《${story.title}》生成背景配乐，氛围：${story.genre ?? "通用"}`;
    const musicResult = await executeTool(
      "generate_music",
      { prompt: musicPrompt, duration: story.targetDuration ?? 60 },
      onProgress,
    );
    if (!musicResult.success) {
      onProgress?.(`配乐跳过：${musicResult.error ?? "当前不支持"}`);
      return false;
    }
    return true;
  } catch (e) {
    onProgress?.(`配乐异常：${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

// ============= 工具实现 =============

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
          storyId: { type: "string", maxLength: 100, description: "故事 ID（必填）" },
          beatId: { type: "string", maxLength: 100, description: "分镜 ID（必填）" },
          providerId: { type: "string", maxLength: 100, description: "指定 provider ID（可选）" },
          modelId: { type: "string", maxLength: 100, description: "指定模型 ID（可选）" },
        },
        required: ["storyId", "beatId"],
      },
    },
  },
  domain: "workflow",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args, ctx) {
    const storyId = String(args.storyId);
    const beatId = String(args.beatId);
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;
    const steps: string[] = [];

    // Step 1: 获取故事和 beat
    ctx.onProgress?.("正在获取故事和分镜…");
    const { storyService } = await import("@/modules/storyboard");
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
    const { generateBeatFullWorkflow } = await import("@/modules/storyboard");
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
          storyId: { type: "string", maxLength: 100, description: "故事 ID（必填）" },
          beatIds: {
            type: "array",
            items: { type: "string" },
            description: "要生成的分镜 ID 数组（可选，不填则生成全部）",
          },
          providerId: { type: "string", maxLength: 100, description: "指定 provider ID（可选）" },
          modelId: { type: "string", maxLength: 100, description: "指定模型 ID（可选）" },
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
  dangerLevel: "limited",
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
    const storyResult = await getStoryBeatsForGeneration(storyId, targetBeatIds, ctx.onProgress);
    if (!storyResult.ok) {
      return { success: false, error: storyResult.error };
    }
    const { story, beatsToGenerate } = storyResult;

    // Step 2: 准备生成上下文
    const { characters, scenes } = await getStoryRelatedEntities(story);
    const providers = buildBeatProviders();

    // Step 3: 逐个生成分镜
    const genResult = await generateAllBeats({
      beatsToGenerate,
      allBeats: story.beats || [],
      story,
      characters,
      scenes,
      providers,
      providerId,
      modelId,
      steps,
      onProgress: ctx.onProgress,
    });
    const { taskIds, failedBeats } = genResult;
    let updatedBeats = genResult.updatedBeats;

    // Step 4: 等待所有视频任务完成（轮询）
    const pollResult = await pollAllVideoTasks(taskIds, updatedBeats, ctx.onProgress);
    const { videoUrls } = pollResult;
    updatedBeats = pollResult.updatedBeats;

    // 保存更新到故事
    const { storyService } = await import("@/modules/storyboard");
    const updateResult = await storyService.update(storyId, { id: storyId, beats: updatedBeats });
    if (!updateResult.ok) {
      ctx.onProgress?.(`警告：保存故事媒体失败：${updateResult.error.message}`);
    }

    // Step 5: 生成字幕（可选）
    let addedSubtitles = false;
    if (addSubtitles && videoUrls.length > 0) {
      addedSubtitles = await processSubtitles(videoUrls, updatedBeats, ctx.onProgress);
      if (addedSubtitles) steps.push("字幕");
    }

    // Step 6: 生成配乐（可选，优雅降级）
    let addedMusic = false;
    if (addMusic) {
      addedMusic = await processMusic(story, ctx.onProgress);
      if (addedMusic) steps.push("配乐");
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
