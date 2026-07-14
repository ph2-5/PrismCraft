/**
 * Agent 会话与检查点模块 - 公共 API
 *
 * 从 @/modules/agent 拆分而来（阶段2-b），职责：
 * - 会话持久化（保存/加载/列出/删除历史会话）
 * - P5 断点恢复（检查点初始化/更新/清除/中断检测）
 *
 * 依赖关系：
 * - 类型依赖 @/modules/agent（AgentSession，仅类型导入，编译时擦除）
 * - 运行时依赖 @/shared/file-http（文件读写 + 配置存储）
 * - agent barrel 从本模块 re-export 服务函数，保持向后兼容
 */

// 会话存储服务
export {
  saveSession,
  loadSession,
  listSessions,
  updateSessionIndex,
  deleteSession,
  persistSession,
} from "./services/session-storage";
export type { SessionListItem } from "./services/session-storage";

// 检查点服务
export {
  saveCheckpoint,
  initCheckpoint,
  clearCheckpoint,
  markInterrupted,
  markRunningAsInterrupted,
  listInterruptedSessions,
  listRunningSessions,
  getCheckpoint,
  loadInterruptedSession,
  _resetCheckpointIndex,
} from "./services/session-checkpoint";
export type {
  SessionCheckpoint,
  CheckpointIndexEntry,
  CheckpointStatus,
} from "./services/session-checkpoint";

// 检查点类型 + 工厂函数
export { createCheckpoint } from "./domain/checkpoint-types";
