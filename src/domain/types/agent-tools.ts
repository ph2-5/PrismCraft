/**
 * Agent 工具相关领域类型
 *
 * 阶段3-1：从 @/modules/agent/domain/types.ts 提取，供 tools 子域拆分后独立引用。
 * 工具文件应从此处 import，避免对 @/modules/agent 的依赖。
 *
 * 设计原则：
 * - 所有类型自包含，仅依赖 @/domain/ports/ai-provider-port 的 ToolDef/ToolCall
 * - 与 Agent 会话类型（AgentMessage/AgentSession 等）分离，职责单一
 */

import type { ToolDef, ToolCall } from "@/domain/ports/ai-provider-port";

/** 工具执行结果 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** 执行耗时（ms） */
  duration?: number;
}

/** 工具业务域分类（用于按域过滤、权限控制） */
export type ToolDomain =
  | "asset"
  | "generation"
  | "story"
  | "video"
  | "shot"
  | "config"
  | "system"
  | "web"
  | "image-edit"
  | "video-post"
  | "audio"
  | "template"
  | "workflow"
  | "help"
  | "monitor"
  | "diagnostic"
  | "memory"
  | "project-io"
  | "file-management"
  | "plugin";

/**
 * 工具危险等级（用于权限分层控制）
 *
 * - safe：只读/无副作用操作，无需确认（如 list_characters、get_project_state）
 * - limited：有副作用但可恢复，可选确认（如 create_character、update_story）
 * - destructive：不可逆操作，必须确认（如 delete_file、import_project with replace）
 */
export type DangerLevel = "safe" | "limited" | "destructive";

/** 工具执行上下文 */
export interface ToolContext {
  /** 当前会话 ID */
  sessionId: string;
  /** 取消信号 */
  signal?: AbortSignal;
  /** 通知 UI 更新进度 */
  onProgress?: (message: string) => void;
  /** 当前会话的取消令牌（内部使用） */
  _cancelled?: boolean;
  /**
   * 危险工具确认回调（用于子 Agent 向上传播）。
   *
   * 由 AgentLoop 从 callbacks.onConfirmationRequired 注入，
   * delegate_to_specialist 工具将其传给 SubAgentRunner，
   * 使子 Agent 的危险操作也能弹出用户确认。
   */
  _confirmDangerous?: (toolCall: ToolCall) => Promise<boolean>;
}

/** 工具实现接口 */
export interface ToolImpl {
  /** 工具定义（传给 LLM 的 function schema） */
  def: ToolDef;
  /** 业务域 */
  domain: ToolDomain;
  /** 执行函数 */
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
  /** 是否需要用户确认（如删除操作）。destructive 级别工具自动视为 true */
  requiresConfirmation?: boolean;
  /** 危险等级（默认 safe） */
  dangerLevel?: DangerLevel;
  /** 工具超时（ms），未设置则使用默认值 */
  timeoutMs?: number;
}

/** 工具执行状态（用于 UI 展示） */
export type ToolExecutionStatus = "pending" | "running" | "done" | "error" | "cancelled";

/** 工具执行记录（UI 状态） */
export interface ToolExecution {
  /** 对应 ToolCall.id */
  id: string;
  toolCall: ToolCall;
  status: ToolExecutionStatus;
  result?: ToolResult;
  /** 进度消息 */
  progress?: string;
  /** 开始时间 */
  startedAt: number;
  /** 结束时间 */
  endedAt?: number;
}
