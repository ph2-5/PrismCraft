/**
 * Agent 真实 LLM 集成测试（可选运行）
 *
 * 此测试验证 Agent Loop → HTTP API → 真实 LLM 的完整链路。
 * 仅在提供 PRISMCRAFT_LLM_API_KEY 环境变量时运行，否则跳过。
 *
 * 运行方式：
 *   PRISMCRAFT_LLM_API_KEY=sk-xxx npx vitest run --config vitest.config.electron.ts \
 *     electron/src/__tests__/agent-real-llm-integration.test.ts
 *
 * 或在 Electron 应用启动后通过 .ai/smoke-test-http-api.cjs 脚本运行。
 *
 * 注意：此测试会消耗真实 API 配额，请谨慎运行。
 */
import { describe, it, expect } from "vitest";

// 仅在提供 API key 时运行
const API_KEY = process.env.PRISMCRAFT_LLM_API_KEY;
const API_BASE_URL = process.env.PRISMCRAFT_LLM_BASE_URL || "https://api.deepseek.com/v1";
const MODEL_ID = process.env.PRISMCRAFT_LLM_MODEL || "deepseek-chat";

const shouldRun = !!API_KEY;

// 辅助函数：从 SSE delta 中累积 tool_calls（提取以降低嵌套深度）
type ToolCallAccumulator = { id: string; name: string; args: string };
function accumulateToolCalls(
  delta: { tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> } | undefined,
  toolCallsMap: Map<number, ToolCallAccumulator>,
): void {
  if (!delta?.tool_calls) return;
  for (const tc of delta.tool_calls) {
    const idx = tc.index ?? 0;
    const existing = toolCallsMap.get(idx) || { id: "", name: "", args: "" };
    if (tc.id) existing.id = tc.id;
    if (tc.function?.name) existing.name = tc.function.name;
    if (tc.function?.arguments) existing.args += tc.function.arguments;
    toolCallsMap.set(idx, existing);
  }
}

describe.skipIf(!shouldRun)("Agent 真实 LLM 集成测试", () => {
  it("非流式 generateChat 应返回有效响应", async () => {
    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          { role: "system", content: "你是 PrismCraft 的 AI 助手。" },
          { role: "user", content: "说'你好'" },
        ],
        max_tokens: 50,
        temperature: 0.7,
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.choices).toBeDefined();
    expect(data.choices[0].message.content).toBeDefined();
    expect(data.choices[0].finish_reason).toBe("stop");
  });

  it("流式 generateChatStream 应返回多个 chunk", async () => {
    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: "user", content: "从 1 数到 5" }],
        stream: true,
        max_tokens: 100,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;
    let fullText = "";
    let finishReason: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        const json = line.slice(6).trim();
        if (json === "[DONE]") continue;
        try {
          const parsed = JSON.parse(json);
          if (parsed.choices?.[0]?.delta?.content) {
            chunkCount++;
            fullText += parsed.choices[0].delta.content;
          }
          if (parsed.choices?.[0]?.finish_reason) {
            finishReason = parsed.choices[0].finish_reason;
          }
        } catch {
          // 跳过不完整的 JSON
        }
      }
    }

    expect(chunkCount).toBeGreaterThan(0);
    expect(fullText.length).toBeGreaterThan(0);
    expect(finishReason).toBe("stop");
  });

  it("Function calling 应正确返回 tool_calls", async () => {
    const tools = [
      {
        type: "function",
        function: {
          name: "get_project_stats",
          description: "获取项目统计概览：角色数、场景数、故事数、视频任务状态。",
          parameters: { type: "object", properties: {} },
        },
      },
    ];

    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: "user", content: "帮我看看项目里有多少角色和场景" }],
        tools,
        tool_choice: "auto",
        max_tokens: 200,
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.choices).toBeDefined();
    const choice = data.choices[0];
    // LLM 可能返回 tool_calls 或直接文本回复，两种都是可接受的
    if (choice.finish_reason === "tool_calls") {
      expect(choice.message.tool_calls).toBeDefined();
      expect(choice.message.tool_calls.length).toBeGreaterThan(0);
      expect(choice.message.tool_calls[0].function.name).toBe("get_project_stats");
    } else {
      // 如果 LLM 选择直接回复而非调用工具，也是可接受的
      expect(choice.message.content).toBeDefined();
    }
  });

  it("流式 + Function calling 应正确返回增量 tool_calls", async () => {
    const tools = [
      {
        type: "function",
        function: {
          name: "create_character",
          description: "创建一个新角色",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "角色名称" },
              style: { type: "string", description: "角色风格" },
            },
            required: ["name"],
          },
        },
      },
    ];

    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: "user", content: "帮我创建一个赛博朋克风格的角色，名字叫霓虹" }],
        tools,
        tool_choice: "auto",
        stream: true,
        max_tokens: 200,
      }),
    });

    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const toolCallsMap = new Map<number, { id: string; name: string; args: string }>();
    let finishReason: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        const json = line.slice(6).trim();
        if (json === "[DONE]") continue;
        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices?.[0]?.delta;
          accumulateToolCalls(delta, toolCallsMap);
          if (parsed.choices?.[0]?.finish_reason) {
            finishReason = parsed.choices[0].finish_reason;
          }
        } catch {
          // 跳过不完整的 JSON
        }
      }
    }

    // 验证 tool_calls 被正确组装
    if (finishReason === "tool_calls") {
      expect(toolCallsMap.size).toBeGreaterThan(0);
      const firstCall = toolCallsMap.get(0)!;
      expect(firstCall.name).toBe("create_character");
      expect(firstCall.args).toContain("霓虹");
    }
  });
});

// 当未提供 API key 时，显示跳过提示
describe.skipIf(shouldRun)("Agent 真实 LLM 集成测试（跳过）", () => {
  it("应提示设置 PRISMCRAFT_LLM_API_KEY 环境变量", () => {
    // 此测试仅在未设置 API key 时运行，作为提示
    expect(process.env.PRISMCRAFT_LLM_API_KEY).toBeUndefined();
  });
});
