/**
 * Shot Tools 单元测试
 *
 * 覆盖 5 个分镜生成工具：
 * - generate_beat_keyframe：生成分镜关键帧
 * - generate_beat_frame_pair：生成分镜首尾帧
 * - generate_beat_video：生成分镜视频（异步任务）
 * - batch_generate：批量生成（关键帧/帧对/视频）
 * - regenerate_beat：重生成（覆盖旧结果）
 *
 * Mock 策略：
 * - container（videoProvider / imageProvider / textProvider）
 * - storyService（动态 import @/modules/story）
 * - characterService / sceneService（动态 import）
 * - generateBeatKeyframe / generateBeatFramePair / generateBeatVideo（@/modules/story/generation）
 * - TOOL_TIMEOUTS（../../services/tool-executor）
 *
 * 测试重点：前置条件检查、Result 模式错误传播、批量结果聚合、重生成清除旧结果
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.hoisted：mock 变量在 vi.mock 工厂执行前就已定义
const mocks = vi.hoisted(() => ({
  videoProvider: { generateVideo: vi.fn() },
  imageProvider: { generateImage: vi.fn() },
  textProvider: { generateText: vi.fn() },
  storyService: {
    getById: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateBeatMediaUrls: vi.fn(),
  },
  characterService: {
    getAll: vi.fn(),
  },
  sceneService: {
    getAll: vi.fn(),
  },
  generateBeatKeyframe: vi.fn(),
  generateBeatFramePair: vi.fn(),
  generateBeatVideo: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoProvider: mocks.videoProvider,
    imageProvider: mocks.imageProvider,
    textProvider: mocks.textProvider,
  },
}));

vi.mock("@/modules/story", () => ({
  storyService: mocks.storyService,
}));

vi.mock("@/modules/character", () => ({
  characterService: mocks.characterService,
}));

vi.mock("@/modules/scene", () => ({
  sceneService: mocks.sceneService,
}));

vi.mock("@/modules/story/generation", () => ({
  generateBeatKeyframe: mocks.generateBeatKeyframe,
  generateBeatFramePair: mocks.generateBeatFramePair,
  generateBeatVideo: mocks.generateBeatVideo,
}));

vi.mock("../../services/tool-executor", () => ({
  TOOL_TIMEOUTS: {
    query: 5000,
    mutation: 30000,
    generation: 120000,
    videoTask: 600000,
    download: 60000,
  },
}));

import {
  generateBeatKeyframeTool,
  generateBeatFramePairTool,
  generateBeatVideoTool,
  batchGenerateTool,
  regenerateBeatTool,
  shotTools,
} from "../shot-tools";
import type { ToolContext } from "../../domain/types";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

/** 构造成功的 Result */
function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

/** 构造失败的 Result */
function err(error: Error): { ok: false; error: Error } {
  return { ok: false, error };
}

/** 构造测试故事（b1 无媒体，b2 已有 keyframe/framePair/videoGen） */
function makeStory() {
  return {
    id: "s1",
    title: "测试故事",
    description: "D",
    beats: [
      {
        id: "b1",
        title: "开场",
        content: "城市全景",
        duration: 8,
        characterIds: ["c1"],
        sceneId: "sc1",
      },
      {
        id: "b2",
        title: "冲突",
        content: "主角冲突",
        duration: 5,
        characterIds: ["c1"],
        sceneId: "sc1",
        keyframe: { imageUrl: "https://example.com/kf.jpg" },
        framePair: {
          firstFrameUrl: "https://example.com/ff.jpg",
          lastFrameUrl: "https://example.com/lf.jpg",
        },
        videoGen: { taskId: "old_task" },
      },
    ],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // 默认 characterService.getAll 和 sceneService.getAll 返回空数组
  mocks.characterService.getAll.mockResolvedValue(ok([]));
  mocks.sceneService.getAll.mockResolvedValue(ok([]));
  // 默认 updateBeatMediaUrls 成功
  mocks.storyService.updateBeatMediaUrls.mockResolvedValue(undefined);
});

// ============================================================
// 1. generate_beat_keyframe
// ============================================================
describe("generate_beat_keyframe", () => {
  it("1. 正常生成关键帧（含 customPrompt）", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatKeyframe.mockResolvedValue(
      ok({ imageUrl: "https://example.com/new_kf.jpg", prompt: "a cityscape" }),
    );

    const result = await generateBeatKeyframeTool.execute(
      { storyId: "s1", beatId: "b1", customPrompt: "custom prompt" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { imageUrl: string; prompt: string; beatId: string };
    expect(data.imageUrl).toBe("https://example.com/new_kf.jpg");
    expect(data.prompt).toBe("a cityscape");
    expect(data.beatId).toBe("b1");
    // 验证 customPrompt 传递到生成函数
    const genArgs = mocks.generateBeatKeyframe.mock.calls[0];
    expect(genArgs[2].customPrompt).toBe("custom prompt");
    // 验证持久化被调用
    expect(mocks.storyService.updateBeatMediaUrls).toHaveBeenCalledWith([
      { id: "b1", keyframeImageUrl: "https://example.com/new_kf.jpg" },
    ]);
  });

  it("2. 故事不存在时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await generateBeatKeyframeTool.execute(
      { storyId: "missing", beatId: "b1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取故事失败");
    expect(mocks.generateBeatKeyframe).not.toHaveBeenCalled();
  });

  it("3. 分镜不存在时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));

    const result = await generateBeatKeyframeTool.execute(
      { storyId: "s1", beatId: "missing_beat" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("未找到分镜");
    expect(result.error).toContain("missing_beat");
  });

  it("4. generateBeatKeyframe 失败时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatKeyframe.mockResolvedValue(err(new Error("AI 生成失败")));

    const result = await generateBeatKeyframeTool.execute(
      { storyId: "s1", beatId: "b1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("生成关键帧失败");
    expect(result.error).toContain("AI 生成失败");
  });

  it("5. 持久化失败时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatKeyframe.mockResolvedValue(
      ok({ imageUrl: "https://example.com/kf.jpg", prompt: "p" }),
    );
    mocks.storyService.updateBeatMediaUrls.mockRejectedValue(new Error("DB locked"));

    const result = await generateBeatKeyframeTool.execute(
      { storyId: "s1", beatId: "b1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("关键帧已生成但持久化失败");
    expect(result.error).toContain("DB locked");
  });
});

// ============================================================
// 2. generate_beat_frame_pair
// ============================================================
describe("generate_beat_frame_pair", () => {
  it("6. 正常生成首尾帧（关键帧已存在）", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatFramePair.mockResolvedValue(
      ok({
        firstFrameUrl: "https://example.com/ff.jpg",
        lastFrameUrl: "https://example.com/lf.jpg",
        firstFramePrompt: "first prompt",
        lastFramePrompt: "last prompt",
      }),
    );

    const result = await generateBeatFramePairTool.execute(
      { storyId: "s1", beatId: "b2" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      firstFrameUrl: string;
      lastFrameUrl: string;
      firstFramePrompt: string;
      lastFramePrompt: string;
      beatId: string;
    };
    expect(data.firstFrameUrl).toBe("https://example.com/ff.jpg");
    expect(data.lastFrameUrl).toBe("https://example.com/lf.jpg");
    expect(data.beatId).toBe("b2");
    expect(mocks.storyService.updateBeatMediaUrls).toHaveBeenCalledWith([
      {
        id: "b2",
        firstFrameImageUrl: "https://example.com/ff.jpg",
        lastFrameImageUrl: "https://example.com/lf.jpg",
      },
    ]);
  });

  it("7. 关键帧不存在时返回前置条件错误", async () => {
    // b1 没有 keyframe
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));

    const result = await generateBeatFramePairTool.execute(
      { storyId: "s1", beatId: "b1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("请先生成关键帧");
    expect(mocks.generateBeatFramePair).not.toHaveBeenCalled();
  });

  it("8. generateBeatFramePair 失败时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatFramePair.mockResolvedValue(err(new Error("帧生成错误")));

    const result = await generateBeatFramePairTool.execute(
      { storyId: "s1", beatId: "b2" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("生成首尾帧失败");
    expect(result.error).toContain("帧生成错误");
  });

  it("9. 持久化失败时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatFramePair.mockResolvedValue(
      ok({
        firstFrameUrl: "ff.jpg",
        lastFrameUrl: "lf.jpg",
        firstFramePrompt: "fp",
        lastFramePrompt: "lp",
      }),
    );
    mocks.storyService.updateBeatMediaUrls.mockRejectedValue(new Error("persist error"));

    const result = await generateBeatFramePairTool.execute(
      { storyId: "s1", beatId: "b2" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("首尾帧已生成但持久化失败");
  });
});

// ============================================================
// 3. generate_beat_video
// ============================================================
describe("generate_beat_video", () => {
  it("10. 正常生成视频（异步任务，无 videoUrl）", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatVideo.mockResolvedValue(
      ok({
        taskId: "task_123",
        videoUrl: undefined,
        status: "pending",
        videoMode: "standard",
      }),
    );

    const result = await generateBeatVideoTool.execute(
      { storyId: "s1", beatId: "b2" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      taskId: string;
      videoUrl: string | undefined;
      status: string;
      videoMode: string;
      beatId: string;
    };
    expect(data.taskId).toBe("task_123");
    expect(data.status).toBe("pending");
    expect(data.videoMode).toBe("standard");
    expect(data.beatId).toBe("b2");
    // 异步任务无 videoUrl 时不持久化
    expect(mocks.storyService.updateBeatMediaUrls).not.toHaveBeenCalled();
  });

  it("11. 首帧不存在时返回前置条件错误", async () => {
    // b1 没有 framePair
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));

    const result = await generateBeatVideoTool.execute(
      { storyId: "s1", beatId: "b1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("请先生成首帧");
    expect(mocks.generateBeatVideo).not.toHaveBeenCalled();
  });

  it("12. generateBeatVideo 失败时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatVideo.mockResolvedValue(err(new Error("视频生成错误")));

    const result = await generateBeatVideoTool.execute(
      { storyId: "s1", beatId: "b2" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("生成视频失败");
    expect(result.error).toContain("视频生成错误");
  });

  it("13. 同步返回 videoUrl 时触发持久化", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatVideo.mockResolvedValue(
      ok({
        taskId: "task_456",
        videoUrl: "https://example.com/video.mp4",
        status: "completed",
        videoMode: "standard",
      }),
    );

    const result = await generateBeatVideoTool.execute(
      { storyId: "s1", beatId: "b2" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect(mocks.storyService.updateBeatMediaUrls).toHaveBeenCalledWith([
      { id: "b2", videoUrl: "https://example.com/video.mp4" },
    ]);
  });
});

// ============================================================
// 4. batch_generate
// ============================================================
describe("batch_generate", () => {
  it("14. 不指定 beatIds 时对全部分镜执行 keyframe 操作", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatKeyframe.mockResolvedValue(
      ok({ imageUrl: "https://example.com/kf.jpg", prompt: "p" }),
    );

    const result = await batchGenerateTool.execute(
      { storyId: "s1", operation: "keyframe" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      operation: string;
      results: Array<{ beatId: string; success: boolean }>;
      totalSuccess: number;
      totalFailed: number;
      total: number;
    };
    expect(data.operation).toBe("keyframe");
    expect(data.total).toBe(2);
    expect(data.totalSuccess).toBe(2);
    expect(data.totalFailed).toBe(0);
    expect(data.results).toHaveLength(2);
    // b1, b2 都执行了 keyframe 生成
    expect(mocks.generateBeatKeyframe).toHaveBeenCalledTimes(2);
  });

  it("15. 指定 beatIds 时只对指定分镜执行", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatKeyframe.mockResolvedValue(
      ok({ imageUrl: "https://example.com/kf.jpg", prompt: "p" }),
    );

    const result = await batchGenerateTool.execute(
      { storyId: "s1", operation: "keyframe", beatIds: ["b1"] },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { total: number; totalSuccess: number };
    expect(data.total).toBe(1);
    expect(data.totalSuccess).toBe(1);
    expect(mocks.generateBeatKeyframe).toHaveBeenCalledTimes(1);
  });

  it("16. frame_pair 操作时跳过无 keyframe 的分镜", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatFramePair.mockResolvedValue(
      ok({
        firstFrameUrl: "ff.jpg",
        lastFrameUrl: "lf.jpg",
        firstFramePrompt: "fp",
        lastFramePrompt: "lp",
      }),
    );

    const result = await batchGenerateTool.execute(
      { storyId: "s1", operation: "frame_pair", beatIds: ["b1", "b2"] },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      results: Array<{ beatId: string; success: boolean; error?: string }>;
      totalSuccess: number;
      totalFailed: number;
    };
    // b1 无 keyframe → 失败；b2 有 keyframe → 成功
    expect(data.totalSuccess).toBe(1);
    expect(data.totalFailed).toBe(1);
    const b1Result = data.results.find((r) => r.beatId === "b1");
    expect(b1Result?.success).toBe(false);
    expect(b1Result?.error).toContain("请先生成关键帧");
  });

  it("17. video 操作时跳过无首帧的分镜", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatVideo.mockResolvedValue(
      ok({ taskId: "t1", videoUrl: undefined, status: "pending", videoMode: "standard" }),
    );

    const result = await batchGenerateTool.execute(
      { storyId: "s1", operation: "video", beatIds: ["b1", "b2"] },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      results: Array<{ beatId: string; success: boolean; error?: string }>;
      totalSuccess: number;
      totalFailed: number;
    };
    // b1 无首帧 → 失败；b2 有首帧 → 成功
    expect(data.totalSuccess).toBe(1);
    expect(data.totalFailed).toBe(1);
    const b1Result = data.results.find((r) => r.beatId === "b1");
    expect(b1Result?.success).toBe(false);
    expect(b1Result?.error).toContain("请先生成首帧");
  });

  it("18. 故事不存在时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await batchGenerateTool.execute(
      { storyId: "missing", operation: "keyframe" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取故事失败");
  });

  it("19. beatIds 包含不存在的分镜时标记失败", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatKeyframe.mockResolvedValue(
      ok({ imageUrl: "kf.jpg", prompt: "p" }),
    );

    const result = await batchGenerateTool.execute(
      { storyId: "s1", operation: "keyframe", beatIds: ["b1", "missing_beat"] },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      results: Array<{ beatId: string; success: boolean; error?: string }>;
      totalSuccess: number;
      totalFailed: number;
    };
    expect(data.totalSuccess).toBe(1);
    expect(data.totalFailed).toBe(1);
    const missing = data.results.find((r) => r.beatId === "missing_beat");
    expect(missing?.success).toBe(false);
    expect(missing?.error).toContain("未找到该分镜");
  });
});

// ============================================================
// 5. regenerate_beat
// ============================================================
describe("regenerate_beat", () => {
  it("20. target=keyframe 时清除旧 keyframe 并重新生成", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatKeyframe.mockResolvedValue(
      ok({ imageUrl: "https://example.com/new_kf.jpg", prompt: "new prompt" }),
    );

    const result = await regenerateBeatTool.execute(
      { storyId: "s1", beatId: "b2", target: "keyframe", customPrompt: "重新生成" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { regenerated: boolean; target: string; imageUrl: string };
    expect(data.regenerated).toBe(true);
    expect(data.target).toBe("keyframe");
    expect(data.imageUrl).toBe("https://example.com/new_kf.jpg");
    // 验证 customPrompt 传递
    const genArgs = mocks.generateBeatKeyframe.mock.calls[0];
    expect(genArgs[2].customPrompt).toBe("重新生成");
    // 验证清除后 keyframe 字段为 undefined（传入生成函数的 beat 不应有 keyframe）
    expect(genArgs[0].keyframe).toBeUndefined();
  });

  it("21. target=frame_pair 时清除旧 framePair 并重新生成", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatFramePair.mockResolvedValue(
      ok({
        firstFrameUrl: "new_ff.jpg",
        lastFrameUrl: "new_lf.jpg",
        firstFramePrompt: "nfp",
        lastFramePrompt: "nlp",
      }),
    );

    const result = await regenerateBeatTool.execute(
      { storyId: "s1", beatId: "b2", target: "frame_pair", customPrompt: "新首帧提示" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { regenerated: boolean; target: string };
    expect(data.regenerated).toBe(true);
    expect(data.target).toBe("frame_pair");
    // 验证清除后 framePair 字段为 undefined
    const genArgs = mocks.generateBeatFramePair.mock.calls[0];
    expect(genArgs[0].framePair).toBeUndefined();
    // customPrompt 作为 customFirstFramePrompt 传递
    expect(genArgs[1].customFirstFramePrompt).toBe("新首帧提示");
  });

  it("22. target=video 时清除旧 videoGen 并重新生成", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatVideo.mockResolvedValue(
      ok({ taskId: "new_task", videoUrl: undefined, status: "pending", videoMode: "standard" }),
    );

    const result = await regenerateBeatTool.execute(
      { storyId: "s1", beatId: "b2", target: "video" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { regenerated: boolean; target: string; taskId: string };
    expect(data.regenerated).toBe(true);
    expect(data.target).toBe("video");
    expect(data.taskId).toBe("new_task");
    // 验证清除后 videoGen 字段为 undefined
    const genArgs = mocks.generateBeatVideo.mock.calls[0];
    expect(genArgs[0].videoGen).toBeUndefined();
  });

  it("23. 故事不存在时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await regenerateBeatTool.execute(
      { storyId: "missing", beatId: "b1", target: "keyframe" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取故事失败");
  });

  it("24. 分镜不存在时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));

    const result = await regenerateBeatTool.execute(
      { storyId: "s1", beatId: "missing", target: "keyframe" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("未找到分镜");
  });

  it("25. 重新生成失败时返回原始错误", async () => {
    mocks.storyService.getById.mockResolvedValue(ok(makeStory()));
    mocks.generateBeatKeyframe.mockResolvedValue(err(new Error("AI 不可用")));

    const result = await regenerateBeatTool.execute(
      { storyId: "s1", beatId: "b2", target: "keyframe" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("生成关键帧失败");
    expect(result.error).toContain("AI 不可用");
  });
});

// ============================================================
// 导出完整性
// ============================================================
describe("shotTools 导出", () => {
  it("26. 导出 5 个工具", () => {
    expect(shotTools).toHaveLength(5);
    expect(shotTools).toContain(generateBeatKeyframeTool);
    expect(shotTools).toContain(generateBeatFramePairTool);
    expect(shotTools).toContain(generateBeatVideoTool);
    expect(shotTools).toContain(batchGenerateTool);
    expect(shotTools).toContain(regenerateBeatTool);
  });
});
