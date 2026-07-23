import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let mockProcessInstance: {
  killed: boolean;
  pid: number;
  kill: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  stdout: { on: ReturnType<typeof vi.fn> };
  stderr: { on: ReturnType<typeof vi.fn> };
  _emit: (event: string, ...args: unknown[]) => void;
} | null = null;

function createMockProcess() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const proc = {
    killed: false,
    pid: 12345,
    kill: vi.fn((signal?: string) => {
      proc.killed = true;
      const cbs = listeners["exit"] || [];
      for (const cb of cbs) cb(signal === "SIGKILL" ? null : 0, signal);
    }),
    send: vi.fn(),
    once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    _emit: (event: string, ...args: unknown[]) => {
      const cbs = listeners[event] || [];
      for (const cb of cbs) cb(...args);
    },
  };
  return proc;
}

vi.mock("child_process", () => ({
  fork: vi.fn(() => {
    mockProcessInstance = createMockProcess();
    return mockProcessInstance;
  }),
}));

vi.mock("../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { PluginProcessManager } from "../plugin-process-manager";

function proc() {
  return mockProcessInstance!;
}

function getLastSentMsg(): Record<string, unknown> {
  const calls = proc().send.mock.calls;
  return calls[calls.length - 1]![0] as Record<string, unknown>;
}

function respond(msg: {
  type: string;
  id: string;
  value?: unknown;
  message?: string;
  pluginId?: string;
  pluginDisplayName?: string;
  metadata?: Record<string, unknown>;
}): void {
  proc()._emit("message", msg);
}

describe("PluginProcessManager", () => {
  let manager: PluginProcessManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mockProcessInstance = null;
    manager = new PluginProcessManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function loadPlugin(filePath = "/path/to/plugin.js"): Promise<void> {
    const p = manager.load(filePath);
    const sent = getLastSentMsg();
    respond({
      type: "loaded",
      id: sent.id as string,
      pluginId: "test-plugin",
      pluginDisplayName: "Test Plugin",
      metadata: { videoCapabilities: {}, imageCapabilities: {}, availableModels: [] },
    });
    await p;
  }

  describe("load()", () => {
    it("should fork with resource limits and send load message", async () => {
      const p = manager.load("/path/to/plugin.js");

      const { fork } = await import("child_process");
      expect(fork).toHaveBeenCalledWith(
        expect.stringContaining("plugin-worker.js"),
        [],
        expect.objectContaining({
          execArgv: expect.arrayContaining(["--max-old-space-size=64", "--max-semi-space-size=16"]),
        }),
      );

      const sent = getLastSentMsg();
      expect(sent.type).toBe("load");
      expect(sent.filePath).toBe("/path/to/plugin.js");

      respond({ type: "loaded", id: sent.id as string, pluginId: "tp", pluginDisplayName: "TP", metadata: {} });
      const result = await p;
      expect(result.pluginId).toBe("tp");
    });

    it("should throw if worker returns error", async () => {
      const p = manager.load("/bad/plugin.js");
      const sent = getLastSentMsg();
      respond({ type: "error", id: sent.id as string, message: "加载失败" });
      await expect(p).rejects.toThrow("加载失败");
    });

    it("should throw if crash count exceeds limit within window", async () => {
      vi.setSystemTime(Date.now());
      for (let i = 0; i < 3; i++) {
        await loadPlugin();
        proc()._emit("exit", 1, null);
      }
      await expect(manager.load("/path/to/plugin.js")).rejects.toThrow(/PLUGIN_CRASH_LOOP_DISABLED.*3.*times/);
    });

    it("should allow load after crash window expires", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      for (let i = 0; i < 3; i++) {
        await loadPlugin();
        proc()._emit("exit", 1, null);
      }
      vi.setSystemTime(now + 61_000);
      const p = manager.load("/path/to/plugin.js");
      const sent = getLastSentMsg();
      respond({ type: "loaded", id: sent.id as string, pluginId: "c", pluginDisplayName: "C", metadata: {} });
      const result = await p;
      expect(result.pluginId).toBe("c");
    });
  });

  describe("call()", () => {
    it("should send call message and resolve with result", async () => {
      await loadPlugin();
      const p = manager.call("buildVideoRequest", [{ prompt: "test" }]);
      const msg = getLastSentMsg();
      expect(msg.type).toBe("call");
      expect(msg.method).toBe("buildVideoRequest");
      respond({ type: "result", id: msg.id as string, value: { body: {}, endpoint: "/api" } });
      expect(await p).toEqual({ body: {}, endpoint: "/api" });
    });

    it("should throw if process is not alive", async () => {
      await expect(manager.call("method", [])).rejects.toThrow("PLUGIN_NOT_RUNNING");
    });

    it("should reject on worker error response", async () => {
      await loadPlugin();
      const p = manager.call("badMethod", []);
      const msg = getLastSentMsg();
      respond({ type: "error", id: msg.id as string, message: "方法不存在" });
      await expect(p).rejects.toThrow("方法不存在");
    });

    it("should timeout if worker does not respond", async () => {
      await loadPlugin();
      const p = manager.call("slowMethod", []);
      vi.advanceTimersByTime(10_001);
      await expect(p).rejects.toThrow(/调用超时/);
    });
  });

  describe("healthCheck()", () => {
    it("should return true on pong", async () => {
      await loadPlugin();
      const p = manager.healthCheck();
      const msg = getLastSentMsg();
      expect(msg.type).toBe("ping");
      respond({ type: "pong", id: msg.id as string });
      await expect(p).resolves.toBe(true);
    });

    it("should return false if process is not alive", async () => {
      await expect(manager.healthCheck()).resolves.toBe(false);
    });
  });

  describe("setConfig()", () => {
    it("should send setConfig message to worker", async () => {
      await loadPlugin();
      const p = manager.setConfig({ apiKey: "sk-test-123" });
      const msg = getLastSentMsg();
      expect(msg.type).toBe("setConfig");
      expect(msg.config).toEqual({ apiKey: "sk-test-123" });
      respond({ type: "result", id: msg.id as string, value: true });
      await p;
    });

    it("should do nothing if process is not alive", async () => {
      await expect(manager.setConfig({ apiKey: "key" })).resolves.toBeUndefined();
    });
  });

  describe("shutdown()", () => {
    it("should send shutdown and wait for exit", async () => {
      await loadPlugin();
      const p = manager.shutdown();
      const msg = getLastSentMsg();
      expect(msg.type).toBe("shutdown");
      proc()._emit("exit", 0, null);
      await p;
      expect(manager.alive).toBe(false);
    });

    it("should force kill after 3s timeout", async () => {
      await loadPlugin();
      const p = manager.shutdown();
      vi.advanceTimersByTime(3001);
      await p;
      expect(proc().kill).toHaveBeenCalledWith("SIGKILL");
    });
  });

  describe("restart()", () => {
    it("should shutdown and reload the same file", async () => {
      await loadPlugin();
      const p = manager.restart();
      const shutdownMsg = getLastSentMsg();
      expect(shutdownMsg.type).toBe("shutdown");
      proc()._emit("exit", 0, null);
      await vi.advanceTimersByTimeAsync(0);
      const loadMsg = getLastSentMsg();
      expect(loadMsg.type).toBe("load");
      expect(loadMsg.filePath).toBe("/path/to/plugin.js");
      respond({ type: "loaded", id: loadMsg.id as string, pluginId: "p", pluginDisplayName: "P", metadata: {} });
      await p;
    });

    it("should throw if never loaded", async () => {
      await expect(manager.restart()).rejects.toThrow("PLUGIN_NOT_LOADED_CANNOT_RESTART");
    });

    it("should throw MANAGER_SHUT_DOWN_DURING_RESTART_BACKOFF if shutdown is called during backoff", async () => {
      await loadPlugin();
      // 触发 crash 使 recentCrashes 非空，restart 时会产生退避延迟
      proc()._emit("exit", 1, null);

      const p = manager.restart();
      // 立即附加 catch 防止定时器回调中的 rejection 成为 unhandled rejection
      p.catch(() => {});
      // restart 内部的 shutdown() 立即完成（process 已为 null），进入退避延迟
      await vi.advanceTimersByTimeAsync(0);

      // 在退避延迟期间调用 shutdown（模拟 shutdownAllProcessManagers）
      await manager.shutdown().catch(() => {});

      // 快进退避延迟（1s 基础延迟）
      await vi.advanceTimersByTimeAsync(2000);

      await expect(p).rejects.toThrow("MANAGER_SHUT_DOWN_DURING_RESTART_BACKOFF");
    });
  });

  describe("getMetrics()", () => {
    it("should track call metrics", async () => {
      await loadPlugin();
      const p = manager.call("method", []);
      const msg = getLastSentMsg();
      respond({ type: "result", id: msg.id as string, value: "ok" });
      await p;
      const m = manager.getMetrics();
      expect(m.totalCalls).toBe(1);
      expect(m.failedCalls).toBe(0);
      expect(m.pluginId).toBe("test-plugin");
      expect(m.alive).toBe(true);
      expect(m.ready).toBe(true);
    });

    it("should track failed calls", async () => {
      await loadPlugin();
      const p = manager.call("badMethod", []);
      const msg = getLastSentMsg();
      respond({ type: "error", id: msg.id as string, message: "fail" });
      try { await p; } catch {}
      expect(manager.getMetrics().failedCalls).toBe(1);
    });

    it("should track timed out calls", async () => {
      await loadPlugin();
      const p = manager.call("slowMethod", []);
      vi.advanceTimersByTime(10_001);
      try { await p; } catch {}
      expect(manager.getMetrics().timedOutCalls).toBe(1);
    });
  });

  describe("process death callback", () => {
    it("should call onProcessDeath on unexpected exit", async () => {
      const cb = vi.fn();
      manager.setOnProcessDeath(cb);
      await loadPlugin();
      proc()._emit("exit", 1, null);
      expect(cb).toHaveBeenCalledWith(manager);
    });

    it("should NOT call onProcessDeath during graceful shutdown", async () => {
      const cb = vi.fn();
      manager.setOnProcessDeath(cb);
      await loadPlugin();
      const p = manager.shutdown();
      proc()._emit("exit", 0, null);
      await p;
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe("rejectAllPending on process exit", () => {
    it("should reject all pending calls when process exits", async () => {
      await loadPlugin();
      const p = manager.call("method", []);
      proc()._emit("exit", 1, "SIGSEGV");
      await expect(p).rejects.toThrow(/插件进程退出/);
    });
  });
});
