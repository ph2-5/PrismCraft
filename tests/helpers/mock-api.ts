import type { Page } from "@playwright/test";

export async function mockApiRoutes(page: Page) {
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
          { id: "seedance", name: "Seedance", models: [{ id: "seedance-v1", capabilities: ["video"] }] },
          { id: "kuaishou", name: "可灵AI", models: [{ id: "kling-v1", capabilities: ["video"] }] },
        ],
      }),
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
}
