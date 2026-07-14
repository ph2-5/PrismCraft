/**
 * 工具超时预设
 *
 * 阶段3-1：TOOL_TIMEOUTS 已迁移至 @/shared/constants/tool-timeouts，
 * 此处 re-export 保持向后兼容（services/hooks 中的现有 import 不破坏）。
 * 工具文件（tools/）应直接从 @/shared/constants/tool-timeouts import。
 */
export { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
