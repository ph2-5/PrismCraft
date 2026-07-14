/**
 * 子流程工具 — 视频润色（Subworkflow Polish Tools）
 *
 * 包含工具：
 * - auto_polish_video：视频自动润色（字幕 → 配乐 → 调色）
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { executeTool, generateJsonArrayWithAI } from "./subworkflow-helpers";

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
          const { storyService } = await import("@/modules/storyboard");
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
