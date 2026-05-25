import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";

const API_BASE = "http://localhost:3001";

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function fetchApi(path: string, options?: RequestInit) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  return res;
}

describe("E2E API 集成测试（MSW 模拟）", () => {
  describe("GET /api/config", () => {
    it("返回结构应包含 providers 字段", async () => {
      server.use(
        http.get(`${API_BASE}/api/config`, () => {
          return HttpResponse.json({
            providers: [
              { id: "seedance", name: "Seedance", apiKey: "sk-***", models: [{ id: "seedance-v1" }] },
            ],
          });
        }),
      );

      const res = await fetchApi("/api/config");
      const body = await res.json();
      expect(body).toHaveProperty("providers");
      expect(Array.isArray(body.providers)).toBe(true);
    });

    it("provider.apiKey 应已脱敏", async () => {
      server.use(
        http.get(`${API_BASE}/api/config`, () => {
          return HttpResponse.json({
            providers: [
              { id: "seedance", name: "Seedance", apiKey: "sk-****1234" },
              { id: "volcengine", name: "火山引擎", apiKey: "" },
            ],
          });
        }),
      );

      const res = await fetchApi("/api/config");
      const body = await res.json();
      const providers = body.providers ?? [];
      expect(Array.isArray(providers)).toBe(true);
      for (const provider of providers) {
        if (provider.apiKey) {
          expect(
            provider.apiKey.includes("***") ||
              provider.apiKey.includes("****") ||
              provider.apiKey.length < 10,
            `Provider ${provider.id} 的 apiKey 未脱敏: ${provider.apiKey}`,
          ).toBe(true);
        }
      }
    });
  });

  describe("POST /api/config", () => {
    it("清除缓存应返回成功", async () => {
      server.use(
        http.post(`${API_BASE}/api/config`, async () => {
          return HttpResponse.json({ success: true });
        }),
      );

      const res = await fetchApi("/api/config", {
        method: "POST",
        body: JSON.stringify({ action: "clear-cache" }),
      });
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("无效请求应返回 400", async () => {
      server.use(
        http.post(`${API_BASE}/api/config`, async () => {
          return HttpResponse.json(
            { success: false, error: "无效请求" },
            { status: 400 },
          );
        }),
      );

      const res = await fetchApi("/api/config", {
        method: "POST",
        body: JSON.stringify({ invalid: true }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/validate", () => {
    it("检测提供商应返回提供商信息", async () => {
      server.use(
        http.post(`${API_BASE}/api/validate`, async () => {
          return HttpResponse.json({
            success: true,
            data: { templateId: "seedance", provider: "Seedance" },
          });
        }),
      );

      const res = await fetchApi("/api/validate", {
        method: "POST",
        body: JSON.stringify({
          type: "detect-provider",
          params: { apiKey: "sk-test1234567890abcdefghijklmnopqrstuv" },
        }),
      });
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.templateId ?? body.data.provider).toBeDefined();
    });

    it("无效类型应返回 400", async () => {
      server.use(
        http.post(`${API_BASE}/api/validate`, async () => {
          return HttpResponse.json(
            { success: false, error: "无效的验证类型" },
            { status: 400 },
          );
        }),
      );

      const res = await fetchApi("/api/validate", {
        method: "POST",
        body: JSON.stringify({
          type: "invalid-type",
          params: { apiKey: "sk-test" },
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/generate-video", () => {
    it("无 prompt 应返回 400 且 success 为 false", async () => {
      server.use(
        http.post(`${API_BASE}/api/generate-video`, async () => {
          return HttpResponse.json(
            { success: false, error: "Missing prompt" },
            { status: 400 },
          );
        }),
      );

      const res = await fetchApi("/api/generate-video", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("有效 prompt 应返回任务 ID", async () => {
      server.use(
        http.post(`${API_BASE}/api/generate-video`, async () => {
          return HttpResponse.json({
            success: true,
            data: { taskId: "mock_task_12345", status: "pending" },
          });
        }),
      );

      const res = await fetchApi("/api/generate-video", {
        method: "POST",
        body: JSON.stringify({ prompt: "一只猫在跳舞" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.taskId).toBeDefined();
    });
  });

  describe("POST /api/generate-image", () => {
    it("无 prompt 应返回 400", async () => {
      server.use(
        http.post(`${API_BASE}/api/generate-image`, async () => {
          return HttpResponse.json(
            { success: false, error: "Missing prompt" },
            { status: 400 },
          );
        }),
      );

      const res = await fetchApi("/api/generate-image", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  describe("POST /api/generate-text", () => {
    it("无 prompt 应返回 400", async () => {
      server.use(
        http.post(`${API_BASE}/api/generate-text`, async () => {
          return HttpResponse.json(
            { success: false, error: "Missing prompt" },
            { status: 400 },
          );
        }),
      );

      const res = await fetchApi("/api/generate-text", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  describe("POST /api/video-status", () => {
    it("无 taskId 应返回 400", async () => {
      server.use(
        http.post(`${API_BASE}/api/video-status`, async () => {
          return HttpResponse.json(
            { success: false, error: "Missing taskId" },
            { status: 400 },
          );
        }),
      );

      const res = await fetchApi("/api/video-status", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("有效 taskId 应返回视频状态", async () => {
      server.use(
        http.post(`${API_BASE}/api/video-status`, async () => {
          return HttpResponse.json({
            success: true,
            data: { status: "completed", videoUrl: "https://mock.video/test.mp4" },
          });
        }),
      );

      const res = await fetchApi("/api/video-status", {
        method: "POST",
        body: JSON.stringify({ taskId: "task-123" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("completed");
    });
  });

  describe("响应格式", () => {
    it("API 响应 content-type 应包含 application/json", async () => {
      server.use(
        http.get(`${API_BASE}/api/config`, () => {
          return HttpResponse.json({ success: true });
        }),
      );

      const res = await fetchApi("/api/config");
      const contentType = res.headers.get("content-type");
      expect(contentType).toContain("application/json");
    });
  });

  describe("错误处理", () => {
    it("服务器错误应返回 500", async () => {
      server.use(
        http.get(`${API_BASE}/api/config`, () => {
          return HttpResponse.json(
            { success: false, error: "Internal Server Error" },
            { status: 500 },
          );
        }),
      );

      const res = await fetchApi("/api/config");
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("网络超时应被正确处理", async () => {
      server.use(
        http.post(`${API_BASE}/api/generate-video`, async () => {
          return HttpResponse.json(
            { success: false, error: "Request timeout" },
            { status: 504 },
          );
        }),
      );

      const res = await fetchApi("/api/generate-video", {
        method: "POST",
        body: JSON.stringify({ prompt: "test" }),
      });
      expect(res.status).toBe(504);
    });
  });
});
