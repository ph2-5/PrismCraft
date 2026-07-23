/**
 * sleep - 延迟工具函数
 *
 * 返回一个在指定毫秒数后 resolve 的 Promise，用于在 async 函数中暂停执行。
 * 替代各模块中重复的 `new Promise((r) => setTimeout(r, ms))` 模式。
 *
 * 纯函数，零外部依赖（符合 shared-logic 层规则）。
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
