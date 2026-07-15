/**
 * System Tools 单元测试
 *
 * 3 个系统工具的关键路径测试：
 * - get_project_stats：聚合角色/场景/视频任务/已配置能力
 * - get_app_info：返回版本/平台/工具数
 * - get_disk_usage：缓存目录磁盘使用情况
 *
 * Mock 策略：
 * - characterService / sceneService（动态导入，返回 Result<T>）
 * - useVideoTaskStore（动态导入）
 * - checkConfigStatus（动态导入 @/shared/api-config）
 * - toolRegistry（动态导入 tool-registry）
 * - getCacheDirectory / getDiskSpace（动态导入 @/shared/file-http）
 * - APP_VERSION（@/shared/constants/app-version）
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  characterService: {
    getAll: vi.fn(),
  },
  sceneService: {
    getAll: vi.fn(),
  },
  useVideoTaskStore: {
    getState: vi.fn(),
  },
  checkConfigStatus: vi.fn(),
  toolRegistry: {
    size: vi.fn(),
    getAllNames: vi.fn(),
  },
  getCacheDirectory: vi.fn(),
  getDiskSpace: vi.fn(),
}));

vi.mock("@/modules/character", () => ({
  characterService: mocks.characterService,
}));

vi.mock("@/modules/scene", () => ({
  sceneService: mocks.sceneService,
}));

vi.mock("@/modules/video/task-management", () => ({
  useVideoTaskStore: mocks.useVideoTaskStore,
}));

vi.mock("@/shared/api-config", () => ({
  checkConfigStatus: mocks.checkConfigStatus,
}));

vi.mock("@/shared/constants/app-version", () => ({
  APP_VERSION: "1.2.3-test",
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    agentToolRegistry: Promise.resolve(mocks.toolRegistry),
  },
}));

vi.mock("@/shared/file-http", () => ({
  getCacheDirectory: mocks.getCacheDirectory,
  getDiskSpace: mocks.getDiskSpace,
}));

import { getProjectStatsTool, getAppInfoTool, getDiskUsageTool } from "../system-tools";
import type { ToolContext } from "@/domain/types/agent-tools";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

function err(error: Error): { ok: false; error: Error } {
  return { ok: false, error };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.characterService.getAll.mockResolvedValue(ok([]));
  mocks.sceneService.getAll.mockResolvedValue(ok([]));
  mocks.useVideoTaskStore.getState.mockReturnValue({ allTasks: [] });
  mocks.checkConfigStatus.mockResolvedValue({
    capabilities: {
      text: { configured: false, provider: "", available: false },
      image: { configured: false, provider: "", available: false },
      vision: { configured: false, provider: "", available: false },
      video: { configured: false, provider: "", available: false },
      embedding: { configured: false, provider: "", available: false },
      audio: { configured: false, provider: "", available: false },
    },
    allConfigured: false,
    configuredCount: 0,
    totalCount: 4,
    missing: ["文本生成", "图像生成", "视觉分析", "视频生成"],
  });
  mocks.toolRegistry.size.mockReturnValue(0);
  mocks.toolRegistry.getAllNames.mockReturnValue([]);
  mocks.getCacheDirectory.mockResolvedValue({ success: true, path: "/cache" });
  mocks.getDiskSpace.mockResolvedValue({
    success: true,
    availableBytes: 1024 * 1024 * 1024,
    totalBytes: 10 * 1024 * 1024 * 1024,
  });
});

// ============================================================
// 1. get_project_stats
// ============================================================
describe("get_project_stats", () => {
  it("1. 聚合角色数、场景数和已配置能力", async () => {
    mocks.characterService.getAll.mockResolvedValue(ok([{ id: "c1" }, { id: "c2" }]));
    mocks.sceneService.getAll.mockResolvedValue(ok([{ id: "s1" }]));
    mocks.checkConfigStatus.mockResolvedValue({
      capabilities: {
        text: { configured: true, provider: "p1", available: true },
        image: { configured: false, provider: "", available: false },
        vision: { configured: true, provider: "p2", available: true },
        video: { configured: false, provider: "", available: false },
        embedding: { configured: false, provider: "", available: false },
        audio: { configured: false, provider: "", available: false },
      },
      allConfigured: false,
      configuredCount: 2,
      totalCount: 4,
      missing: ["图像生成", "视频生成"],
    });

    const result = await getProjectStatsTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      characters: number;
      scenes: number;
      stories: number;
      videoTasks: { active: number; completed: number; failed: number; total: number };
      configuredCapabilities: string[];
    };
    expect(data.characters).toBe(2);
    expect(data.scenes).toBe(1);
    expect(data.stories).toBe(0);
    expect(data.configuredCapabilities).toEqual(["text", "vision"]);
  });

  it("2. 视频任务统计按状态分类", async () => {
    mocks.useVideoTaskStore.getState.mockReturnValue({
      allTasks: [
        { status: "pending" },
        { status: "generating" },
        { status: "retrying" },
        { status: "completed" },
        { status: "completed" },
        { status: "failed" },
        { status: "timeout" },
      ],
    });

    const result = await getProjectStatsTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      videoTasks: { active: number; completed: number; failed: number; total: number };
    };
    expect(data.videoTasks.active).toBe(3);
    expect(data.videoTasks.completed).toBe(2);
    expect(data.videoTasks.failed).toBe(2);
    expect(data.videoTasks.total).toBe(7);
  });

  it("3. 视频任务模块异常时优雅降级", async () => {
    mocks.useVideoTaskStore.getState.mockImplementation(() => {
      throw new Error("store not initialized");
    });

    const result = await getProjectStatsTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      videoTasks: { active: number; completed: number; failed: number; total: number };
    };
    expect(data.videoTasks).toEqual({ active: 0, completed: 0, failed: 0, total: 0 });
  });

  it("4. characterService 返回失败时不阻断流程", async () => {
    mocks.characterService.getAll.mockResolvedValue(err(new Error("DB error")));

    const result = await getProjectStatsTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { characters: number };
    expect(data.characters).toBe(0);
  });

  it("5. checkConfigStatus 抛错时 configuredCapabilities 为空", async () => {
    mocks.checkConfigStatus.mockRejectedValue(new Error("config unavailable"));

    const result = await getProjectStatsTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { configuredCapabilities: string[] };
    expect(data.configuredCapabilities).toEqual([]);
  });
});

// ============================================================
// 2. get_app_info
// ============================================================
describe("get_app_info", () => {
  it("6. 返回版本号、工具数和工具名列表", async () => {
    mocks.toolRegistry.size.mockReturnValue(5);
    mocks.toolRegistry.getAllNames.mockReturnValue(["tool_a", "tool_b"]);

    const result = await getAppInfoTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      version: string;
      availableTools: number;
      toolNames: string[];
      platform: string;
      userAgent: string;
    };
    expect(data.version).toBe("1.2.3-test");
    expect(data.availableTools).toBe(5);
    expect(data.toolNames).toEqual(["tool_a", "tool_b"]);
    expect(typeof data.platform).toBe("string");
    expect(typeof data.userAgent).toBe("string");
  });

  it("7. 工具数为 0 时正常返回空列表", async () => {
    mocks.toolRegistry.size.mockReturnValue(0);
    mocks.toolRegistry.getAllNames.mockReturnValue([]);

    const result = await getAppInfoTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { availableTools: number; toolNames: string[] };
    expect(data.availableTools).toBe(0);
    expect(data.toolNames).toEqual([]);
  });
});

// ============================================================
// 3. get_disk_usage
// ============================================================
describe("get_disk_usage", () => {
  it("8. 显式 directory 时跳过缓存目录查询", async () => {
    const result = await getDiskUsageTool.execute(
      { directory: "/custom/dir" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      directory: string;
      availableBytes: number;
      totalBytes: number;
      availableGB: string;
      totalGB: string;
    };
    expect(data.directory).toBe("/custom/dir");
    expect(data.availableBytes).toBe(1024 * 1024 * 1024);
    expect(data.totalBytes).toBe(10 * 1024 * 1024 * 1024);
    expect(data.availableGB).toBe("1.00");
    expect(data.totalGB).toBe("10.00");
    expect(mocks.getCacheDirectory).not.toHaveBeenCalled();
  });

  it("9. 无 directory 时回退到缓存目录", async () => {
    const result = await getDiskUsageTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { directory: string };
    expect(data.directory).toBe("/cache");
    expect(mocks.getCacheDirectory).toHaveBeenCalled();
  });

  it("10. 缓存目录获取失败时返回错误", async () => {
    mocks.getCacheDirectory.mockResolvedValue({ success: false, path: undefined });

    const result = await getDiskUsageTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toBe("无法获取缓存目录");
  });

  it("11. 缓存目录 path 为空时返回错误", async () => {
    mocks.getCacheDirectory.mockResolvedValue({ success: true, path: "" });

    const result = await getDiskUsageTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toBe("无法获取缓存目录");
  });

  it("12. getDiskSpace 失败时返回具体错误", async () => {
    mocks.getDiskSpace.mockResolvedValue({ success: false, error: "磁盘不可用" });

    const result = await getDiskUsageTool.execute({ directory: "/d" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toBe("磁盘不可用");
  });

  it("13. getDiskSpace 失败且无 error 字段时使用默认消息", async () => {
    mocks.getDiskSpace.mockResolvedValue({ success: false });

    const result = await getDiskUsageTool.execute({ directory: "/d" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toBe("无法获取磁盘空间");
  });

  it("14. availableBytes 为 0 时 availableGB 为 undefined", async () => {
    mocks.getDiskSpace.mockResolvedValue({
      success: true,
      availableBytes: 0,
      totalBytes: 1024 * 1024 * 1024,
    });

    const result = await getDiskUsageTool.execute({ directory: "/d" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { availableGB: string | undefined; totalGB: string };
    expect(data.availableGB).toBeUndefined();
    expect(data.totalGB).toBe("1.00");
  });
});
