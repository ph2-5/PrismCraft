import type { BrowserWindow } from "electron";
import { getLogger } from "../logging/logger";

const logger = getLogger("lifecycle:recovery");

export interface RecoveryOptions {
  createWindowFn: () => Promise<BrowserWindow>;
  onRecovered: (window: BrowserWindow) => void;
  onRecoveryFailed: (error: Error) => void;
}

export class CrashRecovery {
  private recoveryAttempts = 0;
  private readonly maxRecoveryAttempts = 3;
  private recoveryTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private options: RecoveryOptions) {}

  attemptRecovery(): void {
    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      logger.error("[Lifecycle] Max recovery attempts reached, giving up");
      this.options.onRecoveryFailed(new Error("Max recovery attempts reached"));
      return;
    }

    this.recoveryAttempts++;
    logger.warn(`[Lifecycle] Attempting recovery (attempt ${this.recoveryAttempts}/${this.maxRecoveryAttempts})...`);

    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
    }

    this.recoveryTimeout = setTimeout(() => {
      this.options.createWindowFn()
        .then((window) => {
          logger.info("[Lifecycle] Window recovered successfully");
          this.recoveryAttempts = 0;
          this.options.onRecovered(window);
        })
        .catch((error: unknown) => {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error("[Lifecycle] Recovery failed:", err);
          this.options.onRecoveryFailed(err);
        });
    }, 1000);
  }

  cancelRecovery(): void {
    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
      this.recoveryTimeout = null;
    }
  }

  reset(): void {
    this.recoveryAttempts = 0;
    this.cancelRecovery();
  }
}
