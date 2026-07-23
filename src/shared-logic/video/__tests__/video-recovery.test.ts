/**
 * video-recovery 共享逻辑测试
 *
 * 验证 recoverVideoByTaskId 的恢复策略判定：
 * 1. TASK_NOT_FOUND：无 taskRecord
 * 2. VIDEO_ALREADY_EXISTS：本地已完成且有 videoUrl
 * 3. VIDEO_RECOVERY_SUCCESS：云端状态为成功且有 videoUrl
 * 4. CLOUD_TASK_FAILED：云端状态为失败
 * 5. VIDEO_STILL_GENERATING：云端状态为进行中
 * 6. UNKNOWN_STATUS：未知状态
 * 7. QUERY_FAILED：apiGateway 返回 success:false 或无 data
 * 8. 异常路径：apiGateway 抛出错误
 *
 * 另验证导出的超时/重试边界常量。
 *
 * 注：recoverVideoByTaskId 本身是单次查询，不做超时检测或重试循环；
 *     EXPIRY_HOURS / MAX_POLL_DURATION_MS / POLL_INTERVAL_MS / MAX_RECOVERY_ATTEMPTS
 *     是供上层轮询引擎使用的配置常量，此处仅验证其值（重试边界）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recoverVideoByTaskId,
  EXPIRY_HOURS,
  MAX_POLL_DURATION_MS,
  POLL_INTERVAL_MS,
  MAX_RECOVERY_ATTEMPTS,
} from "../video-recovery";

type VideoStatusResult = {
  success: boolean;
  data?: { status?: string; videoUrl?: string };
};

function createMockApiGateway(
  videoStatusImpl: (params: {
    taskId: string;
    providerId?: string;
    modelId?: string;
    format?: string;
  }) => Promise<VideoStatusResult>,
) {
  return { videoStatus: vi.fn(videoStatusImpl) };
}

describe("video-recovery 常量（超时/重试边界）", () => {
  it("EXPIRY_HOURS 应为 720 小时", () => {
    expect(EXPIRY_HOURS).toBe(720);
  });

  it("MAX_POLL_DURATION_MS 应为 30 分钟", () => {
    expect(MAX_POLL_DURATION_MS).toBe(30 * 60 * 1000);
  });

  it("POLL_INTERVAL_MS 应为 60 秒", () => {
    expect(POLL_INTERVAL_MS).toBe(60 * 1000);
  });

  it("MAX_RECOVERY_ATTEMPTS 应为 30 次", () => {
    expect(MAX_RECOVERY_ATTEMPTS).toBe(30);
  });
});

describe("recoverVideoByTaskId 恢复策略判定", () => {
  it("无 taskRecord 时应返回 TASK_NOT_FOUND 且不调用 apiGateway", async () => {
    const gw = createMockApiGateway(async () => ({ success: true, data: {} }));
    const result = await recoverVideoByTaskId(gw, "task-1", undefined);
    expect(result.success).toBe(false);
    expect(result.message).toBe("TASK_NOT_FOUND");
    expect(gw.videoStatus).not.toHaveBeenCalled();
  });

  it("taskRecord 已完成且有 videoUrl 时应返回 VIDEO_ALREADY_EXISTS 且不查询云端", async () => {
    const gw = createMockApiGateway(async () => ({ success: true, data: {} }));
    const result = await recoverVideoByTaskId(gw, "task-1", {
      status: "completed",
      videoUrl: "http://example.com/v.mp4",
    });
    expect(result.success).toBe(true);
    expect(result.videoUrl).toBe("http://example.com/v.mp4");
    expect(result.message).toBe("VIDEO_ALREADY_EXISTS");
    expect(gw.videoStatus).not.toHaveBeenCalled();
  });

  it("taskRecord 已完成但无 videoUrl 时应继续查询云端", async () => {
    const gw = createMockApiGateway(async () => ({
      success: true,
      data: { status: "completed", videoUrl: "http://example.com/v.mp4" },
    }));
    const result = await recoverVideoByTaskId(gw, "task-1", { status: "completed" });
    expect(gw.videoStatus).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.message).toBe("VIDEO_RECOVERY_SUCCESS");
  });
});

describe("recoverVideoByTaskId 云端状态判定", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const successStates = ["done", "completed", "success", "finished", "succeeded"];
  successStates.forEach((status) => {
    it(`云端状态 "${status}" 且有 videoUrl 时应返回 VIDEO_RECOVERY_SUCCESS`, async () => {
      const gw = createMockApiGateway(async () => ({
        success: true,
        data: { status, videoUrl: "http://example.com/v.mp4" },
      }));
      const result = await recoverVideoByTaskId(gw, "task-1", { status: "processing" });
      expect(result.success).toBe(true);
      expect(result.message).toBe("VIDEO_RECOVERY_SUCCESS");
      expect(result.status).toBe("completed");
      expect(result.videoUrl).toBe("http://example.com/v.mp4");
    });
  });

  const failedStates = ["fail", "failed", "error"];
  failedStates.forEach((status) => {
    it(`云端状态 "${status}" 时应返回 CLOUD_TASK_FAILED`, async () => {
      const gw = createMockApiGateway(async () => ({
        success: true,
        data: { status },
      }));
      const result = await recoverVideoByTaskId(gw, "task-1", { status: "processing" });
      expect(result.success).toBe(false);
      expect(result.message).toBe("CLOUD_TASK_FAILED");
    });
  });

  const pendingStates = [
    "pending",
    "generating",
    "processing",
    "wait",
    "running",
    "queued",
    "in_progress",
  ];
  pendingStates.forEach((status) => {
    it(`云端状态 "${status}" 时应返回 VIDEO_STILL_GENERATING`, async () => {
      const gw = createMockApiGateway(async () => ({
        success: true,
        data: { status },
      }));
      const result = await recoverVideoByTaskId(gw, "task-1", { status: "processing" });
      expect(result.success).toBe(false);
      expect(result.message).toBe("VIDEO_STILL_GENERATING");
    });
  });

  it("云端状态为成功但无 videoUrl 时不应返回 VIDEO_RECOVERY_SUCCESS（落入 UNKNOWN_STATUS）", async () => {
    const gw = createMockApiGateway(async () => ({
      success: true,
      data: { status: "completed" }, // 无 videoUrl
    }));
    const result = await recoverVideoByTaskId(gw, "task-1", { status: "processing" });
    expect(result.success).toBe(false);
    expect(result.message).toBe("UNKNOWN_STATUS: completed");
  });

  it("云端状态未知时应返回 UNKNOWN_STATUS: <status>", async () => {
    const gw = createMockApiGateway(async () => ({
      success: true,
      data: { status: "weird_state" },
    }));
    const result = await recoverVideoByTaskId(gw, "task-1", { status: "processing" });
    expect(result.success).toBe(false);
    expect(result.message).toBe("UNKNOWN_STATUS: weird_state");
  });

  it("云端状态大小写不敏感（COMPLETED 应识别为成功）", async () => {
    const gw = createMockApiGateway(async () => ({
      success: true,
      data: { status: "COMPLETED", videoUrl: "http://example.com/v.mp4" },
    }));
    const result = await recoverVideoByTaskId(gw, "task-1", { status: "processing" });
    expect(result.success).toBe(true);
    expect(result.message).toBe("VIDEO_RECOVERY_SUCCESS");
  });

  it("云端状态为空字符串时应返回 UNKNOWN_STATUS", async () => {
    const gw = createMockApiGateway(async () => ({
      success: true,
      data: { status: "" },
    }));
    const result = await recoverVideoByTaskId(gw, "task-1", { status: "processing" });
    expect(result.success).toBe(false);
    expect(result.message).toBe("UNKNOWN_STATUS: ");
  });
});

describe("recoverVideoByTaskId apiGateway 调用", () => {
  it("应将 taskRecord 的 providerId/providerModelId/providerFormat 透传给 videoStatus", async () => {
    const gw = createMockApiGateway(async () => ({
      success: true,
      data: { status: "completed", videoUrl: "http://example.com/v.mp4" },
    }));
    await recoverVideoByTaskId(gw, "task-abc", {
      status: "processing",
      providerId: "kling",
      providerModelId: "v1",
      providerFormat: "mp4",
    });
    expect(gw.videoStatus).toHaveBeenCalledWith({
      taskId: "task-abc",
      providerId: "kling",
      modelId: "v1",
      format: "mp4",
    });
  });

  it("taskRecord 无 provider 字段时应透传 undefined", async () => {
    const gw = createMockApiGateway(async () => ({
      success: true,
      data: { status: "completed", videoUrl: "http://example.com/v.mp4" },
    }));
    await recoverVideoByTaskId(gw, "task-abc", { status: "processing" });
    expect(gw.videoStatus).toHaveBeenCalledWith({
      taskId: "task-abc",
      providerId: undefined,
      modelId: undefined,
      format: undefined,
    });
  });

  it("apiGateway 返回 success:false 时应返回 QUERY_FAILED", async () => {
    const gw = createMockApiGateway(async () => ({ success: false }));
    const result = await recoverVideoByTaskId(gw, "task-1", { status: "processing" });
    expect(result.success).toBe(false);
    expect(result.message).toBe("QUERY_FAILED");
  });

  it("apiGateway 返回 success:true 但无 data 时应返回 QUERY_FAILED", async () => {
    const gw = createMockApiGateway(async () => ({ success: true }));
    const result = await recoverVideoByTaskId(gw, "task-1", { status: "processing" });
    expect(result.success).toBe(false);
    expect(result.message).toBe("QUERY_FAILED");
  });

  it("apiGateway 抛出 Error 时应返回错误 message", async () => {
    const gw = createMockApiGateway(async () => {
      throw new Error("network timeout");
    });
    const result = await recoverVideoByTaskId(gw, "task-1", { status: "processing" });
    expect(result.success).toBe(false);
    expect(result.message).toBe("network timeout");
  });

  it("apiGateway 抛出非 Error 值时应返回 UNKNOWN_ERROR", async () => {
    const gw = createMockApiGateway(async () => {
      throw "string error"; // 非 Error
    });
    const result = await recoverVideoByTaskId(gw, "task-1", { status: "processing" });
    expect(result.success).toBe(false);
    expect(result.message).toBe("UNKNOWN_ERROR");
  });
});
