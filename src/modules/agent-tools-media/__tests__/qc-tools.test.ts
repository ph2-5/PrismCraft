/**
 * QC Tools 单元测试（Task 2A.23 Agent 集成）
 *
 * 测试 2 个 Agent 工具：
 * - check_video_consistency：对已完成视频任务执行一致性 QC
 * - dispatch_video_fallback：根据 QCReport 主动触发 fallback
 *
 * Mock 策略：
 * - container.videoTaskStorage / container.storyStorage
 * - @/modules/video/consistency-qc 的所有导出（runQualityCheck / dispatchFallback / buildQCInput 等）
 * - TOOL_TIMEOUTS 常量
 * - errorLogger
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import type { VideoTask, StoryBeat, Story } from "@/domain/schemas";
import type { QCReport } from "@/modules/video/consistency-qc";

// ── Mock 依赖 ──────────────────────────────────────────────────────────────
const {
  mockVideoTaskStorage,
  mockStoryStorage,
  mockRunQualityCheck,
  mockDispatchFallback,
  mockBuildQCInput,
  mockIsFallbackTerminal,
  mockPredictNextAction,
  mockResolvePolicy,
  mockErrorLogger,
} = vi.hoisted(() => {
  const mockVideoTaskStorage = {
    getVideoTaskById: vi.fn(),
    createVideoTask: vi.fn(),
  };
  const mockStoryStorage = {
    getStoryByBeatId: vi.fn(),
    getStoryVersion: vi.fn(),
    updateStory: vi.fn(),
  };
  return {
    mockVideoTaskStorage,
    mockStoryStorage,
    mockRunQualityCheck: vi.fn(),
    mockDispatchFallback: vi.fn(),
    mockBuildQCInput: vi.fn(),
    mockIsFallbackTerminal: vi.fn(),
    mockPredictNextAction: vi.fn(),
    mockResolvePolicy: vi.fn(),
    mockErrorLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoTaskStorage: mockVideoTaskStorage,
    storyStorage: mockStoryStorage,
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/constants/tool-timeouts", () => ({
  TOOL_TIMEOUTS: {
    query: 30_000,
    mutation: 60_000,
    generation: 300_000,
    videoTask: 1_800_000,
    download: 600_000,
  },
}));

vi.mock("@/modules/video/consistency-qc", () => ({
  runQualityCheck: mockRunQualityCheck,
  dispatchFallback: mockDispatchFallback,
  buildQCInput: mockBuildQCInput,
  isFallbackTerminal: mockIsFallbackTerminal,
  predictNextAction: mockPredictNextAction,
  resolvePolicy: mockResolvePolicy,
  DEFAULT_DRIFT_POLICY: {
    warningThreshold: 0.7,
    criticalThreshold: 0.5,
    maxRegenerateAttempts: 2,
    fallbackToFaceSwap: true,
    autoMarkManualReview: true,
    sampleFrameRate: 1,
  },
  createEmptyQCReport: (videoTaskId: string) => ({
    videoTaskId,
    totalFrames: 0,
    sampledFrames: 0,
    frameScores: [],
    averageScore: 0,
    minScore: 0,
    verdict: "pass",
    actionTaken: "none",
    createdAt: "2026-01-01T00:00:00.000Z",
  }),
}));

import {
  checkVideoConsistencyTool,
  dispatchVideoFallbackTool,
  qcTools,
} from "../qc-tools";
import type { ToolContext } from "@/domain/types/agent-tools";
import { createEmptyQCReport } from "@/modules/video/consistency-qc";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

/** 构造 VideoTask mock */
function makeTask(overrides: Partial<VideoTask> = {}): VideoTask {
  return {
    taskId: "task_1",
    status: "completed",
    progress: 100,
    message: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    prompt: "测试提示词",
    providerId: "provider_1",
    providerModelId: "model_1",
    providerFormat: "openai",
    videoUrl: "file://test/video.mp4",
    beatId: "beat_1",
    storyId: "story_1",
    ...overrides,
  } as VideoTask;
}

/** 构造 StoryBeat mock */
function makeBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat_1",
    title: "测试分镜",
    duration: 5,
    characterIds: ["char_1"],
    fixedImage: { imageUrl: "file://test/char.png" },
    ...overrides,
  } as StoryBeat;
}

/** 构造 Story mock */
function makeStory(beats: StoryBeat[] = [makeBeat()]): Story {
  return {
    id: "story_1",
    title: "测试故事",
    beats,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as Story;
}

/** 构造 drift_critical 的 QCReport */
function makeCriticalReport(retryCount = 0): QCReport {
  const report = createEmptyQCReport("task_1");
  report.verdict = "drift_critical";
  report.minScore = 0.3;
  report.averageScore = 0.5;
  report.retryCount = retryCount;
  report.sampledFrames = 5;
  report.totalFrames = 120;
  report.frameScores = [
    { frameIndex: 0, timestamp: 0, cosineSimilarity: 0.3, faceDetected: true },
    { frameIndex: 1, timestamp: 1, cosineSimilarity: 0.6, faceDetected: true },
  ];
  return report;
}

/** 构造 pass 的 QCReport */
function makePassReport(): QCReport {
  const report = createEmptyQCReport("task_1");
  report.verdict = "pass";
  report.minScore = 0.9;
  report.averageScore = 0.95;
  report.sampledFrames = 5;
  report.totalFrames = 120;
  return report;
}

beforeEach(() => {
  vi.clearAllMocks();
  // 默认 mock 行为
  mockResolvePolicy.mockReturnValue({
    warningThreshold: 0.7,
    criticalThreshold: 0.5,
    maxRegenerateAttempts: 2,
    fallbackToFaceSwap: true,
    autoMarkManualReview: true,
    sampleFrameRate: 1,
  });
});

// ============================================================
// qcTools 数组
// ============================================================
describe("qcTools", () => {
  it("应包含 2 个工具", () => {
    expect(qcTools).toHaveLength(2);
    expect(qcTools[0]?.def.function.name).toBe("check_video_consistency");
    expect(qcTools[1]?.def.function.name).toBe("dispatch_video_fallback");
  });
});

// ============================================================
// 1. check_video_consistency
// ============================================================
describe("check_video_consistency", () => {
  it("任务不存在时返回错误", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(null);

    const result = await checkVideoConsistencyTool.execute({ taskId: "nonexistent" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("视频任务不存在");
  });

  it("任务状态非 completed 时返回错误", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ status: "generating", videoUrl: undefined }),
    );

    const result = await checkVideoConsistencyTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("必须为 completed");
  });

  it("任务无 videoUrl 时返回错误", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ status: "completed", videoUrl: undefined }),
    );

    const result = await checkVideoConsistencyTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("无 videoUrl");
  });

  it("beat.qcReport 已存在且不强制重检查时返回 cached=true", async () => {
    const existingReport = makePassReport();
    const beat = makeBeat({ qcReport: existingReport });
    const story = makeStory([beat]);
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(story);

    const result = await checkVideoConsistencyTool.execute(
      { taskId: "task_1", forceRecheck: false },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect((result.data as { cached: boolean }).cached).toBe(true);
    expect(mockRunQualityCheck).not.toHaveBeenCalled();
    expect((result.data as { needsFallback: boolean }).needsFallback).toBe(false);
  });

  it("forceRecheck=true 时即使 qcReport 已存在也重新执行 QC", async () => {
    const existingReport = makePassReport();
    const beat = makeBeat({ qcReport: existingReport });
    const story = makeStory([beat]);
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(story);
    mockStoryStorage.getStoryVersion.mockResolvedValue(1);

    const newReport = makeCriticalReport(0);
    mockBuildQCInput.mockReturnValue({
      videoTaskId: "task_1",
      videoUrl: "file://test/video.mp4",
      durationSec: 5,
      beatId: "beat_1",
    });
    mockRunQualityCheck.mockResolvedValue({
      report: newReport,
      needsFallback: true,
      providerType: "vlm",
      sampledFrameUrls: ["frame_1.jpg", "frame_2.jpg"],
    });

    const result = await checkVideoConsistencyTool.execute(
      { taskId: "task_1", forceRecheck: true },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect((result.data as { cached: boolean }).cached).toBe(false);
    expect(mockRunQualityCheck).toHaveBeenCalledTimes(1);
    expect((result.data as { needsFallback: boolean }).needsFallback).toBe(true);
    expect(mockStoryStorage.updateStory).toHaveBeenCalledWith(
      "story_1",
      expect.objectContaining({ beats: expect.any(Array) }),
      1,
    );
  });

  it("QC 成功时持久化 QCReport 并返回 report 摘要", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(makeStory([makeBeat()]));
    mockStoryStorage.getStoryVersion.mockResolvedValue(1);

    const report = makePassReport();
    mockBuildQCInput.mockReturnValue({
      videoTaskId: "task_1",
      videoUrl: "file://test/video.mp4",
      durationSec: 5,
      beatId: "beat_1",
    });
    mockRunQualityCheck.mockResolvedValue({
      report,
      needsFallback: false,
      providerType: "vlm",
      sampledFrameUrls: ["frame_1.jpg"],
    });

    const result = await checkVideoConsistencyTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(true);
    expect((result.data as { persisted: boolean }).persisted).toBe(true);
    const reportSummary = (result.data as { report: Record<string, unknown> }).report;
    expect(reportSummary?.verdict).toBe("pass");
    expect(reportSummary?.averageScore).toBe(0.95);
    // 摘要不应包含完整 frameScores，只包含 worstFrames
    expect(reportSummary).not.toHaveProperty("frameScores");
    expect(reportSummary).toHaveProperty("worstFrames");
  });

  it("QC 异常时返回错误", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(makeStory([makeBeat()]));
    mockBuildQCInput.mockReturnValue({
      videoTaskId: "task_1",
      videoUrl: "file://test/video.mp4",
      durationSec: 5,
      beatId: "beat_1",
    });
    mockRunQualityCheck.mockRejectedValue(new Error("抽帧失败"));

    const result = await checkVideoConsistencyTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("QC 执行失败");
    expect(result.error).toContain("抽帧失败");
  });

  it("beatId 缺失时 QC 仍执行但不持久化", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask({ beatId: undefined }));
    mockBuildQCInput.mockReturnValue({
      videoTaskId: "task_1",
      videoUrl: "file://test/video.mp4",
      durationSec: 5,
    });
    mockRunQualityCheck.mockResolvedValue({
      report: makePassReport(),
      needsFallback: false,
      providerType: "vlm",
      sampledFrameUrls: ["frame_1.jpg"],
    });

    const result = await checkVideoConsistencyTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(true);
    expect((result.data as { persisted: boolean }).persisted).toBe(false);
    expect(mockStoryStorage.updateStory).not.toHaveBeenCalled();
  });

  it("story 不存在时 QC 仍执行但 persisted=false", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(null);
    mockBuildQCInput.mockReturnValue({
      videoTaskId: "task_1",
      videoUrl: "file://test/video.mp4",
      durationSec: 5,
      beatId: "beat_1",
    });
    mockRunQualityCheck.mockResolvedValue({
      report: makePassReport(),
      needsFallback: false,
      providerType: "vlm",
      sampledFrameUrls: ["frame_1.jpg"],
    });

    const result = await checkVideoConsistencyTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(true);
    expect((result.data as { persisted: boolean }).persisted).toBe(false);
  });

  it("工具元数据正确", () => {
    expect(checkVideoConsistencyTool.domain).toBe("video");
    expect(checkVideoConsistencyTool.dangerLevel).toBe("safe");
    expect(checkVideoConsistencyTool.timeoutMs).toBe(1_800_000);
    expect(checkVideoConsistencyTool.def.function.parameters.required).toEqual(["taskId"]);
  });
});

// ============================================================
// 2. dispatch_video_fallback
// ============================================================
describe("dispatch_video_fallback", () => {
  it("任务不存在时返回错误", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(null);

    const result = await dispatchVideoFallbackTool.execute({ taskId: "nonexistent" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("视频任务不存在");
  });

  it("beat.qcReport 不存在时返回错误（提示先调用 check_video_consistency）", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(makeStory([makeBeat({ qcReport: undefined })]));

    const result = await dispatchVideoFallbackTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("未执行过 QC");
    expect(result.error).toContain("check_video_consistency");
  });

  it("verdict=pass 时 dispatchFallback 返回 action=none", async () => {
    const passReport = makePassReport();
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(makeStory([makeBeat({ qcReport: passReport })]));
    mockStoryStorage.getStoryVersion.mockResolvedValue(1);

    mockDispatchFallback.mockResolvedValue({
      action: "none",
      ok: true,
      updatedReport: passReport,
    });
    mockIsFallbackTerminal.mockReturnValue(false);

    const result = await dispatchVideoFallbackTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(true);
    expect((result.data as { action: string }).action).toBe("none");
    expect(mockDispatchFallback).toHaveBeenCalledTimes(1);
  });

  it("verdict=drift_critical retryCount=0 时返回 action=regenerate + newTaskId", async () => {
    const criticalReport = makeCriticalReport(0);
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(
      makeStory([makeBeat({ qcReport: criticalReport })]),
    );
    mockStoryStorage.getStoryVersion.mockResolvedValue(1);

    const updatedReport = { ...criticalReport, retryCount: 1, actionTaken: "regenerated" as const };
    mockDispatchFallback.mockResolvedValue({
      action: "regenerate",
      ok: true,
      newTaskId: "retry-task-1",
      updatedReport,
    });
    mockIsFallbackTerminal.mockReturnValue(false);

    const result = await dispatchVideoFallbackTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(true);
    expect((result.data as { action: string }).action).toBe("regenerate");
    expect((result.data as { newTaskId: string }).newTaskId).toBe("retry-task-1");
    expect((result.data as { retryCount: number }).retryCount).toBe(1);
    expect((result.data as { isTerminal: boolean }).isTerminal).toBe(false);
    expect((result.data as { persisted: boolean }).persisted).toBe(true);
  });

  it("verdict=drift_critical retryCount=3 时返回 action=manual_review + isTerminal=true", async () => {
    const criticalReport = makeCriticalReport(3);
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(
      makeStory([makeBeat({ qcReport: criticalReport })]),
    );
    mockStoryStorage.getStoryVersion.mockResolvedValue(1);

    const updatedReport = {
      ...criticalReport,
      retryCount: 4,
      actionTaken: "manual_review" as const,
    };
    mockDispatchFallback.mockResolvedValue({
      action: "manual_review",
      ok: true,
      updatedReport,
    });
    mockIsFallbackTerminal.mockReturnValue(true);

    const result = await dispatchVideoFallbackTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(true);
    expect((result.data as { action: string }).action).toBe("manual_review");
    expect((result.data as { isTerminal: boolean }).isTerminal).toBe(true);
  });

  it("forceAction=manual_review 时直接走 manual_review 路径，不调用 dispatchFallback", async () => {
    const criticalReport = makeCriticalReport(0);
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(
      makeStory([makeBeat({ qcReport: criticalReport })]),
    );
    mockStoryStorage.getStoryVersion.mockResolvedValue(1);

    const result = await dispatchVideoFallbackTool.execute(
      { taskId: "task_1", forceAction: "manual_review" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect((result.data as { action: string }).action).toBe("manual_review");
    expect((result.data as { retryCount: number }).retryCount).toBe(1);
    expect((result.data as { isTerminal: boolean }).isTerminal).toBe(true);
    // 关键：不应调用 dispatchFallback（直接走 manual_review 路径）
    expect(mockDispatchFallback).not.toHaveBeenCalled();
    // 但应持久化
    expect(mockStoryStorage.updateStory).toHaveBeenCalledWith(
      "story_1",
      expect.objectContaining({ beats: expect.any(Array) }),
      1,
    );
  });

  it("forceAction=face_swap 但 retryCount=0 时返回错误（与 fallback 链不匹配）", async () => {
    const criticalReport = makeCriticalReport(0);
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(
      makeStory([makeBeat({ qcReport: criticalReport })]),
    );

    // predictNextAction 返回 "regenerate"（retryCount=0 时应该是 regenerate，不是 face_swap）
    mockPredictNextAction.mockReturnValue("regenerate");

    const result = await dispatchVideoFallbackTool.execute(
      { taskId: "task_1", forceAction: "face_swap" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("forceAction=\"face_swap\"");
    expect(result.error).toContain("自动决策应为 \"regenerate\"");
    expect(mockDispatchFallback).not.toHaveBeenCalled();
  });

  it("forceAction=regenerate 但 verdict=pass 时返回错误（verdict 非 critical）", async () => {
    const passReport = makePassReport();
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(
      makeStory([makeBeat({ qcReport: passReport })]),
    );

    // verdict=pass 时 predictNextAction 返回 "none"
    mockPredictNextAction.mockReturnValue("none");

    const result = await dispatchVideoFallbackTool.execute(
      { taskId: "task_1", forceAction: "regenerate" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("forceAction=\"regenerate\"");
    expect(result.error).toContain("verdict=\"pass\" 非 drift_critical");
    expect(result.error).toContain("无需触发 fallback");
    expect(mockDispatchFallback).not.toHaveBeenCalled();
  });

  it("dispatchFallback 异常时返回错误", async () => {
    const criticalReport = makeCriticalReport(0);
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(
      makeStory([makeBeat({ qcReport: criticalReport })]),
    );

    mockDispatchFallback.mockRejectedValue(new Error("addTask 失败"));

    const result = await dispatchVideoFallbackTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("fallback 执行异常");
    expect(result.error).toContain("addTask 失败");
  });

  it("dispatchFallback 失败时（ok=false）返回 success=false + error", async () => {
    const criticalReport = makeCriticalReport(0);
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(
      makeStory([makeBeat({ qcReport: criticalReport })]),
    );

    mockDispatchFallback.mockResolvedValue({
      action: "regenerate",
      ok: false,
      error: "videoTaskStore 未提供",
      updatedReport: criticalReport,
    });
    mockIsFallbackTerminal.mockReturnValue(false);

    const result = await dispatchVideoFallbackTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toBe("videoTaskStore 未提供");
    expect((result.data as { action: string }).action).toBe("regenerate");
    expect((result.data as { ok: boolean }).ok).toBe(false);
  });

  it("task.beatId 缺失时返回错误（无法获取 qcReport）", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask({ beatId: undefined }));

    const result = await dispatchVideoFallbackTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("未执行过 QC");
    expect(mockDispatchFallback).not.toHaveBeenCalled();
  });

  it("storyStorage.updateStory 异常时 persisted=false 但 dispatchFallback 仍成功", async () => {
    const criticalReport = makeCriticalReport(0);
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mockStoryStorage.getStoryByBeatId.mockResolvedValue(
      makeStory([makeBeat({ qcReport: criticalReport })]),
    );
    mockStoryStorage.getStoryVersion.mockResolvedValue(1);
    mockStoryStorage.updateStory.mockRejectedValue(new Error("DB 写入失败"));

    mockDispatchFallback.mockResolvedValue({
      action: "regenerate",
      ok: true,
      newTaskId: "retry-task-1",
      updatedReport: { ...criticalReport, retryCount: 1, actionTaken: "regenerated" },
    });
    mockIsFallbackTerminal.mockReturnValue(false);

    const result = await dispatchVideoFallbackTool.execute({ taskId: "task_1" }, makeCtx());

    expect(result.success).toBe(true);
    expect((result.data as { persisted: boolean }).persisted).toBe(false);
    expect(mockErrorLogger.warn).toHaveBeenCalled();
  });

  it("工具元数据正确", () => {
    expect(dispatchVideoFallbackTool.domain).toBe("video");
    expect(dispatchVideoFallbackTool.dangerLevel).toBe("limited");
    expect(dispatchVideoFallbackTool.timeoutMs).toBe(60_000);
    expect(dispatchVideoFallbackTool.def.function.parameters.required).toEqual(["taskId"]);
  });
});
