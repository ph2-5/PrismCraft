/**
 * Task 1.0 流式改造 — plugin 层默认流式方法单元测试
 *
 * 覆盖 BaseAIProviderPlugin 的两个流式默认实现：
 * - buildTextStreamRequest：在 buildTextRequest 基础上添加 stream:true + tools 字段
 * - extractTextChunk：解析 OpenAI 兼容 SSE 单行（data: ... 格式）
 *
 * 文件位置遵循 electron 测试规范：electron/src/plugins/__tests__/{name}.test.ts
 */
import { describe, it, expect } from "vitest";
import { BaseAIProviderPlugin } from "../base-provider";

/**
 * 用最小化子类验证 BaseAIProviderPlugin 的默认流式实现。
 * BaseAIProviderPlugin 是抽象基类，需要实现 match() 才能实例化。
 */
class TestPlugin extends BaseAIProviderPlugin {
  id = "test-plugin";
  match = () => true;
  capabilities = { video: false, image: false, text: true, vision: false };
}

describe("BaseAIProviderPlugin.buildTextStreamRequest (Task 1.0 默认实现)", () => {
  const plugin = new TestPlugin();

  it("应在 buildTextRequest 的 body 基础上添加 stream: true", () => {
    const result = plugin.buildTextStreamRequest({
      prompt: "hello",
      model: "gpt-4o",
      maxTokens: 100,
      temperature: 0.7,
    });

    expect(result.body).toHaveProperty("stream", true);
    expect(result.body).toHaveProperty("model", "gpt-4o");
    expect(result.body).toHaveProperty("messages");
    expect(result.body).toHaveProperty("max_tokens", 100);
    expect(result.body).toHaveProperty("temperature", 0.7);
    expect(result.endpoint).toBe("/chat/completions");
  });

  it("无 tools 时不应该添加 tools 字段", () => {
    const result = plugin.buildTextStreamRequest({
      prompt: "hello",
      model: "gpt-4o",
      maxTokens: 100,
      temperature: 0.7,
    });

    expect(result.body).not.toHaveProperty("tools");
  });

  it("有 tools 时应原样传递 tools 数组（OpenAI function-calling 格式）", () => {
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "list_characters",
          description: "列出所有角色",
          parameters: { type: "object", properties: {} },
        },
      },
    ];

    const result = plugin.buildTextStreamRequest({
      prompt: "列出角色",
      model: "gpt-4o",
      maxTokens: 100,
      temperature: 0.7,
      tools,
    });

    expect(result.body).toHaveProperty("tools");
    expect((result.body as Record<string, unknown>).tools).toEqual(tools);
  });

  it("空 tools 数组不应添加 tools 字段", () => {
    const result = plugin.buildTextStreamRequest({
      prompt: "hello",
      model: "gpt-4o",
      maxTokens: 100,
      temperature: 0.7,
      tools: [],
    });

    expect(result.body).not.toHaveProperty("tools");
  });

  it("应该保留 buildTextRequest 的所有字段（不丢失 model/messages/max_tokens/temperature）", () => {
    const result = plugin.buildTextStreamRequest({
      prompt: "测试提示词",
      model: "deepseek-chat",
      maxTokens: 4096,
      temperature: 0.5,
    });

    const body = result.body as Record<string, unknown>;
    expect(body.model).toBe("deepseek-chat");
    expect(body.max_tokens).toBe(4096);
    expect(body.temperature).toBe(0.5);
    expect(Array.isArray(body.messages)).toBe(true);
    expect((body.messages as Array<Record<string, unknown>>)[0]).toEqual({
      role: "user",
      content: "测试提示词",
    });
  });
});

describe("BaseAIProviderPlugin.extractTextChunk (Task 1.0 默认实现)", () => {
  const plugin = new TestPlugin();

  describe("边界处理", () => {
    it("空行返回 undefined", () => {
      expect(plugin.extractTextChunk!("")).toBeUndefined();
      expect(plugin.extractTextChunk!("   ")).toBeUndefined();
      expect(plugin.extractTextChunk!("\n")).toBeUndefined();
      expect(plugin.extractTextChunk!("\t\t")).toBeUndefined();
    });

    it("非 data: 前缀行返回 undefined", () => {
      expect(plugin.extractTextChunk!("event: message")).toBeUndefined();
      expect(plugin.extractTextChunk!(": heartbeat")).toBeUndefined();
      expect(plugin.extractTextChunk!("id: 123")).toBeUndefined();
    });

    it("仅 'data:' 前缀但无内容返回 undefined（trim 后为空）", () => {
      expect(plugin.extractTextChunk!("data:")).toBeUndefined();
      expect(plugin.extractTextChunk!("data: ")).toBeUndefined();
      expect(plugin.extractTextChunk!("data:   ")).toBeUndefined();
    });

    it("非 JSON 数据行返回 undefined（注释/心跳）", () => {
      expect(plugin.extractTextChunk!("data: not a json")).toBeUndefined();
      expect(plugin.extractTextChunk!("data: {invalid json")).toBeUndefined();
    });
  });

  describe("[DONE] 标记", () => {
    it("'data: [DONE]' 应返回 finishReason='stop' 的空 chunk", () => {
      const chunk = plugin.extractTextChunk!("data: [DONE]");
      expect(chunk).toEqual({ delta: "", finishReason: "stop" });
    });

    it("'data: [DONE]' 带前后空格也应正确解析", () => {
      const chunk = plugin.extractTextChunk!("  data: [DONE]  ");
      expect(chunk).toEqual({ delta: "", finishReason: "stop" });
    });
  });

  describe("文本 delta 解析", () => {
    it("应正确提取 choices[0].delta.content 作为 delta", () => {
      const line = 'data: {"choices":[{"delta":{"content":"hello"}}]}';
      const chunk = plugin.extractTextChunk!(line);
      expect(chunk).toEqual({ delta: "hello" });
    });

    it("空 content 字符串应返回 undefined（避免噪声回调）", () => {
      const line = 'data: {"choices":[{"delta":{"content":""}}]}';
      expect(plugin.extractTextChunk!(line)).toBeUndefined();
    });

    it("缺少 delta 字段应返回 undefined", () => {
      const line = 'data: {"choices":[{}]}';
      expect(plugin.extractTextChunk!(line)).toBeUndefined();
    });

    it("多字 delta 应正确返回", () => {
      const line =
        'data: {"choices":[{"delta":{"content":"你好世界，这是一个测试"}}]}';
      const chunk = plugin.extractTextChunk!(line);
      expect(chunk?.delta).toBe("你好世界，这是一个测试");
    });
  });

  describe("finishReason 解析", () => {
    it("finish_reason='stop' 应映射到 finishReason='stop'", () => {
      const line = 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}';
      const chunk = plugin.extractTextChunk!(line);
      // delta 为空对象 → content 为 undefined → delta=""
      // finishReason='stop' → 不为空
      // 但 delta="" 且无 toolCalls → 应返回 {delta:"", finishReason:"stop"}
      expect(chunk).toEqual({ delta: "", finishReason: "stop" });
    });

    it("finish_reason='tool_calls' 应映射到 finishReason='tool_calls'", () => {
      const line = 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}';
      const chunk = plugin.extractTextChunk!(line);
      expect(chunk?.finishReason).toBe("tool_calls");
    });

    it("finish_reason='length' 应映射到 finishReason='length'", () => {
      const line = 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}';
      const chunk = plugin.extractTextChunk!(line);
      expect(chunk?.finishReason).toBe("length");
    });

    it("未知 finish_reason 应被忽略（返回 undefined 或仅含 delta 的 chunk）", () => {
      const line = 'data: {"choices":[{"delta":{},"finish_reason":"unknown"}]}';
      const chunk = plugin.extractTextChunk!(line);
      // delta="" 且 toolCalls undefined 且 mappedFinish undefined → 应返回 undefined
      expect(chunk).toBeUndefined();
    });
  });

  describe("tool_calls 解析（OpenAI 流式增量格式）", () => {
    it("完整的 tool_call（含 id + name + arguments）应正确返回", () => {
      const line =
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","function":{"name":"list_characters","arguments":"{\\"limit\\":5}"}}]}}]}';
      const chunk = plugin.extractTextChunk!(line);
      expect(chunk?.toolCalls).toEqual([
        {
          id: "call_abc",
          function: {
            name: "list_characters",
            arguments: '{"limit":5}',
          },
        },
      ]);
      expect(chunk?.delta).toBe("");
    });

    it("部分 tool_call（仅 arguments 增量）应保留并返回", () => {
      const line =
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"more"}}]}}]}';
      const chunk = plugin.extractTextChunk!(line);
      // id 缺失 → "" , name 缺失 → "", arguments="more"
      // 由于 id 和 name 都为空字符串，被 filter 过滤为 null
      // 但 arguments 不为空 → 应保留
      expect(chunk?.toolCalls).toEqual([
        {
          id: "",
          function: {
            name: "",
            arguments: "more",
          },
        },
      ]);
    });

    it("完全空的 tool_call 片段（仅 index）应被过滤（返回 undefined）", () => {
      const line =
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0}]}}]}';
      const chunk = plugin.extractTextChunk!(line);
      // id="" name="" arguments="" → 被过滤 → toolCalls=[]
      // → length=0 → toolCalls=undefined
      // delta="" + 无 toolCalls + 无 finishReason → 返回 undefined
      expect(chunk).toBeUndefined();
    });

    it("多个 tool_calls 应全部返回", () => {
      const line =
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"tool1","arguments":"{}"}},{"index":1,"id":"call_2","function":{"name":"tool2","arguments":"{}"}}]}}]}';
      const chunk = plugin.extractTextChunk!(line);
      expect(chunk?.toolCalls).toHaveLength(2);
      expect(chunk?.toolCalls?.[0].id).toBe("call_1");
      expect(chunk?.toolCalls?.[1].id).toBe("call_2");
    });
  });

  describe("组合场景", () => {
    it("同时包含 delta 和 finish_reason", () => {
      const line =
        'data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}';
      const chunk = plugin.extractTextChunk!(line);
      expect(chunk).toEqual({ delta: "done", finishReason: "stop" });
    });

    it("同时包含 delta 和 tool_calls", () => {
      const line =
        'data: {"choices":[{"delta":{"content":"thinking","tool_calls":[{"index":0,"id":"call_x","function":{"name":"t","arguments":""}}]}}]}';
      const chunk = plugin.extractTextChunk!(line);
      expect(chunk?.delta).toBe("thinking");
      expect(chunk?.toolCalls).toHaveLength(1);
      expect(chunk?.toolCalls?.[0].id).toBe("call_x");
    });

    it("choices 数组为空应返回 undefined", () => {
      const line = 'data: {"choices":[]}';
      expect(plugin.extractTextChunk!(line)).toBeUndefined();
    });

    it("choices 字段缺失应返回 undefined", () => {
      const line = 'data: {"id":"chatcmpl-123","object":"chat.completion.chunk"}';
      expect(plugin.extractTextChunk!(line)).toBeUndefined();
    });

    it("choices 不是数组应返回 undefined", () => {
      const line = 'data: {"choices":"not an array"}';
      expect(plugin.extractTextChunk!(line)).toBeUndefined();
    });
  });

  describe("OpenAI 真实流式响应片段", () => {
    it("应正确解析首个 chunk（通常含 role）", () => {
      const line =
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}';
      const chunk = plugin.extractTextChunk!(line);
      // content="" → delta="" → 无 finishReason → 无 toolCalls → undefined
      expect(chunk).toBeUndefined();
    });

    it("应正确解析中间 chunk（含增量文本）", () => {
      const line =
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}';
      const chunk = plugin.extractTextChunk!(line);
      expect(chunk?.delta).toBe("Hello");
    });

    it("应正确解析末尾 chunk（含 finish_reason=stop）", () => {
      const line =
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}';
      const chunk = plugin.extractTextChunk!(line);
      expect(chunk?.finishReason).toBe("stop");
    });
  });
});
