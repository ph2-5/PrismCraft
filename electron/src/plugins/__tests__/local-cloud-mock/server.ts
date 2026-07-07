/**
 * LocalCloudMockServer —— 本地 Mock 云端服务器
 *
 * 启动一个本地 HTTP 服务器模拟真实云端 API，真实验证 provider 的：
 * 1. 请求序列化（buildVideoRequest 输出的 body 是否能被云端"接收"）
 * 2. HTTP 通信（真实的 Node.js http 请求/响应）
 * 3. 响应解析（extractTaskId / extractVideoUrl / extractStatus 是否正确）
 * 4. 错误处理（4xx / 5xx / 超时）
 *
 * 不模拟大模型生成效果，只验证 API 链路完整性。
 */

import http from "http";
import type { IncomingMessage, ServerResponse } from "http";
import type { ProviderProfile, ReceivedRequest, MockErrorConfig } from "./types";
import { MINIMAL_VIDEO_BUFFER } from "./fixtures";

interface TaskState {
  state: "pending" | "running" | "completed" | "failed";
  videoUrl?: string;
  progress?: number;
}

export class LocalCloudMockServer {
  private server: http.Server;
  private profiles: ProviderProfile[];
  public receivedRequests: ReceivedRequest[] = [];
  private videoBaseUrl = "";
  private nextError: MockErrorConfig | null = null;
  private delayMs = 0;
  private taskStore = new Map<string, TaskState>();
  private taskProfileMap = new Map<string, ProviderProfile>();
  public videoDownloadCount = 0;

  constructor(profiles: ProviderProfile[], port = 0) {
    this.profiles = profiles;
    this.server = http.createServer(this.handleRequest.bind(this));
    if (port > 0) {
      this.server.listen(port, "127.0.0.1");
      this.videoBaseUrl = `http://127.0.0.1:${port}`;
    }
  }

  async start(): Promise<{ port: number; baseUrl: string }> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        const address = this.server.address();
        const port =
          typeof address === "object" && address ? address.port : 0;
        this.videoBaseUrl = `http://127.0.0.1:${port}`;
        resolve({ port, baseUrl: this.videoBaseUrl });
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      const closeAll = (this.server as unknown as {
        closeAllConnections?: () => void;
      }).closeAllConnections;
      if (typeof closeAll === "function") {
        closeAll.call(this.server);
      }
      this.server.close(() => resolve());
    });
  }

  /** 注入下一次请求的错误响应 */
  setNextError(status: number, body: unknown): void {
    this.nextError = { status, body };
  }

  /** 设置所有请求的延迟（用于测试超时） */
  setDelay(ms: number): void {
    this.delayMs = ms;
  }

  /** 手动设置任务状态（用于测试状态轮询） */
  setTaskState(
    taskId: string,
    state: TaskState["state"],
    videoUrl?: string,
    progress?: number,
  ): void {
    this.taskStore.set(taskId, { state, videoUrl, progress });
  }

  /** 清空收到的请求记录 */
  clearRequests(): void {
    this.receivedRequests = [];
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const bodyStr = Buffer.concat(chunks).toString("utf-8");
    let body: unknown = undefined;
    if (bodyStr) {
      try {
        body = JSON.parse(bodyStr);
      } catch {
        body = bodyStr;
      }
    }

    const path = req.url || "/";
    const method = req.method || "POST";
    this.receivedRequests.push({
      method,
      path,
      headers: req.headers as Record<string, string>,
      body,
      timestamp: Date.now(),
    });

    // 处理视频文件下载
    if (path.startsWith("/mock-video/")) {
      this.videoDownloadCount++;
      res.writeHead(200, { "Content-Type": "video/mp4" });
      res.end(MINIMAL_VIDEO_BUFFER);
      return;
    }

    // 延迟
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }

    // 错误注入
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      res.writeHead(err.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(err.body));
      return;
    }

    // 优先匹配 generate 请求（每个 provider 的 generate path 不同，无冲突）
    const generateProfile = this.profiles.find((p) =>
      p.matchGeneratePath(path, method),
    );

    if (generateProfile) {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const videoUrl = `${this.videoBaseUrl}/mock-video/${taskId}.mp4`;
      this.taskStore.set(taskId, { state: "pending", videoUrl, progress: 0 });
      // 关键：记录 taskId → profile 映射，解决 status 路由冲突
      this.taskProfileMap.set(taskId, generateProfile);
      const response = generateProfile.buildGenerateResponse(taskId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    // status 请求：先从所有 profile 提取 taskId，再用 taskProfileMap 找到正确的 profile
    const statusMatchingProfiles = this.profiles.filter((p) =>
      p.matchStatusPath(path, method),
    );

    if (statusMatchingProfiles.length > 0) {
      let resolvedTaskId: string | undefined;
      let resolvedProfile: ProviderProfile | undefined;

      // 优先用 taskProfileMap 解析（基于已注册的 taskId）
      for (const p of statusMatchingProfiles) {
        const tid = p.extractTaskIdFromStatusPath(path);
        if (tid && this.taskProfileMap.has(tid)) {
          resolvedTaskId = tid;
          resolvedProfile = this.taskProfileMap.get(tid);
          break;
        }
      }

      // 回退：如果只有一个匹配的 profile，直接用
      if (!resolvedProfile && statusMatchingProfiles.length === 1) {
        resolvedProfile = statusMatchingProfiles[0];
        resolvedTaskId = resolvedProfile.extractTaskIdFromStatusPath(path);
      }

      if (!resolvedProfile || !resolvedTaskId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error:
              "Cannot resolve taskId/profile for status path: " + path +
              " (matched " + statusMatchingProfiles.length + " profiles)",
          }),
        );
        return;
      }

      const task = this.taskStore.get(resolvedTaskId) || {
        state: "running" as const,
        progress: 50,
      };
      const response = resolvedProfile.buildStatusResponse(
        resolvedTaskId,
        task.state,
        task.videoUrl,
        task.progress,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "No matching provider profile for path: " + path,
      }),
    );
  }
}

/**
 * 用 fetch 发送 HTTP 请求并返回 JSON 响应。
 * 用于测试中发送真实 HTTP 请求到 Mock 服务器。
 */
export async function sendRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
  } = {},
): Promise<{ status: number; body: unknown; raw: string }> {
  const controller = new AbortController();
  const timeout = options.timeout ?? 30000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method: options.method || "POST",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const raw = await response.text();
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = raw;
    }
    return { status: response.status, body, raw };
  } finally {
    clearTimeout(timer);
  }
}
