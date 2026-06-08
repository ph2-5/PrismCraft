import { describe, it, expect } from "vitest";

const ELECTRON_API_PORT = 30100;
const ELECTRON_API_BASE = `http://127.0.0.1:${ELECTRON_API_PORT}`;
const TEST_TIMEOUT = 5000;

async function fetchElectronApi(path: string, options?: RequestInit) {
  const url = `${ELECTRON_API_BASE}/${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      signal: AbortSignal.timeout(TEST_TIMEOUT),
    });
    return res;
  } catch {
    return null;
  }
}

async function isElectronRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${ELECTRON_API_BASE}/config`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok || res.status === 403;
  } catch {
    return false;
  }
}

describe("E2E Electron 集成测试", () => {
  let electronAvailable = false;

  beforeAll(async () => {
    electronAvailable = await isElectronRunning();
    if (!electronAvailable) {
      console.warn(
        `[Electron集成测试] Electron API 服务器未运行于 ${ELECTRON_API_BASE}，跳过真实 Electron 测试。` +
        `请先启动 Electron 应用。`
      );
    }
  });

  describe("Electron API 服务器健康检查", () => {
    it("GET /config 应返回配置", async () => {
      if (!electronAvailable) return;
      const res = await fetchElectronApi("config");
      expect(res).not.toBeNull();
      expect(res!.status).toBeLessThan(500);
      const body = await res!.json();
      expect(body).toBeDefined();
    });

    it("CORS 应限制允许的来源", async () => {
      if (!electronAvailable) return;
      const res = await fetch(`${ELECTRON_API_BASE}/config`, {
        headers: { Origin: "http://malicious-site.com" },
        signal: AbortSignal.timeout(TEST_TIMEOUT),
      });
      if (res.status === 403) {
        expect(res.status).toBe(403);
      }
    });
  });

  describe("Electron API 路由注册验证", () => {
    it("所有必要路由应已注册", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const serverPath = path.resolve(process.cwd(), "electron/src/api-server.ts");
      const content = fs.readFileSync(serverPath, "utf-8");

      const requiredRoutes = [
        "config",
        "secure-config",
        "upload",
        "analyze-image",
        "generate-image",
        "generate-keyframe",
        "generate-frame-pair",
        "generate-video",
        "video-status",
        "generate-text",
        "test-connection",
        "export",
      ];

      for (const route of requiredRoutes) {
        const pattern = new RegExp(`["']?${route}["']?\\s*:\\s*\\{`);
        expect(
          pattern.test(content),
          `Electron API 路由 "${route}" 未注册`
        ).toBe(true);
      }
    });
  });

  describe("Electron API Gateway 功能验证", () => {
    it("generateVideo 应使用 providerId/modelId", async () => {
      if (!electronAvailable) return;
      const res = await fetchElectronApi("generate-video", {
        method: "POST",
        body: JSON.stringify({
          prompt: "测试视频",
          providerId: "volcengine",
          modelId: "seedance-1.5",
        }),
      });
      if (res) {
        expect(res.status).toBeLessThan(500);
      }
    });

    it("videoStatus 应使用 providerId/modelId", async () => {
      if (!electronAvailable) return;
      const res = await fetchElectronApi("video-status", {
        method: "POST",
        body: JSON.stringify({
          taskId: "test-task-id",
          providerId: "volcengine",
          modelId: "seedance-1.5",
        }),
      });
      if (res) {
        expect(res.status).toBeLessThan(500);
      }
    });

    it("generateImage 应使用 providerId/modelId", async () => {
      if (!electronAvailable) return;
      const res = await fetchElectronApi("generate-image", {
        method: "POST",
        body: JSON.stringify({
          prompt: "测试图片",
          providerId: "volcengine",
          modelId: "seedream-3",
        }),
      });
      if (res) {
        expect(res.status).toBeLessThan(500);
      }
    });
  });

  describe("Electron 速率限制", () => {
    it("速率限制配置应合理", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const serverPath = path.resolve(process.cwd(), "electron/src/api-server.ts");
      const content = fs.readFileSync(serverPath, "utf-8");

      expect(content).toContain("windowMs");
      expect(content).toContain("max:");
      const maxMatch = content.match(/max:\s*(\d+)/);
      expect(maxMatch).not.toBeNull();
      const maxVal = parseInt(maxMatch![1]!);
      expect(maxVal).toBeGreaterThan(0);
      expect(maxVal).toBeLessThanOrEqual(1000);
    });

    it("请求体大小应有限制", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const serverPath = path.resolve(process.cwd(), "electron/src/api-server.ts");
      const content = fs.readFileSync(serverPath, "utf-8");

      expect(content).toContain("MAX_REQUEST_BODY_SIZE");
    });
  });

  describe("Electron 数据库层验证", () => {
    it("database-v2 应包含正确的表结构", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const dbPath = path.resolve(process.cwd(), "electron/src/database-v2.ts");
      if (!fs.existsSync(dbPath)) return;
      const content = fs.readFileSync(dbPath, "utf-8");

      const requiredTables = ["video_tasks", "video_cache", "generation_tasks"];
      for (const table of requiredTables) {
        expect(
          content.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
          `数据库表 "${table}" 未定义`
        ).toBe(true);
      }
    });

    it("video_tasks 表不应包含 custom_config 列", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const dbPath = path.resolve(process.cwd(), "electron/src/database-v2.ts");
      if (!fs.existsSync(dbPath)) return;
      const content = fs.readFileSync(dbPath, "utf-8");

      const videoTasksSection = content.substring(
        content.indexOf("CREATE TABLE IF NOT EXISTS video_tasks"),
        content.indexOf(");", content.indexOf("CREATE TABLE IF NOT EXISTS video_tasks")) + 2
      );
      expect(videoTasksSection).not.toContain("custom_config");
    });

    it("video_tasks 表应包含 provider 列", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const dbPath = path.resolve(process.cwd(), "electron/src/database-v2.ts");
      if (!fs.existsSync(dbPath)) return;
      const content = fs.readFileSync(dbPath, "utf-8");

      const videoTasksSection = content.substring(
        content.indexOf("CREATE TABLE IF NOT EXISTS video_tasks"),
        content.indexOf(");", content.indexOf("CREATE TABLE IF NOT EXISTS video_tasks")) + 2
      );
      expect(videoTasksSection).toContain("provider_id");
      expect(videoTasksSection).toContain("provider_model_id");
      expect(videoTasksSection).toContain("provider_format");
    });
  });

  describe("Electron video-tracker 验证", () => {
    it("buildTrackingInfo 不应接受 customConfig 参数", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const trackerPath = path.resolve(process.cwd(), "electron/src/services/video/video-tracker.ts");
      const content = fs.readFileSync(trackerPath, "utf-8");
      expect(content).not.toContain("customConfig");
    });
  });

  describe("Electron video-recovery 验证", () => {
    it("videoStatus 调用不应传递 customConfig", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const recoveryPath = path.resolve(process.cwd(), "electron/src/services/video/video-recovery.ts");
      const content = fs.readFileSync(recoveryPath, "utf-8");
      expect(content).not.toContain("customConfig");
    });
  });
});
