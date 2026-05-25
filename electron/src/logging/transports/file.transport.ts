import fs from "fs";
import path from "path";
import type { LogTransport, LogEntry, LogLevel } from "../types";
import { getUserDataPath } from "../../database/db-schema";

const MAX_LOG_SIZE = 10 * 1024 * 1024;

function checkLogRotation(logFilePath: string): void {
  try {
    const stats = fs.statSync(logFilePath);
    if (stats.size >= MAX_LOG_SIZE) {
      const backupPath = `${logFilePath}.1`;
      try { fs.unlinkSync(backupPath); } catch {}
      fs.renameSync(logFilePath, backupPath);
    }
  } catch {}
}

export interface FileTransportOptions {
  logDir?: string;
  filename?: string;
  minLevel?: LogLevel;
  enabled?: boolean;
  maxFileSizeMB?: number;
  maxFiles?: number;
}

export class FileTransport implements LogTransport {
  readonly name = "file";
  minLevel: LogLevel;
  enabled: boolean;

  private logDir: string;
  private filename: string;
  private maxFileSize: number;
  private maxFiles: number;
  private writeQueue: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private beforeExitHandler: () => void;

  constructor(options: FileTransportOptions = {}) {
    this.logDir = options.logDir ?? path.join(getUserDataPath(), "logs");
    this.filename = options.filename ?? "app";
    this.minLevel = options.minLevel ?? "info";
    this.enabled = options.enabled ?? true;
    this.maxFileSize = (options.maxFileSizeMB ?? 10) * 1024 * 1024;
    this.maxFiles = options.maxFiles ?? 5;

    this.beforeExitHandler = () => { void this.flush(); };

    this.ensureLogDir();
    this.startFlushTimer();
  }

  write(entry: LogEntry): void {
    if (!this.enabled) return;

    const line = JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      namespace: entry.namespace,
      message: entry.message,
      context: entry.context,
      error: entry.error,
    });

    this.writeQueue.push(line);

    if (this.writeQueue.length > 100) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.writeQueue.length === 0) return;

    const lines = this.writeQueue.splice(0);
    const content = lines.join("\n") + "\n";

    try {
      const logPath = this.getCurrentLogPath();

      checkLogRotation(logPath);

      fs.appendFileSync(logPath, content, "utf-8");

      this.cleanupOldFiles();
    } catch (error) {
      console.error("[FileTransport] Failed to write log:", error);
      console.error("[FileTransport] Log content:", content);
    }
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    process.off("beforeExit", this.beforeExitHandler);
    await this.flush();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getCurrentLogPath(): string {
    const date = new Date().toISOString().split("T")[0];
    return path.join(this.logDir, `${this.filename}-${date}.log`);
  }

  private cleanupOldFiles(): void {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter((f) => f.startsWith(this.filename) && f.endsWith(".log"))
        .map((f) => ({
          name: f,
          path: path.join(this.logDir, f),
          time: fs.statSync(path.join(this.logDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      for (let i = this.maxFiles; i < files.length; i++) {
        fs.unlinkSync(files[i].path);
      }
    } catch (error) {
      console.error("[FileTransport] Failed to cleanup old logs:", error);
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, 5000);

    process.on("beforeExit", this.beforeExitHandler);
  }
}
