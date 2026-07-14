/**
 * Agent Specialist 模块 - 公共 API
 *
 * 设计要点：
 * - 通过 barrel 导出所有公共 API
 * - 内部实现细节不导出
 * - 其他模块通过 @/modules/agent-specialist 导入
 *
 * 本模块从 agent 模块拆分而来，包含 Specialist 注册表和类型定义。
 * Specialist 是针对特定领域优化的 Agent 配置预设（system prompt + 工具白名单）。
 */

// 注册表服务
export { specialistRegistry } from "./services/specialist-registry";
export { SpecialistRegistry } from "./services/specialist-registry";

// 领域类型与常量
export type { SpecialistAgent } from "./domain/specialist-types";
export { BUILTIN_SPECIALISTS } from "./domain/specialist-types";
