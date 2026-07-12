import type {
  ModelCapabilities,
  ProviderCapabilities,
  VideoCapabilities,
  ImageCapabilities,
  VideoBuildContext,
  ImageBuildContext,
  TextBuildContext,
  VisionBuildContext,
  VideoRequestResult,
  ImageRequestResult,
  TextRequestResult,
  VisionRequestResult,
  ImageTransportMode,
  ImagePurpose,
  ApiKeyDetection,
  ChatBuildContext,
  ChatStreamBuildContext,
  TextStreamChunk,
} from "../types";
import { BaseAIProviderPlugin } from "../base-provider";

const VIDEO_CAPABILITIES: VideoCapabilities = {
  supportsLastFrame: false,
  supportsReferenceVideo: false,
  supportsMimicryLevel: false,
  supportsCharacterRef: false,
  supportsSceneRef: false,
  characterRefMode: "none",
  sceneRefMode: "none",
  defaultModel: "claude-3-5-sonnet-20241022",
  maxDuration: 0,
  supportedCodecs: [],
};

const IMAGE_CAPABILITIES: ImageCapabilities = {
  supportsReferenceImage: false,
  defaultModel: "claude-3-5-sonnet-20241022",
};

export class AnthropicPlugin extends BaseAIProviderPlugin {
  readonly id = "anthropic";
  readonly displayName = "Anthropic (Claude)";

  match(apiUrl: string, _model?: string): boolean {
    return apiUrl.includes("anthropic.com") || apiUrl.includes("bedrock-runtime");
  }

  get capabilities(): ProviderCapabilities {
    return {
      video: false,
      image: false,
      text: true,
      vision: true,
    };
  }

  readonly videoCapabilities = VIDEO_CAPABILITIES;
  readonly imageCapabilities = IMAGE_CAPABILITIES;

  getModelCapabilities(_modelId: string): ModelCapabilities {
    return {
      maxReferences: 0,
      maxResolution: 0,
      maxSizeMB: 0,
      supportsLastFrame: false,
      referenceMode: "separate",
    };
  }

  buildVideoRequest(_ctx: VideoBuildContext): VideoRequestResult {
    throw new Error("ANTHROPIC_VIDEO_NOT_SUPPORTED");
  }

  buildImageRequest(_ctx: ImageBuildContext): ImageRequestResult {
    throw new Error("ANTHROPIC_IMAGE_NOT_SUPPORTED");
  }

  buildTextRequest(ctx: TextBuildContext): TextRequestResult {
    return {
      body: {
        model: ctx.model || "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: ctx.prompt }],
        max_tokens: ctx.maxTokens,
        ...(ctx.temperature !== undefined ? { temperature: ctx.temperature } : {}),
      },
      endpoint: "/messages",
    };
  }

  /**
   * 将 OpenAI 格式的 messages 转换为 Anthropic Messages API 格式。
   * - system role → top-level system 参数
   * - assistant with tool_calls → content blocks (text + tool_use)
   * - tool role → user with tool_result content blocks（连续的合并为一条）
   */
  private convertMessagesToAnthropic(
    messages: ChatBuildContext["messages"],
  ): { system?: string; messages: Array<{ role: string; content: unknown }> } {
    let system: string | undefined;
    const result: Array<{ role: string; content: unknown }> = [];
    let pendingToolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];

    const flushToolResults = () => {
      if (pendingToolResults.length > 0) {
        result.push({ role: "user", content: pendingToolResults });
        pendingToolResults = [];
      }
    };

    for (const msg of messages) {
      if (msg.role === "system") {
        system = (system ? system + "\n" : "") + msg.content;
      } else if (msg.role === "tool") {
        pendingToolResults.push({
          type: "tool_result",
          tool_use_id: msg.tool_call_id || "",
          content: msg.content,
        });
      } else if (msg.role === "assistant") {
        flushToolResults();
        if (msg.tool_calls) {
          const content: unknown[] = [];
          if (msg.content) {
            content.push({ type: "text", text: msg.content });
          }
          const toolCalls = msg.tool_calls as Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
          for (const tc of toolCalls) {
            let input: unknown = {};
            if (tc.function?.arguments) {
              try {
                input = JSON.parse(tc.function.arguments);
              } catch {
                input = {};
              }
            }
            content.push({
              type: "tool_use",
              id: tc.id || "",
              name: tc.function?.name || "",
              input,
            });
          }
          result.push({ role: "assistant", content });
        } else {
          result.push({ role: "assistant", content: msg.content });
        }
      } else {
        flushToolResults();
        result.push({ role: msg.role, content: msg.content });
      }
    }
    flushToolResults();

    return { system, messages: result };
  }

  /**
   * 原生对话补全请求（Anthropic Messages API 格式）。
   * 覆盖基类的 OpenAI /chat/completions 默认实现。
   */
  buildChatRequest(ctx: ChatBuildContext): TextRequestResult {
    const { system, messages } = this.convertMessagesToAnthropic(ctx.messages);
    return {
      body: {
        model: ctx.model || "claude-3-5-sonnet-20241022",
        max_tokens: ctx.maxTokens,
        messages,
        ...(system ? { system } : {}),
        ...(ctx.temperature !== undefined ? { temperature: ctx.temperature } : {}),
      },
      endpoint: "/messages",
    };
  }

  /**
   * 原生对话补全流式请求（Anthropic Messages API + stream:true）。
   * tools 转换为 Anthropic 格式（input_schema 替代 parameters）。
   */
  buildChatStreamRequest(ctx: ChatStreamBuildContext): TextRequestResult {
    const base = this.buildChatRequest(ctx);
    const body: Record<string, unknown> = { ...base.body, stream: true };
    if (ctx.tools && ctx.tools.length > 0) {
      body.tools = ctx.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }
    return { ...base, body };
  }

  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult {
    return {
      body: {
        model: ctx.model || "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: ctx.prompt },
              { type: "image_url", image_url: { url: ctx.imageUrl } },
            ],
          },
        ],
        max_tokens: ctx.maxTokens || 4096,
      },
      endpoint: "/messages",
    };
  }

  getImageTransportMode(_purpose: ImagePurpose): ImageTransportMode {
    return "url";
  }

  getAuthHeaders(apiKey: string, _endpoint?: string): Record<string, string> {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }

  /**
   * 解析非流式响应：提取所有 text 内容块的文本（跳过 tool_use 块）。
   * 覆盖基类的 OpenAI choices[0].message.content 解析。
   */
  extractTextContent(response: Record<string, unknown>): string {
    const content = response.content as Record<string, unknown>[] | undefined;
    if (content && Array.isArray(content)) {
      return content
        .filter((block) => block?.type === "text")
        .map((block) => (block.text as string) || "")
        .join("");
    }
    return "";
  }

  /**
   * 解析 Anthropic 流式 SSE 单行，返回 TextStreamChunk 或 undefined（跳过）。
   *
   * Anthropic SSE 事件类型映射：
   * - content_block_delta + text_delta → { delta: text }
   * - content_block_start + tool_use → { toolCalls: [{ id, function: { name, arguments: "" } }] }
   * - content_block_delta + input_json_delta → { toolCalls: [{ id: "", function: { name: "", arguments: partial_json } }] }
   * - message_delta + stop_reason → { finishReason: "stop" | "tool_calls" | "length" }
   * - message_stop → { finishReason: "stop" }
   */
  extractTextChunk(rawLine: string): TextStreamChunk | undefined {
    const trimmed = rawLine.trim();
    if (!trimmed || !trimmed.startsWith("data:")) return undefined;

    const data = trimmed.slice(5).trim();
    if (!data) return undefined;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return undefined;
    }

    const type = parsed.type as string;
    if (!type) return undefined;

    if (type === "content_block_delta") {
      const delta = parsed.delta as Record<string, unknown> | undefined;
      if (!delta) return undefined;

      if (delta.type === "text_delta") {
        const text = (delta.text as string) || "";
        if (!text) return undefined;
        return { delta: text };
      }

      if (delta.type === "input_json_delta") {
        const partialJson = (delta.partial_json as string) || "";
        if (!partialJson) return undefined;
        return {
          delta: "",
          toolCalls: [{
            id: "",
            function: { name: "", arguments: partialJson },
          }],
        };
      }
      return undefined;
    }

    if (type === "content_block_start") {
      const contentBlock = parsed.content_block as Record<string, unknown> | undefined;
      if (contentBlock?.type === "tool_use") {
        return {
          delta: "",
          toolCalls: [{
            id: (contentBlock.id as string) || "",
            function: { name: (contentBlock.name as string) || "", arguments: "" },
          }],
        };
      }
      return undefined;
    }

    if (type === "message_delta") {
      const delta = parsed.delta as Record<string, unknown> | undefined;
      const stopReason = delta?.stop_reason as string | undefined;
      if (stopReason === "end_turn") {
        return { delta: "", finishReason: "stop" };
      }
      if (stopReason === "tool_use") {
        return { delta: "", finishReason: "tool_calls" };
      }
      if (stopReason === "max_tokens") {
        return { delta: "", finishReason: "length" };
      }
      return undefined;
    }

    if (type === "message_stop") {
      return { delta: "", finishReason: "stop" };
    }

    // message_start, content_block_stop, ping 等事件跳过
    return undefined;
  }

  getApiKeyDetection(): ApiKeyDetection {
    return {
      rules: [
        {
          pattern: "^sk-ant-api03-",
          confidence: "high",
        },
      ],
      suggestedName: "Anthropic",
      baseUrl: "https://api.anthropic.com/v1",
    };
  }
}
