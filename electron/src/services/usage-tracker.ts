/**
 * usage-tracker.ts — 用量记录缓冲追踪器（cost-tracking P0）
 *
 * 设计来源：docs/DESIGN-COST-TRACKING.md（v0.2）
 * 职责：主进程 api-gateway 采集点的统一入口——内存环形缓冲(1000) + 定时批写 + 静默降级。
 * 失败语义（R195）：record/flush 绝不 throw；缓冲满丢弃最旧 + warn；写库失败由 repository 内部消化。
 */
import { getLogger } from "../logging/logger";
import { insertUsageBatch, type UsageRecordInput } from "../database/usage-repository";

const logger = getLogger("usage-tracker");

const MAX_BUFFER = 1000;
const FLUSH_INTERVAL_MS = 5000;

class UsageTracker {
  private buffer: UsageRecordInput[] = [];
  private timer: NodeJS.Timeout | null = null;

  /** 入缓冲（绝不 throw） */
  record(input: UsageRecordInput): void {
    try {
      if (this.buffer.length >= MAX_BUFFER) {
        // 满则丢弃最旧（保新弃旧），R195 语义：观测性增强，不允许影响主流程
        this.buffer.shift();
        logger.warn("usage buffer full, dropping oldest record");
      }
      this.buffer.push(input);
      this.scheduleFlush();
    } catch (e) {
      logger.warn(`usage record failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** 立即批写（测试/关闭时调用）；返回成功条数 */
  flush(): number {
    const batch = this.buffer.splice(0);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (batch.length === 0) return 0;
    try {
      return insertUsageBatch(batch);
    } catch (e) {
      logger.warn(`usage flush failed: ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    }
  }

  /** 停止定时器（应用退出/测试清理） */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  get pendingCount(): number {
    return this.buffer.length;
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, FLUSH_INTERVAL_MS);
    // 不阻止进程退出
    if (typeof this.timer.unref === "function") this.timer.unref();
  }
}

/** 全局单例（主进程生命周期内） */
export const usageTracker = new UsageTracker();
