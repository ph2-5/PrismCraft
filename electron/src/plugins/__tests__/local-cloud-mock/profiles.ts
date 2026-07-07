/**
 * Provider Profiles —— 12 个 video provider 的云端响应 profile
 *
 * 每个 profile 模拟一个真实云端的 API 行为，包括：
 * - 请求路径匹配规则
 * - 请求 body 字段校验（验证 provider 序列化是否完整）
 * - generate 响应构造（按官方文档格式）
 * - status 响应构造（按官方文档格式）
 *
 * 数据来源：各 provider 官方 API 文档 + 项目内 provider 实现代码。
 */

import type { ProviderProfile, ExpectedSendContext } from "./types";

/* ------------------------------------------------------------------ */
/* Helper functions                                                    */
/* ------------------------------------------------------------------ */

/** 从 path 中提取最后一段作为 taskId */
function extractLastSegment(path: string): string | undefined {
  const match = path.match(/\/([^/]+)$/);
  return match ? match[1] : undefined;
}

/** 校验 prompt 是否存在于 body 中（通用） */
function checkPrompt(
  body: Record<string, unknown>,
  expected: ExpectedSendContext,
  errors: string[],
  field: string = "prompt",
): void {
  const prompt = body[field];
  if (typeof prompt !== "string") {
    errors.push(`missing or non-string "${field}"`);
    return;
  }
  // prompt 可能被追加了场景参考描述，只验证开头包含 expected.prompt
  if (!prompt.includes(expected.prompt)) {
    errors.push(`prompt mismatch: expected to include "${expected.prompt}" but got "${prompt.slice(0, 80)}..."`);
  }
}

/* ------------------------------------------------------------------ */
/* 1. Volcengine (Doubao)                                             */
/* ------------------------------------------------------------------ */
export const volcengineProfile: ProviderProfile = {
  id: "volcengine",
  name: "火山引擎 (Doubao)",
  testModel: "doubao-seedance-1-0-pro-250528",
  testApiKey: "test-volcengine-uuid-key",
  matchGeneratePath: (path) => path.endsWith("/contents/generations/tasks"),
  matchStatusPath: (path) =>
    /\/contents\/generations\/tasks\/[^/]+$/.test(path),
  extractTaskIdFromStatusPath: (path) => extractLastSegment(path),
  validateGenerateBody(body, expected) {
    const errors: string[] = [];
    if (!body.model) errors.push("missing model");
    const content = body.content;
    if (!Array.isArray(content)) {
      errors.push("missing content array");
      return errors;
    }
    const textItem = content.find(
      (c) => (c as Record<string, unknown>)?.type === "text",
    );
    if (!textItem) {
      errors.push("missing text item in content");
    } else if (
      !String((textItem as Record<string, unknown>).text).includes(expected.prompt)
    ) {
      errors.push("prompt text mismatch");
    }
    if (expected.firstFrame) {
      const ff = content.find(
        (c) => (c as Record<string, unknown>)?.role === "first_frame",
      );
      if (!ff) errors.push("missing first_frame in content");
    }
    if (expected.lastFrame) {
      const lf = content.find(
        (c) => (c as Record<string, unknown>)?.role === "last_frame",
      );
      if (!lf) errors.push("missing last_frame in content");
    }
    return errors;
  },
  buildGenerateResponse(taskId) {
    return { id: taskId, status: "queued" };
  },
  buildStatusResponse(taskId, state, videoUrl, progress) {
    if (state === "completed") {
      return {
        id: taskId,
        status: "succeeded",
        content: [{ type: "video_url", video_url: { url: videoUrl } }],
      };
    }
    if (state === "failed") {
      return { id: taskId, status: "failed", error: { code: "INTERNAL", message: "mock failure" } };
    }
    return {
      id: taskId,
      status: state === "pending" ? "queued" : "running",
      progress: progress ?? 0,
    };
  },
};

/* ------------------------------------------------------------------ */
/* 2. Seedance (Atlas Cloud)                                          */
/* ------------------------------------------------------------------ */
export const seedanceProfile: ProviderProfile = {
  id: "seedance",
  name: "Seedance (Atlas Cloud)",
  testModel: "seedance-v1-pro-i2v",
  testApiKey: "test-seedance-key",
  matchGeneratePath: (path) => path.endsWith("/seedance/video"),
  matchStatusPath: (path) => /\/seedance\/video\/[^/]+$/.test(path),
  extractTaskIdFromStatusPath: (path) => extractLastSegment(path),
  validateGenerateBody(body, expected) {
    const errors: string[] = [];
    if (!body.model) errors.push("missing model");
    checkPrompt(body, expected, errors);
    if (body.duration !== expected.duration) {
      errors.push(`duration mismatch: expected ${expected.duration}, got ${body.duration}`);
    }
    if (expected.firstFrame && !body.first_frame_image) {
      errors.push("missing first_frame_image");
    }
    if (expected.lastFrame && !body.last_frame_image) {
      errors.push("missing last_frame_image");
    }
    return errors;
  },
  buildGenerateResponse(taskId) {
    return { id: taskId, status: "pending" };
  },
  buildStatusResponse(taskId, state, videoUrl, progress) {
    if (state === "completed") {
      return { id: taskId, status: "completed", video_url: videoUrl };
    }
    if (state === "failed") {
      return { id: taskId, status: "failed", error: "mock failure" };
    }
    return { id: taskId, status: state, progress: progress ?? 0 };
  },
};

/* ------------------------------------------------------------------ */
/* 3. Runway                                                          */
/* ------------------------------------------------------------------ */
export const runwayProfile: ProviderProfile = {
  id: "runway",
  name: "Runway",
  testModel: "gen3a_turbo",
  testApiKey: "test-runway-key",
  matchGeneratePath: (path) =>
    path.endsWith("/image_to_video") || path.endsWith("/text_to_video"),
  matchStatusPath: (path) => /\/tasks\/[^/]+$/.test(path),
  extractTaskIdFromStatusPath: (path) => extractLastSegment(path),
  validateGenerateBody(body, expected) {
    const errors: string[] = [];
    if (!body.model) errors.push("missing model");
    // Runway 用 promptText 而非 prompt
    const promptText = body.promptText;
    if (typeof promptText !== "string") {
      errors.push("missing or non-string promptText");
    } else if (!promptText.includes(expected.prompt)) {
      errors.push("promptText mismatch");
    }
    if (body.duration !== expected.duration) {
      errors.push(`duration mismatch: expected ${expected.duration}, got ${body.duration}`);
    }
    if (expected.firstFrame && !body.promptImage) {
      errors.push("missing promptImage");
    }
    return errors;
  },
  buildGenerateResponse(taskId) {
    return { id: taskId, status: "RUNNING" };
  },
  buildStatusResponse(taskId, state, videoUrl, _progress) {
    if (state === "completed") {
      return { id: taskId, status: "SUCCEEDED", output: [videoUrl] };
    }
    if (state === "failed") {
      return { id: taskId, status: "FAILED", failure: "mock failure" };
    }
    return { id: taskId, status: "RUNNING" };
  },
};

/* ------------------------------------------------------------------ */
/* 4. Pika                                                            */
/* ------------------------------------------------------------------ */
export const pikaProfile: ProviderProfile = {
  id: "pika",
  name: "Pika",
  testModel: "pika-v2",
  testApiKey: "test-pika-key",
  matchGeneratePath: (path) => path.endsWith("/video/generate"),
  matchStatusPath: (path) => /\/video\/status\/[^/]+$/.test(path),
  extractTaskIdFromStatusPath: (path) => extractLastSegment(path),
  validateGenerateBody(body, expected) {
    const errors: string[] = [];
    if (!body.model) errors.push("missing model");
    checkPrompt(body, expected, errors);
    if (expected.firstFrame && !body.image_url) {
      errors.push("missing image_url");
    }
    return errors;
  },
  buildGenerateResponse(taskId) {
    return { data: { id: taskId } };
  },
  buildStatusResponse(taskId, state, videoUrl, _progress) {
    if (state === "completed") {
      return { data: { id: taskId, video_url: videoUrl, status: "finished" } };
    }
    if (state === "failed") {
      return { data: { id: taskId, status: "failed", error: "mock failure" } };
    }
    return { data: { id: taskId, status: "processing" } };
  },
};

/* ------------------------------------------------------------------ */
/* 5. Luma Dream Machine                                              */
/* ------------------------------------------------------------------ */
export const lumaProfile: ProviderProfile = {
  id: "luma",
  name: "Luma Dream Machine",
  testModel: "dream-machine-v1",
  testApiKey: "test-luma-key",
  // Luma 的 generate endpoint 是 /generations，但要避免匹配 /videos/generations 或 /video/generations
  matchGeneratePath: (path) =>
    path.endsWith("/generations") &&
    !path.endsWith("/videos/generations") &&
    !path.endsWith("/video/generations"),
  matchStatusPath: (path) =>
    /\/generations\/[^/]+$/.test(path) &&
    !path.includes("/videos/generations/") &&
    !path.includes("/video/generations/"),
  extractTaskIdFromStatusPath: (path) => extractLastSegment(path),
  validateGenerateBody(body, expected) {
    const errors: string[] = [];
    if (!body.model) errors.push("missing model");
    checkPrompt(body, expected, errors);
    if (expected.firstFrame && !body.image_url) {
      errors.push("missing image_url");
    }
    if (expected.lastFrame && !body.end_image_url) {
      errors.push("missing end_image_url");
    }
    return errors;
  },
  buildGenerateResponse(taskId) {
    return { id: taskId, state: "dreaming" };
  },
  buildStatusResponse(taskId, state, videoUrl, _progress) {
    if (state === "completed") {
      return {
        id: taskId,
        state: "completed",
        assets: { video: videoUrl },
      };
    }
    if (state === "failed") {
      return { id: taskId, state: "failed", failure_reason: "mock failure" };
    }
    return { id: taskId, state: "dreaming" };
  },
};

/* ------------------------------------------------------------------ */
/* 6. Pixverse (阿里云百炼 DashScope)                                 */
/* ------------------------------------------------------------------ */
export const pixverseProfile: ProviderProfile = {
  id: "pixverse",
  name: "Pixverse (DashScope)",
  testModel: "pixverse-v2",
  testApiKey: "test-pixverse-key",
  matchGeneratePath: (path) =>
    path.endsWith("/services/aigc/video-generation/video-synthesis"),
  matchStatusPath: (path) => /\/tasks\/[^/]+$/.test(path),
  extractTaskIdFromStatusPath: (path) => extractLastSegment(path),
  validateGenerateBody(body, expected) {
    const errors: string[] = [];
    if (!body.model) errors.push("missing model");
    const input = body.input as Record<string, unknown> | undefined;
    if (!input) {
      errors.push("missing input object");
      return errors;
    }
    if (typeof input.prompt !== "string" || !input.prompt.includes(expected.prompt)) {
      errors.push("prompt mismatch in input.prompt");
    }
    if (expected.firstFrame && !input.image_url) {
      errors.push("missing input.image_url");
    }
    const parameters = body.parameters as Record<string, unknown> | undefined;
    if (!parameters) {
      errors.push("missing parameters object");
    }
    return errors;
  },
  buildGenerateResponse(taskId) {
    return {
      output: { task_id: taskId, task_status: "PENDING" },
      request_id: "req-" + taskId,
    };
  },
  buildStatusResponse(taskId, state, videoUrl, _progress) {
    if (state === "completed") {
      return {
        output: { task_id: taskId, task_status: "SUCCEEDED", video_url: videoUrl },
        request_id: "req-" + taskId,
      };
    }
    if (state === "failed") {
      return {
        output: { task_id: taskId, task_status: "FAILED" },
        request_id: "req-" + taskId,
      };
    }
    return {
      output: { task_id: taskId, task_status: "RUNNING" },
      request_id: "req-" + taskId,
    };
  },
};

/* ------------------------------------------------------------------ */
/* 7. Zhipu AI (智谱)                                                 */
/* ------------------------------------------------------------------ */
export const zhipuProfile: ProviderProfile = {
  id: "zhipu",
  name: "智谱AI",
  testModel: "cogvideox-2",
  testApiKey: "test-zhipu-key",
  matchGeneratePath: (path) => path.endsWith("/videos/generations"),
  matchStatusPath: (path) => /\/videos\/generations\/[^/]+$/.test(path),
  extractTaskIdFromStatusPath: (path) => extractLastSegment(path),
  validateGenerateBody(body, expected) {
    const errors: string[] = [];
    if (!body.model) errors.push("missing model");
    checkPrompt(body, expected, errors);
    if (expected.firstFrame && !body.image_url) {
      errors.push("missing image_url");
    }
    return errors;
  },
  buildGenerateResponse(taskId) {
    return { id: taskId, task_status: "PROCESSING" };
  },
  buildStatusResponse(taskId, state, videoUrl, _progress) {
    if (state === "completed") {
      return { id: taskId, task_status: "SUCCESS", video_url: videoUrl };
    }
    if (state === "failed") {
      return { id: taskId, task_status: "FAIL" };
    }
    return { id: taskId, task_status: "PROCESSING" };
  },
};

/* ------------------------------------------------------------------ */
/* 8. OpenAI-compatible                                               */
/* ------------------------------------------------------------------ */
export const openaiCompatibleProfile: ProviderProfile = {
  id: "openai-compatible",
  name: "OpenAI Compatible",
  testModel: "text-to-video-1",
  testApiKey: "test-openai-key",
  matchGeneratePath: (path) => path.endsWith("/videos/generations"),
  matchStatusPath: (path) => /\/videos\/[^/]+$/.test(path) && !path.includes("/generations/"),
  extractTaskIdFromStatusPath: (path) => extractLastSegment(path),
  validateGenerateBody(body, expected) {
    const errors: string[] = [];
    if (!body.model) errors.push("missing model");
    checkPrompt(body, expected, errors);
    if (expected.firstFrame && !body.image_url) {
      errors.push("missing image_url");
    }
    if (expected.lastFrame && !body.last_frame_url) {
      errors.push("missing last_frame_url");
    }
    return errors;
  },
  buildGenerateResponse(taskId) {
    return { id: taskId, status: "pending" };
  },
  buildStatusResponse(taskId, state, videoUrl, progress) {
    if (state === "completed") {
      return { id: taskId, status: "completed", video_url: videoUrl };
    }
    if (state === "failed") {
      return { id: taskId, status: "failed", error: "mock failure" };
    }
    return { id: taskId, status: state, progress: progress ?? 0 };
  },
};

/* ------------------------------------------------------------------ */
/* 9. OpenAI Sora                                                     */
/* ------------------------------------------------------------------ */
export const openaiSoraProfile: ProviderProfile = {
  id: "openai-sora",
  name: "OpenAI Sora",
  testModel: "sora-2",
  testApiKey: "test-sora-key",
  matchGeneratePath: (path) => path.endsWith("/video/generations"),
  matchStatusPath: (path) => /\/video\/generations\/[^/]+$/.test(path),
  extractTaskIdFromStatusPath: (path) => extractLastSegment(path),
  validateGenerateBody(body, expected) {
    const errors: string[] = [];
    if (!body.model) errors.push("missing model");
    checkPrompt(body, expected, errors);
    if (expected.firstFrame && !body.image_url) {
      errors.push("missing image_url");
    }
    return errors;
  },
  buildGenerateResponse(taskId) {
    return { id: taskId, status: "pending" };
  },
  buildStatusResponse(taskId, state, videoUrl, progress) {
    if (state === "completed") {
      return { id: taskId, status: "completed", video_url: videoUrl };
    }
    if (state === "failed") {
      return { id: taskId, status: "failed", error: "mock failure" };
    }
    return { id: taskId, status: state, progress: progress ?? 0 };
  },
};

/* ------------------------------------------------------------------ */
/* 10. Google (Veo)                                                   */
/* ------------------------------------------------------------------ */
export const googleProfile: ProviderProfile = {
  id: "google",
  name: "Google (Veo)",
  testModel: "veo-3.1",
  testApiKey: "test-google-key",
  matchGeneratePath: (path) => /\/models\/[^/]+:predictLongRunning$/.test(path),
  matchStatusPath: (path) => /\/operations\/[^/]+$/.test(path),
  extractTaskIdFromStatusPath: (path) => extractLastSegment(path),
  validateGenerateBody(body, expected) {
    const errors: string[] = [];
    if (!body.model) errors.push("missing model");
    if (typeof body.prompt !== "string" || !body.prompt.includes(expected.prompt)) {
      errors.push("prompt mismatch");
    }
    if (expected.firstFrame) {
      const image = body.image as Record<string, unknown> | undefined;
      if (!image) errors.push("missing image object for firstFrame");
    }
    return errors;
  },
  buildGenerateResponse(taskId) {
    return { name: `operations/${taskId}` };
  },
  buildStatusResponse(taskId, state, videoUrl, _progress) {
    if (state === "completed") {
      return {
        name: `operations/${taskId}`,
        done: true,
        response: {
          generatedSamples: [{ video: { uri: videoUrl } }],
        },
      };
    }
    if (state === "failed") {
      return {
        name: `operations/${taskId}`,
        done: true,
        error: { message: "mock failure" },
      };
    }
    return { name: `operations/${taskId}`, done: false };
  },
};

/* ------------------------------------------------------------------ */
/* 11. MiniMax (Hailuo)                                               */
/* ------------------------------------------------------------------ */
export const minimaxProfile: ProviderProfile = {
  id: "minimax",
  name: "MiniMax (Hailuo)",
  testModel: "MiniMax-Hailuo-02",
  testApiKey: "test-minimax-key",
  matchGeneratePath: (path) => path.endsWith("/video_generation/task"),
  matchStatusPath: (path) => /\/video_generation\/task\/[^/]+$/.test(path),
  extractTaskIdFromStatusPath: (path) => extractLastSegment(path),
  validateGenerateBody(body, expected) {
    const errors: string[] = [];
    if (!body.model) errors.push("missing model");
    checkPrompt(body, expected, errors);
    if (expected.firstFrame && !body.image_url) {
      errors.push("missing image_url");
    }
    return errors;
  },
  buildGenerateResponse(taskId) {
    return { task_id: taskId, task_status: "processing" };
  },
  buildStatusResponse(taskId, state, videoUrl, _progress) {
    if (state === "completed") {
      // MiniMax 真实返回 file_id，需要二次查询 /files/retrieve 拿下载 URL
      // 但 BaseAIProviderPlugin.extractVideoUrl 默认找 video_url，所以同时返回 video_url 简化测试
      return {
        task_id: taskId,
        task_status: "success",
        file_id: "file-" + taskId,
        file_download_url: videoUrl,
      };
    }
    if (state === "failed") {
      return { task_id: taskId, task_status: "failed", error: "mock failure" };
    }
    return { task_id: taskId, task_status: "processing" };
  },
};

/* ------------------------------------------------------------------ */
/* 12. Kuaishou (Kling)                                               */
/* ------------------------------------------------------------------ */
export const kuaishouProfile: ProviderProfile = {
  id: "kuaishou",
  name: "可灵AI (Kling)",
  testModel: "kling-v3-pro",
  testApiKey: "test-kuaishou-key",
  matchGeneratePath: (path) =>
    path.endsWith("/v1/videos/image2video") ||
    path.endsWith("/v1/videos/text2video"),
  matchStatusPath: (path) => /\/api\/v1\/video\/status\/[^/]+$/.test(path),
  extractTaskIdFromStatusPath: (path) => extractLastSegment(path),
  validateGenerateBody(body, expected) {
    const errors: string[] = [];
    if (!body.model) errors.push("missing model");
    checkPrompt(body, expected, errors);
    if (body.duration !== expected.duration) {
      errors.push(`duration mismatch: expected ${expected.duration}, got ${body.duration}`);
    }
    if (expected.firstFrame && !body.image) {
      errors.push("missing image (firstFrame)");
    }
    if (expected.lastFrame && !body.tail_image) {
      errors.push("missing tail_image (lastFrame)");
    }
    if (expected.characterRefs?.length && !body.subject_reference) {
      errors.push("missing subject_reference (characterRefs)");
    }
    return errors;
  },
  buildGenerateResponse(taskId) {
    return {
      code: 0,
      message: "success",
      data: { task_id: taskId, task_status: "processing" },
    };
  },
  buildStatusResponse(taskId, state, videoUrl, _progress) {
    if (state === "completed") {
      return {
        code: 0,
        data: { task_id: taskId, task_status: "succeed", video_url: videoUrl },
      };
    }
    if (state === "failed") {
      return {
        code: 0,
        data: { task_id: taskId, task_status: "failed" },
      };
    }
    return {
      code: 0,
      data: { task_id: taskId, task_status: "processing" },
    };
  },
};

/* ------------------------------------------------------------------ */
/* All profiles                                                       */
/* ------------------------------------------------------------------ */
export const allProfiles: ProviderProfile[] = [
  volcengineProfile,
  seedanceProfile,
  runwayProfile,
  pikaProfile,
  lumaProfile,
  pixverseProfile,
  zhipuProfile,
  openaiCompatibleProfile,
  openaiSoraProfile,
  googleProfile,
  minimaxProfile,
  kuaishouProfile,
];

/** 根据 provider id 获取 profile */
export function getProfile(id: string): ProviderProfile {
  const profile = allProfiles.find((p) => p.id === id);
  if (!profile) {
    throw new Error(`Unknown provider profile: ${id}`);
  }
  return profile;
}
