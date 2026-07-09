import { fork } from "child_process";
import type { ChildProcess } from "child_process";
import path from "path";
import { getLogger } from "../logging/logger";

const logger = getLogger("plugin-process-manager");

interface PendingCall {
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  startTime: number;
  method: string;
}

interface WorkerMessage {
  type: "load" | "call" | "ping" | "shutdown" | "setConfig";
  id: string;
  filePath?: string;
  method?: string;
  args?: unknown[];
  config?: { apiKey?: string; apiUrl?: string };
}

interface WorkerResponse {
  type: "loaded" | "result" | "error" | "log" | "pong";
  id: string;
  pluginId?: string;
  pluginDisplayName?: string;
  metadata?: Record<string, unknown>;
  value?: unknown;
  message?: string;
  level?: string;
}

export interface PluginLoadResult {
  pluginId: string;
  pluginDisplayName: string;
  metadata: Record<string, unknown>;
}

export interface ProcessMetrics {
  pluginId: string | null;
  alive: boolean;
  ready: boolean;
  totalCalls: number;
  failedCalls: number;
  timedOutCalls: number;
  avgCallDurationMs: number;
  lastCallAt: number | null;
  crashCount: number;
  uptimeMs: number;
  pid: number | undefined;
}

const MAX_CRASH_COUNT = 3;
const CRASH_WINDOW_MS = 60_000;
const CALL_TIMEOUT_MS = 10_000;
const SPAWN_TIMEOUT_MS = 15_000;
const MAX_OLD_GENERATION_SIZE_MB = 64;
const MAX_YOUNG_GENERATION_SIZE_MB = 16;
const HEALTH_CHECK_INTERVAL_MS = 30_000;
const RESTART_BASE_DELAY_MS = 1000;
const RESTART_MAX_DELAY_MS = 60_000;

export class PluginProcessManager {
  private process: ChildProcess | null = null;
  private pendingCalls = new Map<string, PendingCall>();
  private callCounter = 0;
  private crashTimestamps: number[] = [];
  private isShuttingDown = false;
  private pluginId: string | null = null;
  private pluginDisplayName: string | null = null;
  private isReady = false;
  private readyResolve: ((value: void) => void) | null = null;
  private readyPromise: Promise<void> | null = null;
  private spawnedAt = 0;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private filePath: string | null = null;
  private onProcessDeath: ((manager: PluginProcessManager) => void) | null = null;

  private metrics = {
    totalCalls: 0,
    failedCalls: 0,
    timedOutCalls: 0,
    callDurations: [] as number[],
    lastCallAt: null as number | null,
  };

  get id(): string | null {
    return this.pluginId;
  }

  get displayName(): string | null {
    return this.pluginDisplayName;
  }

  get alive(): boolean {
    return this.process !== null && !this.process.killed;
  }

  setOnProcessDeath(cb: (manager: PluginProcessManager) => void): void {
    this.onProcessDeath = cb;
  }

  async restart(): Promise<PluginLoadResult> {
    if (!this.filePath) {
      throw new Error("PLUGIN_NOT_LOADED_CANNOT_RESTART");
    }
    await this.shutdown();
    this.isShuttingDown = false;

    // 指数退避：1s → 2s → 4s → 8s → ...，最大 60s
    const recentCrashes = this.crashTimestamps.filter((t) => Date.now() - t < CRASH_WINDOW_MS);
    if (recentCrashes.length > 0) {
      const delay = Math.min(
        RESTART_BASE_DELAY_MS * Math.pow(2, recentCrashes.length - 1),
        RESTART_MAX_DELAY_MS,
      );
      logger.info(`Plugin restart backoff: ${delay}ms (${recentCrashes.length} recent crashes)`);
      await new Promise((r) => setTimeout(r, delay));
    }

    // P1-5 四审修复：退避延迟期间 dispose()/unregisterProcessManager 可能被调用，
    // 导致 isShuttingDown 被重新设为 true。此时不应继续 spawn 新进程，否则会产生孤儿进程。
    // 抛出异常使 attemptRestart 进入 catch 块，catch 块检查 disposed 后不再调度重试。
    if (this.isShuttingDown) {
      throw new Error("MANAGER_SHUT_DOWN_DURING_RESTART_BACKOFF");
    }

    return this.load(this.filePath);
  }

  getMetrics(): ProcessMetrics {
    const durations = this.metrics.callDurations;
    const avg = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      pluginId: this.pluginId,
      alive: this.alive,
      ready: this.isReady,
      totalCalls: this.metrics.totalCalls,
      failedCalls: this.metrics.failedCalls,
      timedOutCalls: this.metrics.timedOutCalls,
      avgCallDurationMs: Math.round(avg * 100) / 100,
      lastCallAt: this.metrics.lastCallAt,
      crashCount: this.crashTimestamps.length,
      uptimeMs: this.spawnedAt > 0 ? Date.now() - this.spawnedAt : 0,
      pid: this.process?.pid,
    };
  }

  async load(filePath: string): Promise<PluginLoadResult> {
    if (this.crashTimestamps.length >= MAX_CRASH_COUNT) {
      const recentCrashes = this.crashTimestamps.filter((t) => Date.now() - t < CRASH_WINDOW_MS);
      if (recentCrashes.length >= MAX_CRASH_COUNT) {
        throw new Error(`插件进程在 ${CRASH_WINDOW_MS / 1000}s 内崩溃 ${MAX_CRASH_COUNT} 次，已禁用自动重启`);
      }
      this.crashTimestamps = recentCrashes;
    }

    this.isReady = false;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });

    this.spawnProcess();

    const callId = this.nextCallId();
    const msg: WorkerMessage = { type: "load", id: callId, filePath };

    const result = await this.sendAndWait(callId, msg, SPAWN_TIMEOUT_MS);

    if (result.type === "error") {
      this.kill();
      throw new Error(result.message || "插件加载失败");
    }

    this.pluginId = result.pluginId || null;
    this.pluginDisplayName = result.pluginDisplayName || null;
    this.isReady = true;
    if (this.readyResolve) this.readyResolve();

    this.startHealthCheck();

    logger.info(`Plugin process loaded: ${this.pluginId} (${this.pluginDisplayName})`);
    this.filePath = filePath;
    return {
      pluginId: this.pluginId!,
      pluginDisplayName: this.pluginDisplayName!,
      metadata: result.metadata || {},
    };
  }

  async call<T = unknown>(method: string, args: unknown[]): Promise<T> {
    if (!this.alive) {
      throw new Error(`插件进程未运行 (plugin: ${this.pluginId})`);
    }

    if (!this.isReady && this.readyPromise) {
      await this.readyPromise;
    }

    const callId = this.nextCallId();
    const msg: WorkerMessage = { type: "call", id: callId, method, args };

    this.metrics.totalCalls++;
    this.metrics.lastCallAt = Date.now();

    const result = await this.sendAndWait(callId, msg, CALL_TIMEOUT_MS);

    if (result.type === "error") {
      throw new Error(result.message || `调用 ${method}() 失败`);
    }

    return result.value as T;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.alive || !this.isReady) return false;

    try {
      const callId = this.nextCallId();
      const msg: WorkerMessage = { type: "ping", id: callId };
      await this.sendAndWait(callId, msg, 5000);
      return true;
    } catch {
      logger.warn(`Health check failed for plugin ${this.pluginId}`);
      return false;
    }
  }

  async setConfig(config: { apiKey?: string; apiUrl?: string }): Promise<void> {
    if (!this.alive) return;

    const callId = this.nextCallId();
    const msg: WorkerMessage = { type: "setConfig", id: callId, config };
    await this.sendAndWait(callId, msg, 5000);
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.stopHealthCheck();
    this.rejectAllPending("插件进程正在关闭");

    if (this.process && !this.process.killed) {
      const proc = this.process;
      try {
        proc.send({ type: "shutdown", id: "0" });
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            this.kill();
            resolve();
          }, 3000);
          proc.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      } catch {
        this.kill();
      }
    }

    this.process = null;
    this.isReady = false;
  }

  private spawnProcess(): void {
    const workerPath = path.join(__dirname, "plugin-worker.js");
    this.spawnedAt = Date.now();

    this.process = fork(workerPath, [], {
      execArgv: [
        `--max-old-space-size=${MAX_OLD_GENERATION_SIZE_MB}`,
        `--max-semi-space-size=${MAX_YOUNG_GENERATION_SIZE_MB}`,
      ],
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      env: { ...process.env, NODE_ENV: "production" },
    });

    this.process.on("message", (msg: WorkerResponse) => {
      this.handleMessage(msg);
    });

    this.process.on("exit", (code, signal) => {
      logger.warn(`Plugin process exited (plugin: ${this.pluginId}, code: ${code}, signal: ${signal})`);
      this.rejectAllPending(`插件进程退出 (code: ${code}, signal: ${signal})`);
      this.process = null;
      this.isReady = false;

      if (!this.isShuttingDown) {
        this.crashTimestamps.push(Date.now());
        if (this.onProcessDeath) {
          this.onProcessDeath(this);
        }
      }
    });

    this.process.on("error", (err) => {
      logger.error(`Plugin process error (plugin: ${this.pluginId})`, err);
      this.rejectAllPending(`插件进程错误: ${err.message}`);
    });

    if (this.process.stdout) {
      this.process.stdout.on("data", (data: Buffer) => {
        logger.info(`[plugin-worker:${this.pluginId || "unknown"}] stdout: ${data.toString().trim()}`);
      });
    }
    if (this.process.stderr) {
      this.process.stderr.on("data", (data: Buffer) => {
        logger.warn(`[plugin-worker:${this.pluginId || "unknown"}] stderr: ${data.toString().trim()}`);
      });
    }
  }

  private handleMessage(msg: WorkerResponse): void {
    if (msg.type === "log") {
      const logFn = msg.level === "error" ? logger.error : msg.level === "warn" ? logger.warn : logger.info;
      logFn(`[code-plugin:${this.pluginId || "unknown"}] ${msg.message || ""}`);
      return;
    }

    const pending = this.pendingCalls.get(msg.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingCalls.delete(msg.id);

    const duration = Date.now() - pending.startTime;
    this.metrics.callDurations.push(duration);
    if (this.metrics.callDurations.length > 100) {
      this.metrics.callDurations = this.metrics.callDurations.slice(-50);
    }

    if (msg.type === "error") {
      this.metrics.failedCalls++;
      if (msg.message?.includes("超时")) {
        this.metrics.timedOutCalls++;
      }
      pending.reject(new Error(msg.message || "未知错误"));
    } else {
      pending.resolve(msg);
    }
  }

  private sendAndWait(callId: string, msg: WorkerMessage, timeoutMs: number): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const timer = setTimeout(() => {
        this.pendingCalls.delete(callId);
        this.metrics.timedOutCalls++;
        reject(new Error(`调用超时 (${timeoutMs}ms): ${msg.type}${msg.method ? `.${msg.method}` : ""}`));
      }, timeoutMs);

      this.pendingCalls.set(callId, { resolve, reject, timer, startTime, method: msg.method || msg.type });

      try {
        if (!this.process || !this.alive) {
          throw new Error("Plugin process not alive");
        }
        this.process.send(msg);
      } catch (err) {
        clearTimeout(timer);
        this.pendingCalls.delete(callId);
        reject(new Error(`IPC 发送失败: ${err instanceof Error ? err.message : String(err)}`));
      }
    });
  }

  private rejectAllPending(reason: string): void {
    for (const [, pending] of this.pendingCalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pendingCalls.clear();
  }

  private kill(): void {
    if (this.process && !this.process.killed) {
      try {
        this.process.kill("SIGKILL");
      } catch (e) {
        logger.warn(`Failed to kill plugin process (pid: ${this.process.pid}, plugin: ${this.pluginId})`, { error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckTimer = setInterval(async () => {
      if (this.isShuttingDown) return;
      const healthy = await this.healthCheck();
      if (!healthy && this.alive) {
        logger.warn(`Plugin ${this.pluginId} health check failed, process may be unresponsive`);
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private nextCallId(): string {
    return `call-${++this.callCounter}`;
  }
}

const processManagers = new Map<string, PluginProcessManager>();

export function getProcessManager(pluginId: string): PluginProcessManager | undefined {
  return processManagers.get(pluginId);
}

export function registerProcessManager(pluginId: string, manager: PluginProcessManager): void {
  processManagers.set(pluginId, manager);
}

export function unregisterProcessManager(pluginId: string): void {
  const manager = processManagers.get(pluginId);
  if (manager) {
    manager.shutdown().catch((err) => {
      logger.warn(`Failed to shutdown process manager for ${pluginId}: ${err instanceof Error ? err.message : String(err)}`);
    });
    processManagers.delete(pluginId);
  }
}

export async function shutdownAllProcessManagers(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [id, manager] of processManagers) {
    promises.push(manager.shutdown());
    processManagers.delete(id);
  }
  await Promise.allSettled(promises);
}

export function getAllProcessManagers(): Map<string, PluginProcessManager> {
  return new Map(processManagers);
}

export function getAllProcessMetrics(): ProcessMetrics[] {
  return Array.from(processManagers.values()).map((m) => m.getMetrics());
}
