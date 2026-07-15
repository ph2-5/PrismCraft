/**
 * Diagnostic Tools 单元测试
 *
 * 测试 4 个诊断工具：
 * - diagnose_error：用 AI（textProvider）分析错误信息
 * - auto_fix：按 errorType 执行自动修复策略
 * - diagnose_system_health：系统健康检查
 * - rollback：回滚操作（优雅降级）
 *
 * Mock 策略：
 * - container.textProvider / videoTaskStorage / storyStorage / versionStorage
 * - @/shared/api-config（testConnection / loadConfig / checkConfigStatus）
 * - @/shared/file-http（getCacheDirectory / getDiskSpace / fileExists）
 * - TOOL_TIMEOUTS 常量
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  textProvider: { generateText: vi.fn() },
  videoTaskStorage: { getVideoTasks: vi.fn() },
  storyStorage: { getStoryById: vi.fn() },
  versionStorage: { getStoryVersions: vi.fn() },
  testConnection: vi.fn(),
  loadConfig: vi.fn(),
  checkConfigStatus: vi.fn(),
  getCacheDirectory: vi.fn(),
  getDiskSpace: vi.fn(),
  fileExists: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: mocks.textProvider,
    videoTaskStorage: mocks.videoTaskStorage,
    storyStorage: mocks.storyStorage,
    versionStorage: mocks.versionStorage,
  },
}));

vi.mock("@/shared/api-config", () => ({
  testConnection: mocks.testConnection,
  loadConfig: mocks.loadConfig,
  checkConfigStatus: mocks.checkConfigStatus,
}));

vi.mock("@/shared/file-http", () => ({
  getCacheDirectory: mocks.getCacheDirectory,
  getDiskSpace: mocks.getDiskSpace,
  fileExists: mocks.fileExists,
}));

import {
  diagnoseErrorTool,
  autoFixTool,
  diagnoseSystemHealthTool,
  rollbackTool,
  diagnosticTools,
} from "../diagnostic-tools";
import type { ToolContext } from "@/domain/types/agent-tools";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

function makeTask(overrides?: Record<string, unknown>) {
  return {
    taskId: "task_1",
    status: "pending",
    progress: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    prompt: "测试",
    ...overrides,
  };
}

/** 全部 API 能力已配置的 checkConfigStatus mock */
function allConfigured() {
  mocks.checkConfigStatus.mockResolvedValue({
    capabilities: {
      text: { configured: true },
      image: { configured: true },
      vision: { configured: true },
      video: { configured: true },
      embedding: { configured: false },
      audio: { configured: false },
    },
    allConfigured: true,
    configuredCount: 4,
    totalCount: 4,
    missing: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// 1. diagnose_error
// ============================================================
describe("diagnose_error", () => {
  it("1. textProvider 返回有效 JSON 时解析并返回", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          possibleCauses: ["原因1", "原因2"],
          suggestedFixes: ["修复1"],
          severity: "high",
        }),
      },
    });

    const result = await diagnoseErrorTool.execute(
      { errorMessage: "测试错误" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      possibleCauses: string[];
      suggestedFixes: string[];
      severity: string;
    };
    expect(data.possibleCauses).toEqual(["原因1", "原因2"]);
    expect(data.suggestedFixes).toEqual(["修复1"]);
    expect(data.severity).toBe("high");
  });

  it("2. textProvider 返回 markdown 包裹的 JSON 时正确解析", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text:
          "```json\n" +
          JSON.stringify({
            possibleCauses: ["原因"],
            suggestedFixes: ["修复"],
            severity: "low",
          }) +
          "\n```",
      },
    });

    const result = await diagnoseErrorTool.execute(
      { errorMessage: "测试" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { possibleCauses: string[]; severity: string };
    expect(data.possibleCauses).toEqual(["原因"]);
    expect(data.severity).toBe("low");
  });

  it("3. textProvider 返回非 JSON 文本时使用 fallback", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "这不是 JSON 格式的回复" },
    });

    const result = await diagnoseErrorTool.execute(
      { errorMessage: "测试" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      possibleCauses: string[];
      suggestedFixes: string[];
      severity: string;
      rawOutput: string;
    };
    expect(data.possibleCauses).toHaveLength(1);
    expect(data.possibleCauses[0]).toBe("这不是 JSON 格式的回复");
    expect(data.suggestedFixes).toEqual([]);
    expect(data.severity).toBe("medium");
    expect(data.rawOutput).toBe("这不是 JSON 格式的回复");
  });

  it("4. textProvider 返回失败时返回错误", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: false,
      error: "AI 服务不可用",
    });

    const result = await diagnoseErrorTool.execute(
      { errorMessage: "测试" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI 服务不可用");
  });

  it("5. textProvider 抛异常时返回错误", async () => {
    mocks.textProvider.generateText.mockRejectedValue(new Error("网络错误"));

    const result = await diagnoseErrorTool.execute(
      { errorMessage: "测试" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("诊断错误失败");
    expect(result.error).toContain("网络错误");
  });

  it("6. severity 非法值降级为 medium", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          possibleCauses: ["原因"],
          suggestedFixes: ["修复"],
          severity: "critical",
        }),
      },
    });

    const result = await diagnoseErrorTool.execute(
      { errorMessage: "测试" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { severity: string };
    expect(data.severity).toBe("medium");
  });

  it("7. errorContext 包含所有字段时构建提示词", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          possibleCauses: ["原因"],
          suggestedFixes: [],
          severity: "medium",
        }),
      },
    });

    await diagnoseErrorTool.execute(
      {
        errorMessage: "测试错误",
        errorContext: {
          toolName: "generate_video",
          args: { prompt: "test" },
          timestamp: 1700000000000,
        },
      },
      makeCtx(),
    );

    expect(mocks.textProvider.generateText).toHaveBeenCalledTimes(1);
    const prompt = mocks.textProvider.generateText.mock.calls[0][0] as string;
    expect(prompt).toContain("generate_video");
    expect(prompt).toContain("2023-11-14");
    expect(prompt).toContain("prompt");
  });
});

// ============================================================
// 2. auto_fix
// ============================================================
describe("auto_fix", () => {
  it("8. api_connection - 连接测试成功时 fixed=true", async () => {
    mocks.testConnection.mockResolvedValue({ success: true, message: "OK" });

    const result = await autoFixTool.execute(
      { errorType: "api_connection" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { fixed: boolean; action: string; message: string };
    expect(data.fixed).toBe(true);
    expect(data.action).toBe("testConnection(text)");
    expect(data.message).toContain("连接已恢复");
  });

  it("9. api_connection - 连接测试失败时 fixed=false", async () => {
    mocks.testConnection.mockResolvedValue({ success: false, message: "超时" });

    const result = await autoFixTool.execute(
      { errorType: "api_connection" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { fixed: boolean; message: string };
    expect(data.fixed).toBe(false);
    expect(data.message).toContain("连接测试仍失败");
    expect(data.message).toContain("超时");
  });

  it("10. api_auth - 有 providerId 且验证通过时 fixed=true", async () => {
    mocks.testConnection.mockResolvedValue({ success: true, message: "OK" });

    const result = await autoFixTool.execute(
      { errorType: "api_auth", context: { providerId: "openai" } },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { fixed: boolean; action: string };
    expect(data.fixed).toBe(true);
    expect(data.action).toBe("validate_api_key(openai)");
  });

  it("11. api_auth - 无 providerId 时跳过验证", async () => {
    const result = await autoFixTool.execute(
      { errorType: "api_auth" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { fixed: boolean; action: string; message: string };
    expect(data.fixed).toBe(false);
    expect(data.action).toContain("skipped");
    expect(data.message).toContain("未提供 providerId");
    expect(mocks.testConnection).not.toHaveBeenCalled();
  });

  it("12. quota_exceeded - 返回配额检查建议", async () => {
    const result = await autoFixTool.execute(
      { errorType: "quota_exceeded" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { fixed: boolean; action: string; message: string };
    expect(data.fixed).toBe(false);
    expect(data.action).toBe("suggest_check_quota");
    expect(data.message).toContain("配额");
  });

  it("13. model_not_found - 有可用模型时列出模型", async () => {
    mocks.loadConfig.mockResolvedValue({
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          models: [{ id: "gpt-4", name: "GPT-4", capabilities: ["text"] }],
        },
      ],
    });

    const result = await autoFixTool.execute(
      { errorType: "model_not_found" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      fixed: boolean;
      action: string;
      availableModels: Array<{ providerId: string; modelId: string }>;
      message: string;
    };
    expect(data.fixed).toBe(false);
    expect(data.action).toBe("list_available_models");
    expect(data.availableModels).toHaveLength(1);
    expect(data.availableModels[0].providerId).toBe("openai");
    expect(data.availableModels[0].modelId).toBe("gpt-4");
    expect(data.message).toContain("1");
  });

  it("14. model_not_found - 无可用模型时提示配置", async () => {
    mocks.loadConfig.mockResolvedValue({ providers: [] });

    const result = await autoFixTool.execute(
      { errorType: "model_not_found" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      fixed: boolean;
      message: string;
      availableModels: unknown[];
    };
    expect(data.fixed).toBe(false);
    expect(data.availableModels).toEqual([]);
    expect(data.message).toContain("未找到任何已配置的模型");
  });

  it("15. rate_limit - 返回等待建议", async () => {
    const result = await autoFixTool.execute(
      { errorType: "rate_limit" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { fixed: boolean; action: string; message: string };
    expect(data.fixed).toBe(false);
    expect(data.action).toBe("suggest_wait");
    expect(data.message).toContain("限流");
  });

  it("16. unknown - 调用 diagnose_error 进行诊断", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          possibleCauses: ["原因"],
          suggestedFixes: ["修复"],
          severity: "medium",
        }),
      },
    });

    const result = await autoFixTool.execute(
      { errorType: "unknown", context: { errorMessage: "奇怪的错误" } },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      fixed: boolean;
      action: string;
      diagnosis: unknown;
    };
    expect(data.fixed).toBe(false);
    expect(data.action).toBe("diagnose_error");
    expect(data.diagnosis).toBeDefined();
    expect(mocks.textProvider.generateText).toHaveBeenCalledTimes(1);
  });

  it("17. unknown - diagnose_error 失败时返回失败信息", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: false,
      error: "AI 不可用",
    });

    const result = await autoFixTool.execute(
      { errorType: "unknown", context: { errorMessage: "错误" } },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { fixed: boolean; action: string; message: string };
    expect(data.fixed).toBe(false);
    expect(data.action).toBe("diagnose_error (failed)");
    expect(data.message).toContain("自动诊断失败");
  });

  it("18. testConnection 抛异常时返回失败", async () => {
    mocks.testConnection.mockRejectedValue(new Error("网络异常"));

    const result = await autoFixTool.execute(
      { errorType: "api_connection" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("自动修复失败");
    expect(result.error).toContain("网络异常");
  });

  it("19. 调用 onProgress 回调", async () => {
    mocks.testConnection.mockResolvedValue({ success: true, message: "OK" });
    const ctx = makeCtx();

    await autoFixTool.execute(
      { errorType: "api_connection" },
      ctx,
    );

    expect(ctx.onProgress).toHaveBeenCalledWith("正在测试 API 连接...");
  });
});

// ============================================================
// 3. diagnose_system_health
// ============================================================
describe("diagnose_system_health", () => {
  it("20. quick 深度只检查 API 配置", async () => {
    allConfigured();

    const result = await diagnoseSystemHealthTool.execute(
      { depth: "quick" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      depth: string;
      checks: Array<{ name: string; status: string }>;
      overallHealth: string;
    };
    expect(data.depth).toBe("quick");
    expect(data.checks).toHaveLength(1);
    expect(data.checks[0].name).toBe("api_config");
    expect(data.overallHealth).toBe("healthy");
  });

  it("21. standard 深度检查 API + 磁盘 + 任务", async () => {
    allConfigured();
    mocks.getCacheDirectory.mockResolvedValue({ success: true, path: "/cache" });
    mocks.getDiskSpace.mockResolvedValue({
      success: true,
      availableBytes: 50 * 1024 * 1024 * 1024,
      totalBytes: 100 * 1024 * 1024 * 1024,
    });
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([]);

    const result = await diagnoseSystemHealthTool.execute(
      { depth: "standard" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { checks: Array<{ name: string }> };
    const names = data.checks.map((c) => c.name);
    expect(names).toContain("api_config");
    expect(names).toContain("disk_space");
    expect(names).toContain("video_tasks");
    expect(names).not.toContain("cache_directory");
  });

  it("22. thorough 深度检查全部 4 项", async () => {
    allConfigured();
    mocks.getCacheDirectory.mockResolvedValue({ success: true, path: "/cache" });
    mocks.getDiskSpace.mockResolvedValue({
      success: true,
      availableBytes: 50 * 1024 * 1024 * 1024,
      totalBytes: 100 * 1024 * 1024 * 1024,
    });
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([]);
    mocks.fileExists.mockResolvedValue(true);

    const result = await diagnoseSystemHealthTool.execute(
      { depth: "thorough" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { checks: Array<{ name: string }> };
    expect(data.checks).toHaveLength(4);
    const names = data.checks.map((c) => c.name);
    expect(names).toContain("cache_directory");
  });

  it("23. API 配置全部已配置时 status=healthy", async () => {
    allConfigured();

    const result = await diagnoseSystemHealthTool.execute(
      { depth: "quick" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      checks: Array<{ name: string; status: string; message: string }>;
    };
    const apiCheck = data.checks.find((c) => c.name === "api_config");
    expect(apiCheck?.status).toBe("healthy");
    expect(apiCheck?.message).toContain("所有能力");
  });

  it("24. API 配置全部缺失时 status=critical 且 overallHealth=critical", async () => {
    mocks.checkConfigStatus.mockResolvedValue({
      capabilities: {
        text: { configured: false },
        image: { configured: false },
        vision: { configured: false },
        video: { configured: false },
        embedding: { configured: false },
        audio: { configured: false },
      },
      allConfigured: false,
      configuredCount: 0,
      totalCount: 4,
      missing: ["文本生成", "图像生成", "视觉分析", "视频生成"],
    });

    const result = await diagnoseSystemHealthTool.execute(
      { depth: "quick" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      checks: Array<{ name: string; status: string }>;
      overallHealth: string;
    };
    const apiCheck = data.checks.find((c) => c.name === "api_config");
    expect(apiCheck?.status).toBe("critical");
    expect(data.overallHealth).toBe("critical");
  });

  it("25. 磁盘空间不足 5% 时 status=critical", async () => {
    allConfigured();
    mocks.getCacheDirectory.mockResolvedValue({ success: true, path: "/cache" });
    mocks.getDiskSpace.mockResolvedValue({
      success: true,
      availableBytes: 4 * 1024 * 1024 * 1024,
      totalBytes: 100 * 1024 * 1024 * 1024,
    });
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([]);

    const result = await diagnoseSystemHealthTool.execute(
      { depth: "standard" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      checks: Array<{ name: string; status: string }>;
      overallHealth: string;
    };
    const diskCheck = data.checks.find((c) => c.name === "disk_space");
    expect(diskCheck?.status).toBe("critical");
    expect(data.overallHealth).toBe("critical");
  });

  it("26. 视频任务失败数 > 5 时 status=warning", async () => {
    allConfigured();
    mocks.getCacheDirectory.mockResolvedValue({ success: true, path: "/cache" });
    mocks.getDiskSpace.mockResolvedValue({
      success: true,
      availableBytes: 50 * 1024 * 1024 * 1024,
      totalBytes: 100 * 1024 * 1024 * 1024,
    });
    const failedTasks = Array.from({ length: 6 }, (_, i) =>
      makeTask({ taskId: `t_${i}`, status: "failed" }),
    );
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue(failedTasks);

    const result = await diagnoseSystemHealthTool.execute(
      { depth: "standard" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      checks: Array<{ name: string; status: string; message: string }>;
    };
    const taskCheck = data.checks.find((c) => c.name === "video_tasks");
    expect(taskCheck?.status).toBe("warning");
    expect(taskCheck?.message).toContain("6");
  });

  it("27. 默认深度为 standard", async () => {
    allConfigured();
    mocks.getCacheDirectory.mockResolvedValue({ success: true, path: "/cache" });
    mocks.getDiskSpace.mockResolvedValue({
      success: true,
      availableBytes: 50 * 1024 * 1024 * 1024,
      totalBytes: 100 * 1024 * 1024 * 1024,
    });
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([]);

    const result = await diagnoseSystemHealthTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      depth: string;
      checks: Array<{ name: string }>;
    };
    expect(data.depth).toBe("standard");
    expect(data.checks.length).toBeGreaterThanOrEqual(3);
  });

  it("28. overallHealth 在有 warning 但无 critical 时为 warning", async () => {
    mocks.checkConfigStatus.mockResolvedValue({
      capabilities: {
        text: { configured: true },
        image: { configured: false },
        vision: { configured: true },
        video: { configured: true },
        embedding: { configured: false },
        audio: { configured: false },
      },
      allConfigured: false,
      configuredCount: 3,
      totalCount: 4,
      missing: ["图像生成"],
    });

    const result = await diagnoseSystemHealthTool.execute(
      { depth: "quick" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      overallHealth: string;
      checks: Array<{ name: string; status: string }>;
    };
    expect(data.overallHealth).toBe("warning");
    const apiCheck = data.checks.find((c) => c.name === "api_config");
    expect(apiCheck?.status).toBe("warning");
  });

  it("29. summary 统计正确", async () => {
    allConfigured();
    mocks.getCacheDirectory.mockResolvedValue({ success: true, path: "/cache" });
    mocks.getDiskSpace.mockResolvedValue({
      success: true,
      availableBytes: 50 * 1024 * 1024 * 1024,
      totalBytes: 100 * 1024 * 1024 * 1024,
    });
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([]);

    const result = await diagnoseSystemHealthTool.execute(
      { depth: "thorough" },
      makeCtx(),
    );
    mocks.fileExists.mockResolvedValue(true);

    expect(result.success).toBe(true);
    const data = result.data as {
      summary: { total: number; healthy: number; warning: number; critical: number };
      checks: Array<{ status: string }>;
    };
    expect(data.summary.total).toBe(data.checks.length);
    expect(data.summary.healthy + data.summary.warning + data.summary.critical).toBe(
      data.summary.total,
    );
  });
});

// ============================================================
// 4. rollback
// ============================================================
describe("rollback", () => {
  it("30. story 存在且有历史版本时返回版本列表", async () => {
    mocks.storyStorage.getStoryById.mockResolvedValue({
      id: "s1",
      title: "测试故事",
    });
    mocks.versionStorage.getStoryVersions.mockResolvedValue([
      { id: "v1", timestamp: 1700000000, changeSummary: "v1", autoSaved: false },
      { id: "v2", timestamp: 1700001000, changeSummary: "v2", autoSaved: true },
    ]);

    const result = await rollbackTool.execute(
      { targetType: "story", targetId: "s1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      rolledBack: boolean;
      message: string;
      availableVersions: Array<{ versionId: string; timestamp: number }>;
      targetExists: boolean;
    };
    expect(data.rolledBack).toBe(false);
    expect(data.targetExists).toBe(true);
    expect(data.availableVersions).toHaveLength(2);
    expect(data.availableVersions[0].versionId).toBe("v1");
    expect(data.availableVersions[0].timestamp).toBe(1700000000 * 1000);
    expect(data.message).toContain("2");
  });

  it("31. story 不存在时返回提示", async () => {
    mocks.storyStorage.getStoryById.mockResolvedValue(null);

    const result = await rollbackTool.execute(
      { targetType: "story", targetId: "missing" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { rolledBack: boolean; message: string };
    expect(data.rolledBack).toBe(false);
    expect(data.message).toContain("不存在");
  });

  it("32. story 存在但无历史版本时返回提示", async () => {
    mocks.storyStorage.getStoryById.mockResolvedValue({ id: "s1", title: "故事" });
    mocks.versionStorage.getStoryVersions.mockResolvedValue([]);

    const result = await rollbackTool.execute(
      { targetType: "story", targetId: "s1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { rolledBack: boolean; message: string };
    expect(data.rolledBack).toBe(false);
    expect(data.message).toContain("未找到匹配的备份版本");
  });

  it("33. story 有 backupPoint 时按时间过滤版本", async () => {
    mocks.storyStorage.getStoryById.mockResolvedValue({ id: "s1", title: "故事" });
    mocks.versionStorage.getStoryVersions.mockResolvedValue([
      { id: "v1", timestamp: 1700000000, changeSummary: "v1" },
      { id: "v2", timestamp: 1700001000, changeSummary: "v2" },
      { id: "v3", timestamp: 1700002000, changeSummary: "v3" },
    ]);

    const result = await rollbackTool.execute(
      { targetType: "story", targetId: "s1", backupPoint: 1700001500000 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      availableVersions: Array<{ versionId: string }>;
    };
    expect(data.availableVersions).toHaveLength(2);
    expect(data.availableVersions[0].versionId).toBe("v1");
    expect(data.availableVersions[1].versionId).toBe("v2");
  });

  it("34. character 类型优雅降级", async () => {
    const result = await rollbackTool.execute(
      { targetType: "character", targetId: "c1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      rolledBack: boolean;
      message: string;
      targetType: string;
    };
    expect(data.rolledBack).toBe(false);
    expect(data.targetType).toBe("character");
    expect(data.message).toContain("角色");
    expect(data.message).toContain("不支持自动回滚");
  });

  it("35. video_task 类型优雅降级", async () => {
    const result = await rollbackTool.execute(
      { targetType: "video_task", targetId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { rolledBack: boolean; message: string };
    expect(data.rolledBack).toBe(false);
    expect(data.message).toContain("视频任务");
  });

  it("36. story 查询异常时返回失败", async () => {
    mocks.storyStorage.getStoryById.mockRejectedValue(new Error("DB 错误"));

    const result = await rollbackTool.execute(
      { targetType: "story", targetId: "s1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("查询故事备份版本失败");
    expect(result.error).toContain("DB 错误");
  });
});

// ============================================================
// 5. diagnosticTools 数组导出
// ============================================================
describe("diagnosticTools 数组", () => {
  it("37. 包含 4 个工具", () => {
    expect(diagnosticTools).toHaveLength(4);
    expect(diagnosticTools).toContain(diagnoseErrorTool);
    expect(diagnosticTools).toContain(autoFixTool);
    expect(diagnosticTools).toContain(diagnoseSystemHealthTool);
    expect(diagnosticTools).toContain(rollbackTool);
  });

  it("38. 所有工具的 domain 为 diagnostic", () => {
    for (const tool of diagnosticTools) {
      expect(tool.domain).toBe("diagnostic");
    }
  });
});
