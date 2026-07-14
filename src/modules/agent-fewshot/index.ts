/**
 * agent-fewshot 模块 barrel
 *
 * 提供 Agent 工具调用的 few-shot 缓存服务：
 * - 内置示例：预训练数据，覆盖典型场景（开箱即用）
 * - 运行时缓存：从用户历史成功调用中学习
 * - 检索 + 提示构建：合并内置 + 运行时示例，注入到 system prompt
 *
 * 唯一外部消费者：@/modules/agent/services/agent-loop.ts
 */

// 类型
export type { FewShotEntry } from "./domain/types";

// 运行时缓存服务
export {
  recordFewShot,
  getFewShots,
  getRelevantFewShots,
  buildFewShotPrompt,
  clearFewShotCache,
  getFewShotStats,
} from "./services/tool-fewshot-cache";

// 内置示例库
export {
  BUILTIN_FEWSHOT_EXAMPLES,
  getBuiltinFewShotExamples,
  getBuiltinFewShotsByTool,
  getRelevantBuiltinFewShots,
  getBuiltinFewShotStats,
} from "./services/builtin-fewshot-examples";
