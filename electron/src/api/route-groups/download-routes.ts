/**
 * 流式下载路由（方案 C）。
 *
 * 让主进程直接 fetch 远程 URL 并流式写入本地文件，绕过渲染进程内存。
 * 用于支持 200-500MB 大视频文件下载（Seedance 2.5 30秒 4K / Kling 180秒）。
 *
 * 路由：
 * - POST /api/download/to-file  同步阻塞下载，完成后返回 { totalBytes, duration }
 *
 * 设计选择（同步阻塞模式）：
 * - video-cache.ts 当前的 onProgress 是空函数，说明进度反馈非必需
 * - 与 writeFile 模式一致，调用方只需 await 结果
 * - 避免引入 task 管理 / SSE / 轮询的复杂度
 *
 * 超时：客户端通过 AbortSignal.timeout 控制。默认 5 分钟（download-to-file.ts 兜底）。
 */
import { z } from "zod";
import type { Route } from "../types";
import { defineRoute } from "../types";
import { extractErrorMessage } from "../../logging/extract-error";
import { getLogger } from "../../logging";
import { downloadToFile } from "../../handlers/download-to-file";

const logger = getLogger("download-routes");

const downloadToFileSchema = z.object({
  url: z.string().url(),
  filePath: z.string().min(1),
  timeout: z.number().int().positive().optional(),
  maxRetries: z.number().int().positive().optional(),
});

export type DownloadToFileRequest = z.infer<typeof downloadToFileSchema>;

export const downloadRoutes: Record<string, Route> = {
  "download/to-file": defineRoute({
    schema: downloadToFileSchema,
    handler: async (_method, body) => {
      try {
        const { url, filePath, timeout, maxRetries } = body;
        const result = await downloadToFile(url, filePath, { timeout, maxRetries });

        if (result.success) {
          return {
            success: true,
            data: {
              totalBytes: result.totalBytes,
              duration: result.duration,
            },
          };
        }
        return {
          success: false,
          error: result.error ?? "Download failed",
        };
      } catch (error) {
        logger.error(
          "[download/to-file] failed:",
          error instanceof Error ? error : new Error(String(error)),
        );
        return {
          success: false,
          error: extractErrorMessage(error),
        };
      }
    },
    methods: ["POST"],
  }),
};
