/**
 * Few-Shot 缓存类型定义（domain 层，零外部依赖）
 *
 * 从 tool-fewshot-cache.ts 提取到 domain 层，使 tool-fewshot-cache 和
 * builtin-fewshot-examples 都从 domain 导入类型，消除循环依赖。
 */

/** 单条 few-shot 缓存条目 */
export interface FewShotEntry {
  /** 工具名 */
  toolName: string;
  /** 用户查询摘要（截断到 100 字符） */
  userQuery: string;
  /** 工具参数摘要（JSON 截断到 200 字符） */
  argsSummary: string;
  /** 工具结果摘要（JSON 截断到 300 字符） */
  resultSummary: string;
  /** 记录时间戳（ms） */
  timestamp: number;
}
