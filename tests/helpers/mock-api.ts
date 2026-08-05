import type { Page } from "@playwright/test";

export async function mockApiRoutes(page: Page) {
  // 统一通信层（withHttpFallback）先探测 /api/health 决定是否启用 HTTP 通道。
  // web e2e 无 Electron 主进程，必须 mock health=200，否则 _httpAvailable=false
  // 导致 loadConfig 等走 IPC 空配置（页面无模型、无法生成）。
  await page.route("**/api/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, status: "ok" }),
    }),
  );

  await page.route("**/api/generate-video", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        task_id: "e2e_mock_video_12345",
        status: "pending",
        estimated_time: 1,
      }),
    }),
  );

  await page.route("**/api/generate-image", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        task_id: "e2e_mock_img_12345",
        status: "completed",
        url: "https://mock.image/e2e-fake.png",
      }),
    }),
  );

  await page.route("**/api/generate-keyframe", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        task_id: "e2e_mock_keyframe_12345",
        status: "completed",
        url: "https://mock.image/e2e-keyframe.png",
      }),
    }),
  );

  await page.route("**/api/video-status/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        task_id: "e2e_mock_video_12345",
        status: "completed",
        url: "https://mock.video/e2e-fake.mp4",
        progress: 100,
      }),
    }),
  );

  await page.route("**/api/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        providers: [
          { id: "seedance", name: "Seedance", models: [{ id: "seedance-v1", name: "Seedance V1", capabilities: ["video"] }] },
          { id: "kuaishou", name: "可灵AI", models: [{ id: "kling-v1", name: "可灵 V1", capabilities: ["video"] }] },
        ],
      }),
    }),
  );

  // loadConfig 实际请求 /api/config/get（httpConfigGet），必须拦截否则回退 IPC 空配置导致无模型。
  // 响应结构：{ success, data: { value: ApiConfig } }，CONFIG_VERSION = 1。
  await page.route("**/api/config/get", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          value: {
            version: 1,
            providers: [
              { id: "seedance", name: "Seedance", models: [{ id: "seedance-v1", name: "Seedance V1", capabilities: ["video"] }] },
              { id: "kuaishou", name: "可灵AI", models: [{ id: "kling-v1", name: "可灵 V1", capabilities: ["video"] }] },
            ],
            mapping: {},
            fallback: { enabled: true, order: ["text", "image", "vision", "video"] },
          },
        },
      }),
    }),
  );

  await page.route("**/api/config/set", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    }),
  );

  await page.route("**/api/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: [
          { id: "seedance-v1", name: "Seedance V1", provider: "seedance" },
          { id: "kling-v1", name: "可灵 V1", provider: "kuaishou" },
        ],
      }),
    }),
  );

  await page.route("**/api/test-connection", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, message: "Connection successful" }),
    }),
  );

  await page.route("**/api/sync/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        config: {
          enabled: false,
          autoSync: false,
          syncInterval: 30000,
          conflictStrategy: "lastWriteWins",
          server: null,
        },
      }),
    }),
  );
}
