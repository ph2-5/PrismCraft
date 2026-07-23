/**
 * ffmpeg 路由组
 *
 * 暴露 ffmpeg 能力给渲染进程：
 * - POST /api/ffmpeg/probe   检查 ffmpeg 是否可用
 * - POST /api/ffmpeg/execute 执行 ffmpeg 命令
 *
 * 安全要点：
 * - execute 只接受预定义的参数数组，不接受 shell 字符串
 * - 渲染进程传入的 ffmpegPath 会被校验（必须存在且可执行）
 */

import { z } from "zod";
import type { Route } from "../types";
import { defineRoute } from "../types";
import { extractErrorMessage } from "../../logging/extract-error";
import { getLogger } from "../../logging";
import { probeFfmpeg, executeFfmpeg, type FfmpegExecuteResult } from "../../handlers/ffmpeg-handler";

const logger = getLogger("ffmpeg-routes");

const probeSchema = z.object({
  ffmpegPath: z.string().min(1).optional(),
});

const executeSchema = z.object({
  args: z.array(z.string()).min(1),
  ffmpegPath: z.string().min(1).optional(),
  timeout: z.number().int().positive().max(30 * 60 * 1000).optional(),
});

export type FfmpegExecuteRequest = z.infer<typeof executeSchema>;

export const ffmpegRoutes: Record<string, Route> = {
  "ffmpeg/probe": defineRoute({
    schema: probeSchema,
    methods: ["POST"],
    handler: async (_method, body) => {
      try {
        const { ffmpegPath } = body;
        const result = await probeFfmpeg(ffmpegPath);
        return { success: true, data: result };
      } catch (error) {
        logger.error(
          "[ffmpeg/probe] failed:",
          error instanceof Error ? error : new Error(String(error)),
        );
        return {
          success: false,
          error: extractErrorMessage(error),
        };
      }
    },
  }),

  "ffmpeg/execute": defineRoute({
    schema: executeSchema,
    methods: ["POST"],
    handler: async (_method, body) => {
      try {
        const { args, ffmpegPath, timeout } = body;
        const result: FfmpegExecuteResult = await executeFfmpeg(args, {
          ffmpegPath,
          timeout,
        });

        if (result.success) {
          return {
            success: true,
            data: {
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
              duration: result.duration,
            },
          };
        }
        return {
          success: false,
          error: result.error ?? "ffmpeg execution failed",
          data: {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            duration: result.duration,
          },
        };
      } catch (error) {
        logger.error(
          "[ffmpeg/execute] failed:",
          error instanceof Error ? error : new Error(String(error)),
        );
        return {
          success: false,
          error: extractErrorMessage(error),
        };
      }
    },
  }),
};
