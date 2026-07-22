/**
 * Agent Loop 纯函数辅助模块
 *
 * 从 agent-loop.ts 抽取的纯函数集合，无 AgentLoop 实例状态依赖：
 * - buildDynamicProjectState：动态查询项目状态构建摘要（模块级原函数）
 * - mergeToolCall：合并增量工具调用（OpenAI 流式返回可能分块）
 * - serializeMessages：序列化消息为 LLM 输入（generateTextStream 降级路径）
 * - truncateToolResult：截断过大的工具结果防止消耗过多上下文 token
 */

import { container } from "@/infrastructure/di";
import type { ToolCall } from "@/domain/ports/ai-provider-port";
import type { ToolResult } from "../domain/types";
import { estimateTokens } from "@/shared-logic/agent";
import { buildProjectStateSummary } from "../domain/prompts";

/** 动态查询项目状态，构建状态摘要注入 system prompt */
export async function buildDynamicProjectState(): Promise<string> {
  try {
    const [characterResult, sceneResult, storyResult, allTasks, configResult] = await Promise.all([
      import("@/modules/character").then((m) => m.characterService.getAll()),
      import("@/modules/scene").then((m) => m.sceneService.getAll()),
      import("@/modules/storyboard").then((m) => m.storyService.getAll()),
      container.videoTaskStorage.getVideoTasks(),
      import("@/shared/api-config").then((m) => m.loadConfig()),
    ]);

    const characterCount = characterResult.ok ? characterResult.value.length : 0;
    const sceneCount = sceneResult.ok ? sceneResult.value.length : 0;
    const storyCount = storyResult.ok ? storyResult.value.length : 0;
    const activeVideoTasks = allTasks.filter(
      (t) => t.status === "pending" || t.status === "generating" || t.status === "retrying",
    ).length;
    const failedVideoTasks = allTasks.filter(
      (t) => t.status === "failed" || t.status === "timeout",
    ).length;

    // 已配置的能力
    const configuredCapabilities: string[] = [];
    if (configResult) {
      const mapping = configResult.mapping ?? {};
      const caps = ["text", "image", "vision", "video"] as const;
      for (const cap of caps) {
        if (mapping[cap]) {
          configuredCapabilities.push(cap);
        }
      }
    }

    return buildProjectStateSummary({
      characterCount,
      sceneCount,
      storyCount,
      activeVideoTasks,
      failedVideoTasks,
      configuredCapabilities,
    });
  } catch {
    // 查询失败时返回最小状态，不阻断 Agent Loop
    return buildProjectStateSummary({
      characterCount: 0,
      sceneCount: 0,
      storyCount: 0,
      activeVideoTasks: 0,
      failedVideoTasks: 0,
      configuredCapabilities: [],
    });
  }
}

/** 合并增量工具调用（OpenAI 流式返回可能分块） */
export function mergeToolCall(acc: Map<string, ToolCall>, partial: ToolCall): void {
  const existing = acc.get(partial.id);
  if (!existing) {
    // 新的工具调用
    acc.set(partial.id, {
      id: partial.id,
      function: {
        name: partial.function.name,
        arguments: partial.function.arguments,
      },
    });
  } else {
    // 合并增量
    if (partial.function.name && !existing.function.name) {
      existing.function.name = partial.function.name;
    }
    if (partial.function.arguments) {
      existing.function.arguments += partial.function.arguments;
    }
  }
}

/** 序列化消息为 LLM 输入（textProvider 接收单字符串 prompt） */
export function serializeMessages(messages: Array<{ role: string; content: string; tool_calls?: unknown; tool_call_id?: string; name?: string }>): string {
  // 将消息序列化为 LLM 可理解的格式
  // 注意：当前 textProvider.generateTextStream 接收单字符串 prompt
  // 这里将历史消息序列化为结构化文本
  return messages
    .map((m) => {
      if (m.role === "system") {
        return `[系统]\n${m.content}`;
      }
      if (m.role === "user") {
        return `[用户]\n${m.content}`;
      }
      if (m.role === "assistant") {
        let text = `[助手]\n${m.content}`;
        if (m.tool_calls) {
          text += `\n[工具调用]\n${JSON.stringify(m.tool_calls)}`;
        }
        return text;
      }
      if (m.role === "tool") {
        return `[工具结果 ${m.name || ""}]\n${m.content}`;
      }
      return m.content;
    })
    .join("\n\n---\n\n");
}

/**
 * 截断过大的工具结果（防止消耗过多上下文 token）
 *
 * 策略：
 * - 成功结果：将 data 序列化为 JSON，超限时保留头部 + 尾部，中间用省略号标记
 * - 错误结果：error 字符串超限时截断尾部
 * - 截断阈值由 config.maxToolResultTokens 控制（默认 2000）
 *
 * 注意：此方法仅影响传给 LLM 的内容，UI 回调收到的是完整结果。
 */
export function truncateToolResult(result: ToolResult, maxTokens: number): ToolResult {
  if (!result.success) {
    // 错误结果：截断 error 字符串
    if (result.error) {
      const errorTokens = estimateTokens(result.error);
      if (errorTokens > maxTokens) {
        // 按比例截断（ASCII 4 字符 ≈ 1 token，中文 1 字 ≈ 1.5 token，取保守 3 字符/token）
        const keepChars = Math.floor(maxTokens * 3 * 0.8);
        return {
          ...result,
          error: result.error.slice(0, keepChars) + "\n...[错误信息已截断]",
        };
      }
    }
    return result;
  }

  // 成功结果：序列化 data
  const dataStr = JSON.stringify(result.data ?? null);
  const dataTokens = estimateTokens(dataStr);
  if (dataTokens <= maxTokens) {
    return result;
  }

  // 超限截断：保留头部 60% + 尾部 40%，中间用省略号标记
  const keepChars = Math.floor(maxTokens * 3 * 0.8); // token 转 char 近似（保守）
  const headChars = Math.floor(keepChars * 0.6);
  const tailChars = keepChars - headChars;
  const truncated =
    dataStr.slice(0, headChars) +
    "\n...[内容已截断，原始约 " + dataTokens + " token]...\n" +
    dataStr.slice(-tailChars);

  return {
    ...result,
    data: { _truncated: true, preview: truncated, originalTokens: dataTokens },
  };
}
