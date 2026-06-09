import fs from "fs";
import path from "path";
import os from "os";
import https from "https";
import http from "http";
import { loadConfig } from "./handlers/config";
import { getLogger } from "./logging/logger";
import { pluginRegistry } from "./plugins";
import type { AIProviderPlugin, AsyncAIProviderPlugin } from "./plugins";

function isAsyncPlugin(plugin: AIProviderPlugin): plugin is AIProviderPlugin & AsyncAIProviderPlugin {
  return "buildVideoRequestAsync" in plugin && typeof (plugin as AsyncAIProviderPlugin).buildVideoRequestAsync === "function";
}

async function buildVideoRequest(plugin: AIProviderPlugin, ctx: Parameters<AIProviderPlugin["buildVideoRequest"]>[0]) {
  if (isAsyncPlugin(plugin) && plugin.buildVideoRequestAsync) {
    return plugin.buildVideoRequestAsync(ctx);
  }
  return plugin.buildVideoRequest(ctx);
}

async function buildImageRequest(plugin: AIProviderPlugin, ctx: Parameters<AIProviderPlugin["buildImageRequest"]>[0]) {
  if (isAsyncPlugin(plugin) && plugin.buildImageRequestAsync) {
    return plugin.buildImageRequestAsync(ctx);
  }
  return plugin.buildImageRequest(ctx);
}

async function getAuthHeaders(plugin: AIProviderPlugin, apiKey: string, endpoint?: string) {
  if (isAsyncPlugin(plugin) && plugin.getAuthHeadersAsync) {
    return plugin.getAuthHeadersAsync(apiKey, endpoint);
  }
  return plugin.getAuthHeaders(apiKey, endpoint);
}

async function extractTaskId(plugin: AIProviderPlugin, response: Record<string, unknown>) {
  if (isAsyncPlugin(plugin) && plugin.extractTaskIdAsync) {
    return plugin.extractTaskIdAsync(response);
  }
  return plugin.extractTaskId(response);
}

async function extractVideoUrl(plugin: AIProviderPlugin, response: Record<string, unknown>) {
  if (isAsyncPlugin(plugin) && plugin.extractVideoUrlAsync) {
    return plugin.extractVideoUrlAsync(response);
  }
  return plugin.extractVideoUrl(response);
}

async function extractStatus(plugin: AIProviderPlugin, response: Record<string, unknown>) {
  if (isAsyncPlugin(plugin) && plugin.extractStatusAsync) {
    return plugin.extractStatusAsync(response);
  }
  return plugin.extractStatus?.(response);
}

async function extractImageUrl(plugin: AIProviderPlugin, response: Record<string, unknown>) {
  if (isAsyncPlugin(plugin) && plugin.extractImageUrlAsync) {
    return plugin.extractImageUrlAsync(response);
  }
  return plugin.extractImageUrl(response);
}

const logger = getLogger("api-gateway");

interface ApiConfig {
  providerId?: string;
  modelId?: string;
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  apiConfig?: { apiUrl?: string; apiKey?: string; model?: string };
}

interface ResolvedConfig {
  effectiveApiUrl: string | undefined;
  effectiveApiKey: string | undefined;
  effectiveModel: string | undefined;
  resolvedProviderId: string | null;
  resolvedProviderModelId: string | null;
  resolvedProviderFormat: string;
  resolvedPlugin: AIProviderPlugin | undefined;
}

interface StructuredError {
  code: string;
  message: string;
}

interface ApiResult {
  ok?: boolean;
  success: boolean;
  error?: string | StructuredError;
  httpStatus?: number;
  data?: Record<string, unknown>;
  url?: string;
  path?: string;
  filename?: string;
}

interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

function resolveApiConfig(
  body: ApiConfig,
  capability?: string,
): ResolvedConfig {
  const {
    providerId,
    modelId,
    apiUrl,
    apiKey,
    model,
    apiConfig,
  } = body;

  let effectiveApiUrl: string | undefined =
    apiUrl || apiConfig?.apiUrl;
  let effectiveApiKey: string | undefined =
    apiKey || apiConfig?.apiKey;
  let effectiveModel: string | undefined =
    model || apiConfig?.model;
  let resolvedProviderId: string | null = providerId || null;
  let resolvedProviderModelId: string | null = modelId || null;

  if (effectiveApiUrl) {
    registerUserEndpoint(effectiveApiUrl);
  }

  if (providerId && modelId) {
    const config = loadConfig();
    const provider = config.providers.find((p) => p.id === providerId);
    if (provider) {
      if (!effectiveApiUrl) effectiveApiUrl = provider.baseUrl;
      if (!effectiveApiKey) effectiveApiKey = provider.apiKey;
      if (!effectiveModel) effectiveModel = modelId;
      if (provider.baseUrl) registerUserEndpoint(provider.baseUrl);
      const modelConfig = provider.models?.find((m) => m.id === modelId);
      if (modelConfig && !effectiveModel) effectiveModel = modelConfig.id;
    } else {
      logger.warn(`Provider not found: ${providerId}`);
    }
  }

  if (!effectiveApiKey && capability) {
    const config = loadConfig();
    const mappingValue = config.mapping?.[capability];
    if (mappingValue) {
      const firstSlashIndex = mappingValue.indexOf("/");
      if (firstSlashIndex !== -1) {
        const pId = mappingValue.substring(0, firstSlashIndex);
        const mId = mappingValue.substring(firstSlashIndex + 1);
        const provider = config.providers.find((p) => p.id === pId);
        if (provider) {
          if (!effectiveApiUrl) effectiveApiUrl = provider.baseUrl;
          if (!effectiveApiKey) effectiveApiKey = provider.apiKey;
          if (!effectiveModel) effectiveModel = mId;
          if (!resolvedProviderId) resolvedProviderId = pId;
          if (!resolvedProviderModelId) resolvedProviderModelId = mId;
        } else {
          logger.warn(`Mapping provider not found: ${pId}`);
        }
      }
    } else {
      logger.warn(`No mapping for capability: ${capability}`);
    }
  }

  let resolvedPlugin: AIProviderPlugin | undefined;

  if (resolvedProviderId) {
    resolvedPlugin = pluginRegistry.selectById(resolvedProviderId);
  }

  if (!resolvedPlugin && effectiveApiUrl) {
    resolvedPlugin = pluginRegistry.select(effectiveApiUrl, effectiveModel);
  }

  const resolvedProviderFormat = resolvedPlugin?.id || "openai";

  return {
    effectiveApiUrl,
    effectiveApiKey,
    effectiveModel,
    resolvedProviderId,
    resolvedProviderModelId,
    resolvedProviderFormat,
    resolvedPlugin,
  };
}

const UPLOAD_DIR =
  process.env.AI_STUDIO_UPLOAD_DIR ||
  path.join(os.tmpdir(), "ai-animation-studio", "uploads");
const PRIVATE_IP_REGEX =
  /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|localhost|::1|fe80:)/i;

const USER_CONFIGURED_HOSTS = new Set<string>();

function registerUserEndpoint(urlStr: string): void {
  try {
    const parsed = new URL(urlStr);
    const hostKey = parsed.port
      ? `${parsed.hostname}:${parsed.port}`
      : parsed.hostname;
    USER_CONFIGURED_HOSTS.add(hostKey);
  } catch {
    logger.warn("Failed to add user-configured host to whitelist", { urlStr });
  }
}

async function isPrivateUrl(urlStr: string): Promise<boolean> {
  try {
    const parsed = new URL(urlStr);
    const hostKey = parsed.port
      ? `${parsed.hostname}:${parsed.port}`
      : parsed.hostname;

    if (
      USER_CONFIGURED_HOSTS.has(hostKey) ||
      USER_CONFIGURED_HOSTS.has(parsed.hostname)
    ) {
      return false;
    }

    return PRIVATE_IP_REGEX.test(parsed.hostname);
  } catch {
    logger.warn("Failed to parse URL for private IP check", { urlStr });
    return false;
  }
}

function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

async function makeRequest(
  url: string,
  options: HttpRequestOptions,
): Promise<unknown> {
  const DEFAULT_TIMEOUT = 120000;
  if (await isPrivateUrl(url)) {
    throw new Error("Cannot access private/internal URLs");
  }

  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.request(url, options, (res) => {
      const chunks: Buffer[] = [];
      const MAX_RESPONSE_SIZE = 50 * 1024 * 1024;
      let totalSize = 0;
      res.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        totalSize += chunk.length;
        if (totalSize > MAX_RESPONSE_SIZE) {
          req.destroy(new Error("Response too large"));
        }
      });
      res.on("end", () => {
        const data = Buffer.concat(chunks).toString("utf-8");
        const statusCode = res.statusCode ?? 0;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          logger.warn("Failed to parse API response as JSON", { statusCode });
          if (statusCode >= 200 && statusCode < 300) {
            resolve(data);
          } else {
            const error = new Error(`HTTP ${statusCode}: ${data}`);
            (error as Error & { statusCode?: number }).statusCode = statusCode;
            reject(error);
          }
          return;
        }
        if (statusCode >= 200 && statusCode < 300) {
          resolve(parsed);
        } else {
          const error = new Error(
            (parsed as Record<string, unknown>)?.error
              ? String(((parsed as Record<string, unknown>).error as Record<string, unknown>)?.message || `HTTP ${statusCode}`)
              : `HTTP ${statusCode}`,
          );
          (error as Error & { statusCode?: number }).statusCode = statusCode;
          reject(error);
        }
      });
    });

    req.setTimeout(options.timeout || DEFAULT_TIMEOUT, () => {
      req.destroy(new Error("Request timeout"));
    });

    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function generateText(body: Record<string, unknown>): Promise<ApiResult> {
  const { prompt, maxTokens, temperature } = body as Record<string, unknown>;
  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = resolveApiConfig(
    body,
    "text",
  );

  if (!effectiveApiKey) {
    return {
      success: false,
      error: "未配置文本生成 API，请在设置中配置",
      httpStatus: 400,
    };
  }

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return {
      success: false,
      error: "提示词不能为空",
      httpStatus: 400,
    };
  }

  const safeMaxTokens = Math.min(Math.max(1, (maxTokens as number) || 4096), 16384);
  const safeTemperature = Math.min(Math.max(0, (temperature as number) ?? 0.7), 2);

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "无法识别的 API 提供商", httpStatus: 400 };
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

    const response = (await makeRequest(requestUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(reqBody),
    })) as Record<string, unknown>;

    const text = plugin.extractTextContent
      ? plugin.extractTextContent(response)
      : ((((response.choices as Record<string, unknown>[])?.[0] as Record<string, unknown>)?.message as Record<string, unknown>)?.content as string) || "";

    return { success: true, data: { text } };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

async function handleUpload(body: Record<string, unknown>): Promise<ApiResult> {
  const { file, filename, mimetype: _mimetype } = body as Record<string, unknown>;

  if (!file) {
    return { success: false, error: "No file provided", httpStatus: 400 };
  }

  const MAX_BASE64_SIZE = 20 * 1024 * 1024;
  const base64Data = (file as string).replace(/^data:[\w/+\-.]+;base64,/, "");
  const estimatedSize = base64Data.length * 0.75;
  if (estimatedSize > MAX_BASE64_SIZE) {
    return {
      success: false,
      error: `文件过大，最大支持 ${MAX_BASE64_SIZE / 1024 / 1024}MB`,
      httpStatus: 400,
    };
  }

  try {
    ensureUploadDir();

    const ALLOWED_EXTENSIONS = [
      ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".webm", ".mov",
    ];
    const ext = filename ? path.extname(filename as string).toLowerCase() : ".png";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        success: false,
        error: `不支持的文件类型: ${ext}`,
        httpStatus: 400,
      };
    }

    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
    const filePath = path.join(UPLOAD_DIR, uniqueName);

    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(filePath, buffer);

    return {
      success: true,
      url: `/api/upload/${uniqueName}`,
      path: filePath,
      filename: uniqueName,
    };
  } catch (error) {
    logger.error("Upload error", error instanceof Error ? error : undefined);
    return { success: false, error: (error as Error).message, httpStatus: 500 };
  }
}

function getUploadedFile(filename: string): string | null {
  if (!filename || /[^a-zA-Z0-9_.\-]/.test(filename)) {
    return null;
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return filePath;
}

async function analyzeImage(body: Record<string, unknown>): Promise<ApiResult> {
  const { imageUrl, prompt, type } = body as Record<string, unknown>;
  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = resolveApiConfig(
    body,
    "vision",
  );

  if (!effectiveApiKey) {
    return {
      success: false,
      error: "未配置图片分析 API，请在设置中配置",
      httpStatus: 400,
    };
  }

  const defaultPrompt =
    type === "character"
      ? `分析这张图片中的角色，提取以下信息并以 JSON 格式返回：
{
  "name": "角色名称",
  "gender": "性别",
  "age": "年龄数字",
  "style": "艺术风格",
  "personality": ["性格特征1", "性格特征2"],
  "appearance": {
    "hairColor": "发色",
    "hairStyle": "发型",
    "eyeColor": "眼睛颜色",
    "height": "身高描述",
    "build": "体型",
    "clothing": "服装描述"
  },
  "description": "角色整体描述"
}`
      : `分析这张图片中的场景，提取以下信息并以 JSON 格式返回：
{
  "name": "场景名称",
  "type": "场景类型",
  "timeOfDay": "时间（早晨/中午/傍晚/夜晚）",
  "weather": "天气",
  "mood": "氛围/情绪",
  "elements": ["元素1", "元素2", "元素3"],
  "colorPalette": "色调描述",
  "description": "场景整体描述"
}`;

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "无法识别的 API 提供商", httpStatus: 400 };
    }

    const accessibleImageUrl = await plugin.prepareImage(
      imageUrl as string,
      "analysisTarget",
      { apiKey: effectiveApiKey, apiUrl: effectiveApiUrl || "" },
    ) || (imageUrl as string);

    const { body: reqBody, endpoint } = plugin.buildVisionRequest({
      prompt: (prompt as string) || defaultPrompt,
      model: effectiveModel,
      imageUrl: accessibleImageUrl,
      maxTokens: 4096,
    });

    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
    };

    const response = (await makeRequest(requestUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(reqBody),
    })) as Record<string, unknown>;

    const analysis = plugin.extractTextContent
      ? plugin.extractTextContent(response)
      : ((((response.choices as Record<string, unknown>[])?.[0] as Record<string, unknown>)?.message as Record<string, unknown>)?.content as string) || "";

    let analyzed: Record<string, unknown> | null = null;
    const jsonMatch = analysis.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        analyzed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        logger.warn(`Failed to parse JSON from analysis response: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      success: true,
      data: {
        analysis,
        analyzed,
        description: analysis,
        tags: [],
      },
    };
  } catch (error) {
    logger.error("Analyze error", error instanceof Error ? error : undefined);
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: 500,
    };
  }
}

async function generateImage(body: Record<string, unknown>): Promise<ApiResult> {
  const {
    prompt,
    type: _type,
    size = "1024x1024",
    referenceImageUrl,
    characterImageUrl,
    sceneImageUrl,
    previousFrameUrl,
  } = body as Record<string, unknown>;

  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = resolveApiConfig(
    body,
    "image",
  );

  if (!effectiveApiKey && effectiveApiUrl?.includes("pollinations")) {
    if (!prompt || typeof prompt !== "string") {
      return { success: false, error: "提示词不能为空", httpStatus: 400 };
    }
    const width = (size as string).split("x")[0] || "1024";
    const height = (size as string).split("x")[1] || "1024";
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      prompt as string,
    )}?width=${width}&height=${height}&seed=${Date.now()}&nologo=true`;

    return { success: true, data: { imageUrl } };
  }

  if (!effectiveApiKey) {
    return {
      success: false,
      error: "未配置图片生成 API，请在设置中配置",
      httpStatus: 400,
    };
  }

  const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
  if (!plugin) {
    return { success: false, error: "无法识别的 API 提供商", httpStatus: 400 };
  }

  const allRefImages = (await Promise.all(
    [referenceImageUrl, characterImageUrl, sceneImageUrl, previousFrameUrl]
      .filter(Boolean)
      .map((url) => plugin.prepareImage(url as string, "referenceImage", { apiKey: effectiveApiKey, apiUrl: effectiveApiUrl || "" }))
  )).filter((url): url is string => url !== undefined);

  try {
    const { body: reqBody, endpoint } = await buildImageRequest(plugin, {
      prompt: prompt as string,
      model: effectiveModel,
      size: size as string,
      referenceImages: allRefImages,
    });

    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
    };

    const response = (await makeRequest(requestUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(reqBody),
    })) as Record<string, unknown>;

    const imageUrl = await extractImageUrl(plugin, response);
    if (imageUrl) {
      return { success: true, data: { imageUrl } };
    } else {
      return { success: false, error: "API 返回格式不正确", httpStatus: 500 };
    }
  } catch (error) {
    logger.error("Image generation error", error instanceof Error ? error : undefined);
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

async function generateKeyframe(body: Record<string, unknown>): Promise<ApiResult> {
  const {
    content,
    prompt,
    size,
    type: _type,
    referenceImageUrl,
    characterRef,
    sceneRef,
    characterImageUrl: _legacyCharacterImageUrl,
    sceneImageUrl: _legacySceneImageUrl,
    previousFrameUrl,
    prevKeyframe,
  } = body as Record<string, unknown>;

  const effectiveCharacterRef = characterRef || _legacyCharacterImageUrl;
  const effectiveSceneRef = sceneRef || _legacySceneImageUrl;
  const effectivePrevFrame = previousFrameUrl || prevKeyframe;

  const { effectiveApiUrl, effectiveModel, resolvedPlugin } = resolveApiConfig(
    body,
    "image",
  );

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "无法识别的 API 提供商", httpStatus: 400 };
    }
    const supportsRef = plugin.imageCapabilities.supportsReferenceImage;

    let enrichedPrompt = (content as string) || (prompt as string) || "";

    if (!supportsRef) {
      if (effectiveCharacterRef) enrichedPrompt = `[参考角色] ${enrichedPrompt}`;
      if (effectiveSceneRef) enrichedPrompt = `[参考场景] ${enrichedPrompt}`;
      if (effectivePrevFrame) enrichedPrompt = `[上一帧参考] ${enrichedPrompt}`;
      if (referenceImageUrl) enrichedPrompt = `[参考图] ${enrichedPrompt}`;
      logger.warn("Format does not support reference images, appended to prompt text");
    }

    return generateImage({
      ...body,
      prompt: enrichedPrompt,
      characterImageUrl: supportsRef ? effectiveCharacterRef : undefined,
      sceneImageUrl: supportsRef ? effectiveSceneRef : undefined,
      referenceImageUrl: supportsRef ? referenceImageUrl : undefined,
      previousFrameUrl: supportsRef ? effectivePrevFrame : undefined,
      size: size || "1024x1024",
    });
  } catch (e) {
    logger.error("Keyframe buildRequest error", e instanceof Error ? e : undefined);
    return {
      ok: false,
      success: false,
      error: { code: "PLUGIN_ERROR", message: (e as Error).message },
      httpStatus: 500,
    };
  }
}

async function generateFramePair(body: Record<string, unknown>): Promise<ApiResult> {
  const {
    prompt,
    firstFramePrompt,
    lastFramePrompt,
    characterRef,
    sceneRef,
    characterImageUrl: _legacyCharacterImageUrl,
    sceneImageUrl: _legacySceneImageUrl,
    size,
  } = body as Record<string, unknown>;

  const effectiveCharacterRef = characterRef || _legacyCharacterImageUrl;
  const effectiveSceneRef = sceneRef || _legacySceneImageUrl;

  const { effectiveApiUrl, effectiveModel, resolvedPlugin } = resolveApiConfig(
    body,
    "image",
  );

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "无法识别的 API 提供商", httpStatus: 400 };
    }
    const supportsRef = plugin.imageCapabilities.supportsReferenceImage;

    const firstRef = supportsRef ? effectiveCharacterRef : undefined;
    const secondRef = supportsRef ? effectiveSceneRef : undefined;

    const firstResult = await generateImage({
      ...body,
      prompt: firstFramePrompt || `首帧: ${prompt}`,
      characterImageUrl: firstRef,
      sceneImageUrl: secondRef,
      size: size || "1024x1024",
    });

    if (!firstResult.success) {
      return firstResult;
    }

    const lastResult = await generateImage({
      ...body,
      prompt: lastFramePrompt || `尾帧: ${prompt}`,
      characterImageUrl: firstRef,
      sceneImageUrl: secondRef,
      size: size || "1024x1024",
    });

    return {
      success: true,
      data: {
        firstFrameUrl: (firstResult.data as Record<string, unknown>)?.imageUrl,
        lastFrameUrl: lastResult.success ? (lastResult.data as Record<string, unknown>)?.imageUrl : null,
        lastFrameError: lastResult.success ? null : lastResult.error,
      },
    };
  } catch (e) {
    logger.error("FramePair buildRequest error", e instanceof Error ? e : undefined);
    return {
      ok: false,
      success: false,
      error: { code: "PLUGIN_ERROR", message: (e as Error).message },
      httpStatus: 500,
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
    characterRef,
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
  } = resolveApiConfig(body, "video");

  if (!effectiveApiKey) {
    return {
      success: false,
      error: "未配置视频生成 API，请在设置中配置",
      httpStatus: 400,
    };
  }

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return {
      success: false,
      error: "提示词不能为空",
      httpStatus: 400,
    };
  }

  const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
  if (!plugin) {
    return { success: false, error: "无法识别的 API 提供商", httpStatus: 400 };
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

  const effectiveCharacterRef = characterRef
    ? await plugin.prepareImage(characterRef as string, "characterRef", apiConfig)
    : undefined;

  const effectiveSceneRef = sceneRef
    ? await plugin.prepareImage(sceneRef as string, "sceneRef", apiConfig)
    : undefined;

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
      characterRef: effectiveCharacterRef,
      sceneRef: effectiveSceneRef,
    }));
  } catch (e) {
    logger.error("Video buildRequest error", e instanceof Error ? e : undefined);
    return {
      ok: false,
      success: false,
      error: { code: "PLUGIN_ERROR", message: (e as Error).message },
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

    const response = (await makeRequest(requestUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(reqBody),
      timeout: 300000,
    })) as Record<string, unknown>;

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
      error: "缺少 taskId",
      httpStatus: 400,
    };
  }

  if (!/^[a-zA-Z0-9_\-.:]+$/.test(taskId as string)) {
    return {
      success: false,
      error: "taskId 格式无效",
      httpStatus: 400,
    };
  }

  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = resolveApiConfig(
    body,
    "video",
  );

  if (!effectiveApiKey || !effectiveApiUrl) {
    return {
      success: false,
      error: "未配置视频生成 API",
      httpStatus: 400,
    };
  }

  const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl, effectiveModel);
  if (!plugin) {
    return { success: false, error: "无法识别的 API 提供商", httpStatus: 400 };
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
    const response = (await makeRequest(statusUrl, {
      method: statusMethod,
      headers: statusHeaders,
      timeout: 30000,
    })) as Record<string, unknown>;

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

export {
  generateText,
  handleUpload,
  getUploadedFile,
  analyzeImage,
  generateImage,
  generateKeyframe,
  generateFramePair,
  generateVideo,
  videoStatus,
};
