import { getLogger } from "./logging/logger";
import { pluginRegistry } from "./plugins";
import type { TextStreamChunk, TextStreamToolDef } from "./plugins";
import { API_ERROR_CODES } from "./api-gateway-error-codes";
import {
  type ApiResult,
  resolveApiConfig,
  buildVideoRequest,
  getAuthHeaders,
  makeRequest,
  makeStreamingRequest,
  extractTaskId,
  extractVideoUrl,
  extractStatus,
  handleUpload,
  getUploadedFile,
  extractTextFromResponse,
} from "./api-gateway-utils";
import {
  generateImage,
  generateKeyframe,
  generateFramePair,
  analyzeImage,
} from "./api-gateway-image";
import { withRetry, isRetryableError } from "./api-gateway-retry";

const logger = getLogger("api-gateway");

/**
 * Result type for {@link generateText}. Narrows `ApiResult.data` to the concrete
 * `{ text: string }` shape returned on success, so route handlers can access
 * `data.text` without `as` assertions.
 */
type TextApiResult = ApiResult & { data?: { text: string } };

async function generateText(body: Record<string, unknown>): Promise<TextApiResult> {
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
async function generateTextStream(
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
function serializeMessagesToPrompt(
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
async function generateChat(body: Record<string, unknown>): Promise<TextApiResult> {
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
async function generateChatStream(
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

async function generateVideo(body: Record<string, unknown>): Promise<ApiResult> {
  const {
    prompt,
    imageUrl: bodyImageUrl,
    firstFrameUrl,
    lastFrameUrl,
    duration = 5,
    characterRef: characterRefRaw,
    characterRefs: characterRefsRaw,
    sceneRef,
    referenceVideo: rawReferenceVideo,
    format: _bodyFormat,
    mimicryLevel,
  } = body as Record<string, unknown>;

  const referenceVideoUrl = rawReferenceVideo
    ? typeof rawReferenceVideo === "object"
      ? ((rawReferenceVideo as Record<string, unknown>).videoUrl as string | undefined)
      : (rawReferenceVideo as string)
    : undefined;
  const referenceVideoMimicryLevel = rawReferenceVideo && typeof rawReferenceVideo === "object"
    ? ((rawReferenceVideo as Record<string, unknown>).mimicryLevel as string | undefined)
    : undefined;
  const effectiveMimicryLevel = referenceVideoMimicryLevel || (mimicryLevel as string | undefined);

  const {
    effectiveApiUrl,
    effectiveApiKey,
    effectiveModel,
    resolvedProviderId,
    resolvedProviderModelId,
    resolvedProviderFormat,
    resolvedPlugin,
  } = await resolveApiConfig(body, "video");

  if (!effectiveApiKey) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "video" },
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

  const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
  if (!plugin) {
    return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
  }

  // Task 3.2 Step 4：防御性能力检查 — 记录 plugin 关键能力字段，便于排查渲染层/主进程能力不一致
  const pluginVCaps = plugin.videoCapabilities;
  if (process.env.NODE_ENV !== "production" || lastFrameUrl || characterRefsRaw || sceneRef) {
    logger.debug(
      `[CapabilityCheck] plugin=${plugin.id} model=${effectiveModel} ` +
      `supportsLastFrame=${pluginVCaps.supportsLastFrame} ` +
      `supportsCharacterRef=${pluginVCaps.supportsCharacterRef ?? false} ` +
      `supportsSceneRef=${pluginVCaps.supportsSceneRef ?? false} ` +
      `maxDuration=${pluginVCaps.maxDuration} ` +
      `maxCharacterRefs=${pluginVCaps.maxCharacterRefs ?? "default"} ` +
      `| request: lastFrame=${!!lastFrameUrl} charRefs=${Array.isArray(characterRefsRaw) ? characterRefsRaw.length : (characterRefRaw ? 1 : 0)} sceneRef=${!!sceneRef}`,
    );
  }

  const safeDuration = Math.min(
    Math.max((duration as number) || 5, 1),
    plugin.videoCapabilities.maxDuration,
  );

  const apiConfig = { apiKey: effectiveApiKey, apiUrl: effectiveApiUrl || "" };

  const effectiveFirstFrame = await plugin.prepareImage(
    (firstFrameUrl as string) || (bodyImageUrl as string),
    "firstFrame",
    apiConfig,
  );

  const effectiveLastFrame = plugin.videoCapabilities.supportsLastFrame
    ? await plugin.prepareImage(lastFrameUrl as string, "lastFrame", apiConfig)
    : undefined;

  if (lastFrameUrl && !plugin.videoCapabilities.supportsLastFrame) {
    logger.warn(
      `Provider ${plugin.id} does not support last frame, ignoring lastFrameUrl`,
    );
  }

  const isLocalRefVideo = referenceVideoUrl && (
    referenceVideoUrl.startsWith("blob:") ||
    referenceVideoUrl.startsWith("data:") ||
    referenceVideoUrl.startsWith("file://") ||
    referenceVideoUrl.startsWith("/") ||
    referenceVideoUrl.startsWith("vcache://")
  );
  const effectiveRefVideoUrl = isLocalRefVideo
    ? await plugin.prepareImage(referenceVideoUrl, "referenceVideo", apiConfig)
    : referenceVideoUrl;

  const effectiveCharacterRefs: string[] = [];
  if (plugin.videoCapabilities.supportsCharacterRef !== false) {
    const rawRefs = (Array.isArray(characterRefsRaw) ? characterRefsRaw : characterRefRaw ? [characterRefRaw] : []) as string[];
    const maxRefs = plugin.videoCapabilities.maxCharacterRefs ?? rawRefs.length;
    const limitedRefs = rawRefs.slice(0, maxRefs);
    for (const ref of limitedRefs) {
      const prepared = await plugin.prepareImage(ref, "characterRef", apiConfig);
      if (prepared) effectiveCharacterRefs.push(prepared);
    }
    if (rawRefs.length > maxRefs) {
      logger.warn(`Provider ${plugin.id} supports max ${maxRefs} character refs, ${rawRefs.length} provided, truncating`);
    }
  } else if (characterRefsRaw || characterRefRaw) {
    logger.warn(`Provider ${plugin.id} does not support characterRef, ignoring`);
  }

  let effectiveSceneRef: string | undefined;
  if (sceneRef && plugin.videoCapabilities.supportsSceneRef !== false) {
    effectiveSceneRef = await plugin.prepareImage(sceneRef as string, "sceneRef", apiConfig);
  }

  if (sceneRef && plugin.videoCapabilities.supportsSceneRef === false) {
    logger.warn(`Provider ${plugin.id} does not support sceneRef, ignoring`);
  }

  let reqBody: unknown;
  let endpoint: string;
  let extraHeaders: Record<string, string> | undefined;

  try {
    ({ body: reqBody, endpoint, extraHeaders } = await buildVideoRequest(plugin, {
      prompt: prompt as string,
      model: effectiveModel,
      firstFrameUrl: effectiveFirstFrame,
      lastFrameUrl: effectiveLastFrame,
      referenceVideoUrl: effectiveRefVideoUrl,
      referenceVideoMimicryLevel: effectiveMimicryLevel,
      duration: safeDuration,
      characterRefs: effectiveCharacterRefs.length > 0 ? effectiveCharacterRefs : undefined,
      characterRef: effectiveCharacterRefs.length > 0 ? effectiveCharacterRefs[0] : undefined,
      sceneRef: effectiveSceneRef,
    }));
  } catch (e) {
    logger.error("Video buildRequest error", e instanceof Error ? e : undefined);
    return {
      ok: false,
      success: false,
      error: { code: API_ERROR_CODES.PLUGIN_ERROR, message: (e as Error).message },
      code: API_ERROR_CODES.PLUGIN_ERROR,
      httpStatus: 500,
    };
  }

  try {
    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
      ...(extraHeaders || {}),
    };

    const response = (await withRetry(
      () => makeRequest(requestUrl, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(reqBody),
        timeout: 300000,
      }),
      {
        maxRetries: 1,
        retryableCheck: (error) => {
          if (!(error instanceof Error)) return false;
          const httpStatus = (error as Error & { statusCode?: number }).statusCode;
          if (httpStatus !== undefined) {
            return httpStatus === 429 || httpStatus >= 502;
          }
          return isRetryableError(error);
        },
      },
    )) as Record<string, unknown>;

    const taskId = await extractTaskId(plugin, response);
    const videoUrl = await extractVideoUrl(plugin, response);

    return {
      success: true,
      data: {
        taskId,
        videoUrl,
        providerId: resolvedProviderId,
        providerModelId: resolvedProviderModelId,
        providerFormat: resolvedProviderFormat,
      },
    };
  } catch (error) {
    logger.error("Video generation error", error instanceof Error ? error : undefined);
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

async function videoStatus(body: Record<string, unknown>): Promise<ApiResult> {
  const { taskId } = body as Record<string, unknown>;

  if (!taskId) {
    return {
      success: false,
      error: "missing_task_id",
      code: API_ERROR_CODES.MISSING_TASK_ID,
      httpStatus: 400,
    };
  }

  if (!/^[a-zA-Z0-9_\-.:]+$/.test(taskId as string)) {
    return {
      success: false,
      error: "invalid_task_id",
      code: API_ERROR_CODES.INVALID_TASK_ID,
      httpStatus: 400,
    };
  }

  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "video",
  );

  if (!effectiveApiKey || !effectiveApiUrl) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "video" },
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl, effectiveModel);
  if (!plugin) {
    return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
  }

  const endpoint = plugin.getVideoStatusEndpoint(effectiveApiUrl, taskId as string, effectiveModel);

  try {
    const statusUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const statusHeaders: Record<string, string> = {
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
    };

    const statusMethod = plugin.getStatusMethod ? plugin.getStatusMethod() : "GET";
    const response = (await withRetry(
      () => makeRequest(statusUrl, {
        method: statusMethod,
        headers: statusHeaders,
        timeout: 30000,
      }),
      { maxRetries: 2, retryableCheck: isRetryableError },
    )) as Record<string, unknown>;

    const statusInfo = await extractStatus(plugin, response);

    const videoUrl: string | undefined = await extractVideoUrl(plugin, response);

    return {
      success: true,
      data: {
        status: statusInfo?.status ?? String((response as Record<string, unknown>).status || "generating"),
        videoUrl,
        progress: statusInfo?.progress,
        message: statusInfo?.message,
      },
    };
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
async function generateEmbedding(body: Record<string, unknown>): Promise<ApiResult> {
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

/**
 * 文字转语音（TTS）
 *
 * 调用 OpenAI 兼容的 `/audio/speech` 端点：
 * POST {baseUrl}/audio/speech
 * body: { model, input, voice, response_format, speed }
 * response: binary audio stream
 *
 * 音频二进制落盘到本地 cache 目录后返回 URL。
 */
async function generateAudio(body: Record<string, unknown>): Promise<ApiResult> {
  const { text, voice, format, speed } = body as {
    text?: string;
    voice?: string;
    format?: string;
    speed?: number;
  };
  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "audio",
  );

  if (!effectiveApiKey) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "audio" },
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return {
      success: false,
      error: "empty_text",
      code: API_ERROR_CODES.EMPTY_PROMPT,
      httpStatus: 400,
    };
  }

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
    }

    const reqBody: Record<string, unknown> = {
      model: effectiveModel,
      input: text,
      voice: voice || "alloy",
      response_format: format || "mp3",
    };
    if (typeof speed === "number") {
      reqBody.speed = speed;
    }

    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}/audio/speech`, effectiveApiKey)
      : `${effectiveApiUrl}/audio/speech`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...await getAuthHeaders(plugin, effectiveApiKey, "/audio/speech"),
    };

    // 直接发起请求，获取二进制响应
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(reqBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return {
        success: false,
        error: `tts_failed: ${response.status} ${errText}`.trim(),
        httpStatus: response.status,
      };
    }

    // 落盘到 cache 目录
    const buffer = Buffer.from(await response.arrayBuffer());
    const { getUserDataRootDir } = await import("./app-paths");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const cacheDir = path.join(getUserDataRootDir(), "Cache", "Audio");
    await fs.mkdir(cacheDir, { recursive: true });
    const filename = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${format || "mp3"}`;
    const fullPath = path.join(cacheDir, filename);
    await fs.writeFile(fullPath, buffer);

    // 返回本地文件 URL（renderer 通过 file:// 或本地 HTTP 服务读取）
    const audioUrl = `local://${fullPath.replace(/\\/g, "/")}`;

    return { success: true, data: { audioUrl } };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

/**
 * 语音转文字（STT / 转写）
 *
 * 调用 OpenAI 兼容的 `/audio/transcriptions` 端点（multipart/form-data）：
 * POST {baseUrl}/audio/transcriptions
 * form: { model, file, language? }
 * response: { text, segments? }
 */
async function transcribeAudio(body: Record<string, unknown>): Promise<ApiResult> {
  const { audioUrl, language } = body as { audioUrl?: string; language?: string };
  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "audio",
  );

  if (!effectiveApiKey) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "audio" },
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  if (!audioUrl || typeof audioUrl !== "string") {
    return {
      success: false,
      error: "empty_audio_url",
      httpStatus: 400,
    };
  }

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
    }

    // 下载音频文件
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    let audioBuffer: Buffer;
    let filename: string;

    if (audioUrl.startsWith("local://")) {
      const localPath = audioUrl.slice("local://".length);
      audioBuffer = await fs.readFile(localPath);
      filename = path.basename(localPath);
    } else if (audioUrl.startsWith("http://") || audioUrl.startsWith("https://")) {
      const dlResponse = await fetch(audioUrl);
      if (!dlResponse.ok) {
        return { success: false, error: `download_failed: ${dlResponse.status}`, httpStatus: dlResponse.status };
      }
      audioBuffer = Buffer.from(await dlResponse.arrayBuffer());
      filename = audioUrl.split("/").pop() || "audio.mp3";
    } else {
      // 尝试作为本地路径
      try {
        audioBuffer = await fs.readFile(audioUrl);
        filename = path.basename(audioUrl);
      } catch {
        return { success: false, error: "invalid_audio_url", httpStatus: 400 };
      }
    }

    // 构建 multipart/form-data
    const formData = new FormData();
    formData.append("model", effectiveModel);
    formData.append("file", new Blob([new Uint8Array(audioBuffer)]), filename);
    if (language) {
      formData.append("language", language);
    }

    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}/audio/transcriptions`, effectiveApiKey)
      : `${effectiveApiUrl}/audio/transcriptions`;
    const requestHeaders: Record<string, string> = {
      ...await getAuthHeaders(plugin, effectiveApiKey, "/audio/transcriptions"),
    };

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: requestHeaders,
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return {
        success: false,
        error: `stt_failed: ${response.status} ${errText}`.trim(),
        httpStatus: response.status,
      };
    }

    const result = (await response.json()) as { text?: string; segments?: Array<{ start: number; end: number; text: string }> };
    return {
      success: true,
      data: {
        text: result.text || "",
        segments: result.segments,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

export {
  generateText,
  generateTextStream,
  generateChat,
  generateChatStream,
  generateEmbedding,
  generateAudio,
  transcribeAudio,
  handleUpload,
  getUploadedFile,
  analyzeImage,
  generateImage,
  generateKeyframe,
  generateFramePair,
  generateVideo,
  videoStatus,
};

/**
 * ApiGateway 适配器：将模块导出函数封装为符合 shared-logic ApiGateway 接口的对象。
 * 避免 route-groups 中使用 `apiGateway as unknown as ApiGateway` 类型断言。
 *
 * 注意：api-gateway 函数返回 ApiResult（data: Record<string, unknown>），
 * 而 ApiGateway 接口期望具体的 data 形状。运行时数据形状兼容，
 * 此适配器通过类型收窄提供编译时类型安全。
 */
export function createApiGatewayAdapter(): import("@shared-logic/story/storyboard-generation").ApiGateway {
  return {
    generateKeyframe: async (params) => {
      const result = await generateKeyframe(params);
      return {
        success: result.success,
        data: result.data as { imageUrl: string; prompt?: string; generatedAt?: string } | undefined,
        error: result.error as import("@shared-logic/story/storyboard-generation").ApiError | undefined,
      };
    },
    generateImage: async (params) => {
      const result = await generateImage(params);
      return {
        success: result.success,
        data: result.data as { imageUrl: string } | undefined,
        error: result.error as import("@shared-logic/story/storyboard-generation").ApiError | undefined,
      };
    },
    generateFramePair: async (params) => {
      const result = await generateFramePair(params);
      return {
        success: result.success,
        data: result.data as {
          firstFrame: { imageUrl: string; prompt?: string };
          lastFrame: { imageUrl: string; prompt?: string };
          generatedAt: number;
        } | undefined,
        error: result.error as import("@shared-logic/story/storyboard-generation").ApiError | undefined,
      };
    },
    generateVideo: async (params) => {
      const result = await generateVideo(params);
      return {
        success: result.success,
        data: result.data as { taskId: string; videoUrl?: string; status?: string } | undefined,
        error: result.error as import("@shared-logic/story/storyboard-generation").ApiError | undefined,
      };
    },
    analyzeImage: async (params) => {
      const result = await analyzeImage(params);
      return {
        success: result.success,
        data: result.data as { analysis?: string } | undefined,
        error: result.error as import("@shared-logic/story/storyboard-generation").ApiError | undefined,
      };
    },
    videoStatus: async (params) => {
      const result = await videoStatus(params);
      return {
        success: result.success,
        data: result.data as { status?: string; videoUrl?: string } | undefined,
        error: result.error as import("@shared-logic/story/storyboard-generation").ApiError | undefined,
      };
    },
  };
}
