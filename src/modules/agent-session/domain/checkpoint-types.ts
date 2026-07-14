/**
 * P5 断点恢复 - 检查点类型定义
 *
 * 设计原则：
 * - 纯类型定义，无运行时依赖（domain 层）
 * - 检查点信息附加在 AgentSession.checkpoint 字段，与会话一同持久化
 * - 单独维护运行中会话的索引（agent.checkpoints.index），便于启动时快速检测中断
 *
 * 恢复策略：
 * - 应用启动时遍历 checkpoints.index，将所有 status=running 的会话标记为 interrupted
 * - 用户可选择加载中断的会话，查看历史后重新发送消息继续
 * - 不自动续接 LLM 推理（流式推理无法从中间恢复，只能重新发起）
 */

/** 检查点状态 */
export type CheckpointStatus = "running" | "interrupted" | "completed";

/** 会话检查点（记录 AgentLoop 运行时的关键状态） */
export interface SessionCheckpoint {
  /** 关联的会话 ID */
  sessionId: string;
  /** 当前状态 */
  status: CheckpointStatus;
  /** 触发本次运行的用户输入 */
  userInput: string;
  /** 当前迭代序号（0-based，表示已完成的迭代数） */
  iteration: number;
  /** 本次运行开始时间戳 */
  startedAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
  /** 已完成的工具调用数 */
  toolCallsCompleted: number;
  /** 已生成的工具调用总数 */
  toolCallsTotal: number;
}

/** 检查点索引项（轻量记录，用于启动时检测中断会话） */
export interface CheckpointIndexEntry {
  sessionId: string;
  status: CheckpointStatus;
  startedAt: number;
  updatedAt: number;
}

/** 创建初始检查点 */
export function createCheckpoint(
  sessionId: string,
  userInput: string,
): SessionCheckpoint {
  const now = Date.now();
  return {
    sessionId,
    status: "running",
    userInput,
    iteration: 0,
    startedAt: now,
    updatedAt: now,
    toolCallsCompleted: 0,
    toolCallsTotal: 0,
  };
}
