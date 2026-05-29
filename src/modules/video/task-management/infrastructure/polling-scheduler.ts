import { errorLogger } from "@/shared/error-logger";

const BASE_INTERVAL_MS = 5000;
const MAX_INTERVAL_MS = 60000;
const BACKOFF_FACTOR = 1.5;

interface PollEntry {
  timerId: ReturnType<typeof setTimeout>;
  currentInterval: number;
  failCount: number;
}

export class PollingScheduler {
  private entries = new Map<string, PollEntry>();
  private onPoll: (taskId: string) => Promise<void>;

  constructor(onPoll: (taskId: string) => Promise<void>) {
    this.onPoll = onPoll;
  }

  start(taskId: string): void {
    if (this.entries.has(taskId)) return;
    this.scheduleNext(taskId, BASE_INTERVAL_MS, 0);
  }

  stop(taskId: string): void {
    const entry = this.entries.get(taskId);
    if (entry) {
      clearTimeout(entry.timerId);
      this.entries.delete(taskId);
    }
  }

  stopAll(): void {
    for (const [taskId] of this.entries) {
      this.stop(taskId);
    }
  }

  isActive(taskId: string): boolean {
    return this.entries.has(taskId);
  }

  getActiveCount(): number {
    return this.entries.size;
  }

  reportSuccess(taskId: string): void {
    const entry = this.entries.get(taskId);
    if (entry) {
      entry.failCount = 0;
      entry.currentInterval = BASE_INTERVAL_MS;
    }
  }

  reportFailure(taskId: string): void {
    const entry = this.entries.get(taskId);
    if (entry) {
      entry.failCount++;
      entry.currentInterval = Math.min(
        entry.currentInterval * BACKOFF_FACTOR,
        MAX_INTERVAL_MS,
      );
    }
  }

  private scheduleNext(taskId: string, intervalMs: number, failCount: number): void {
    const timerId = setTimeout(async () => {
      try {
        await this.onPoll(taskId);
      } catch {
        errorLogger.warn(
          { code: "POLL_EXECUTION_ERROR", message: `Poll execution failed for taskId=${taskId}` },
          "PollingScheduler",
        );
        this.reportFailure(taskId);
      }
    }, intervalMs);

    this.entries.set(taskId, { timerId, currentInterval: intervalMs, failCount });
  }
}
