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
import { z } from "zod";

const logger = getLogger("base-provider");

// ───────────────────────────────────────────────────────────────────────────
// Task 3: Provider response runtime validation schemas
//
// These lightweight Zod schemas replace the previous `as Record<string, unknown>`
// (and the more dangerous `as Record<string, unknown>[]`) casts inside the
// extract* methods. Each schema uses `.passthrough()` so provider-specific
// extra keys are preserved for downstream consumers — we only validate the
// narrow set of fields the base class actually reads.
//
// `.catch(undefined)` is applied to optional fields so that a single
// wrong-type field (e.g. `status: 123`) degrades to "missing" instead of
// failing the entire parse. This preserves the previous behavior of returning
// a safe default for malformed sub-fields while still validating the overall
// object shape.
//
// `safeParse` returns `{ success: true, data } | { success: false, error }`
// without throwing, so malformed input degrades gracefully to `undefined` /
// empty string instead of returning a value that violates the declared
// TypeScript type.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Helper: an optional string field that falls back to `undefined` when the
 * input is present but not a string (e.g. `id: 123`). Without `.catch()`,
 * a single wrong-type field would fail the entire object parse.
 */
const optionalString = z.string().optional().catch(undefined);
const optionalNumber = z.number().optional().catch(undefined);

/**
 * Helper: an object schema that becomes `undefined` when the input is missing
 * OR not a plain object (string, number, array, null). The order matters:
 * `.optional()` allows `undefined` as valid input, and `.catch(undefined)`
 * catches validation failures (e.g. when input is a string) and returns
 * `undefined` instead. Together they mirror the previous behavior where
 * `as Record<string, unknown>` silently passed through wrong types.
 */
function optionalObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).passthrough().optional().catch(undefined);
}

/** Nested object containing an optional `task_id` string. */
const taskIdDataSchema = optionalObject({
  task_id: optionalString,
});

/** Shape for `{ id?, task_id?, data?: { task_id? }, output?: { task_id? } }`. */
const taskIdResponseSchema = z
  .object({
    id: optionalString,
    task_id: optionalString,
    data: taskIdDataSchema,
    output: taskIdDataSchema,
  })
  .passthrough();

/** Nested object containing an optional `video_url` string. */
const videoUrlDataSchema = optionalObject({
  video_url: optionalString,
});

/** Shape for `{ video_url?, url?, data?: { video_url? }, output?: { video_url? } }`. */
const videoUrlResponseSchema = z
  .object({
    video_url: optionalString,
    url: optionalString,
    data: videoUrlDataSchema,
    output: videoUrlDataSchema,
  })
  .passthrough();

/** Single image entry inside the `data` array — either `url` or `b64_json`. */
const imageEntrySchema = z
  .object({
    url: optionalString,
    b64_json: optionalString,
  })
  .passthrough();

/** Shape for `{ data?: [{ url?, b64_json? }] }` — the previously unsafe array cast. */
const imageUrlResponseSchema = z
  .object({
    data: z.array(imageEntrySchema).optional().catch(undefined),
  })
  .passthrough();

/** Shape for `{ choices?: [{ message?: { content? } }] }`. */
const textContentResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: optionalObject({ content: optionalString }),
          })
          .passthrough(),
      )
      .optional()
      .catch(undefined),
  })
  .passthrough();

/** Shape for `{ status?, progress?, progress_percentage?, message?, error?, msg? }`. */
const statusResponseSchema = z
  .object({
    status: optionalString,
    progress: optionalNumber,
    progress_percentage: optionalNumber,
    message: optionalString,
    error: optionalString,
    msg: optionalString,
  })
  .passthrough();

/** Shape for a single OpenAI SSE tool_call function block. */
const textStreamFunctionSchema = optionalObject({
  name: optionalString,
  arguments: optionalString,
});

/** Shape for a single OpenAI SSE tool_call entry. */
const textStreamToolCallSchema = optionalObject({
  id: optionalString,
  function: textStreamFunctionSchema,
});

/** Shape for a single OpenAI SSE delta. */
const textStreamDeltaSchema = optionalObject({
  content: optionalString,
  tool_calls: z.array(textStreamToolCallSchema).optional().catch(undefined),
});

/** Shape for a single OpenAI SSE choice. */
const textStreamChoiceSchema = z
  .object({
    delta: textStreamDeltaSchema,
    finish_reason: optionalString,
  })
  .passthrough();

/** Shape for an OpenAI SSE chunk: `{ choices: [{ delta?, finish_reason? }] }`. */
const textStreamChunkSchema = z
  .object({
    choices: z.array(textStreamChoiceSchema),
  })
  .passthrough();

/**
 * Utility: parse an unknown provider response against a Zod schema.
 *
 * Returns the parsed (and narrowed) data on success, or `null` on failure.
 * Use this to replace `as Record<string, unknown>` casts with runtime-validated
 * narrowing. Callers should check for `null` and fall back to a safe default.
 *
 * @example
 * const parsed = parseProviderResponse(taskIdResponseSchema, data);
 * if (!parsed) return undefined;
 * return parsed.id ?? parsed.task_id ?? parsed.data?.task_id ?? parsed.output?.task_id;
 */
export function parseProviderResponse<T>(
  schema: z.ZodType<T>,
  response: unknown,
): T | null {
  const result = schema.safeParse(response);
  return result.success ? result.data : null;
}

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
    // Zod safeParse narrows the unknown shape — no more `as Record<string, unknown>`
    // chains. If the response doesn't match (e.g. id is a number), we fall back
    // to undefined instead of returning a value that violates the string type.
    const parsed = parseProviderResponse(taskIdResponseSchema, data);
    if (!parsed) return undefined;
    return (
      parsed.id ??
      parsed.task_id ??
      parsed.data?.task_id ??
      parsed.output?.task_id
    );
  }

  extractVideoUrl(data: Record<string, unknown>): string | undefined {
    if (!data || typeof data !== "object") return undefined;
    const parsed = parseProviderResponse(videoUrlResponseSchema, data);
    if (!parsed) return undefined;
    return (
      parsed.video_url ??
      parsed.url ??
      parsed.data?.video_url ??
      parsed.output?.video_url
    );
  }

  extractImageUrl(data: Record<string, unknown>): string | undefined {
    if (!data || typeof data !== "object") return undefined;
    // Previously: `(data.data as Record<string, unknown>[])?.[0]` — an unsafe
    // array cast that lied about the shape when `data.data` was a string or
    // number. Now Zod validates the array structure; non-array `data` or
    // non-string `url`/`b64_json` fields are rejected at runtime.
    const parsed = parseProviderResponse(imageUrlResponseSchema, data);
    if (!parsed) return undefined;
    const responseData = parsed.data?.[0];
    if (!responseData) return undefined;
    if (responseData.url) return responseData.url;
    if (responseData.b64_json) {
      return `data:image/png;base64,${responseData.b64_json}`;
    }
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
    let jsonValue: unknown;
    try {
      jsonValue = JSON.parse(data);
    } catch {
      // 非 JSON 行（如注释、心跳）直接跳过
      return undefined;
    }

    // Zod safeParse narrows the unknown JSON to the OpenAI chunk shape —
    // eliminates the previous `as Record<string, unknown>[]` casts for
    // choices / delta / tool_calls / function. Non-array choices or
    // non-string fields now fail validation and return undefined.
    const parsed = parseProviderResponse(textStreamChunkSchema, jsonValue);
    if (!parsed) return undefined;
    if (parsed.choices.length === 0) return undefined;

    const choice = parsed.choices[0];
    if (!choice) return undefined;
    const delta = choice.delta;
    const deltaText = delta?.content ?? "";

    // 提取增量 tool_calls（OpenAI 流式格式：每个 chunk 可能只含 index + 部分 arguments）
    let toolCalls: TextStreamToolCall[] | undefined;
    const rawToolCalls = delta?.tool_calls;
    if (rawToolCalls && rawToolCalls.length > 0) {
      toolCalls = rawToolCalls
        // `.catch(undefined)` on the tool_call schema turns invalid elements
        // (strings, numbers) into undefined — filter them out before mapping.
        .filter((tc): tc is NonNullable<typeof tc> => tc != null)
        .map((tc) => {
          const fn = tc.function;
          const id = tc.id ?? "";
          const name = fn?.name ?? "";
          const args = fn?.arguments ?? "";
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
    const rawFinish = choice.finish_reason;
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
    // PrismCraft 第三章: 当有参考图时，构造多图 messages（参考图 + 生成图）
    // 让 VLM 做真实视觉比对，而非只看文字描述
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: ctx.prompt },
      { type: "image_url", image_url: { url: ctx.imageUrl } },
    ];

    if (ctx.referenceImageUrls && ctx.referenceImageUrls.length > 0) {
      // 参考图排在生成图之后，prompt 中已说明比对意图
      for (const refUrl of ctx.referenceImageUrls) {
        content.push({ type: "image_url", image_url: { url: refUrl } });
      }
    }

    return {
      body: {
        model: ctx.model || "gpt-4o",
        messages: [
          {
            role: "user",
            content,
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
    // Zod safeParse validates that `choices` is an array of objects with an
    // optional `message.content` string — no more `as Record<string, unknown>[]`
    // chain. Non-string content now returns "" instead of leaking the raw
    // (non-string) value through the declared string return type.
    const parsed = parseProviderResponse(textContentResponseSchema, response);
    if (!parsed) return "";
    const choices = parsed.choices;
    if (!choices || choices.length === 0) return "";
    const message = choices[0]?.message;
    if (!message?.content) return "";
    return message.content;
  }

  extractStatus(response: Record<string, unknown>): {
    status: string;
    progress?: number;
    message?: string;
  } {
    if (!response || typeof response !== "object") {
      return { status: "unknown" };
    }
    // Zod safeParse validates field types: status must be a string (else
    // default to "generating"), progress must be a number (else undefined),
    // message/error/msg must be strings (else undefined). Previously these
    // were `as string` / `as number` casts that returned non-string /
    // non-number values through the declared types.
    const parsed = parseProviderResponse(statusResponseSchema, response);
    if (!parsed) {
      return { status: "unknown" };
    }
    const status = parsed.status ?? "generating";
    const progress = parsed.progress ?? parsed.progress_percentage;
    const message = parsed.message ?? parsed.error ?? parsed.msg;
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
