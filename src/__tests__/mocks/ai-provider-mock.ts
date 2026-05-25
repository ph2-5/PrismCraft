import { http, HttpResponse, delay } from "msw";
import type { HttpHandler } from "msw";

type Scenario = "success" | "error" | "rate_limit" | "timeout" | "slow";

const TASK_STATES = new Map<string, { status: string; progress: number; videoUrl?: string }>();

function scheduleTaskCompletion(taskId: string, delayMs = 100): void {
  TASK_STATES.set(taskId, { status: "generating", progress: 0 });

  setTimeout(() => {
    TASK_STATES.set(taskId, { status: "generating", progress: 50 });
  }, delayMs * 0.5);

  setTimeout(() => {
    TASK_STATES.set(taskId, {
      status: "completed",
      progress: 100,
      videoUrl: `https://mock-cdn.example.com/videos/${taskId}.mp4`,
    });
  }, delayMs);
}

function createVideoGenerateHandler(scenario: Scenario = "success"): HttpHandler {
  return http.post("/api/generate-video", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.prompt) {
      return HttpResponse.json(
        { success: false, error: "Missing prompt", code: "CONFIG_MISSING" },
        { status: 400 },
      );
    }

    switch (scenario) {
      case "error":
        return HttpResponse.json(
          { success: false, error: "API Key 无效", code: "UNAUTHORIZED" },
          { status: 401 },
        );
      case "rate_limit":
        return HttpResponse.json(
          { success: false, error: "请求过于频繁", code: "RATE_LIMITED" },
          { status: 429 },
        );
      case "timeout":
        await delay(60000);
        return HttpResponse.json({ success: false, error: "timeout" });
      case "slow":
        await delay(2000);
        break;
    }

    const taskId = `mock_task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    scheduleTaskCompletion(taskId);

    return HttpResponse.json({
      success: true,
      data: {
        taskId,
        status: "pending",
        providerId: body.providerId || "volcengine",
        providerModelId: body.modelId || "seedance-1.5",
        providerFormat: body.format || "mp4",
      },
    });
  });
}

function createVideoStatusHandler(): HttpHandler {
  return http.post("/api/video-status", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const taskId = body.taskId as string;

    if (!taskId) {
      return HttpResponse.json(
        { success: false, error: "Missing taskId" },
        { status: 400 },
      );
    }

    const state = TASK_STATES.get(taskId);
    if (!state) {
      return HttpResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 },
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        status: state.status,
        progress: state.progress,
        videoUrl: state.videoUrl,
      },
    });
  });
}

function createImageGenerateHandler(scenario: Scenario = "success"): HttpHandler {
  return http.post("/api/generate-image", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.prompt) {
      return HttpResponse.json(
        { success: false, error: "Missing prompt" },
        { status: 400 },
      );
    }

    if (scenario === "error") {
      return HttpResponse.json(
        { success: false, error: "图片生成服务不可用" },
        { status: 503 },
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        imageUrl: `https://mock-cdn.example.com/images/img_${Date.now()}.png`,
        prompt: body.prompt as string,
      },
    });
  });
}

function createTextGenerateHandler(scenario: Scenario = "success"): HttpHandler {
  return http.post("/api/generate-text", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.prompt) {
      return HttpResponse.json(
        { success: false, error: "Missing prompt" },
        { status: 400 },
      );
    }

    if (scenario === "error") {
      return HttpResponse.json(
        { success: false, error: "文本生成服务不可用" },
        { status: 503 },
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        text: `基于提示词"${(body.prompt as string).substring(0, 20)}..."生成的详细描述内容。这是一段模拟的AI生成文本，用于E2E测试。`,
      },
    });
  });
}

function createKeyframeHandler(): HttpHandler {
  return http.post("/api/generate-keyframe", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.characterRef && !body.sceneRef && !body.content) {
      return HttpResponse.json(
        { success: false, error: "Missing reference or content" },
        { status: 400 },
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        imageUrl: `https://mock-cdn.example.com/keyframes/kf_${Date.now()}.png`,
        prompt: "模拟关键帧提示词",
        generatedAt: Date.now(),
        referencedPrevKeyframe: !!body.prevKeyframe,
        referenceCount: [body.characterRef, body.sceneRef, body.prevKeyframe].filter(Boolean).length,
      },
    });
  });
}

function createFramePairHandler(): HttpHandler {
  return http.post("/api/generate-frame-pair", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.keyframeUrl) {
      return HttpResponse.json(
        { success: false, error: "Missing keyframeUrl" },
        { status: 400 },
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        firstFrame: {
          imageUrl: `https://mock-cdn.example.com/frames/first_${Date.now()}.png`,
          prompt: "首帧提示词",
          derivedFrom: "keyframe",
        },
        lastFrame: {
          imageUrl: `https://mock-cdn.example.com/frames/last_${Date.now()}.png`,
          prompt: "尾帧提示词",
          derivedFrom: "keyframe",
        },
        generatedAt: Date.now(),
      },
    });
  });
}

function createConfigHandler(): HttpHandler {
  return http.get("/api/config", () => {
    return HttpResponse.json({
      success: true,
      data: {
        providers: [
          {
            id: "volcengine",
            name: "火山引擎 (Doubao)",
            apiKey: "sk-****abcd",
            models: [
              { id: "seedance-1.5", name: "Seedance 1.5", capabilities: ["video"] },
              { id: "seedream-3", name: "Seedream 3", capabilities: ["image"] },
            ],
          },
          {
            id: "kling",
            name: "可灵AI",
            apiKey: "****efgh",
            models: [
              { id: "kling-v2", name: "Kling V2", capabilities: ["video"] },
            ],
          },
        ],
      },
    });
  });
}

function createTestConnectionHandler(): HttpHandler {
  return http.post("/api/test-connection", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const apiKey = body.apiKey as string | undefined;

    if (!apiKey || apiKey === "invalid") {
      return HttpResponse.json(
        { success: false, error: "API Key 无效" },
        { status: 401 },
      );
    }

    return HttpResponse.json({ success: true, message: "连接成功" });
  });
}

function createValidateHandler(): HttpHandler {
  return http.post("/api/validate", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (body.type === "detect-provider") {
      return HttpResponse.json({
        success: true,
        data: { templateId: "volcengine", provider: "volcengine" },
      });
    }

    return HttpResponse.json(
      { success: false, error: "Invalid type" },
      { status: 400 },
    );
  });
}

export function createAIProviderHandlers(scenario: Scenario = "success"): HttpHandler[] {
  TASK_STATES.clear();
  return [
    createVideoGenerateHandler(scenario),
    createVideoStatusHandler(),
    createImageGenerateHandler(scenario),
    createTextGenerateHandler(scenario),
    createKeyframeHandler(),
    createFramePairHandler(),
    createConfigHandler(),
    createTestConnectionHandler(),
    createValidateHandler(),
  ];
}

export function clearTaskStates(): void {
  TASK_STATES.clear();
}

export function getTaskState(taskId: string) {
  return TASK_STATES.get(taskId);
}

export function setTaskState(taskId: string, state: { status: string; progress: number; videoUrl?: string }) {
  TASK_STATES.set(taskId, state);
}
