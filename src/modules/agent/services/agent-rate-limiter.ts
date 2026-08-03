/**
 * 工具调用频率限制（滑动窗口）（从 AgentLoop.enforceRateLimit / recordToolCallTimestamps 提取，P2.1）。
 *
 * 独立逻辑：
 * - 维护最近 60 秒内的工具调用时间戳（滑动窗口）
 * - 本轮即将执行的调用数 + 窗口内已调用数 超过上限时，等待至最早时间戳滑出窗口
 * - 等待期间支持 AbortSignal 中断（不阻塞取消）
 *
 * 提取原因：降低 agent-loop.ts 行数，且该逻辑自包含、可独立测试。
 */

const WINDOW_MS = 60_000;

export interface RateLimiterWaitOptions {
  maxPerMinute: number;
  /** 等待开始时的 UI 提示回调（可选） */
  onWaiting?: (seconds: number) => void;
  /** 取消信号（等待期间监听 abort，立即返回） */
  signal?: AbortSignal;
}

export class AgentRateLimiter {
  private timestamps: number[] = [];

  /** 记录本轮执行的工具调用时间戳 */
  record(count: number): void {
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      this.timestamps.push(now);
    }
  }

  /**
   * 频率限制检查。若最近 60 秒内调用次数已达上限，异步等待至窗口外。
   *
   * @param pendingCount 本轮即将执行的工具调用数量
   */
  async enforce(pendingCount: number, opts: RateLimiterWaitOptions): Promise<void> {
    const { maxPerMinute, onWaiting, signal } = opts;
    if (maxPerMinute <= 0 || pendingCount === 0) return;

    const now = Date.now();
    this.prune(now);

    if (this.timestamps.length + pendingCount > maxPerMinute) {
      // 需要等待：计算最早时间戳 + 60s 的时间点
      const oldestInWindow = this.timestamps[0] ?? now;
      const waitUntil = oldestInWindow + WINDOW_MS;
      const waitMs = waitUntil - now;
      if (waitMs > 0) {
        onWaiting?.(Math.ceil(waitMs / 1000));
        await this.wait(waitMs, signal);
      }
      // 等待后重新清理时间戳
      this.prune(Date.now());
    }
  }

  /** 清理 60 秒前的时间戳 */
  private prune(now: number): void {
    this.timestamps = this.timestamps.filter((ts) => now - ts < WINDOW_MS);
  }

  /** 等待指定毫秒（支持 AbortSignal 中断） */
  private wait(waitMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, waitMs);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
