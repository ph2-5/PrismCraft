/**
 * 子流程工具 — 视频润色（Subworkflow Polish Tools）
 *
 * 包含工具：
 * - auto_polish_video：视频自动润色（字幕 → 配乐 → 调色）
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { executeTool, generateJsonArrayWithAI } from "./subworkflow-helpers";

/** 字幕条目类型 */
interface SubtitleEntry {
  text: string;
  startTime: number;
  endTime: number;
}

/** 字幕步骤处理结果 */
interface SubtitleStepResult {
  /** 字幕是否成功添加 */
  added: boolean;
  /** 输出路径（成功时为字幕工具输出，否则沿用输入） */
  outputPath: string;
}

/** 解析 auto_polish_video 的入参 */
function parsePolishArgs(args: Record<string, unknown>) {
  const videoPath = String(args.videoPath);
  const storyId = args.storyId ? String(args.storyId) : undefined;
  const addSubtitles = args.addSubtitles !== false;
  const addMusic = args.addMusic === true;
  const colorGrade = String(args.colorGrade || "none") as "none" | "warm" | "cool" | "cinematic";
  return { videoPath, storyId, addSubtitles, addMusic, colorGrade };
}

/** 从故事分镜生成字幕条目（无故事或失败时返回空数组） */
async function generateSubtitlesFromStory(storyId: string): Promise<SubtitleEntry[]> {
  const { storyService } = await import("@/modules/storyboard");
  const storyResult = await storyService.getById(storyId);
  if (!storyResult.ok) return [];

  const story = storyResult.value;
  const beats = story.beats || [];
  let currentTime = 0;
  return beats.map((b) => {
    const duration = b.duration ?? 5;
    const sub: SubtitleEntry = {
      text: b.content || b.description || b.title || "",
      startTime: currentTime,
      endTime: currentTime + duration,
    };
    currentTime += duration;
    return sub;
  });
}

/** 用 AI 生成字幕文本（失败时返回空数组） */
async function generateSubtitlesWithAI(
  videoPath: string,
  onProgress?: (message: string) => void,
): Promise<SubtitleEntry[]> {
  onProgress?.("用 AI 生成字幕文本…");
  const subtitlePrompt = `请为一段视频生成字幕。视频路径：${videoPath}。
请生成 3-5 句字幕，按时间顺序排列。严格按 JSON 数组格式输出：
[{"text": "字幕文本", "startTime": 0, "endTime": 3}]`;
  const subsData = await generateJsonArrayWithAI(subtitlePrompt);
  if (!subsData) return [];

  return subsData.map((s) => {
    const sub = s as Record<string, unknown>;
    return {
      text: String(sub.text ?? ""),
      startTime: Number(sub.startTime ?? 0),
      endTime: Number(sub.endTime ?? 3),
    };
  });
}

/** 生成字幕：先尝试用故事分镜，无故事或为空时再用 AI 兜底 */
async function generateSubtitles(
  storyId: string | undefined,
  videoPath: string,
  onProgress?: (message: string) => void,
): Promise<SubtitleEntry[]> {
  let subtitles: SubtitleEntry[] = [];
  if (storyId) {
    subtitles = await generateSubtitlesFromStory(storyId);
  }
  if (subtitles.length === 0) {
    subtitles = await generateSubtitlesWithAI(videoPath, onProgress);
  }
  return subtitles;
}

/** 调用 add_subtitle 工具将字幕应用到视频，返回更新后的输出路径 */
async function applySubtitles(
  videoPath: string,
  subtitles: SubtitleEntry[],
  onProgress?: (message: string) => void,
): Promise<{ success: boolean; outputPath: string; error?: string }> {
  const result = await executeTool(
    "add_subtitle",
    { videoPath, subtitles },
    onProgress,
  );
  let outputPath = videoPath;
  if (result.success) {
    const data = result.data as Record<string, unknown> | undefined;
    if (data?.outputPath) {
      outputPath = String(data.outputPath);
    }
  }
  return { success: result.success, outputPath, error: result.error };
}

/** 处理字幕步骤：生成并应用字幕，返回是否成功及输出路径 */
async function processSubtitlesStep(
  opts: { videoPath: string; storyId?: string; addSubtitles: boolean },
  onProgress?: (message: string) => void,
): Promise<SubtitleStepResult> {
  if (!opts.addSubtitles) {
    return { added: false, outputPath: opts.videoPath };
  }

  onProgress?.("正在生成字幕…");
  try {
    const subtitles = await generateSubtitles(opts.storyId, opts.videoPath, onProgress);
    if (subtitles.length === 0) {
      onProgress?.("字幕生成跳过：无法生成字幕文本");
      return { added: false, outputPath: opts.videoPath };
    }
    const applyResult = await applySubtitles(opts.videoPath, subtitles, onProgress);
    if (applyResult.success) {
      return { added: true, outputPath: applyResult.outputPath };
    }
    onProgress?.(`字幕添加跳过：${applyResult.error ?? "未知"}`);
    return { added: false, outputPath: opts.videoPath };
  } catch (e) {
    onProgress?.(`字幕生成异常：${e instanceof Error ? e.message : String(e)}`);
    return { added: false, outputPath: opts.videoPath };
  }
}

/** 处理配乐步骤：调用 generate_music（当前优雅降级） */
async function processMusicStep(
  addMusic: boolean,
  onProgress?: (message: string) => void,
): Promise<boolean> {
  if (!addMusic) return false;

  onProgress?.("正在生成配乐…");
  try {
    const musicResult = await executeTool(
      "generate_music",
      { prompt: "温馨的背景音乐", duration: 60 },
      onProgress,
    );
    if (musicResult.success) {
      return true;
    }
    onProgress?.(`配乐跳过：${musicResult.error ?? "当前不支持"}`);
    return false;
  } catch (e) {
    onProgress?.(`配乐异常：${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** 处理调色步骤：apply_filter 当前对视频不可用，优雅降级 */
function processColorGradeStep(
  colorGrade: "none" | "warm" | "cool" | "cinematic",
  onProgress?: (message: string) => void,
): void {
  if (colorGrade === "none") return;

  onProgress?.(`正在应用调色（${colorGrade}）…`);
  // apply_filter 仅支持图片，对视频不可用 — 优雅降级
  onProgress?.(
    `提示：apply_filter 当前仅支持图片，视频调色功能暂未实现（colorGrade=${colorGrade}）`,
  );
}

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
          videoPath: { type: "string", maxLength: 2048, description: "视频文件路径（必填）" },
          storyId: { type: "string", maxLength: 100, description: "故事 ID（可选，用于生成字幕文本）" },
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
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args, ctx) {
    const { videoPath, storyId, addSubtitles, addMusic, colorGrade } = parsePolishArgs(args);
    const steps: string[] = [];
    let outputPath = videoPath;

    // Step 1: 生成字幕（可选）
    const subtitleStep = await processSubtitlesStep(
      { videoPath, storyId, addSubtitles },
      ctx.onProgress,
    );
    outputPath = subtitleStep.outputPath;
    if (subtitleStep.added) {
      steps.push("字幕");
    }

    // Step 2: 生成配乐（可选，优雅降级）
    const addedMusic = await processMusicStep(addMusic, ctx.onProgress);
    if (addedMusic) {
      steps.push("配乐");
    }

    // Step 3: 调色（可选，对视频当前不可用，优雅降级）
    processColorGradeStep(colorGrade, ctx.onProgress);

    return {
      success: true,
      data: {
        outputPath,
        addedSubtitles: subtitleStep.added,
        addedMusic,
        colorGraded: false,
        steps,
      },
    };
  },
};
