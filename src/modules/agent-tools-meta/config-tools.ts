/**
 * 配置管理工具（Config Tools）— Barrel 入口
 *
 * 原始实现已按读写职责拆分为 2 个独立文件：
 * - config-query-tools.ts：查询类工具（读操作，7 个）
 *   - get_api_config / check_api_health / list_providers
 *   - list_video_models / get_model_parameters（Task 4.1/4.2）
 *   - test_connection / validate_api_key（仅探测，无写入）
 * - config-write-tools.ts：配置类工具（写操作，1 个）
 *   - configure_api_provider（含 vendor 预设派生逻辑 + _resetVendorPresetsCache）
 *
 * 本文件仅作为聚合 barrel，保持原导出签名不变（向后兼容）：
 * - 各工具对象命名导出
 * - `_resetVendorPresetsCache` 测试辅助函数导出
 * - `configTools` 数组聚合导出（合并 query + write，保持原顺序）
 *
 * 设计要点见各工具文件头部注释。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

// 查询类工具（读操作）
export {
  getApiConfigTool,
  checkApiHealthTool,
  listProvidersTool,
  listVideoModelsTool,
  getModelParametersTool,
  testConnectionTool,
  validateApiKeyTool,
  configQueryTools,
} from "./config-query-tools";

// 配置类工具（写操作）
export {
  configureApiProviderTool,
  _resetVendorPresetsCache,
  configWriteTools,
} from "./config-write-tools";

import { configQueryTools } from "./config-query-tools";
import { configWriteTools } from "./config-write-tools";

/** 导出所有配置工具（保持原顺序：query 在前，write 在后） */
export const configTools: ToolImpl[] = [
  ...configQueryTools,
  ...configWriteTools,
];
