import { app, BrowserWindow } from "electron";
import { getLogger } from "../logging/logger";
import { AppState, isValidTransition } from "./states";
import { performCleanup } from "./cleanup";
import { CrashRecovery } from "./recovery";

const logger = getLogger("lifecycle:manager");

export interface LifecycleManagerOptions {
  createWindowFn: () => Promise<BrowserWindow>;
}

export class LifecycleManager {
  private state: AppState = AppState.IDLE;
  private mainWindow: BrowserWindow | null = null;
  private cleanupInProgress = false;
  private crashRecovery: CrashRecovery;
  private gpuCrashCount = 0;
  private gpuCrashResetTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly MAX_GPU_CRASH_RETRIES = 3;

  constructor(private options: LifecycleManagerOptions) {
    this.crashRecovery = new CrashRecovery({
      createWindowFn: options.createWindowFn,
      onRecovered: (window) => {
        this.mainWindow = window;
        this.transitionTo(AppState.RUNNING, "window-recovered");
        this.setupWindowEvents();
      },
      onRecoveryFailed: (error) => {
        logger.error("[Lifecycle] Recovery failed, shutting down:", error);
        this.shutdown("recovery-failed");
      },
    });

    this.setupAppEvents();
    this.setupProcessEvents();
  }

  get currentState(): AppState {
    return this.state;
  }

  get window(): BrowserWindow | null {
    return this.mainWindow;
  }

  setWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    this.setupWindowEvents();
  }

  private transitionTo(newState: AppState, reason: string): boolean {
    if (!isValidTransition(this.state, newState)) {
      logger.warn(`[Lifecycle] Invalid transition: ${this.state} -> ${newState} (${reason})`);
      return false;
    }

    logger.info(`[Lifecycle] State transition: ${this.state} -> ${newState} (${reason})`);
    this.state = newState;
    return true;
  }

  start(): void {
    this.transitionTo(AppState.STARTING, "app-ready");
  }

  markWindowReady(): void {
    this.transitionTo(AppState.RUNNING, "window-ready");
  }

  async shutdown(reason: string): Promise<void> {
    if (this.cleanupInProgress) {
      logger.info("[Lifecycle] Cleanup already in progress, ignoring duplicate shutdown request");
      return;
    }

    if (this.state === AppState.CLOSED) {
      logger.info("[Lifecycle] Already closed, ignoring shutdown request");
      return;
    }

    this.cleanupInProgress = true;
    this.crashRecovery.cancelRecovery();

    this.transitionTo(AppState.CLOSING, reason);

    try {
      await performCleanup({ mainWindow: this.mainWindow, reason });
    } catch (error) {
      logger.error("[Lifecycle] Cleanup failed:", error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.mainWindow = null;
      this.transitionTo(AppState.CLOSED, "cleanup-done");
      this.cleanupInProgress = false;

      if (app.isReady()) {
        app.quit();
      }
    }
  }

  handleRendererCrash(): void {
    logger.error("[Lifecycle] Renderer process crashed");
    this.mainWindow = null;

    if (!this.transitionTo(AppState.CRASHED, "renderer-crash")) {
      this.state = AppState.CRASHED;
    }

    this.crashRecovery.attemptRecovery();
  }

  cancelRecovery(): void {
    this.crashRecovery.cancelRecovery();
  }

  private setupWindowEvents(): void {
    if (!this.mainWindow) return;

    this.mainWindow.on("close", (event) => {
      if (this.state !== AppState.CLOSING && this.state !== AppState.CLOSED) {
        logger.info("[Lifecycle] Window close requested by user");
        event.preventDefault();
        this.shutdown("user-close");
      }
    });

    this.mainWindow.on("closed", () => {
      logger.info("[Lifecycle] Window closed event received");
      this.mainWindow = null;
    });
  }

  private setupAppEvents(): void {
    app.on("window-all-closed", () => {
      logger.info("[Lifecycle] All windows closed");
      if (this.state === AppState.CRASHED) {
        logger.info("[Lifecycle] Window was closed due to crash, recovery already scheduled");
        return;
      }
      this.shutdown("window-all-closed");
    });

    app.on("before-quit", () => {
      logger.info("[Lifecycle] Before quit event");
      if (this.state !== AppState.CLOSING && this.state !== AppState.CLOSED) {
        this.shutdown("before-quit");
      }
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && this.state !== AppState.CLOSING) {
        logger.info("[Lifecycle] App activated with no windows");
        this.options.createWindowFn().then((window) => {
          this.mainWindow = window;
          this.setupWindowEvents();
        });
      }
    });

    app.on("render-process-gone", (_event, _webContents, details) => {
      logger.error("[Lifecycle] Render process gone:", undefined, {
        reason: details.reason,
        exitCode: details.exitCode,
      });
      this.handleRendererCrash();
    });

    app.on("child-process-gone", (_event, details) => {
      if (details.type === "GPU") {
        logger.error("[Lifecycle] GPU process gone:", undefined, {
          reason: details.reason,
          exitCode: details.exitCode,
        });
        this.gpuCrashCount++;
        if (this.gpuCrashResetTimer) clearTimeout(this.gpuCrashResetTimer);
        this.gpuCrashResetTimer = setTimeout(() => { this.gpuCrashCount = 0; }, 60_000);
        if (this.gpuCrashCount <= LifecycleManager.MAX_GPU_CRASH_RETRIES) {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.reload();
          }
        } else {
          logger.error("[Lifecycle] GPU process crashed too many times, stopping reload");
        }
      } else {
        logger.warn("[Lifecycle] Child process gone:", { type: details.type, reason: details.reason, exitCode: details.exitCode });
      }
    });
  }

  private setupProcessEvents(): void {
    process.on("SIGINT", () => {
      logger.info("[Lifecycle] SIGINT received");
      this.shutdown("sigint");
    });

    process.on("SIGTERM", () => {
      logger.info("[Lifecycle] SIGTERM received");
      this.shutdown("sigterm");
    });

    process.on("uncaughtException", (error: Error) => {
      logger.error("[Lifecycle] Uncaught Exception:", error);
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send("fatal-error", {
          message: error.message,
          stack: error.stack,
        });
      }
    });

    process.on("unhandledRejection", (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      logger.error("[Lifecycle] Unhandled Promise Rejection:", reason instanceof Error ? reason : new Error(message));
      if (stack) {
        logger.error("[Lifecycle] Stack:", undefined, { stack });
      }
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send("fatal-error", {
          message: `Unhandled rejection: ${message}`,
          stack,
        });
      }
    });
  }
}
