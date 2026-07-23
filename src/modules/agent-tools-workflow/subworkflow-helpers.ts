/**
 * 子流程工具共享辅助函数（Subworkflow Helpers）
 *
 * 提供子流程工具共用的：
 * - AI JSON 推理（generateJsonWithAI / generateJsonArrayWithAI）
 * - 基础工具执行便捷函数（executeTool）
 * - 视频任务轮询（pollVideoTask）
 * - 类型转换（toStringArray）
 * - 常量（NOVEL_TEXT_MAX_CHARS）
 */

import type { ToolResult, ToolContext } from "@/domain/types/agent-tools";
import type { ToolCall } from "@/domain/ports/ai-provider-port";
import { container } from "@/infrastructure/di";
import { extractJsonObject, extractJsonArray } from "@/shared-logic/json";
import { sleep } from "@/shared-logic/sleep";

/** 小说转分镜时文本最大字符数（避免 token 超限） */
export const NOVEL_TEXT_MAX_CHARS = 8000;

/** 用 textProvider 推理生成 JSON（从文本中提取第一个 JSON 对象） */
export async function generateJsonWithAI(prompt: string): Promise<Record<string, unknown> | null> {
  const result = await container.textProvider.generateText(prompt, {
    maxTokens: 2048,
    temperature: 0.7,
  });
  if (!result.success || !result.data) return null;
  const text = result.data.text;
  const jsonStr = extractJsonObject(text);
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 用 textProvider 推理生成 JSON 数组（从文本中提取第一个 JSON 数组） */
export async function generateJsonArrayWithAI(prompt: string): Promise<unknown[] | null> {
  const result = await container.textProvider.generateText(prompt, {
    maxTokens: 4096,
    temperature: 0.7,
  });
  if (!result.success || !result.data) return null;
  const text = result.data.text;
  const jsonStr = extractJsonArray(text);
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr) as unknown[];
  } catch {
    return null;
  }
}

/** 执行基础工具的便捷函数（透传进度回调） */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  onProgress?: (message: string) => void,
): Promise<ToolResult> {
  const toolRegistry = await container.agentToolRegistry;
  const toolExecutor = await container.agentToolExecutor;
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
export async function pollVideoTask(
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
    await sleep(pollInterval);
  }

  return {
    completed: false,
    status: lastStatus,
    message: `视频任务 ${taskId} 轮询超时（${Math.round(timeoutMs / 1000)}秒）`,
  };
}

/** 将未知值转为字符串数组 */
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  if (value === undefined || value === null) return [];
  return String(value)
    .split(/[、，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
