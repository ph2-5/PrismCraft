import { vi } from "vitest";

const mockResponses = new Map<string, unknown>();

export function setMockAIResponse(endpoint: string, response: unknown) {
  mockResponses.set(endpoint, response);
}

export function clearMockAIResponses() {
  mockResponses.clear();
}

export function setupApiCallMock() {
  return vi.fn(async (endpoint: string, options: { method?: string; body?: string } = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    const key = `${options.method || "GET"}:${endpoint}`;

    if (mockResponses.has(key)) {
      return mockResponses.get(key);
    }

    if (endpoint === "generate-video") {
      if (!body.prompt) {
        throw Object.assign(new Error("Missing prompt"), { statusCode: 400, code: "CONFIG_MISSING" });
      }
      const taskId = `mock_task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      return {
        success: true,
        data: {
          taskId,
          status: "pending",
          providerId: body.providerId || "volcengine",
          providerModelId: body.modelId || "seedance-1.5",
          providerFormat: body.format || "mp4",
        },
      };
    }

    if (endpoint === "video-status") {
      if (!body.taskId) {
        throw Object.assign(new Error("Missing taskId"), { statusCode: 400 });
      }
      return {
        success: true,
        data: {
          status: "completed",
          progress: 100,
          videoUrl: `https://mock-cdn.example.com/videos/${body.taskId}.mp4`,
        },
      };
    }

    if (endpoint === "generate-image") {
      if (!body.prompt) {
        throw Object.assign(new Error("Missing prompt"), { statusCode: 400 });
      }
      return {
        success: true,
        data: {
          imageUrl: `https://mock-cdn.example.com/images/img_${Date.now()}.png`,
          prompt: body.prompt,
        },
      };
    }

    if (endpoint === "generate-text") {
      if (!body.prompt) {
        throw Object.assign(new Error("Missing prompt"), { statusCode: 400 });
      }
      return {
        success: true,
        data: {
          text: `基于提示词"${(body.prompt as string).substring(0, 20)}..."生成的详细描述内容。`,
        },
      };
    }

    if (endpoint === "generate-keyframe") {
      if (!body.characterRef && !body.sceneRef && !body.content) {
        throw Object.assign(new Error("Missing reference"), { statusCode: 400 });
      }
      return {
        success: true,
        data: {
          imageUrl: `https://mock-cdn.example.com/keyframes/kf_${Date.now()}.png`,
          prompt: "模拟关键帧提示词",
          generatedAt: Date.now(),
          referencedPrevKeyframe: !!body.prevKeyframe,
          referenceCount: [body.characterRef, body.sceneRef, body.prevKeyframe].filter(Boolean).length,
        },
      };
    }

    if (endpoint === "generate-frame-pair") {
      if (!body.keyframeUrl) {
        throw Object.assign(new Error("Missing keyframeUrl"), { statusCode: 400 });
      }
      return {
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
      };
    }

    if (endpoint === "config" && (options.method === "GET" || !options.method)) {
      return {
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
          ],
        },
      };
    }

    if (endpoint === "test-connection") {
      return { success: true, message: "连接成功" };
    }

    throw Object.assign(new Error(`Unknown endpoint: ${endpoint}`), { statusCode: 404 });
  });
}
