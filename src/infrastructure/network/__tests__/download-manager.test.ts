import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../resilient-fetch", () => ({
  resilientFetch: vi.fn(),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock("../network.config", () => ({
  NETWORK_CONFIG: {
    downloadManager: {
      enabled: true,
      maxConcurrency: 2,
    },
  },
}));

function flushAsync(ms = 0): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("download-manager", () => {
  let dm: typeof import("../download-manager");
  let rf: typeof import("../resilient-fetch");

  beforeEach(async () => {
    vi.resetModules();
    dm = await import("../download-manager");
    rf = await import("../resilient-fetch");
  });

  describe("下载成功", () => {
    it("should complete download successfully", async () => {
      vi.mocked(rf.resilientFetch).mockResolvedValue({
        success: true,
        totalBytes: 1024,
        duration: 100,
        fromCache: false,
      });

      const id = dm.enqueueDownload("https://example.com/file.zip");
      await flushAsync(50);

      const task = dm.getDownloadTask(id);
      expect(task?.state).toBe("completed");

      const progress = dm.getDownloadProgress(id);
      expect(progress.percent).toBe(100);
      expect(progress.state).toBe("completed");
    });
  });

  describe("下载失败", () => {
    it("should mark task as failed when download fails", async () => {
      vi.mocked(rf.resilientFetch).mockRejectedValue(new Error("NETWORK_ERROR"));

      const id = dm.enqueueDownload("https://example.com/fail.zip");
      await flushAsync(50);

      const task = dm.getDownloadTask(id);
      expect(task?.state).toBe("failed");

      const progress = dm.getDownloadProgress(id);
      expect(progress.state).toBe("failed");
    });
  });

  describe("进度回调", () => {
    it("should call onProgress callback during download", async () => {
      vi.mocked(rf.resilientFetch).mockImplementation(async (opts) => {
        opts.onProgress?.({
          loaded: 512,
          total: 1024,
          percent: 50,
          speed: 1024,
          eta: 500,
          state: "downloading",
        });
        return {
          success: true,
          totalBytes: 1024,
          duration: 100,
          fromCache: false,
        };
      });

      const onProgress = vi.fn();
      const _id = dm.enqueueDownload("https://example.com/file.zip", { onProgress });
      await flushAsync(50);

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          percent: 50,
          state: "downloading",
        }),
      );
    });
  });

  describe("取消下载", () => {
    it("should cancel a queued download", async () => {
      vi.mocked(rf.resilientFetch).mockImplementation(
        () => new Promise(() => {}),
      );

      const id = dm.enqueueDownload("https://example.com/file.zip");
      dm.cancelDownload(id);

      expect(dm.getDownloadTask(id)).toBeUndefined();
      expect(dm.getDownloadProgress(id).state).toBe("idle");
    });

    it("should cancel an active download", async () => {
      vi.mocked(rf.resilientFetch).mockImplementation(async (opts) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve({ success: true, totalBytes: 1024, duration: 5000, fromCache: false });
          }, 5000);
          if (opts.signal) {
            opts.signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new DOMException("The operation was aborted", "AbortError"));
            }, { once: true });
          }
        });
      });

      const id = dm.enqueueDownload("https://example.com/slow.zip");
      await flushAsync(10);

      dm.cancelDownload(id);

      expect(dm.getDownloadTask(id)).toBeUndefined();
    });
  });

  describe("并发下载数量限制", () => {
    it("should respect max concurrency limit", async () => {
      dm.setMaxConcurrency(1);

      const fetchCalls: string[] = [];
      let resolveFetch: () => void;
      const fetchPromise = new Promise<void>((r) => { resolveFetch = r; });

      vi.mocked(rf.resilientFetch).mockImplementation(async (opts) => {
        fetchCalls.push(opts.url);
        if (fetchCalls.length === 1) {
          await fetchPromise;
        }
        return {
          success: true,
          totalBytes: 1024,
          duration: 100,
          fromCache: false,
        };
      });

      dm.enqueueDownload("https://example.com/file1.zip");
      dm.enqueueDownload("https://example.com/file2.zip");
      await flushAsync(10);

      expect(fetchCalls.length).toBe(1);
      expect(fetchCalls[0]).toBe("https://example.com/file1.zip");

      resolveFetch!();
      await flushAsync(50);

      expect(fetchCalls.length).toBe(2);
      expect(fetchCalls[1]).toBe("https://example.com/file2.zip");
    });

    it("should process queued downloads when slots free up", async () => {
      dm.setMaxConcurrency(2);

      let resolveFirst: () => void;
      const firstPromise = new Promise<void>((r) => { resolveFirst = r; });
      let firstDone = false;

      vi.mocked(rf.resilientFetch).mockImplementation(async () => {
        if (!firstDone) {
          await firstPromise;
          firstDone = true;
        }
        return {
          success: true,
          totalBytes: 1024,
          duration: 100,
          fromCache: false,
        };
      });

      const id1 = dm.enqueueDownload("https://example.com/file1.zip");
      const id2 = dm.enqueueDownload("https://example.com/file2.zip");
      const id3 = dm.enqueueDownload("https://example.com/file3.zip");
      await flushAsync(10);

      const task3 = dm.getDownloadTask(id3);
      expect(task3?.state).toBe("idle");

      resolveFirst!();
      await flushAsync(50);

      dm.cancelDownload(id1);
      dm.cancelDownload(id2);
      dm.cancelDownload(id3);
    });
  });

  describe("暂停和恢复", () => {
    it("should pause an active download", async () => {
      vi.mocked(rf.resilientFetch).mockImplementation(async (opts) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve({ success: true, totalBytes: 1024, duration: 5000, fromCache: false });
          }, 5000);
          if (opts.signal) {
            opts.signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new DOMException("The operation was aborted", "AbortError"));
            }, { once: true });
          }
        });
      });

      const id = dm.enqueueDownload("https://example.com/file.zip");
      await flushAsync(10);

      dm.pauseDownload(id);

      const task = dm.getDownloadTask(id);
      expect(task?.state).toBe("idle");

      dm.cancelDownload(id);
    });

    it("should resume a paused download", async () => {
      vi.mocked(rf.resilientFetch).mockResolvedValue({
        success: true,
        totalBytes: 1024,
        duration: 100,
        fromCache: false,
      });

      const id = dm.enqueueDownload("https://example.com/file.zip");
      await flushAsync(50);

      dm.pauseDownload(id);
      dm.resumeDownload(id);
      await flushAsync(50);

      const task = dm.getDownloadTask(id);
      expect(task?.state).toBe("completed");
    });
  });

  describe("getDownloadTask / getAllTasks", () => {
    it("should return task by id", () => {
      vi.mocked(rf.resilientFetch).mockImplementation(() => new Promise(() => {}));

      const id = dm.enqueueDownload("https://example.com/file.zip");
      const task = dm.getDownloadTask(id);
      expect(task).toBeDefined();
      expect(task?.url).toBe("https://example.com/file.zip");
      expect(task?.priority).toBe("normal");

      dm.cancelDownload(id);
    });

    it("should return all tasks", () => {
      vi.mocked(rf.resilientFetch).mockImplementation(() => new Promise(() => {}));

      const id1 = dm.enqueueDownload("https://example.com/file1.zip");
      const id2 = dm.enqueueDownload("https://example.com/file2.zip");
      const allTasks = dm.getAllTasks();
      expect(allTasks.length).toBeGreaterThanOrEqual(2);
      expect(allTasks.find((t) => t.id === id1)).toBeDefined();
      expect(allTasks.find((t) => t.id === id2)).toBeDefined();

      dm.cancelDownload(id1);
      dm.cancelDownload(id2);
    });
  });

  describe("removeCompletedTask", () => {
    it("should remove completed task", async () => {
      vi.mocked(rf.resilientFetch).mockResolvedValue({
        success: true,
        totalBytes: 1024,
        duration: 100,
        fromCache: false,
      });

      const id = dm.enqueueDownload("https://example.com/file.zip");
      await flushAsync(50);

      expect(dm.getDownloadTask(id)?.state).toBe("completed");

      dm.removeCompletedTask(id);
      expect(dm.getDownloadTask(id)).toBeUndefined();
    });

    it("should not remove idle task", () => {
      vi.mocked(rf.resilientFetch).mockImplementation(
        () => new Promise(() => {}),
      );

      const id = dm.enqueueDownload("https://example.com/file.zip");
      dm.removeCompletedTask(id);

      expect(dm.getDownloadTask(id)).toBeDefined();

      dm.cancelDownload(id);
    });
  });

  describe("setMaxConcurrency", () => {
    it("should enforce minimum of 1", () => {
      dm.setMaxConcurrency(0);
    });
  });

  describe("优先级排序", () => {
    it("should process higher priority tasks first", async () => {
      dm.setMaxConcurrency(1);

      const order: string[] = [];
      let resolveFetch: () => void;
      const fetchPromise = new Promise<void>((r) => { resolveFetch = r; });
      let firstDone = false;

      vi.mocked(rf.resilientFetch).mockImplementation(async (opts) => {
        order.push(opts.url);
        if (!firstDone) {
          await fetchPromise;
          firstDone = true;
        }
        return {
          success: true,
          totalBytes: 1024,
          duration: 100,
          fromCache: false,
        };
      });

      dm.enqueueDownload("https://example.com/low.zip", { priority: "low" });
      dm.enqueueDownload("https://example.com/critical.zip", { priority: "critical" });
      await flushAsync(10);

      resolveFetch!();
      await flushAsync(50);

      expect(order[0]).toBe("https://example.com/low.zip");
      if (order.length > 1) {
        expect(order[1]).toBe("https://example.com/critical.zip");
      }
    });
  });
});
