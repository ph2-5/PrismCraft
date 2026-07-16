/**
 * Text Provider Plugin 单元测试
 *
 * 验证 3 个 text provider 的请求构造 + 响应解析：
 * 1. OpenAICompatiblePlugin —— /chat/completions，OpenAI function-calling 格式
 * 2. AnthropicPlugin —— /messages，content blocks + input_schema 格式
 * 3. GooglePlugin —— /chat/completions（OpenAI 兼容端点），x-goog-api-key 认证
 *
 * 覆盖盲区：
 * - text capability 完全无测试覆盖（local-cloud-mock 仅覆盖 video）
 * - Anthropic 的 convertMessagesToAnthropic 和 extractTextChunk 复杂逻辑无测试
 * - provider 间的请求/响应格式差异无回归保护
 */

import { describe, it, expect } from "vitest";
import { OpenAICompatiblePlugin } from "../openai-compatible";
import { AnthropicPlugin } from "../anthropic";
import { GooglePlugin } from "../google";
import type {
  TextBuildContext,
  ChatBuildContext,
  ChatStreamBuildContext,
  TextStreamBuildContext,
} from "../../types";

const TEST_API_KEY = "test-api-key-12345";

describe("Text Provider Plugin 单元测试", () => {
  describe("OpenAICompatiblePlugin", () => {
    const plugin = new OpenAICompatiblePlugin();

    describe("buildTextRequest", () => {
      it("应构造标准 OpenAI chat/completions 请求", () => {
        const ctx: TextBuildContext = {
          prompt: "你好",
          model: "gpt-4o",
          maxTokens: 1024,
          temperature: 0.7,
        };
        const result = plugin.buildTextRequest(ctx);

        expect(result.endpoint).toBe("/chat/completions");
        expect(result.body).toEqual({
          model: "gpt-4o",
          messages: [{ role: "user", content: "你好" }],
          max_tokens: 1024,
          temperature: 0.7,
        });
      });

      it("未指定 model 时应使用默认 gpt-4o", () => {
        const ctx: TextBuildContext = {
          prompt: "test",
          maxTokens: 100,
          temperature: 0,
        };
        const result = plugin.buildTextRequest(ctx);
        expect(result.body.model).toBe("gpt-4o");
      });

      it("应支持 DeepSeek 等 OpenAI 兼容 provider 的自定义 model", () => {
        const ctx: TextBuildContext = {
          prompt: "测试",
          model: "deepseek-chat",
          maxTokens: 4096,
          temperature: 0.7,
        };
        const result = plugin.buildTextRequest(ctx);
        expect(result.body.model).toBe("deepseek-chat");
      });
    });

    describe("buildChatRequest", () => {
      it("应透传完整 messages 数组（含 tool_calls/tool_call_id）", () => {
        const ctx: ChatBuildContext = {
          messages: [
            { role: "system", content: "你是助手" },
            { role: "user", content: "调用工具" },
            {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "search", arguments: '{"q":"test"}' },
                },
              ],
            },
            { role: "tool", tool_call_id: "call_1", content: "搜索结果" },
          ],
          model: "gpt-4o",
          maxTokens: 2048,
          temperature: 0.5,
        };
        const result = plugin.buildChatRequest(ctx);

        expect(result.endpoint).toBe("/chat/completions");
        expect(result.body.messages).toEqual(ctx.messages);
        expect(result.body.max_tokens).toBe(2048);
      });
    });

    describe("buildChatStreamRequest", () => {
      it("应追加 stream:true 和 tools 字段（OpenAI function-calling 格式）", () => {
        const ctx: ChatStreamBuildContext = {
          messages: [{ role: "user", content: "调用工具" }],
          model: "gpt-4o",
          maxTokens: 1024,
          temperature: 0.7,
          tools: [
            {
              type: "function",
              function: {
                name: "search",
                description: "搜索",
                parameters: { type: "object", properties: { q: { type: "string" } } },
              },
            },
          ],
        };
        const result = plugin.buildChatStreamRequest(ctx);

        expect(result.body.stream).toBe(true);
        expect(result.body.tools).toEqual([
          {
            type: "function",
            function: {
              name: "search",
              description: "搜索",
              parameters: { type: "object", properties: { q: { type: "string" } } },
            },
          },
        ]);
      });

      it("无 tools 时不应添加 tools 字段", () => {
        const ctx: ChatStreamBuildContext = {
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          maxTokens: 100,
          temperature: 0,
        };
        const result = plugin.buildChatStreamRequest(ctx);
        expect(result.body.tools).toBeUndefined();
        expect(result.body.stream).toBe(true);
      });
    });

    describe("extractTextChunk (SSE 流式解析)", () => {
      it("应解析 delta.content 文本增量", () => {
        const line = 'data: {"choices":[{"delta":{"content":"你好"}}]}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk).toEqual({ delta: "你好" });
      });

      it("应解析 [DONE] 为 finishReason:stop", () => {
        const chunk = plugin.extractTextChunk("data: [DONE]");
        expect(chunk).toEqual({ delta: "", finishReason: "stop" });
      });

      it("应解析 finish_reason=tool_calls", () => {
        const line = 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk?.finishReason).toBe("tool_calls");
      });

      it("应解析增量 tool_calls（含 id/name/arguments）", () => {
        const line = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search","arguments":"{\\"q\\":"}}]}}]}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk?.toolCalls).toEqual([
          {
            id: "call_1",
            function: { name: "search", arguments: '{"q":' },
          },
        ]);
      });

      it("应跳过空的 tool_call 片段（仅 index）", () => {
        const line = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0}]}}]}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk).toBeUndefined();
      });

      it("应跳过非 data: 开头的行", () => {
        expect(plugin.extractTextChunk(": heartbeat")).toBeUndefined();
        expect(plugin.extractTextChunk("event: ping")).toBeUndefined();
        expect(plugin.extractTextChunk("")).toBeUndefined();
      });

      it("应跳过非 JSON 的 data 行", () => {
        expect(plugin.extractTextChunk("data: not-json")).toBeUndefined();
      });

      it("应跳过空 chunk（无 delta/toolCalls/finishReason）", () => {
        const line = 'data: {"choices":[{"delta":{}}]}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk).toBeUndefined();
      });
    });

    describe("getAuthHeaders", () => {
      it("应返回 Authorization: Bearer 头", () => {
        const headers = plugin.getAuthHeaders(TEST_API_KEY);
        expect(headers.Authorization).toBe(`Bearer ${TEST_API_KEY}`);
      });
    });
  });

  describe("AnthropicPlugin", () => {
    const plugin = new AnthropicPlugin();

    describe("buildTextRequest", () => {
      it("应构造 /messages 请求，使用 claude 默认 model", () => {
        const ctx: TextBuildContext = {
          prompt: "你好",
          maxTokens: 1024,
          temperature: 0.7,
        };
        const result = plugin.buildTextRequest(ctx);

        expect(result.endpoint).toBe("/messages");
        expect(result.body).toEqual({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "你好" }],
          max_tokens: 1024,
          temperature: 0.7,
        });
      });

      it("temperature 为 0 时仍应包含 temperature 字段", () => {
        const ctx: TextBuildContext = {
          prompt: "test",
          maxTokens: 100,
          temperature: 0,
        };
        const result = plugin.buildTextRequest(ctx);
        expect(result.body.temperature).toBe(0);
      });
    });

    describe("buildChatRequest - convertMessagesToAnthropic", () => {
      it("应将 system role 提取到顶层 system 字段", () => {
        const ctx: ChatBuildContext = {
          messages: [
            { role: "system", content: "系统提示1" },
            { role: "system", content: "系统提示2" },
            { role: "user", content: "hi" },
          ],
          maxTokens: 100,
          temperature: 0.7,
        };
        const result = plugin.buildChatRequest(ctx);

        expect(result.body.system).toBe("系统提示1\n系统提示2");
        const messages = result.body.messages as Array<{ role: string }>;
        expect(messages.every((m) => m.role !== "system")).toBe(true);
      });

      it("应将 assistant + tool_calls 转换为 content blocks（text + tool_use）", () => {
        const ctx: ChatBuildContext = {
          messages: [
            { role: "user", content: "调用工具" },
            {
              role: "assistant",
              content: "正在调用",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "search", arguments: '{"q":"test"}' },
                },
              ],
            },
          ],
          maxTokens: 100,
          temperature: 0.7,
        };
        const result = plugin.buildChatRequest(ctx);
        const messages = result.body.messages as Array<{ role: string; content: unknown }>;
        const assistantMsg = messages.find((m) => m.role === "assistant");
        const content = assistantMsg?.content as Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;

        expect(Array.isArray(content)).toBe(true);
        expect(content[0]).toEqual({ type: "text", text: "正在调用" });
        expect(content[1]).toEqual({
          type: "tool_use",
          id: "call_1",
          name: "search",
          input: { q: "test" }, // arguments 字符串被 JSON.parse 为对象
        });
      });

      it("应将 tool role 转换为 user with tool_result content blocks（连续合并）", () => {
        const ctx: ChatBuildContext = {
          messages: [
            { role: "user", content: "调用两个工具" },
            {
              role: "assistant",
              content: "",
              tool_calls: [
                { id: "c1", type: "function", function: { name: "f1", arguments: "{}" } },
                { id: "c2", type: "function", function: { name: "f2", arguments: "{}" } },
              ],
            },
            { role: "tool", tool_call_id: "c1", content: "结果1" },
            { role: "tool", tool_call_id: "c2", content: "结果2" },
          ],
          maxTokens: 100,
          temperature: 0.7,
        };
        const result = plugin.buildChatRequest(ctx);
        const messages = result.body.messages as Array<{ role: string; content: unknown }>;

        // 两条连续 tool 消息应合并为一条 user 消息，content 为数组
        const toolResultMsg = messages.find((m) => Array.isArray(m.content) && (m.content as Array<{ type: string }>)[0]?.type === "tool_result");
        expect(toolResultMsg?.role).toBe("user");
        const content = toolResultMsg?.content as Array<{ type: string; tool_use_id: string; content: string }>;
        expect(content).toHaveLength(2);
        expect(content[0]).toEqual({ type: "tool_result", tool_use_id: "c1", content: "结果1" });
        expect(content[1]).toEqual({ type: "tool_result", tool_use_id: "c2", content: "结果2" });
      });

      it("arguments 非法 JSON 时应 fallback 为空对象", () => {
        const ctx: ChatBuildContext = {
          messages: [
            { role: "user", content: "调用" },
            {
              role: "assistant",
              content: "",
              tool_calls: [
                { id: "c1", type: "function", function: { name: "f", arguments: "not-json" } },
              ],
            },
          ],
          maxTokens: 100,
          temperature: 0.7,
        };
        const result = plugin.buildChatRequest(ctx);
        const messages = result.body.messages as Array<{ role: string; content: unknown }>;
        const assistant = messages.find((m) => m.role === "assistant");
        const content = assistant?.content as Array<{ type: string; input?: unknown }>;
        const toolUse = content.find((c) => c.type === "tool_use");
        expect(toolUse?.input).toEqual({});
      });

      it("无 system 消息时不应添加 system 字段", () => {
        const ctx: ChatBuildContext = {
          messages: [{ role: "user", content: "hi" }],
          maxTokens: 100,
          temperature: 0.7,
        };
        const result = plugin.buildChatRequest(ctx);
        expect(result.body.system).toBeUndefined();
      });
    });

    describe("buildChatStreamRequest", () => {
      it("应追加 stream:true 并将 tools 转换为 input_schema 格式", () => {
        const ctx: ChatStreamBuildContext = {
          messages: [{ role: "user", content: "调用工具" }],
          maxTokens: 100,
          temperature: 0.7,
          tools: [
            {
              type: "function",
              function: {
                name: "search",
                description: "搜索",
                parameters: { type: "object", properties: { q: { type: "string" } } },
              },
            },
          ],
        };
        const result = plugin.buildChatStreamRequest(ctx);

        expect(result.body.stream).toBe(true);
        expect(result.body.tools).toEqual([
          {
            name: "search",
            description: "搜索",
            input_schema: { type: "object", properties: { q: { type: "string" } } },
          },
        ]);
        // 不应包含 type:"function" 包装
        const tools = result.body.tools as Array<Record<string, unknown>>;
        expect(tools[0].type).toBeUndefined();
      });
    });

    describe("extractTextContent (非流式响应解析)", () => {
      it("应提取所有 text 内容块并拼接", () => {
        const response = {
          content: [
            { type: "text", text: "你好" },
            { type: "tool_use", id: "c1", name: "f", input: {} },
            { type: "text", text: "世界" },
          ],
        };
        expect(plugin.extractTextContent(response)).toBe("你好世界");
      });

      it("应跳过 tool_use 块", () => {
        const response = {
          content: [
            { type: "tool_use", id: "c1", name: "f", input: {} },
          ],
        };
        expect(plugin.extractTextContent(response)).toBe("");
      });

      it("无 content 字段时应返回空字符串", () => {
        expect(plugin.extractTextContent({})).toBe("");
      });
    });

    describe("extractTextChunk (Anthropic SSE 流式解析)", () => {
      it("应解析 content_block_delta + text_delta", () => {
        const line = 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk).toEqual({ delta: "你好" });
      });

      it("应解析 content_block_start + tool_use 为新 toolCall（id+name, arguments 空）", () => {
        const line = 'data: {"type":"content_block_start","content_block":{"type":"tool_use","id":"c1","name":"search"}}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk).toEqual({
          delta: "",
          toolCalls: [{ id: "c1", function: { name: "search", arguments: "" } }],
        });
      });

      it("应解析 input_json_delta 为 arguments 增量（id/name 空）", () => {
        const line = 'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"q\\":"}}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk).toEqual({
          delta: "",
          toolCalls: [{ id: "", function: { name: "", arguments: '{"q":' } }],
        });
      });

      it("应映射 stop_reason=end_turn 为 finishReason:stop", () => {
        const line = 'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk).toEqual({ delta: "", finishReason: "stop" });
      });

      it("应映射 stop_reason=tool_use 为 finishReason:tool_calls", () => {
        const line = 'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk?.finishReason).toBe("tool_calls");
      });

      it("应映射 stop_reason=max_tokens 为 finishReason:length", () => {
        const line = 'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk?.finishReason).toBe("length");
      });

      it("应解析 message_stop 为 finishReason:stop", () => {
        const chunk = plugin.extractTextChunk('data: {"type":"message_stop"}');
        expect(chunk).toEqual({ delta: "", finishReason: "stop" });
      });

      it("应跳过 message_start/content_block_stop/ping 事件", () => {
        expect(plugin.extractTextChunk('data: {"type":"message_start"}')).toBeUndefined();
        expect(plugin.extractTextChunk('data: {"type":"content_block_stop"}')).toBeUndefined();
        expect(plugin.extractTextChunk('data: {"type":"ping"}')).toBeUndefined();
      });

      it("应跳过空 partial_json", () => {
        const line = 'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":""}}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk).toBeUndefined();
      });

      it("应跳过非 data: 开头和非 JSON 行", () => {
        expect(plugin.extractTextChunk("event: ping")).toBeUndefined();
        expect(plugin.extractTextChunk("data: not-json")).toBeUndefined();
        expect(plugin.extractTextChunk("")).toBeUndefined();
      });

      it("完整 SSE 序列应正确累积 tool_use", () => {
        // 模拟真实 Anthropic 流式 tool_use 序列
        const lines = [
          'data: {"type":"message_start"}',
          'data: {"type":"content_block_start","content_block":{"type":"tool_use","id":"c1","name":"search"}}',
          'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"q\\":"}}',
          'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"\\"test\\"}"}}',
          'data: {"type":"content_block_stop"}',
          'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
          'data: {"type":"message_stop"}',
        ];

        const chunks = lines
          .map((l) => plugin.extractTextChunk(l))
          .filter((c): c is NonNullable<typeof c> => c !== undefined);

        expect(chunks).toEqual([
          { delta: "", toolCalls: [{ id: "c1", function: { name: "search", arguments: "" } }] },
          { delta: "", toolCalls: [{ id: "", function: { name: "", arguments: '{"q":' } }] },
          { delta: "", toolCalls: [{ id: "", function: { name: "", arguments: '"test"}' } }] },
          { delta: "", finishReason: "tool_calls" },
          { delta: "", finishReason: "stop" },
        ]);

        // 验证累积后的 arguments 完整 JSON
        const fullArgs = chunks
          .flatMap((c) => c.toolCalls ?? [])
          .map((tc) => tc.function.arguments)
          .join("");
        expect(JSON.parse(fullArgs)).toEqual({ q: "test" });
      });
    });

    describe("getAuthHeaders", () => {
      it("应返回 x-api-key + anthropic-version 头", () => {
        const headers = plugin.getAuthHeaders(TEST_API_KEY);
        expect(headers["x-api-key"]).toBe(TEST_API_KEY);
        expect(headers["anthropic-version"]).toBe("2023-06-01");
      });
    });
  });

  describe("GooglePlugin", () => {
    const plugin = new GooglePlugin();

    describe("buildTextRequest", () => {
      it("应使用 OpenAI 兼容端点 /chat/completions", () => {
        const ctx: TextBuildContext = {
          prompt: "你好",
          model: "gemini-2.0-flash",
          maxTokens: 1024,
          temperature: 0.7,
        };
        const result = plugin.buildTextRequest(ctx);

        expect(result.endpoint).toBe("/chat/completions");
        expect(result.body).toEqual({
          model: "gemini-2.0-flash",
          messages: [{ role: "user", content: "你好" }],
          max_tokens: 1024,
          temperature: 0.7,
        });
      });

      it("未指定 model 时应使用默认 gemini-2.0-flash", () => {
        const ctx: TextBuildContext = {
          prompt: "test",
          maxTokens: 100,
          temperature: 0,
        };
        const result = plugin.buildTextRequest(ctx);
        expect(result.body.model).toBe("gemini-2.0-flash");
      });
    });

    describe("buildChatRequest / buildChatStreamRequest（继承基类）", () => {
      it("应使用 OpenAI 格式的 messages 透传", () => {
        const ctx: ChatBuildContext = {
          messages: [
            { role: "system", content: "你是助手" },
            { role: "user", content: "hi" },
          ],
          model: "gemini-2.0-flash",
          maxTokens: 100,
          temperature: 0.7,
        };
        const result = plugin.buildChatRequest(ctx);

        expect(result.endpoint).toBe("/chat/completions");
        expect(result.body.messages).toEqual(ctx.messages);
      });

      it("stream 应追加 stream:true 和 OpenAI 格式 tools", () => {
        const ctx: ChatStreamBuildContext = {
          messages: [{ role: "user", content: "调用工具" }],
          model: "gemini-2.0-flash",
          maxTokens: 100,
          temperature: 0.7,
          tools: [
            {
              type: "function",
              function: {
                name: "search",
                description: "搜索",
                parameters: { type: "object" },
              },
            },
          ],
        };
        const result = plugin.buildChatStreamRequest(ctx);

        expect(result.body.stream).toBe(true);
        // Google 继承基类，tools 应是 OpenAI 格式（含 type:"function"）
        expect(result.body.tools).toEqual([
          {
            type: "function",
            function: { name: "search", description: "搜索", parameters: { type: "object" } },
          },
        ]);
      });
    });

    describe("getAuthHeaders", () => {
      it("应使用 x-goog-api-key 头（非 Authorization Bearer）", () => {
        const headers = plugin.getAuthHeaders(TEST_API_KEY);
        expect(headers["x-goog-api-key"]).toBe(TEST_API_KEY);
        expect(headers.Authorization).toBeUndefined();
      });
    });

    describe("appendAuthToUrl", () => {
      it("不应将 apiKey 附加到 URL query", () => {
        const url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
        const result = plugin.appendAuthToUrl(url, TEST_API_KEY);
        expect(result).toBe(url);
        expect(result).not.toContain(TEST_API_KEY);
      });
    });

    describe("extractTextChunk（继承基类 OpenAI SSE 解析）", () => {
      it("应正确解析 OpenAI 格式 SSE delta", () => {
        const line = 'data: {"choices":[{"delta":{"content":"你好"}}]}';
        const chunk = plugin.extractTextChunk(line);
        expect(chunk).toEqual({ delta: "你好" });
      });
    });
  });

  describe("Provider 间格式差异回归保护", () => {
    const openai = new OpenAICompatiblePlugin();
    const anthropic = new AnthropicPlugin();
    const google = new GooglePlugin();

    it("endpoint 差异：OpenAI/Google 用 /chat/completions，Anthropic 用 /messages", () => {
      const ctx: TextBuildContext = { prompt: "x", maxTokens: 1, temperature: 0 };
      expect(openai.buildTextRequest(ctx).endpoint).toBe("/chat/completions");
      expect(google.buildTextRequest(ctx).endpoint).toBe("/chat/completions");
      expect(anthropic.buildTextRequest(ctx).endpoint).toBe("/messages");
    });

    it("认证头差异：OpenAI Bearer / Anthropic x-api-key / Google x-goog-api-key", () => {
      expect(openai.getAuthHeaders("k").Authorization).toBe("Bearer k");
      expect(anthropic.getAuthHeaders("k")["x-api-key"]).toBe("k");
      expect(anthropic.getAuthHeaders("k")["anthropic-version"]).toBe("2023-06-01");
      expect(google.getAuthHeaders("k")["x-goog-api-key"]).toBe("k");
    });

    it("tools 格式差异：OpenAI/Google 用 parameters + type:function，Anthropic 用 input_schema 无 type", () => {
      const ctx: ChatStreamBuildContext = {
        messages: [{ role: "user", content: "x" }],
        maxTokens: 1,
        temperature: 0,
        tools: [{
          type: "function",
          function: { name: "f", description: "d", parameters: { type: "object" } },
        }],
      };
      const openaiTools = openai.buildChatStreamRequest(ctx).body.tools as Array<Record<string, unknown>>;
      const anthropicTools = anthropic.buildChatStreamRequest(ctx).body.tools as Array<Record<string, unknown>>;
      const googleTools = google.buildChatStreamRequest(ctx).body.tools as Array<Record<string, unknown>>;

      expect(openaiTools[0].type).toBe("function");
      expect(openaiTools[0].function).toBeDefined();
      expect(googleTools[0].type).toBe("function");
      expect(googleTools[0].function).toBeDefined();
      expect(anthropicTools[0].type).toBeUndefined();
      expect(anthropicTools[0].input_schema).toBeDefined();
      expect(anthropicTools[0].name).toBe("f");
    });
  });
});
