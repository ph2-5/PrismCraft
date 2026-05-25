import { describe, it, expect } from "vitest";
import {
  videoTaskSchema,
  videoTaskStatusSchema,
  apiResponseSchema,
  apiErrorCodeSchema,
  videoGenerationResultSchema,
  imageGenerationResultSchema,
  healthStatusSchema,
} from "@/domain/schemas/api";
import { factories } from "@/__tests__/mocks/factories";

describe("videoTaskSchema", () => {
  it("应解析有效的视频任务数据", () => {
    const valid = factories.videoTask();
    const result = videoTaskSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少必填字段 taskId", () => {
    const { taskId: _, ...noTaskId } = factories.videoTask();
    const result = videoTaskSchema.safeParse(noTaskId);
    expect(result.success).toBe(false);
  });

  it("应拒绝非法 status 枚举值", () => {
    const data = factories.videoTask({ status: "invalid" as any });
    const result = videoTaskSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("应接受所有合法 status 枚举值", () => {
    const statuses: Array<"pending" | "generating" | "completed" | "failed" | "cancelled" | "retrying"> = [
      "pending", "generating", "completed", "failed", "cancelled", "retrying",
    ];
    for (const status of statuses) {
      const data = factories.videoTask({ status });
      const result = videoTaskSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it("应拒绝 progress 超出 0-100 范围", () => {
    const over = factories.videoTask({ progress: 101 });
    expect(videoTaskSchema.safeParse(over).success).toBe(false);
    const under = factories.videoTask({ progress: -1 });
    expect(videoTaskSchema.safeParse(under).success).toBe(false);
  });

  it("应接受 progress 边界值 0 和 100", () => {
    const atMin = factories.videoTask({ progress: 0 });
    expect(videoTaskSchema.safeParse(atMin).success).toBe(true);
    const atMax = factories.videoTask({ progress: 100 });
    expect(videoTaskSchema.safeParse(atMax).success).toBe(true);
  });

  it("应拒绝负数 pollFailureCount", () => {
    const data = factories.videoTask({ pollFailureCount: -1 });
    const result = videoTaskSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("应拒绝负数 recoveryAttempts", () => {
    const data = factories.videoTask({ recoveryAttempts: -1 });
    const result = videoTaskSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("应正确应用默认值", () => {
    const minimal = {
      taskId: "task_1",
      status: "pending" as const,
      progress: 0,
      createdAt: new Date().toISOString(),
    };
    const result = videoTaskSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe("");
    }
  });
});

describe("videoTaskStatusSchema", () => {
  it("应接受所有合法枚举值", () => {
    const validValues = ["pending", "generating", "completed", "failed", "cancelled", "retrying"];
    for (const val of validValues) {
      expect(videoTaskStatusSchema.safeParse(val).success).toBe(true);
    }
  });

  it("应拒绝非法枚举值", () => {
    expect(videoTaskStatusSchema.safeParse("invalid").success).toBe(false);
  });
});

describe("apiResponseSchema", () => {
  it("应解析成功响应", () => {
    const result = apiResponseSchema.safeParse({
      success: true,
      data: { url: "/mock/video.mp4" },
    });
    expect(result.success).toBe(true);
  });

  it("应解析失败响应", () => {
    const result = apiResponseSchema.safeParse({
      success: false,
      error: "API 调用失败",
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少 success 字段的数据", () => {
    const result = apiResponseSchema.safeParse({
      data: { url: "/mock/video.mp4" },
    });
    expect(result.success).toBe(false);
  });

  it("应拒绝失败响应缺少 error 字段", () => {
    const result = apiResponseSchema.safeParse({
      success: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("apiErrorCodeSchema", () => {
  it("应接受所有合法错误码", () => {
    const codes = [
      "INVALID_API_KEY", "RATE_LIMITED", "ENDPOINT_NOT_FOUND",
      "API_SERVER_ERROR", "TIMEOUT", "CONNECTION_FAILED",
      "INVALID_RESPONSE", "POLLINATIONS_FAILED", "INTERNAL_ERROR", "UNKNOWN_ERROR",
    ];
    for (const code of codes) {
      expect(apiErrorCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it("应拒绝非法错误码", () => {
    expect(apiErrorCodeSchema.safeParse("INVALID_CODE").success).toBe(false);
  });
});

describe("videoGenerationResultSchema", () => {
  it("应解析有效的视频生成结果", () => {
    const result = videoGenerationResultSchema.safeParse({
      videoUrl: "/mock/video.mp4",
      taskId: "task_1",
      status: "completed",
    });
    expect(result.success).toBe(true);
  });

  it("应接受全部可选字段缺失", () => {
    const result = videoGenerationResultSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("imageGenerationResultSchema", () => {
  it("应解析有效的图片生成结果", () => {
    const result = imageGenerationResultSchema.safeParse({
      imageUrl: "/mock/image.png",
      source: "openai",
      prompt: "测试提示词",
    });
    expect(result.success).toBe(true);
  });

  it("应接受缺少可选字段", () => {
    const result = imageGenerationResultSchema.safeParse({
      imageUrl: "/mock/image.png",
    });
    expect(result.success).toBe(true);
  });
});

describe("healthStatusSchema", () => {
  it("应解析有效的健康状态", () => {
    const result = healthStatusSchema.safeParse({
      text: { configured: true, provider: "openai", available: true },
      image: { configured: true, provider: "openai", available: true },
      video: { configured: false, provider: "", available: false },
      vision: { configured: false, provider: "", available: false },
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少子字段", () => {
    const result = healthStatusSchema.safeParse({
      text: { configured: true },
    });
    expect(result.success).toBe(false);
  });
});
