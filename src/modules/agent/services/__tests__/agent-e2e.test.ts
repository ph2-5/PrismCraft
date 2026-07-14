/**
 * Agent 端到端集成测试（E2E）
 *
 * 目标：验证 AgentLoop 从用户输入 → LLM 推理 → 工具调用 → 结果回灌 → 最终回复的完整流程。
 *
 * 方案：
 * - 注入 MockTextProvider 模拟 LLM 流式响应（按场景匹配返回预设剧本）
 * - 注入 MockToolRegistry + MockToolExecutor 模拟工具注册和执行
 * - 注入 mock MemoryService 避免真实 DB/embedding 调用
 * - 使用真实 ConversationManager 管理消息历史
 *
 * 覆盖场景：
 * 1. 简单聊天（无工具调用）
 * 2. 列表查询（单工具调用）
 * 3. 创建角色（多轮 + P0 并行工具执行）
 * 4. 委派专家（P4 delegate_to_specialist）
 * 5. 配置 API（configure_api_provider 工具）
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ToolCall, StreamChunk } from "@/domain/ports/ai-provider-port";
import type {
  AgentSession,
  AgentLoopCallbacks,
  ToolResult,
  AgentMessage,
} from "../../domain/types";
import { createEmptySession } from "../../domain/types";
import type { AgentLoopDeps, IMemoryService } from "../../domain/ports";

// ── Mock container（agent-loop.ts 顶层 import 需要） ──
const { mockVideoTaskStorage } = vi.hoisted(() => ({
  mockVideoTaskStorage: {
    getVideoTasks: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: {},
    videoTaskStorage: mockVideoTaskStorage,
  },
}));

// ── Mock 动态 import（buildDynamicProjectState 用） ──
vi.mock("@/modules/character", () => ({
  characterService: { getAll: vi.fn().mockResolvedValue({ ok: true, value: [] }) },
}));
vi.mock("@/modules/scene", () => ({
  sceneService: { getAll: vi.fn().mockResolvedValue({ ok: true, value: [] }) },
}));
vi.mock("@/modules/storyboard", () => ({
  storyService: { getAll: vi.fn().mockResolvedValue({ ok: true, value: [] }) },
}));
vi.mock("@/shared/api-config", () => ({
  loadConfig: vi.fn().mockResolvedValue(null),
}));

// ── Mock session-checkpoint（避免文件系统 I/O） ──
vi.mock("../session-checkpoint", () => ({
  initCheckpoint: vi.fn().mockResolvedValue(undefined),
  saveCheckpoint: vi.fn().mockResolvedValue(undefined),
  clearCheckpoint: vi.fn().mockResolvedValue(undefined),
  markInterrupted: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock memory-service（避免真实 DB/embedding 调用） ──
vi.mock("@/modules/agent-memory/services/memory-service", () => ({
  memoryService: {
    buildCoreMemoryPrompt: vi.fn().mockResolvedValue(""),
    searchRelevant: vi.fn().mockResolvedValue(""),
    shouldExtract: vi.fn().mockReturnValue(false),
    extractFromConversation: vi.fn().mockResolvedValue(null),
    applyExtractedMemory: vi.fn().mockResolvedValue(undefined),
    summarizeConversation: vi.fn().mockResolvedValue(null),
  },
}));

// 导入被测模块（在 mock 之后）
import { AgentLoop } from "../agent-loop";
import { conversationManager } from "../conversation-manager";
import { MockTextProvider } from "./mock-text-provider";
import { MockToolRegistry, MockToolExecutor, setupMockTools } from "./mock-tool-registry";

// ════════════════════════════════════════════════════════════
// 辅助函数
// ════════════════════════════════════════════════════════════

/** 创建 mock 记忆服务（所有方法返回空值，不阻断流程） */
function createMockMemoryService(): IMemoryService {
  return {
    buildCoreMemoryPrompt: vi.fn().mockResolvedValue(""),
    searchRelevant: vi.fn().mockResolvedValue(""),
    shouldExtract: vi.fn().mockReturnValue(false),
    extractFromConversation: vi.fn().mockResolvedValue(null),
    applyExtractedMemory: vi.fn().mockResolvedValue(undefined),
    summarizeConversation: vi.fn().mockResolvedValue(null),
  };
}

/** 跟踪式回调（记录所有事件用于断言） */
interface TrackingCallbacks extends AgentLoopCallbacks {
  chunks: string[];
  toolCalls: ToolCall[];
  toolResults: Array<{ toolCallId: string; result: ToolResult }>;
  errors: Error[];
}

/** 创建 mock 回调（记录所有事件用于断言） */
function createTrackingCallbacks(): TrackingCallbacks {
  const controller = new AbortController();
  const tracker: TrackingCallbacks = {
    chunks: [],
    toolCalls: [],
    toolResults: [],
    errors: [],
    signal: controller.signal,
    onChunk: (chunk: StreamChunk) => {
      if (chunk.delta) tracker.chunks.push(chunk.delta);
    },
    onToolCall: (tc: ToolCall) => {
      tracker.toolCalls.push(tc);
    },
    onToolResult: (toolCallId: string, result: ToolResult) => {
      tracker.toolResults.push({ toolCallId, result });
    },
    onError: (error: Error) => {
      tracker.errors.push(error);
    },
  };
  return tracker;
}

/** 组装 AgentLoopDeps（注入全部 mock 协作者） */
function createDeps(
  textProvider: MockTextProvider,
  toolRegistry: MockToolRegistry,
  toolExecutor: MockToolExecutor,
  memoryService?: IMemoryService,
): AgentLoopDeps {
  return {
    conversationManager,
    toolRegistry,
    toolExecutor,
    memoryService: memoryService ?? createMockMemoryService(),
    textProvider,
  };
}

/** 获取会话中最后一条 assistant 消息 */
function getLastAssistantMessage(session: AgentSession): AgentMessage | undefined {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    if (session.messages[i]!.role === "assistant") {
      return session.messages[i]!;
    }
  }
  return undefined;
}

// ════════════════════════════════════════════════════════════
// E2E 测试
// ════════════════════════════════════════════════════════════

describe("Agent E2E 端到端集成测试", () => {
  let textProvider: MockTextProvider;
  let toolRegistry: MockToolRegistry;
  let toolExecutor: MockToolExecutor;
  let memoryService: IMemoryService;

  beforeEach(() => {
    textProvider = new MockTextProvider();
    toolRegistry = new MockToolRegistry();
    toolExecutor = new MockToolExecutor();
    memoryService = createMockMemoryService();
    setupMockTools(toolRegistry, toolExecutor);
    vi.clearAllMocks();
    mockVideoTaskStorage.getVideoTasks.mockResolvedValue([]);
  });

  // ──────────────────────────────────────────────
  // 场景 1：简单聊天（无工具调用）
  // ──────────────────────────────────────────────
  describe("场景 1：简单聊天（无工具调用）", () => {
    it("用户说「你好」→ LLM 返回文本回复，无工具调用", async () => {
      const session = createEmptySession();
      const callbacks = createTrackingCallbacks();
      const deps = createDeps(textProvider, toolRegistry, toolExecutor, memoryService);

      const loop = new AgentLoop(session, callbacks, { maxIterations: 3 }, deps);
      await loop.run("你好");

      // 验证：生成 assistant 消息
      const lastAssistant = getLastAssistantMessage(session);
      expect(lastAssistant).toBeDefined();
      expect(lastAssistant!.content).toContain("你好");

      // 验证：无工具调用
      expect(callbacks.toolCalls).toHaveLength(0);
      expect(callbacks.toolResults).toHaveLength(0);

      // 验证：无错误
      expect(callbacks.errors).toHaveLength(0);

      // 验证：消息历史 = 1 user + 1 assistant
      expect(session.messages.length).toBe(2);
      expect(session.messages[0]!.role).toBe("user");
      expect(session.messages[1]!.role).toBe("assistant");
    });

    it("流式 delta 被实时回调", async () => {
      const session = createEmptySession();
      const callbacks = createTrackingCallbacks();
      const deps = createDeps(textProvider, toolRegistry, toolExecutor, memoryService);

      const loop = new AgentLoop(session, callbacks, { maxIterations: 3 }, deps);
      await loop.run("hello");

      // 验证：onChunk 被调用，chunks 被填充
      expect(callbacks.chunks.length).toBeGreaterThan(0);
      const fullText = callbacks.chunks.join("");
      expect(fullText).toContain("AI 动画工作室");
    });
  });

  // ──────────────────────────────────────────────
  // 场景 2：列表查询（单工具调用）
  // ──────────────────────────────────────────────
  describe("场景 2：列表查询（单工具调用）", () => {
    it("用户查询角色列表 → LLM 调用 list_characters → 返回结果后总结", async () => {
      const session = createEmptySession();
      const callbacks = createTrackingCallbacks();
      const deps = createDeps(textProvider, toolRegistry, toolExecutor, memoryService);

      const loop = new AgentLoop(session, callbacks, { maxIterations: 5 }, deps);
      await loop.run("有哪些角色？列出列表");

      // 验证：调用了 list_characters 工具
      const listCall = callbacks.toolCalls.find(
        (tc) => tc.function.name === "list_characters",
      );
      expect(listCall).toBeDefined();

      // 验证：工具执行器被调用
      const executeCall = toolExecutor.executeCalls.find(
        (c) => c.toolCall.function.name === "list_characters",
      );
      expect(executeCall).toBeDefined();

      // 验证：工具结果被回灌
      const listResult = callbacks.toolResults.find(
        (r) => r.toolCallId === listCall!.id,
      );
      expect(listResult).toBeDefined();
      expect(listResult!.result.success).toBe(true);

      // 验证：最终 assistant 消息包含总结
      const lastAssistant = getLastAssistantMessage(session);
      expect(lastAssistant).toBeDefined();
      expect(lastAssistant!.content).toContain("5 个角色");

      // 验证：消息历史 = 1 user + 2 assistant（工具调用 + 总结）
      const assistantMessages = session.messages.filter((m) => m.role === "assistant");
      expect(assistantMessages.length).toBeGreaterThanOrEqual(2);

      // 验证：工具结果消息存在
      const toolMessages = session.messages.filter((m) => m.role === "tool");
      expect(toolMessages.length).toBe(1);
    });
  });

  // ──────────────────────────────────────────────
  // 场景 3：创建角色（多轮 + P0 并行工具执行）
  // ──────────────────────────────────────────────
  describe("场景 3：创建角色（多轮 + P0 并行）", () => {
    it("用户创建角色 → 第1轮 create_character → 第2轮并行 generate_image + list_scenes → 第3轮总结", async () => {
      const session = createEmptySession();
      const callbacks = createTrackingCallbacks();
      const deps = createDeps(textProvider, toolRegistry, toolExecutor, memoryService);

      const loop = new AgentLoop(session, callbacks, { maxIterations: 5 }, deps);
      await loop.run("帮我创建角色");

      // ── 第 1 轮验证：create_character ──
      const createCall = callbacks.toolCalls.find(
        (tc) => tc.function.name === "create_character",
      );
      expect(createCall).toBeDefined();

      // ── 第 2 轮验证：generate_character_image + list_scenes 并行 ──
      const genImgCall = callbacks.toolCalls.find(
        (tc) => tc.function.name === "generate_character_image",
      );
      const listScenesCall = callbacks.toolCalls.find(
        (tc) => tc.function.name === "list_scenes",
      );
      expect(genImgCall).toBeDefined();
      expect(listScenesCall).toBeDefined();

      // P0 核心断言：两个工具在同一个 executeAll 批次中执行（并行）
      const parallelBatch = toolExecutor.executeAllBatches.find(
        (batch) =>
          batch.some((tc) => tc.function.name === "generate_character_image") &&
          batch.some((tc) => tc.function.name === "list_scenes"),
      );
      expect(parallelBatch).toBeDefined();
      expect(parallelBatch!.length).toBe(2);

      // ── 第 3 轮验证：总结 ──
      const lastAssistant = getLastAssistantMessage(session);
      expect(lastAssistant).toBeDefined();
      expect(lastAssistant!.content).toContain("赛博战士");

      // ── 工具调用总数 ──
      expect(callbacks.toolCalls.length).toBe(3); // create + gen_img + list_scenes

      // ── 工具结果总数 ──
      expect(callbacks.toolResults.length).toBe(3);

      // ── 无错误 ──
      expect(callbacks.errors).toHaveLength(0);
    });

    it("P0 并行执行的两个工具结果都被回灌", async () => {
      const session = createEmptySession();
      const callbacks = createTrackingCallbacks();
      const deps = createDeps(textProvider, toolRegistry, toolExecutor, memoryService);

      const loop = new AgentLoop(session, callbacks, { maxIterations: 5 }, deps);
      await loop.run("创建角色");

      // 验证两个并行工具都有结果
      const genImgResult = callbacks.toolResults.find(
        (r) => r.toolCallId === callbacks.toolCalls.find(
          (tc) => tc.function.name === "generate_character_image",
        )?.id,
      );
      const listScenesResult = callbacks.toolResults.find(
        (r) => r.toolCallId === callbacks.toolCalls.find(
          (tc) => tc.function.name === "list_scenes",
        )?.id,
      );

      expect(genImgResult).toBeDefined();
      expect(genImgResult!.result.success).toBe(true);
      expect(listScenesResult).toBeDefined();
      expect(listScenesResult!.result.success).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // 场景 4：委派专家（P4 多 Agent 编排）
  // ──────────────────────────────────────────────
  describe("场景 4：委派专家（P4 delegate_to_specialist）", () => {
    it("用户请求委派 → LLM 调用 delegate_to_specialist → 返回专家结果后总结", async () => {
      const session = createEmptySession();
      const callbacks = createTrackingCallbacks();
      const deps = createDeps(textProvider, toolRegistry, toolExecutor, memoryService);

      const loop = new AgentLoop(session, callbacks, { maxIterations: 5 }, deps);
      await loop.run("请委派专家处理这个任务");

      // 验证：调用了 delegate_to_specialist 工具
      const delegateCall = callbacks.toolCalls.find(
        (tc) => tc.function.name === "delegate_to_specialist",
      );
      expect(delegateCall).toBeDefined();

      // 验证：工具参数正确
      const executeCall = toolExecutor.executeCalls.find(
        (c) => c.toolCall.function.name === "delegate_to_specialist",
      );
      expect(executeCall).toBeDefined();
      const args = JSON.parse(executeCall!.toolCall.function.arguments);
      expect(args.specialist_id).toBe("character-creator");
      expect(args.task).toContain("赛博朋克");

      // 验证：工具结果包含专家回复
      const delegateResult = callbacks.toolResults.find(
        (r) => r.toolCallId === delegateCall!.id,
      );
      expect(delegateResult).toBeDefined();
      expect(delegateResult!.result.success).toBe(true);

      // 验证：最终总结提及专家完成
      const lastAssistant = getLastAssistantMessage(session);
      expect(lastAssistant).toBeDefined();
      expect(lastAssistant!.content).toContain("专家");
    });
  });

  // ──────────────────────────────────────────────
  // 场景 5：配置 API（configure_api_provider 工具）
  // ──────────────────────────────────────────────
  describe("场景 5：配置 API", () => {
    it("用户请求配置 API → LLM 调用 configure_api_provider → 返回成功后总结", async () => {
      const session = createEmptySession();
      const callbacks = createTrackingCallbacks();
      const deps = createDeps(textProvider, toolRegistry, toolExecutor, memoryService);

      const loop = new AgentLoop(session, callbacks, { maxIterations: 5 }, deps);
      await loop.run("帮我配置 API provider");

      // 验证：调用了 configure_api_provider 工具
      const configCall = callbacks.toolCalls.find(
        (tc) => tc.function.name === "configure_api_provider",
      );
      expect(configCall).toBeDefined();

      // 验证：工具参数正确
      const executeCall = toolExecutor.executeCalls.find(
        (c) => c.toolCall.function.name === "configure_api_provider",
      );
      expect(executeCall).toBeDefined();
      const args = JSON.parse(executeCall!.toolCall.function.arguments);
      expect(args.vendor).toBe("openai");

      // 验证：工具结果成功
      const configResult = callbacks.toolResults.find(
        (r) => r.toolCallId === configCall!.id,
      );
      expect(configResult).toBeDefined();
      expect(configResult!.result.success).toBe(true);

      // 验证：最终总结
      const lastAssistant = getLastAssistantMessage(session);
      expect(lastAssistant).toBeDefined();
      expect(lastAssistant!.content).toContain("配置完成");
    });
  });

  // ──────────────────────────────────────────────
  // 验证 LLM 消息构建
  // ──────────────────────────────────────────────
  describe("LLM 消息构建验证", () => {
    it("generateChat 接收的 messages 包含 system prompt 和 user 消息", async () => {
      const session = createEmptySession();
      const callbacks = createTrackingCallbacks();
      const deps = createDeps(textProvider, toolRegistry, toolExecutor, memoryService);

      const loop = new AgentLoop(session, callbacks, { maxIterations: 3 }, deps);
      await loop.run("你好");

      // 验证：textProvider 收到至少一次 generateChat 调用
      expect(textProvider.chatCalls.length).toBeGreaterThanOrEqual(1);

      // 第一次调用的 messages 应包含 system + user
      const firstCallMessages = textProvider.chatCalls[0]!;
      const hasSystem = firstCallMessages.some((m) => m.role === "system");
      const hasUser = firstCallMessages.some((m) => m.role === "user");
      expect(hasSystem).toBe(true);
      expect(hasUser).toBe(true);
    });

    it("generateChat 接收的 tools 参数包含已注册工具", async () => {
      const session = createEmptySession();
      const callbacks = createTrackingCallbacks();
      const deps = createDeps(textProvider, toolRegistry, toolExecutor, memoryService);

      const loop = new AgentLoop(session, callbacks, { maxIterations: 3 }, deps);
      await loop.run("有哪些角色？列出列表");

      // 验证：tools 参数被传入
      expect(textProvider.toolDefsPassed.length).toBeGreaterThanOrEqual(1);

      // 验证：tools 包含 list_characters
      const firstTools = textProvider.toolDefsPassed[0]!;
      const toolNames = firstTools.map((t) => t.function.name);
      expect(toolNames).toContain("list_characters");
      expect(toolNames).toContain("create_character");
    });
  });

  // ──────────────────────────────────────────────
  // 验证消息历史完整性
  // ──────────────────────────────────────────────
  describe("消息历史完整性", () => {
    it("多轮工具调用后，消息历史包含所有 user/assistant/tool 消息", async () => {
      const session = createEmptySession();
      const callbacks = createTrackingCallbacks();
      const deps = createDeps(textProvider, toolRegistry, toolExecutor, memoryService);

      const loop = new AgentLoop(session, callbacks, { maxIterations: 5 }, deps);
      await loop.run("创建角色");

      // 消息序列：
      // 1. user: "创建角色"
      // 2. assistant (with tool_calls: create_character)
      // 3. tool (create_character result)
      // 4. assistant (with tool_calls: gen_img + list_scenes)
      // 5. tool (gen_img result)
      // 6. tool (list_scenes result)
      // 7. assistant (总结)

      const userMessages = session.messages.filter((m) => m.role === "user");
      const assistantMessages = session.messages.filter((m) => m.role === "assistant");
      const toolMessages = session.messages.filter((m) => m.role === "tool");

      expect(userMessages.length).toBe(1);
      expect(assistantMessages.length).toBe(3); // 3 轮 LLM 调用
      expect(toolMessages.length).toBe(3); // create + gen_img + list_scenes
    });
  });

  // ──────────────────────────────────────────────
  // 验证 RAG 注入（P1）
  // ──────────────────────────────────────────────
  describe("RAG 记忆注入（P1）", () => {
    it("buildSystemPrompt 调用 memoryService.searchRelevant 获取相关记忆", async () => {
      const session = createEmptySession();
      const callbacks = createTrackingCallbacks();
      const mockMemory = createMockMemoryService();
      (mockMemory.searchRelevant as ReturnType<typeof vi.fn>).mockResolvedValue(
        "用户喜欢赛博朋克风格",
      );
      const deps = createDeps(textProvider, toolRegistry, toolExecutor, mockMemory);

      const loop = new AgentLoop(session, callbacks, { maxIterations: 3 }, deps);
      await loop.run("你好");

      // 验证：searchRelevant 被调用，参数为用户消息
      expect(mockMemory.searchRelevant).toHaveBeenCalledWith("你好", 3);
    });

    it("buildSystemPrompt 调用 memoryService.buildCoreMemoryPrompt 获取核心记忆", async () => {
      const session = createEmptySession();
      const callbacks = createTrackingCallbacks();
      const mockMemory = createMockMemoryService();
      (mockMemory.buildCoreMemoryPrompt as ReturnType<typeof vi.fn>).mockResolvedValue(
        "核心记忆：用户偏好暗色调",
      );
      const deps = createDeps(textProvider, toolRegistry, toolExecutor, mockMemory);

      const loop = new AgentLoop(session, callbacks, { maxIterations: 3 }, deps);
      await loop.run("你好");

      // 验证：buildCoreMemoryPrompt 被调用
      expect(mockMemory.buildCoreMemoryPrompt).toHaveBeenCalled();
    });
  });
});
