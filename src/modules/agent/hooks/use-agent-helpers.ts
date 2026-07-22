/**
 * use-agent-helpers - 从 useAgent 抽取的纯函数和常量
 *
 * 职责：提供与 Agent 会话相关的纯函数工具集和常量定义，
 * 不依赖任何 React hooks。
 */

"use client";

import type { AgentSession } from "../domain/types";
import { createEmptySession } from "../domain/types";
import type { ToolCall } from "@/domain/ports/ai-provider-port";
import { type AgentPersona } from "../domain/prompts";
import {
  shouldExtract,
  extractFromConversation,
  applyExtractedMemory,
} from "@/modules/agent-memory";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { toolRegistry } from "../services/tool-registry";
import type { ModelSelection } from "@/domain/schemas";

/** 创建新会话（带 i18n 默认标题） */
export function createNewSession(): AgentSession {
  const session = createEmptySession();
  session.title = t("agent.newSession");
  return session;
}

/** Agent 设置（持久化到 localStorage） */
export interface AgentSettings {
  persona: AgentPersona;
  maxIterations: number;
  temperature: number;
  /** Agent 主 LLM 使用的文本模型（null=使用全局 mapping 的 text capability） */
  textModel?: ModelSelection | null;
}

export const DEFAULT_SETTINGS: AgentSettings = {
  persona: "default",
  maxIterations: 10,
  temperature: 0.7,
  textModel: null,
};

export const SETTINGS_KEY = "agent-settings";

/** 会话标题最大长度 */
const MAX_TITLE_LENGTH = 30;

/**
 * 根据第一条用户消息生成会话标题
 * - 截断到 30 字符
 * - 去除首尾空白和换行
 */
export function generateSessionTitle(session: AgentSession): string {
  const firstUserMsg = session.messages.find((m) => m.role === "user");
  if (!firstUserMsg || !firstUserMsg.content) {
    return t("agent.newSession");
  }
  const title = firstUserMsg.content
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
  return title || t("agent.newSession");
}

/**
 * 异步触发记忆抽取（不阻断 UI，失败静默）
 *
 * 触发条件：用户消息数达到阈值
 * 流程：LLM 抽取 → 合并到核心记忆 + 追加摘要到归档记忆
 */
export async function triggerMemoryExtraction(
  session: AgentSession,
  options?: { providerId?: string; modelId?: string },
): Promise<void> {
  try {
    if (!shouldExtract(session.messages)) return;
    const extracted = await extractFromConversation(session.messages, session.id, options);
    if (!extracted) return;
    await applyExtractedMemory(extracted, session.id);
  } catch (e) {
    // 记忆抽取失败不影响主流程，但记录日志便于排查
    errorLogger.warn("[Agent] 记忆抽取失败", e);
  }
}

/**
 * 根据 VIDEO_TASK_COMPLETED 事件载荷构建系统提示（注入下次 buildSystemPrompt）。
 *
 * 提取自 useAgent 内部 useEffect 订阅回调，便于单测与复用。
 */
export function buildVideoTaskCompletedHint(payload: unknown): string | undefined {
  try {
    const { taskId, videoUrl } = payload as { taskId: string; videoUrl?: string };
    const urlHint = videoUrl ? `，videoUrl=${videoUrl}` : "";
    return [
      "## 系统事件通知",
      "",
      `视频任务刚刚完成：taskId=\`${taskId}\`${urlHint}。`,
      "系统已自动执行一致性 QC 并将 QCReport 写入 StoryBeat.qcReport。",
      "",
      "响应建议：",
      `- 若用户询问视频质量或一致性，优先调用 \`check_video_consistency(taskId="${taskId}")\` 获取 cached QCReport`,
      "- 若 verdict=drift_critical，告知用户并询问是否触发 `dispatch_video_fallback`",
      "- 不要主动调用 QC 工具，除非用户明确询问",
    ].join("\n");
  } catch (e) {
    errorLogger.warn("[useAgent] VIDEO_TASK_COMPLETED 订阅处理失败", e);
    return undefined;
  }
}

/**
 * 构建危险工具确认对话框的描述文本（工具名/描述/危险等级/参数列表）。
 *
 * 提取自 useAgent.sendMessage 内的 onConfirmationRequired 回调。
 */
export function buildToolConfirmationDescription(toolCall: ToolCall): string {
  const toolName = toolCall.function.name;

  // P1-C：从 toolRegistry 获取工具描述和危险等级
  const toolImpl = toolRegistry.get(toolName);
  const toolDesc = toolImpl?.def.function.description ?? "";
  const dangerLevel = toolImpl?.dangerLevel ?? (toolImpl?.requiresConfirmation ? "destructive" : "safe");

  // 解析参数为 key-value 格式（字段化展示）
  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch {
    // 解析失败时用原始字符串
  }

  // 构建参数列表文本（key-value 格式）
  const argEntries = Object.entries(parsedArgs);
  let argsText: string;
  if (argEntries.length > 0) {
    argsText = argEntries.map(([key, val]) => {
      const valStr = typeof val === "string" ? val : JSON.stringify(val);
      const truncated = valStr.length > 100 ? valStr.slice(0, 100) + "…" : valStr;
      return `  ${key}: ${truncated}`;
    }).join("\n");
  } else {
    argsText = `  ${toolCall.function.arguments?.slice(0, 500) ?? "(无参数)"}`;
  }

  // 构建风险等级标签
  const dangerLabel = dangerLevel === "destructive"
    ? t("agent.dangerLevelDestructive")
    : dangerLevel === "limited"
      ? t("agent.dangerLevelLimited")
      : t("agent.dangerLevelSafe");

  // 构建描述：工具描述 + 风险等级 + 参数
  const descParts: string[] = [
    t("agent.confirmToolDescription"),
    "",
    `${t("agent.confirmToolName")}: ${toolName}`,
  ];
  if (toolDesc) {
    const descTrunc = toolDesc.length > 200 ? toolDesc.slice(0, 200) + "…" : toolDesc;
    descParts.push(`${t("agent.confirmToolDescLabel")}: ${descTrunc}`);
  }
  descParts.push(`${t("agent.confirmDangerLevel")}: ${dangerLabel}`);
  descParts.push(`${t("agent.confirmToolArgs")}:`);
  descParts.push(argsText);
  return descParts.join("\n");
}
