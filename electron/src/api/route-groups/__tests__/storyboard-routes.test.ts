/**
 * storyboard-routes.ts 路由 handler 测试
 *
 * 重点验证：
 * 1. 路由注册：storyboard/generate-*、video/recover、video-tasks/bulk-save、video/tracking-info、video/provider-info
 * 2. schema 校验：generate-keyframe/video/recover/bulk-save/tracking-info 的入参校验
 * 3. storyboard/generate-* handler 调用：mock storyboard-generation，验证透传
 * 4. video-tasks/bulk-save 成功路径：mock getDb，验证 saved 计数与 insert/update 分支
 * 5. video/recover 路由：mock video-recovery.recoverVideoByTaskId
 *
 * 参考 shot-routes.test.ts 和 regression-r136-bulk-save-failures.test.ts 的 mock 模式。
 * 注：storyboard-routes 在模块加载时调用 createApiGatewayAdapter()，
 *     必须在 vi.mock factory 内部设置默认返回值。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type http from "http";

// ── hoisted mocks ──────────────────────────────────────────────────────
const {
  mockCreateApiGatewayAdapter,
  mockGenerateBeatKeyframe,
  mockGenerateBeatFramePair,
  mockGenerateBeatVideo,
  mockGenerateBeatFullWorkflow,
  mockGenerateKeyframeChain,
  mockRecoverVideoByTaskId,
  mockBuildTrackingInfoByApiUrl,
  mockGetProviderInfoByApiUrl,
  mockGetDb,
  mockPrepare,
  mockTransaction,
  mockInsertRun,
  mockUpdateRun,
  mockCheckGet,
} = vi.hoisted(() => ({
  mockCreateApiGatewayAdapter: vi.fn(),
  mockGenerateBeatKeyframe: vi.fn(),
  mockGenerateBeatFramePair: vi.fn(),
  mockGenerateBeatVideo: vi.fn(),
  mockGenerateBeatFullWorkflow: vi.fn(),
  mockGenerateKeyframeChain: vi.fn(),
  mockRecoverVideoByTaskId: vi.fn(),
  mockBuildTrackingInfoByApiUrl: vi.fn(),
  mockGetProviderInfoByApiUrl: vi.fn(),
  mockGetDb: vi.fn(),
  mockPrepare: vi.fn(),
  mockTransaction: vi.fn(),
  mockInsertRun: vi.fn(),
  mockUpdateRun: vi.fn(),
  mockCheckGet: vi.fn(),
}));

vi.mock("../../../api-gateway", () => ({
  // storyboard-routes.ts 在模块加载时调用 createApiGatewayAdapter()，
  // 必须在 factory 内部设置默认返回值，否则在 mockReturnValue 调用之前就被执行
  createApiGatewayAdapter: mockCreateApiGatewayAdapter.mockReturnValue({ id: "mock-adapter" }),
}));

vi.mock("@shared-logic/story/storyboard-generation", () => ({
  generateBeatKeyframe: mockGenerateBeatKeyframe,
  generateBeatFramePair: mockGenerateBeatFramePair,
  generateBeatVideo: mockGenerateBeatVideo,
  generateBeatFullWorkflow: mockGenerateBeatFullWorkflow,
  generateKeyframeChain: mockGenerateKeyframeChain,
}));

vi.mock("@shared-logic/prompt/prompt-service", () => ({
  default: {},
}));

vi.mock("@shared-logic/video/video-recovery", () => ({
  recoverVideoByTaskId: mockRecoverVideoByTaskId,
}));

vi.mock("@shared-logic/video/video-tracker", () => ({
  buildTrackingInfoByApiUrl: mockBuildTrackingInfoByApiUrl,
  getProviderInfoByApiUrl: mockGetProviderInfoByApiUrl,
}));

vi.mock("../../../database", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../../logging", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { storyboardRoutes } from "../storyboard-routes";
import {
  storyboardGenerateKeyframeSchema,
  storyboardGenerateVideoSchema,
  storyboardGenerateFullWorkflowSchema,
  storyboardGenerateKeyframeChainSchema,
  videoRecoverSchema,
  videoTasksBulkSaveSchema,
  videoTrackingInfoSchema,
  videoProviderInfoSchema,
} from "../../schemas";

const mockReq = {} as http.IncomingMessage;

// slStoryboardBeatSchema 仅要求 id（其余可选）
const validBeat = {
  id: "beat-1",
  content: "A cat sits on a chair",
  duration: 5,
};

describe("storyboard-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateApiGatewayAdapter.mockReturnValue({ id: "mock-adapter" });

    // bulk-save 默认 mock：成功路径。按 SQL 区分 insert/update/check 语句，
    // 便于验证已存在任务走 update、新任务走 insert。
    mockInsertRun.mockReturnValue({ changes: 1, lastInsertRowid: 1 });
    mockUpdateRun.mockReturnValue({ changes: 1, lastInsertRowid: 1 });
    mockCheckGet.mockReturnValue(undefined); // 默认任务不存在，走 insert 路径
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes("INSERT")) {
        return { run: mockInsertRun, get: vi.fn() };
      }
      if (sql.includes("UPDATE")) {
        return { run: mockUpdateRun, get: vi.fn() };
      }
      // SELECT ... FROM video_tasks WHERE id = ?
      return { run: vi.fn(), get: mockCheckGet };
    });
    mockTransaction.mockImplementation((fn: () => void) => fn());
    mockGetDb.mockReturnValue({
      prepare: mockPrepare,
      transaction: mockTransaction,
    });
  });

  // ── 路由注册 ───────────────────────────────────────────────────────
  describe("路由注册", () => {
    it("应注册所有 storyboard/video 路由", () => {
      const expectedRoutes = [
        "video/tracking-info",
        "video/provider-info",
        "storyboard/generate-keyframe",
        "storyboard/generate-frame-pair",
        "storyboard/generate-video",
        "storyboard/generate-full-workflow",
        "storyboard/generate-keyframe-chain",
        "video/recover",
        "video-tasks/bulk-save",
      ];
      expectedRoutes.forEach((route) => {
        expect(storyboardRoutes[route]).toBeDefined();
        expect(storyboardRoutes[route].methods).toContain("POST");
      });
    });

    it("所有路由都应有 schema", () => {
      const routes = [
        "video/tracking-info",
        "video/provider-info",
        "storyboard/generate-keyframe",
        "storyboard/generate-frame-pair",
        "storyboard/generate-video",
        "storyboard/generate-full-workflow",
        "storyboard/generate-keyframe-chain",
        "video/recover",
        "video-tasks/bulk-save",
      ];
      routes.forEach((route) => {
        expect(storyboardRoutes[route].schema).toBeDefined();
      });
    });
  });

  // ── schema 校验 ─────────────────────────────────────────────────
  describe("schema 校验", () => {
    it("storyboard/generate-keyframe 缺少 beat 时应拒绝", () => {
      const result = storyboardGenerateKeyframeSchema.safeParse({ options: {} });
      expect(result.success).toBe(false);
    });

    it("storyboard/generate-keyframe 缺少 options 时应拒绝", () => {
      const result = storyboardGenerateKeyframeSchema.safeParse({ beat: validBeat });
      expect(result.success).toBe(false);
    });

    it("storyboard/generate-keyframe 完整参数应接受", () => {
      const result = storyboardGenerateKeyframeSchema.safeParse({
        beat: validBeat,
        prevBeat: { id: "beat-0" },
        options: { providerId: "openai" },
      });
      expect(result.success).toBe(true);
    });

    it("storyboard/generate-video 完整参数应接受", () => {
      const result = storyboardGenerateVideoSchema.safeParse({
        beat: validBeat,
        options: { providerId: "kling" },
      });
      expect(result.success).toBe(true);
    });

    it("storyboard/generate-video 缺少 beat 时应拒绝", () => {
      const result = storyboardGenerateVideoSchema.safeParse({ options: {} });
      expect(result.success).toBe(false);
    });

    it("storyboard/generate-full-workflow 带 prevBeat 应接受", () => {
      const result = storyboardGenerateFullWorkflowSchema.safeParse({
        beat: validBeat,
        prevBeat: { id: "beat-0" },
        options: {},
      });
      expect(result.success).toBe(true);
    });

    it("storyboard/generate-keyframe-chain 缺少 beats 时应拒绝", () => {
      const result = storyboardGenerateKeyframeChainSchema.safeParse({
        options: { providerId: "x" },
      });
      expect(result.success).toBe(false);
    });

    it("storyboard/generate-keyframe-chain 完整参数应接受", () => {
      const result = storyboardGenerateKeyframeChainSchema.safeParse({
        beats: [validBeat, { id: "beat-2" }],
        options: { providerId: "openai" },
      });
      expect(result.success).toBe(true);
    });

    it("video/recover 缺少 taskId 时应拒绝", () => {
      const result = videoRecoverSchema.safeParse({ taskRecord: {} });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.path.includes("taskId")),
        ).toBe(true);
      }
    });

    it("video/recover 仅 taskId 时应接受（taskRecord 可选）", () => {
      const result = videoRecoverSchema.safeParse({ taskId: "task-1" });
      expect(result.success).toBe(true);
    });

    it("video-tasks/bulk-save 空对象应接受（tasks 可选）", () => {
      const result = videoTasksBulkSaveSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("video-tasks/bulk-save 带 tasks 数组应接受", () => {
      const result = videoTasksBulkSaveSchema.safeParse({
        tasks: [{ taskId: "t-1", status: "pending" }],
      });
      expect(result.success).toBe(true);
    });

    it("video/tracking-info 缺少 taskId 时应拒绝", () => {
      const result = videoTrackingInfoSchema.safeParse({
        apiUrl: "http://x",
        apiKeyPreview: "sk-***",
        model: "m",
      });
      expect(result.success).toBe(false);
    });

    it("video/tracking-info 完整参数应接受", () => {
      const result = videoTrackingInfoSchema.safeParse({
        taskId: "t-1",
        apiUrl: "http://x",
        apiKeyPreview: "sk-***",
        model: "m",
      });
      expect(result.success).toBe(true);
    });

    it("video/provider-info 空对象应接受（apiUrl 可选）", () => {
      const result = videoProviderInfoSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  // ── storyboard/generate-* handler ─────────────────────────────────
  describe("storyboard/generate-* handler", () => {
    it("generate-keyframe 应调用 storyboardGeneration.generateBeatKeyframe 并透传结果", async () => {
      mockGenerateBeatKeyframe.mockResolvedValue({ keyframeUrl: "http://example.com/kf.png" });
      const body = {
        beat: validBeat,
        prevBeat: { id: "beat-0" },
        options: { providerId: "openai" },
      };
      const route = storyboardRoutes["storyboard/generate-keyframe"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { keyframeUrl?: string };
      };

      expect(mockGenerateBeatKeyframe).toHaveBeenCalledWith(
        { id: "mock-adapter" },
        expect.anything(), // promptService namespace
        body.beat,
        body.prevBeat,
        body.options,
      );
      expect(result.success).toBe(true);
      expect(result.data?.keyframeUrl).toBe("http://example.com/kf.png");
    });

    it("generate-frame-pair 应调用 generateBeatFramePair", async () => {
      mockGenerateBeatFramePair.mockResolvedValue({
        firstFrame: "http://x/1.png",
        lastFrame: "http://x/2.png",
      });
      const body = { beat: validBeat, options: {} };
      const route = storyboardRoutes["storyboard/generate-frame-pair"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { firstFrame?: string; lastFrame?: string };
      };

      expect(mockGenerateBeatFramePair).toHaveBeenCalledWith(
        { id: "mock-adapter" },
        expect.anything(),
        body.beat,
        body.options,
      );
      expect(result.success).toBe(true);
      expect(result.data?.firstFrame).toBe("http://x/1.png");
      expect(result.data?.lastFrame).toBe("http://x/2.png");
    });

    it("generate-video 应调用 generateBeatVideo（不传 promptService）", async () => {
      mockGenerateBeatVideo.mockResolvedValue({ videoUrl: "http://example.com/v.mp4" });
      const body = { beat: validBeat, options: { providerId: "kling" } };
      const route = storyboardRoutes["storyboard/generate-video"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { videoUrl?: string };
      };

      expect(mockGenerateBeatVideo).toHaveBeenCalledWith(
        { id: "mock-adapter" },
        body.beat,
        body.options,
      );
      expect(result.success).toBe(true);
      expect(result.data?.videoUrl).toBe("http://example.com/v.mp4");
    });

    it("generate-full-workflow 应调用 generateBeatFullWorkflow", async () => {
      mockGenerateBeatFullWorkflow.mockResolvedValue({ ok: true });
      const body = { beat: validBeat, prevBeat: { id: "beat-0" }, options: {} };
      const route = storyboardRoutes["storyboard/generate-full-workflow"];
      const result = (await route.handler("POST", body, mockReq)) as { success: boolean };

      expect(mockGenerateBeatFullWorkflow).toHaveBeenCalledWith(
        { id: "mock-adapter" },
        expect.anything(),
        body.beat,
        body.prevBeat,
        body.options,
      );
      expect(result.success).toBe(true);
    });

    it("generate-keyframe-chain 应调用 generateKeyframeChain", async () => {
      mockGenerateKeyframeChain.mockResolvedValue({ chain: [] });
      const body = { beats: [validBeat, { id: "beat-2" }], options: {} };
      const route = storyboardRoutes["storyboard/generate-keyframe-chain"];
      const result = (await route.handler("POST", body, mockReq)) as { success: boolean };

      expect(mockGenerateKeyframeChain).toHaveBeenCalledWith(
        { id: "mock-adapter" },
        expect.anything(),
        body.beats,
        body.options,
      );
      expect(result.success).toBe(true);
    });

    it("generate-keyframe 未传 prevBeat 时应透传 undefined", async () => {
      mockGenerateBeatKeyframe.mockResolvedValue({ ok: true });
      const body = { beat: validBeat, options: {} };
      const route = storyboardRoutes["storyboard/generate-keyframe"];
      await route.handler("POST", body, mockReq);

      expect(mockGenerateBeatKeyframe).toHaveBeenCalledWith(
        { id: "mock-adapter" },
        expect.anything(),
        body.beat,
        undefined,
        body.options,
      );
    });
  });

  // ── video/recover handler ──────────────────────────────────────────
  describe("video/recover handler", () => {
    it("应调用 videoRecovery.recoverVideoByTaskId 并透传结果", async () => {
      mockRecoverVideoByTaskId.mockResolvedValue({
        success: true,
        videoUrl: "http://example.com/v.mp4",
        message: "VIDEO_RECOVERY_SUCCESS",
        status: "completed",
      });
      const body = {
        taskId: "task-1",
        taskRecord: { status: "processing", providerId: "kling" },
      };
      const route = storyboardRoutes["video/recover"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { success?: boolean; videoUrl?: string; message?: string; status?: string };
      };

      expect(mockRecoverVideoByTaskId).toHaveBeenCalledWith(
        { id: "mock-adapter" },
        body.taskId,
        body.taskRecord,
      );
      expect(result.success).toBe(true);
      expect(result.data?.videoUrl).toBe("http://example.com/v.mp4");
      expect(result.data?.message).toBe("VIDEO_RECOVERY_SUCCESS");
      expect(result.data?.status).toBe("completed");
    });

    it("recoverVideoByTaskId 返回失败时也应包装为 success:true（路由层不判别业务成功）", async () => {
      mockRecoverVideoByTaskId.mockResolvedValue({
        success: false,
        message: "TASK_NOT_FOUND",
      });
      const body = { taskId: "missing-task" };
      const route = storyboardRoutes["video/recover"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { success?: boolean; message?: string };
      };

      expect(result.success).toBe(true); // 路由层固定返回 success:true
      expect(result.data?.success).toBe(false);
      expect(result.data?.message).toBe("TASK_NOT_FOUND");
    });

    it("未传 taskRecord 时应透传 undefined 给 recoverVideoByTaskId", async () => {
      mockRecoverVideoByTaskId.mockResolvedValue({ success: false, message: "TASK_NOT_FOUND" });
      const body = { taskId: "task-x" };
      const route = storyboardRoutes["video/recover"];
      await route.handler("POST", body, mockReq);

      expect(mockRecoverVideoByTaskId).toHaveBeenCalledWith(
        { id: "mock-adapter" },
        "task-x",
        undefined,
      );
    });
  });

  // ── video-tasks/bulk-save 成功路径 ─────────────────────────────────
  describe("video-tasks/bulk-save 成功路径", () => {
    it("空任务列表应返回 saved:0 和 failures:[]", async () => {
      const route = storyboardRoutes["video-tasks/bulk-save"];
      const result = (await route.handler("POST", { tasks: [] }, mockReq)) as {
        success: boolean;
        saved: number;
        failures: unknown[];
      };

      expect(result.success).toBe(true);
      expect(result.saved).toBe(0);
      expect(result.failures).toEqual([]);
    });

    it("无 tasks 字段应返回 saved:0", async () => {
      const route = storyboardRoutes["video-tasks/bulk-save"];
      const result = (await route.handler("POST", {}, mockReq)) as {
        success: boolean;
        saved: number;
        failures: unknown[];
      };

      expect(result.success).toBe(true);
      expect(result.saved).toBe(0);
      expect(result.failures).toEqual([]);
    });

    it("多个新任务全部成功时应返回正确的 saved 计数（走 insert 路径）", async () => {
      const route = storyboardRoutes["video-tasks/bulk-save"];
      const result = (await route.handler(
        "POST",
        {
          tasks: [
            { taskId: "task-1", status: "completed", progress: 100, videoUrl: "http://x/1.mp4" },
            { taskId: "task-2", status: "completed", progress: 100, videoUrl: "http://x/2.mp4" },
          ],
        },
        mockReq,
      )) as { success: boolean; saved: number; failures: unknown[] };

      expect(result.success).toBe(true);
      expect(result.saved).toBe(2);
      expect(result.failures).toEqual([]);
      // 任务不存在时走 insert 路径
      expect(mockInsertRun).toHaveBeenCalledTimes(2);
      expect(mockUpdateRun).not.toHaveBeenCalled();
    });

    it("已存在的任务应走 update 路径", async () => {
      mockCheckGet.mockReturnValue({ id: "task-1" }); // 任务已存在
      const route = storyboardRoutes["video-tasks/bulk-save"];
      const result = (await route.handler(
        "POST",
        { tasks: [{ taskId: "task-1", status: "completed", progress: 100 }] },
        mockReq,
      )) as { success: boolean; saved: number };

      expect(result.saved).toBe(1);
      expect(mockUpdateRun).toHaveBeenCalledTimes(1);
      expect(mockInsertRun).not.toHaveBeenCalled();
    });

    it("混合已存在与新任务时应分别走 update 与 insert", async () => {
      // 第一次 check（task-1）已存在，第二次 check（task-2）不存在
      mockCheckGet
        .mockReturnValueOnce({ id: "task-1" })
        .mockReturnValueOnce(undefined);
      const route = storyboardRoutes["video-tasks/bulk-save"];
      const result = (await route.handler(
        "POST",
        {
          tasks: [
            { taskId: "task-1", status: "completed", progress: 100 },
            { taskId: "task-2", status: "pending", progress: 0 },
          ],
        },
        mockReq,
      )) as { success: number; saved: number };

      expect(result.saved).toBe(2);
      expect(mockUpdateRun).toHaveBeenCalledTimes(1);
      expect(mockInsertRun).toHaveBeenCalledTimes(1);
    });

    it("无 taskId 的任务应被跳过且不计入 saved", async () => {
      const route = storyboardRoutes["video-tasks/bulk-save"];
      const result = (await route.handler(
        "POST",
        { tasks: [{ status: "pending" }, { taskId: "task-1", status: "pending" }] },
        mockReq,
      )) as { success: boolean; saved: number };

      expect(result.saved).toBe(1); // 仅 task-1 被保存
    });
  });

  // ── video/tracking-info & video/provider-info handler ──────────────
  describe("video/tracking-info & video/provider-info handler", () => {
    it("tracking-info 应调用 videoTracker.buildTrackingInfoByApiUrl", async () => {
      mockBuildTrackingInfoByApiUrl.mockReturnValue({
        providerName: "Kling",
        taskId: "t-1",
        apiUrl: "http://x",
        model: "m",
        apiKeyPreview: "sk-***",
      });
      const body = { taskId: "t-1", apiUrl: "http://x", apiKeyPreview: "sk-***", model: "m" };
      const route = storyboardRoutes["video/tracking-info"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { providerName?: string; taskId?: string };
      };

      expect(mockBuildTrackingInfoByApiUrl).toHaveBeenCalledWith(
        body.taskId,
        body.apiUrl,
        body.apiKeyPreview,
        body.model,
      );
      expect(result.success).toBe(true);
      expect(result.data?.providerName).toBe("Kling");
      expect(result.data?.taskId).toBe("t-1");
    });

    it("provider-info 应调用 videoTracker.getProviderInfoByApiUrl", async () => {
      mockGetProviderInfoByApiUrl.mockReturnValue({ name: "可灵AI (Kling)" });
      const body = { apiUrl: "https://klingai.com/api" };
      const route = storyboardRoutes["video/provider-info"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { name?: string };
      };

      expect(mockGetProviderInfoByApiUrl).toHaveBeenCalledWith(body.apiUrl);
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("可灵AI (Kling)");
    });

    it("provider-info 不传 apiUrl 时也应调用 getProviderInfoByApiUrl(undefined)", async () => {
      mockGetProviderInfoByApiUrl.mockReturnValue({ name: "自定义API" });
      const route = storyboardRoutes["video/provider-info"];
      const result = (await route.handler("POST", {}, mockReq)) as {
        success: boolean;
        data?: { name?: string };
      };

      expect(mockGetProviderInfoByApiUrl).toHaveBeenCalledWith(undefined);
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("自定义API");
    });
  });
});
