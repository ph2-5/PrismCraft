/**
 * api-gateway-text.ts
 *
 * 文本类生成函数（从 api-gateway.ts 拆分以降低文件行数）：
 *  - generateText / generateTextStream：单 prompt 文本生成（非流式 / 流式）
 *  - generateChat / generateChatStream：原生对话补全（messages 数组，含 tool_calls）
 *  - generateEmbedding：向量嵌入
 *  - serializeMessagesToPrompt：plugin 不支持 chat 时的降级序列化
 *
 * 业务逻辑与原 api-gateway.ts 完全一致，仅做文件拆分。
 */
import { getLogger } from "./logging/logger";
import { pluginRegistry } from "./plugins";
import type { TextStreamChunk, TextStreamToolDef } from "./plugins";
import { API_ERROR_CODES } from "./api-gateway-error-codes";
import {
  type ApiResult,
  resolveApiConfig,
  getAuthHeaders,
  extractTextFromResponse,
} from "./api-gateway-utils";
import { makeRequest, makeStreamingRequest } from "./http-request";
import { withRetry, isRetryableError } from "./api-gateway-retry";

const logger = getLogger("api-gateway");

/**
 * Result type for {@link generateText}. Narrows `ApiResult.data` to the concrete
 * `{ text: string }` shape returned on success, so route handlers can access
 * `data.text` without `as` assertions.
 */
export type TextApiResult = ApiResult & { data?: { text: string } };

export async function generateText(body: Record<string, unknown>): Promise<TextApiResult> {
  const { prompt, maxTokens, temperature } = body as Record<string, unknown>;
  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "text",
  );

  if (!effectiveApiKey) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "text" },
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return {
      success: false,
      error: "empty_prompt",
      code: API_ERROR_CODES.EMPTY_PROMPT,
      httpStatus: 400,
    };
  }

  const safeMaxTokens = Math.min(Math.max(1, (maxTokens as number) || 4096), 16384);
  const safeTemperature = Math.min(Math.max(0, (temperature as number) ?? 0.7), 2);

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
    }

    const { body: reqBody, endpoint } = plugin.buildTextRequest({
      prompt: prompt as string,
      model: effectiveModel,
      maxTokens: safeMaxTokens,
      temperature: safeTemperature,
    });

    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
    };

    const response = (await withRetry(
      () => makeRequest(requestUrl, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(reqBody),
      }),
      { maxRetries: 1, retryableCheck: isRetryableError },
    )) as Record<string, unknown>;

    const text = extractTextFromResponse(response, plugin);

    return { success: true, data: { text } };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

/**
 * 流式文本生成（Task 1.0）。
 * 通过 SSE 流式接收 AI provider 的响应，每收到一个 chunk 通过 onChunk 回调实时传出。
 * 流结束后返回完整的累积文本。
 *
 * 与 generateText 的区别：
 * - 使用 makeStreamingRequest 而非 makeRequest（不缓冲完整响应）
 * - 调用 plugin.buildTextStreamRequest 构建 stream:true 的请求体
 * - 调用 plugin.extractTextChunk 解析 SSE 行
 * - 不走 withRetry（流式响应部分失败难以安全重试）
 *
 * 如果 plugin 未实现流式方法，自动回退到普通 generateText（但不会调用 onChunk）。
 */
export async function generateTextStream(
  body: Record<string, unknown>,
  options: {
    onChunk: (chunk: TextStreamChunk) => void;
  },
): Promise<TextApiResult> {
  const { prompt, maxTokens, temperature, tools: toolsRaw } = body as Record<string, unknown>;
  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "text",
  );

  if (!effectiveApiKey) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "text" },
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return {
      success: false,
      error: "empty_prompt",
      code: API_ERROR_CODES.EMPTY_PROMPT,
      httpStatus: 400,
    };
  }

  const safeMaxTokens = Math.min(Math.max(1, (maxTokens as number) || 4096), 16384);
  const safeTemperature = Math.min(Math.max(0, (temperature as number) ?? 0.7), 2);

  // 归一化 tools 字段（OpenAI function-calling 格式）
  let tools: TextStreamToolDef[] | undefined;
  if (Array.isArray(toolsRaw) && toolsRaw.length > 0) {
    tools = (toolsRaw as unknown[])
      .map((t) => {
        const fn = (t as { function?: Record<string, unknown> })?.function;
        if (!fn) return null;
        return {
          type: "function" as const,
          function: {
            name: String(fn.name ?? ""),
            description: String(fn.description ?? ""),
            parameters: (fn.parameters as Record<string, unknown>) || { type: "object", properties: {} },
          },
        };
      })
      .filter((t): t is TextStreamToolDef => t !== null);
    if (tools.length === 0) tools = undefined;
  }

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
    }

    // plugin 未实现流式接口 → 回退到普通 generateText（不流式，但保证功能可用）
    if (!plugin.buildTextStreamRequest || !plugin.extractTextChunk) {
      logger.warn(`Plugin ${plugin.id} does not support streaming, falling back to non-streaming generateText`);
      return generateText(body);
    }

    const { body: reqBody, endpoint } = plugin.buildTextStreamRequest({
      prompt: prompt as string,
      model: effectiveModel,
      maxTokens: safeMaxTokens,
      temperature: safeTemperature,
      tools,
    });

    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
    };

    let fullText = "";
    await makeStreamingRequest(requestUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(reqBody),
      onLine: (line) => {
        const chunk = plugin.extractTextChunk!(line);
        if (!chunk) return;
        if (chunk.delta) fullText += chunk.delta;
        options.onChunk(chunk);
      },
    });

    return { success: true, data: { text: fullText } };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

/**
 * 将 messages 数组序列化为 prompt 文本（fallback 用）。
 * 当 plugin 未实现 buildChatRequest/buildChatStreamRequest 时，降级为文本 prompt。
 */
export function serializeMessagesToPrompt(
  messages: Array<{ role: string; content: string; tool_calls?: unknown; name?: string }>,
): string {
  return messages
    .map((m) => {
      if (m.role === "system") return `[system]\n${m.content}`;
      if (m.role === "user") return `[user]\n${m.content}`;
      if (m.role === "assistant") {
        let text = `[assistant]\n${m.content}`;
        if (m.tool_calls) text += `\n[tool_calls]\n${JSON.stringify(m.tool_calls)}`;
        return text;
      }
      if (m.role === "tool") return `[tool_result ${m.name || ""}]\n${m.content}`;
      return m.content;
    })
    .join("\n\n---\n\n");
}

/**
 * 原生对话补全（非流式）。
 *
 * 与 generateText 的区别：
 * - 接收结构化 messages 数组（含 role/tool_calls/tool_call_id），而非单字符串 prompt
 * - 调用 plugin.buildChatRequest 构建请求（完整 messages 数组）
 * - 支持 OpenAI 兼容原生 function calling
 *
 * 如果 plugin 未实现 buildChatRequest，降级到 buildTextRequest + 序列化 messages。
 */
export async function generateChat(body: Record<string, unknown>): Promise<TextApiResult> {
  const { messages: messagesRaw, maxTokens, temperature } = body as Record<string, unknown>;
  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "text",
  );

  if (!effectiveApiKey) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "text" },
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
    return {
      success: false,
      error: "empty_messages",
      code: API_ERROR_CODES.EMPTY_PROMPT,
      httpStatus: 400,
    };
  }

  const safeMaxTokens = Math.min(Math.max(1, (maxTokens as number) || 4096), 16384);
  const safeTemperature = Math.min(Math.max(0, (temperature as number) ?? 0.7), 2);

  const messages = (messagesRaw as Array<Record<string, unknown>>).map((m) => ({
    role: String(m.role || "user"),
    content: String(m.content || ""),
    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    ...(m.tool_call_id ? { tool_call_id: String(m.tool_call_id) } : {}),
    ...(m.name ? { name: String(m.name) } : {}),
  }));

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
    }

    let reqBody: Record<string, unknown>;
    let endpoint: string;

    if (plugin.buildChatRequest) {
      const result = plugin.buildChatRequest({
        messages,
        model: effectiveModel,
        maxTokens: safeMaxTokens,
        temperature: safeTemperature,
      });
      reqBody = result.body;
      endpoint = result.endpoint;
    } else {
      logger.warn(`Plugin ${plugin.id} has no buildChatRequest, falling back to buildTextRequest with serialized messages`);
      const result = plugin.buildTextRequest({
        prompt: serializeMessagesToPrompt(messages),
        model: effectiveModel,
        maxTokens: safeMaxTokens,
        temperature: safeTemperature,
      });
      reqBody = result.body;
      endpoint = result.endpoint;
    }

    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
    };

    const response = (await withRetry(
      () => makeRequest(requestUrl, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(reqBody),
      }),
      { maxRetries: 1, retryableCheck: isRetryableError },
    )) as Record<string, unknown>;

    const text = extractTextFromResponse(response, plugin);

    return { success: true, data: { text } };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

/**
 * 原生对话补全流式生成。
 *
 * 与 generateTextStream 的区别：
 * - 接收结构化 messages 数组（含 role/tool_calls/tool_call_id），而非单字符串 prompt
 * - 调用 plugin.buildChatStreamRequest 构建流式请求（完整 messages 数组 + stream:true + tools）
 * - 支持 OpenAI 兼容原生 function calling（流式 tool_calls 增量返回）
 *
 * 如果 plugin 未实现 buildChatStreamRequest，降级到 buildTextStreamRequest + 序列化 messages。
 * 如果 plugin 未实现流式方法，回退到非流式 generateChat。
 */
export async function generateChatStream(
  body: Record<string, unknown>,
  options: {
    onChunk: (chunk: TextStreamChunk) => void;
  },
): Promise<TextApiResult> {
  const { messages: messagesRaw, maxTokens, temperature, tools: toolsRaw } = body as Record<string, unknown>;
  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "text",
  );

  if (!effectiveApiKey) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "text" },
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
    return {
      success: false,
      error: "empty_messages",
      code: API_ERROR_CODES.EMPTY_PROMPT,
      httpStatus: 400,
    };
  }

  const safeMaxTokens = Math.min(Math.max(1, (maxTokens as number) || 4096), 16384);
  const safeTemperature = Math.min(Math.max(0, (temperature as number) ?? 0.7), 2);

  const messages = (messagesRaw as Array<Record<string, unknown>>).map((m) => ({
    role: String(m.role || "user"),
    content: String(m.content || ""),
    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    ...(m.tool_call_id ? { tool_call_id: String(m.tool_call_id) } : {}),
    ...(m.name ? { name: String(m.name) } : {}),
  }));

  // 归一化 tools 字段（与 generateTextStream 相同逻辑）
  let tools: TextStreamToolDef[] | undefined;
  if (Array.isArray(toolsRaw) && toolsRaw.length > 0) {
    tools = (toolsRaw as unknown[])
      .map((t) => {
        const fn = (t as { function?: Record<string, unknown> })?.function;
        if (!fn) return null;
        return {
          type: "function" as const,
          function: {
            name: String(fn.name ?? ""),
            description: String(fn.description ?? ""),
            parameters: (fn.parameters as Record<string, unknown>) || { type: "object", properties: {} },
          },
        };
      })
      .filter((t): t is TextStreamToolDef => t !== null);
    if (tools.length === 0) tools = undefined;
  }

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
    }

    // plugin 未实现流式接口 → 回退到非流式 generateChat
    if (!plugin.extractTextChunk) {
      logger.warn(`Plugin ${plugin.id} has no extractTextChunk, falling back to non-streaming generateChat`);
      return generateChat(body);
    }

    let reqBody: Record<string, unknown>;
    let endpoint: string;

    if (plugin.buildChatStreamRequest) {
      const result = plugin.buildChatStreamRequest({
        messages,
        model: effectiveModel,
        maxTokens: safeMaxTokens,
        temperature: safeTemperature,
        tools,
      });
      reqBody = result.body;
      endpoint = result.endpoint;
    } else if (plugin.buildTextStreamRequest) {
      logger.warn(`Plugin ${plugin.id} has no buildChatStreamRequest, falling back to buildTextStreamRequest with serialized messages`);
      const result = plugin.buildTextStreamRequest({
        prompt: serializeMessagesToPrompt(messages),
        model: effectiveModel,
        maxTokens: safeMaxTokens,
        temperature: safeTemperature,
        tools,
      });
      reqBody = result.body;
      endpoint = result.endpoint;
    } else {
      logger.warn(`Plugin ${plugin.id} has no streaming support, falling back to non-streaming generateChat`);
      return generateChat(body);
    }

    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
    };

    let fullText = "";
    await makeStreamingRequest(requestUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(reqBody),
      onLine: (line) => {
        const chunk = plugin.extractTextChunk!(line);
        if (!chunk) return;
        if (chunk.delta) fullText += chunk.delta;
        options.onChunk(chunk);
      },
    });

    return { success: true, data: { text: fullText } };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

/**
 * 生成向量嵌入（Embedding）
 *
 * 调用 OpenAI 兼容的 `/embeddings` 端点：
 * POST {baseUrl}/embeddings
 * body: { model, input: string | string[] }
 * response: { data: [{ embedding: number[] }] }
 *
 * 单条输入返回 { embedding: number[] }
 * 批量输入返回 { embeddings: number[][] }
 */
export async function generateEmbedding(body: Record<string, unknown>): Promise<ApiResult> {
  const { input } = body as { input?: string | string[] };
  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "embedding",
  );

  if (!effectiveApiKey) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "embedding" },
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  if (input === undefined || input === null ||
      (typeof input === "string" && input.trim().length === 0) ||
      (Array.isArray(input) && input.length === 0)) {
    return {
      success: false,
      error: "empty_input",
      code: API_ERROR_CODES.EMPTY_PROMPT,
      httpStatus: 400,
    };
  }

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
    }

    // OpenAI 兼容请求体
    const reqBody = {
      model: effectiveModel,
      input,
    };

    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}/embeddings`, effectiveApiKey)
      : `${effectiveApiUrl}/embeddings`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...await getAuthHeaders(plugin, effectiveApiKey, "/embeddings"),
    };

    const response = (await withRetry(
      () => makeRequest(requestUrl, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(reqBody),
      }),
      { maxRetries: 1, retryableCheck: isRetryableError },
    )) as Record<string, unknown>;

    const data = (response.data as Array<{ embedding?: number[] }>) || [];
    const embeddings = data.map((item) => item.embedding || []);

    if (Array.isArray(input)) {
      return { success: true, data: { embeddings } };
    }
    return { success: true, data: { embedding: embeddings[0] || [] } };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}
