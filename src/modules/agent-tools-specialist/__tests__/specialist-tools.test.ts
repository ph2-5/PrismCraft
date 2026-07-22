/**
 * Specialist 工具单元测试（agent-tools-specialist 模块）
 *
 * 测试覆盖：
 * - 工具定义：delegateToSpecialistTool / listSpecialistsTool 的 schema、domain、dangerLevel、timeoutMs
 * - specialistTools / allSpecialistTools 聚合数组
 * - 工具执行（delegateToSpecialistTool）：
 *   - 参数校验：缺 specialist_id / 缺 task / 类型错误
 *   - specialist 不存在：返回错误并附可用列表
 *   - 成功委派：调用 runSpecialist，触发 onProgress
 *   - _confirmDangerous 回调透传
 *   - 失败结果透传
 * - 工具执行（listSpecialistsTool）：
 *   - 返回 count / specialists / summary
 *   - 空注册表返回 count=0
 *
 * Mock 策略：
 * - vi.mock("@/modules/agent", ...) 拦截动态 import，避免触发真实 AgentLoop
 * - 使用真实 specialistRegistry 单例，但 beforeEach 中 clear + registerBuiltins
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { specialistRegistry } from "@/modules/agent-specialist";
import { BUILTIN_SPECIALISTS } from "@/modules/agent-specialist";
import type { ToolContext, ToolResult } from "@/domain/types/agent-tools";

// ============= Mock @/modules/agent 的动态 import =============
// specialist-tools.ts 通过 `await import("@/modules/agent")` 获取
// runSpecialist / listAvailableSpecialists，vi.mock 可拦截动态 import

const runSpecialistMock = vi.fn<
  (
    specialistId: string,
    task: string,
    context: string,
    ctx?: ToolContext,
    confirmDangerous?: (toolCall: unknown) => Promise<boolean>,
  ) => Promise<ToolResult>
>();

const listAvailableSpecialistsMock = vi.fn<() => string>();

vi.mock("@/modules/agent", () => ({
  runSpecialist: runSpecialistMock,
  listAvailableSpecialists: listAvailableSpecialistsMock,
}));

// 在 vi.mock 之后导入被测模块，确保 mock 已注册
import {
  delegateToSpecialistTool,
  listSpecialistsTool,
  specialistTools,
} from "../specialist-tools";
import { allSpecialistTools } from "../index";

// ============= 测试工具 =============

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "test-session",
    ...overrides,
  };
}

// ============= 测试用例 =============

describe("specialist-tools 工具定义", () => {
  it("delegateToSpecialistTool 定义正确（name / parameters / required / domain / dangerLevel / timeoutMs）", () => {
    expect(delegateToSpecialistTool.def.type).toBe("function");
    expect(delegateToSpecialistTool.def.function.name).toBe("delegate_to_specialist");
    expect(delegateToSpecialistTool.def.function.description).toBeTruthy();

    const params = delegateToSpecialistTool.def.function.parameters as Record<string, unknown>;
    expect(params).toHaveProperty("properties.specialist_id");
    expect(params).toHaveProperty("properties.task");
    expect(params).toHaveProperty("properties.context");
    expect(params).toHaveProperty("required");
    expect((params as { required: string[] }).required).toEqual(["specialist_id", "task"]);

    expect(delegateToSpecialistTool.domain).toBe("workflow");
    expect(delegateToSpecialistTool.dangerLevel).toBe("limited");
    expect(delegateToSpecialistTool.timeoutMs).toBe(120_000);
  });

  it("listSpecialistsTool 定义正确（无必填参数 / safe / query 超时）", () => {
    expect(listSpecialistsTool.def.function.name).toBe("list_specialists");
    const params = listSpecialistsTool.def.function.parameters as Record<string, unknown>;
    expect(params).toHaveProperty("properties");
    // 无 required 字段或 required 为空
    expect(params.required ?? []).toEqual([]);

    expect(listSpecialistsTool.domain).toBe("workflow");
    expect(listSpecialistsTool.dangerLevel).toBe("safe");
    expect(listSpecialistsTool.timeoutMs).toBe(TOOL_TIMEOUTS.query);
  });

  it("specialistTools 数组包含 2 个工具且名称正确", () => {
    expect(specialistTools).toHaveLength(2);
    const names = specialistTools.map((t) => t.def.function.name);
    expect(names).toContain("delegate_to_specialist");
    expect(names).toContain("list_specialists");
  });

  it("allSpecialistTools 与 specialistTools 内容等价但为不同数组实例", () => {
    expect(allSpecialistTools).toHaveLength(specialistTools.length);
    const allNames = allSpecialistTools.map((t) => t.def.function.name).sort();
    const specNames = specialistTools.map((t) => t.def.function.name).sort();
    expect(allNames).toEqual(specNames);
    // 不同实例（allSpecialistTools 是 [...specialistTools] 复制）
    expect(allSpecialistTools).not.toBe(specialistTools);
  });

  it("所有 specialist 工具 domain 均为 workflow", () => {
    for (const tool of specialistTools) {
      expect(tool.domain).toBe("workflow");
    }
  });
});

describe("delegateToSpecialistTool.execute（参数校验）", () => {
  beforeEach(() => {
    runSpecialistMock.mockReset();
    specialistRegistry.clear();
    specialistRegistry.registerBuiltins();
  });

  afterEach(() => {
    specialistRegistry.clear();
  });

  it("缺 specialist_id 参数返回错误，不调用 runSpecialist", async () => {
    const result = await delegateToSpecialistTool.execute({}, makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain("specialist_id");
    expect(runSpecialistMock).not.toHaveBeenCalled();
  });

  it("specialist_id 为非字符串（如数字）返回错误", async () => {
    const result = await delegateToSpecialistTool.execute(
      { specialist_id: 123, task: "test" },
      makeCtx(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("specialist_id");
    expect(runSpecialistMock).not.toHaveBeenCalled();
  });

  it("缺 task 参数返回错误", async () => {
    const result = await delegateToSpecialistTool.execute(
      { specialist_id: "character-creator" },
      makeCtx(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("task");
    expect(runSpecialistMock).not.toHaveBeenCalled();
  });

  it("task 为空字符串返回错误", async () => {
    const result = await delegateToSpecialistTool.execute(
      { specialist_id: "character-creator", task: "" },
      makeCtx(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("task");
  });

  it("不存在的 specialist_id 返回错误，且错误信息包含可用专家列表", async () => {
    const result = await delegateToSpecialistTool.execute(
      { specialist_id: "ghost-specialist", task: "test" },
      makeCtx(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("ghost-specialist");
    expect(result.error).toContain("不存在");
    // 错误信息中应列出至少一个可用专家 id
    expect(result.error).toContain("character-creator");
    expect(runSpecialistMock).not.toHaveBeenCalled();
  });
});

describe("delegateToSpecialistTool.execute（委派执行）", () => {
  beforeEach(() => {
    runSpecialistMock.mockReset();
    specialistRegistry.clear();
    specialistRegistry.registerBuiltins();
  });

  afterEach(() => {
    specialistRegistry.clear();
  });

  it("成功委派任务时调用 runSpecialist 并透传结果", async () => {
    const expectedResult: ToolResult = {
      success: true,
      data: { specialist: "角色创建专家", result: "已创建角色" },
      duration: 100,
    };
    runSpecialistMock.mockResolvedValue(expectedResult);

    const result = await delegateToSpecialistTool.execute(
      { specialist_id: "character-creator", task: "创建角色", context: "赛博朋克" },
      makeCtx(),
    );

    expect(result).toBe(expectedResult);
    expect(runSpecialistMock).toHaveBeenCalledTimes(1);
    const [specId, task, context] = runSpecialistMock.mock.calls[0];
    expect(specId).toBe("character-creator");
    expect(task).toBe("创建角色");
    expect(context).toBe("赛博朋克");
  });

  it("context 缺省时传空字符串给 runSpecialist", async () => {
    runSpecialistMock.mockResolvedValue({ success: true, data: {}, duration: 0 });

    await delegateToSpecialistTool.execute(
      { specialist_id: "story-writer", task: "构思故事" },
      makeCtx(),
    );

    const [, , context] = runSpecialistMock.mock.calls[0];
    expect(context).toBe("");
  });

  it("onProgress 在委派前被调用（包含专家名称）", async () => {
    runSpecialistMock.mockResolvedValue({ success: true, data: {}, duration: 0 });
    const onProgress = vi.fn();

    await delegateToSpecialistTool.execute(
      { specialist_id: "video-producer", task: "生成视频" },
      makeCtx({ onProgress }),
    );

    expect(onProgress).toHaveBeenCalled();
    // 第一次调用应包含专家显示名"视频制作专家"
    const firstCallArg = onProgress.mock.calls[0][0] as string;
    expect(firstCallArg).toContain("视频制作专家");
  });

  it("成功时 onProgress 还会触发专家完成消息", async () => {
    runSpecialistMock.mockResolvedValue({
      success: true,
      data: { result: "完成结果文本" },
      duration: 50,
    });
    const onProgress = vi.fn();

    await delegateToSpecialistTool.execute(
      { specialist_id: "asset-finder", task: "找图片" },
      makeCtx({ onProgress }),
    );

    // 应至少调用 2 次：开始委派 + 完成提示
    expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastCallArg = onProgress.mock.calls[onProgress.mock.calls.length - 1][0] as string;
    expect(lastCallArg).toContain("专家完成");
  });

  it("_confirmDangerous 回调透传给 runSpecialist", async () => {
    runSpecialistMock.mockResolvedValue({ success: true, data: {}, duration: 0 });
    const confirmDangerous = vi.fn<(tc: unknown) => Promise<boolean>>();

    await delegateToSpecialistTool.execute(
      { specialist_id: "character-creator", task: "task" },
      makeCtx({ _confirmDangerous: confirmDangerous as never }),
    );

    const [, , , , confirmArg] = runSpecialistMock.mock.calls[0];
    expect(confirmArg).toBe(confirmDangerous);
  });

  it("runSpecialist 返回失败时原样透传失败结果", async () => {
    const failureResult: ToolResult = {
      success: false,
      error: "子 Agent 执行失败",
      duration: 200,
    };
    runSpecialistMock.mockResolvedValue(failureResult);

    const result = await delegateToSpecialistTool.execute(
      { specialist_id: "api-configurator", task: "配置 API" },
      makeCtx(),
    );

    expect(result).toBe(failureResult);
    expect(result.success).toBe(false);
  });
});

describe("listSpecialistsTool.execute", () => {
  beforeEach(() => {
    listAvailableSpecialistsMock.mockReset();
    listAvailableSpecialistsMock.mockReturnValue("专家摘要文本");
    specialistRegistry.clear();
    specialistRegistry.registerBuiltins();
  });

  afterEach(() => {
    specialistRegistry.clear();
  });

  it("返回所有专家列表及 count、summary", async () => {
    const result = await listSpecialistsTool.execute({}, makeCtx());
    expect(result.success).toBe(true);
    const data = result.data as {
      count: number;
      specialists: Array<{ id: string; name: string; description: string }>;
      summary: string;
    };
    expect(data.count).toBe(BUILTIN_SPECIALISTS.length);
    expect(Array.isArray(data.specialists)).toBe(true);
    expect(data.specialists).toHaveLength(BUILTIN_SPECIALISTS.length);
    expect(data.summary).toBe("专家摘要文本");
    // 至少包含 character-creator
    expect(data.specialists.some((s) => s.id === "character-creator")).toBe(true);
  });

  it("调用 listAvailableSpecialists 获取 summary", async () => {
    await listSpecialistsTool.execute({}, makeCtx());
    expect(listAvailableSpecialistsMock).toHaveBeenCalledTimes(1);
  });

  it("空注册表返回 count=0 且 specialists 为空数组", async () => {
    specialistRegistry.clear();
    const result = await listSpecialistsTool.execute({}, makeCtx());
    expect(result.success).toBe(true);
    const data = result.data as { count: number; specialists: unknown[] };
    expect(data.count).toBe(0);
    expect(data.specialists).toEqual([]);
  });

  it("specialists 仅含 id/name/description 三字段", async () => {
    const result = await listSpecialistsTool.execute({}, makeCtx());
    const data = result.data as { specialists: Array<Record<string, unknown>> };
    for (const s of data.specialists) {
      expect(Object.keys(s).sort()).toEqual(["description", "id", "name"]);
    }
  });
});
