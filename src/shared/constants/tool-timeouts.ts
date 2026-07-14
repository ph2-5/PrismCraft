/**
 * 工具超时预设（按业务域）
 *
 * 阶段3-1：从 @/modules/agent/domain/constants.ts 提取，供 tools 子域拆分后独立引用。
 * 工具文件应从此处 import，避免对 @/modules/agent 的依赖。
 */
export const TOOL_TIMEOUTS = {
  /** 查询类：30 秒 */
  query: 30_000,
  /** 创建/更新类：60 秒 */
  mutation: 60_000,
  /** AI 生成类：5 分钟 */
  generation: 5 * 60_000,
  /** 视频任务类：30 分钟 */
  videoTask: 30 * 60_000,
  /** 网络下载类：10 分钟 */
  download: 10 * 60_000,
} as const;
