/**
 * 审计日志模块 - 公共 API
 *
 * 从 agent 模块拆分而来，提供 Agent 工具调用审计日志的记录、查询、清除和统计能力。
 *
 * 设计要点：
 * - 通过 barrel 导出所有公共 API
 * - 内部实现细节不导出
 * - 其他模块通过 @/modules/audit-log 导入
 */

export type { AuditEntry, AuditQueryFilter } from "./services/audit-storage";
export {
  recordAudit,
  queryAuditLogs,
  clearAuditLogs,
  clearAllAuditLogs,
  getAuditStats,
} from "./services/audit-storage";
