/**
 * 记忆服务共享常量与写串行化锁（Memory Service Shared）
 *
 * 从 memory-service.ts 拆分而来，包含被多个子模块共用的部分：
 * - MAX_ARCHIVAL_ENTRIES：归档记忆容量上限（memory-archival / memory-seed 共用）
 * - WRITE_OP_TIMEOUT_MS + withWriteTimeout：写操作超时保护（memory-core / memory-archival 共用）
 * - enqueueArchivalWrite：read-modify-write 串行化锁（P1-2 修复）
 *
 * 设计要点：
 * - archivalWriteChain 是全局唯一的写串行化链，所有写操作（核心记忆与归档记忆）
 *   共用一条链，防止并发调用时后写入覆盖先写入的数据。
 * - ESM 中 import 绑定只读，不能跨文件给导出的 let 变量重新赋值，
 *   因此通过 enqueueArchivalWrite 函数封装链的读写，保持闭包一致。
 */

/** 归档记忆最大条数 */
export const MAX_ARCHIVAL_ENTRIES = 200;

/**
 * 为 archivalWriteChain 上的 read-modify-write 操作添加超时保护。
 * 防止单次操作卡住（如 file-http 永久阻塞）导致整条串行链死锁。
 */
export const WRITE_OP_TIMEOUT_MS = 10000;

/**
 * P1-2 修复：addArchivalMemory 等写操作串行化锁
 *
 * 原问题：addArchivalMemory 是 read-modify-write 模式（getAllArchivalMemory → push → save），
 * 并发调用时后写入会覆盖先写入的数据。
 * 修复：用 promise 链串行化所有写操作。
 */
let archivalWriteChain: Promise<unknown> = Promise.resolve();

/** 为串行化链上的 read-modify-write 操作添加超时保护。 */
export function withWriteTimeout<T>(op: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("[memory-service] archival write operation timed out"));
    }, WRITE_OP_TIMEOUT_MS);
    op().then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * 在串行化链上执行写操作（read-modify-write 排队），并更新链头使后续调用排队。
 *
 * @param op 写操作
 * @param options.timeout 是否带超时保护，默认 true；
 *                        deleteArchivalMemory 传 false 保持其原有行为（无超时）
 */
export function enqueueArchivalWrite<T>(
  op: () => Promise<T>,
  options: { timeout?: boolean } = {},
): Promise<T> {
  const wrapped = options.timeout === false ? op : () => withWriteTimeout(op);
  const result = archivalWriteChain.then(wrapped);
  // 更新链头，使后续调用排队
  archivalWriteChain = result.then(() => undefined).catch(() => undefined);
  return result;
}
