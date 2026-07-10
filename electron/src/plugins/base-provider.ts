import type {
  AIProviderPlugin,
  ModelCapabilities,
  ModelParameterProfile,
  ProviderCapabilities,
  VideoCapabilities,
  ImageCapabilities,
  VideoBuildContext,
  ImageBuildContext,
  TextBuildContext,
  TextStreamBuildContext,
  TextStreamChunk,
  TextStreamToolCall,
  ChatBuildContext,
  ChatStreamBuildContext,
  VisionBuildContext,
  VideoRequestResult,
  ImageRequestResult,
  TextRequestResult,
  VisionRequestResult,
  ImageTransportMode,
  ImagePurpose,
} from "./types";
import {
  ensureAccessibleUrl,
  resolveLocalUrlToBase64,
  downloadAsBase64,
} from "./utils";
import { getLogger } from "../logging/logger";

const logger = getLogger("base-provider");

export abstract class BaseAIProviderPlugin implements AIProviderPlugin {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract match(apiUrl: string, model?: string): boolean;

  get capabilities(): ProviderCapabilities {
    return {
      video: true,
      image: true,
      text: true,
      vision: true,
    };
  }

  abstract readonly videoCapabilities: VideoCapabilities;
  abstract readonly imageCapabilities: ImageCapabilities;
  abstract getModelCapabilities(modelId: string): ModelCapabilities;

  abstract buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult;
  abstract buildImageRequest(ctx: ImageBuildContext): ImageRequestResult;

  extractTaskId(data: Record<string, unknown>): string | undefined {
    if (!data || typeof data !== "object") return undefined;
    return (
      (data.id as string | undefined) ||
      (data.task_id as string | undefined) ||
      ((data.data as Record<string, unknown>)?.task_id as string | undefined) ||
      ((data.output as Record<string, unknown>)?.task_id as string | undefined)
    );
  }

  extractVideoUrl(data: Record<string, unknown>): string | undefined {
    if (!data || typeof data !== "object") return undefined;
    return (
      (data.video_url as string | undefined) ||
      (data.url as string | undefined) ||
      ((data.data as Record<string, unknown>)?.video_url as
        | string
        | undefined) ||
      ((data.output as Record<string, unknown>)?.video_url as
        | string
        | undefined)
    );
  }

  extractImageUrl(data: Record<string, unknown>): string | undefined {
    if (!data || typeof data !== "object") return undefined;
    const responseData = (data.data as Record<string, unknown>[])?.[0];
    if (responseData?.url) return responseData.url as string;
    if (responseData?.b64_json)
      return `data:image/png;base64,${responseData.b64_json as string}`;
    return undefined;
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/videos/${taskId}`;
  }

  buildTextRequest(ctx: TextBuildContext): TextRequestResult {
    return {
      body: {
        model: ctx.model || "gpt-4o",
        messages: [{ role: "user", content: ctx.prompt }],
        max_tokens: ctx.maxTokens,
        temperature: ctx.temperature,
      },
      endpoint: "/chat/completions",
    };
  }

  /**
   * 流式文本请求默认构建（Task 1.0）。
   * 复用 buildTextRequest 的 body，追加 stream:true 与可选的 tools 字段。
   * 支持 OpenAI 兼容流式 API 的 provider 无需覆盖；非标准 provider 可自行重写。
   */
  buildTextStreamRequest(ctx: TextStreamBuildContext): TextRequestResult {
    const base = this.buildTextRequest(ctx);
    const body: Record<string, unknown> = { ...base.body, stream: true };
    if (ctx.tools && ctx.tools.length > 0) {
      body.tools = ctx.tools.map((t) => ({ type: t.type, function: t.function }));
    }
    return { ...base, body };
  }

  /**
   * 原生对话补全请求构建（非流式）。
   * 与 buildTextRequest 的区别：使用完整 messages 数组（含 role/tool_calls/tool_call_id），
   * 而非单字符串 prompt 包装为单条 user message。
   * 支持 OpenAI 兼容 /chat/completions 格式的 provider 无需覆盖。
   */
  buildChatRequest(ctx: ChatBuildContext): TextRequestResult {
    return {
      body: {
        model: ctx.model || "gpt-4o",
        messages: ctx.messages,
        max_tokens: ctx.maxTokens,
        temperature: ctx.temperature,
      },
      endpoint: "/chat/completions",
    };
  }

  /**
   * 原生对话补全流式请求构建。
   * 复用 buildChatRequest 的 body，追加 stream:true 与可选的 tools 字段。
   * 复用 extractTextChunk 解析 SSE（OpenAI 流式格式不变）。
   */
  buildChatStreamRequest(ctx: ChatStreamBuildContext): TextRequestResult {
    const base = this.buildChatRequest(ctx);
    const body: Record<string, unknown> = { ...base.body, stream: true };
    if (ctx.tools && ctx.tools.length > 0) {
      body.tools = ctx.tools.map((t) => ({ type: t.type, function: t.function }));
    }
    return { ...base, body };
  }

  /**
   * SSE 单行解析默认实现（Task 1.0）。
   * 输入为原始行（含 "data:" 前缀），返回解析后的 chunk 或 undefined（跳过）。
   * 兼容 OpenAI 流式格式：choices[0].delta.content / tool_calls / finish_reason。
   *
   * 职责划分：上游 makeStreamingRequest 负责按 "\n" 切分原始字节流为行数组，
   *          本方法只负责将单行转换为 chunk。
   */
  extractTextChunk(rawLine: string): TextStreamChunk | undefined {
    const trimmed = rawLine.trim();
    if (!trimmed || !trimmed.startsWith("data:")) return undefined;

    const data = trimmed.slice(5).trim();

    // [DONE] 标记 → 正常结束
    if (data === "[DONE]") {
      return { delta: "", finishReason: "stop" };
    }

    // 解析 JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
      // 非 JSON 行（如注释、心跳）直接跳过
      return undefined;
    }

    const choices = parsed.choices as Record<string, unknown>[] | undefined;
    if (!Array.isArray(choices) || choices.length === 0) return undefined;

    const choice = choices[0] as Record<string, unknown>;
    const delta = choice.delta as Record<string, unknown> | undefined;
    const deltaText = (delta?.content as string) || "";

    // 提取增量 tool_calls（OpenAI 流式格式：每个 chunk 可能只含 index + 部分 arguments）
    let toolCalls: TextStreamToolCall[] | undefined;
    const rawToolCalls = delta?.tool_calls as Record<string, unknown>[] | undefined;
    if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
      toolCalls = rawToolCalls
        .map((tc) => {
          const fn = tc.function as Record<string, unknown> | undefined;
          const id = (tc.id as string) || "";
          const name = (fn?.name as string) || "";
          const args = (fn?.arguments as string) || "";
          // 完全空的 tool_call 片段（仅 index）跳过，避免产生噪声
          if (!id && !name && !args) return null;
          return {
            id,
            function: { name, arguments: args },
          };
        })
        .filter((tc): tc is TextStreamToolCall => tc !== null);
      if (toolCalls.length === 0) toolCalls = undefined;
    }

    // 映射 finish_reason
    const rawFinish = choice.finish_reason as string | undefined;
    const mappedFinish: TextStreamChunk["finishReason"] | undefined =
      rawFinish === "stop" || rawFinish === "tool_calls" || rawFinish === "length"
        ? rawFinish
        : undefined;

    // 空 chunk 且无结束信号 → 跳过以减少回调噪声
    if (!deltaText && !toolCalls && !mappedFinish) return undefined;

    return {
      delta: deltaText,
      toolCalls,
      finishReason: mappedFinish,
    };
  }

  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult {
    return {
      body: {
        model: ctx.model || "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: ctx.prompt },
              { type: "image_url", image_url: { url: ctx.imageUrl } },
            ],
          },
        ],
      },
      endpoint: "/chat/completions",
    };
  }

  getImageTransportMode(_purpose: ImagePurpose): ImageTransportMode {
    return "url";
  }

  async prepareImage(
    url: string,
    _purpose: ImagePurpose,
    _apiConfig: { apiKey: string; apiUrl: string },
  ): Promise<string | undefined> {
    if (!url) return undefined;

    if (url.startsWith("data:")) return url;

    if (url.startsWith("vcache://") || url.startsWith("/") || url.startsWith("file://")) {
      const base64 = await resolveLocalUrlToBase64(url);
      if (base64) return base64;
      logger.warn(`Failed to resolve local file to base64: ${url.substring(0, 60)}`);
      return undefined;
    }

    if (url.startsWith("https://") || url.startsWith("http://")) {
      try {
        const base64 = await downloadAsBase64(url);
        const ext = url.split(".").pop()?.toLowerCase() || "png";
        const mimeMap: Record<string, string> = {
          png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
          webp: "image/webp", gif: "image/gif", mp4: "video/mp4", webm: "video/webm",
        };
        const mime = mimeMap[ext] || "image/png";
        return `data:${mime};base64,${base64}`;
      } catch (e) {
        logger.warn(
          `Failed to download remote image, falling back to URL: ${e instanceof Error ? e.message : String(e)}`,
        );
        return url;
      }
    }

    return ensureAccessibleUrl(url);
  }

  getAuthHeaders(
    apiKey: string,
    _endpoint?: string,
  ): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
  }

  appendAuthToUrl(url: string, _apiKey: string): string {
    return url;
  }

  extractTextContent(response: Record<string, unknown>): string {
    if (!response || typeof response !== "object") return "";
    const choices = response.choices as Record<string, unknown>[] | undefined;
    if (choices && Array.isArray(choices) && choices.length > 0) {
      const message = choices[0]?.message as Record<string, unknown> | undefined;
      if (message?.content) return message.content as string;
    }
    return "";
  }

  extractStatus(response: Record<string, unknown>): {
    status: string;
    progress?: number;
    message?: string;
  } {
    if (!response || typeof response !== "object") {
      return { status: "unknown" };
    }
    const r = response as Record<string, unknown>;
    const status = (r.status as string) || "generating";
    const progress = (r.progress as number) || (r.progress_percentage as number);
    const message = (r.message as string) || (r.error as string) || (r.msg as string);
    return { status, progress, message };
  }

  getStatusMethod(): "GET" | "POST" {
    return "GET";
  }

  getModelParameterProfile(modelId: string): ModelParameterProfile {
    const capabilities = this.getModelCapabilities(modelId);
    const mergedCapabilities: ModelCapabilities = {
      ...capabilities,
      supportsCharacterRef: capabilities.supportsCharacterRef ?? this.videoCapabilities.supportsCharacterRef,
      supportsSceneRef: capabilities.supportsSceneRef ?? this.videoCapabilities.supportsSceneRef,
    };
    return {
      modelId,
      capabilities: mergedCapabilities,
      parameters: {
        durations: [
          { value: 2, label: "2秒" },
          { value: 5, label: "5秒" },
          { value: 10, label: "10秒" },
        ],
        resolutions: mergedCapabilities.supportedImageSizes?.map((s) => ({
          value: `${s.width}x${s.height}`,
          label: s.label,
          width: s.width,
          height: s.height,
        })) || [{ value: `${mergedCapabilities.maxResolution}x${mergedCapabilities.maxResolution}`, label: "1:1", width: mergedCapabilities.maxResolution, height: mergedCapabilities.maxResolution }],
        styles: [],
        negativePrompt: false,
        seed: false,
      },
    };
  }

  getAvailableModels(): string[] {
    return [];
  }
}
