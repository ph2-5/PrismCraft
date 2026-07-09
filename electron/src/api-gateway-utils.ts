import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import os from "os";
import https from "https";
import http from "http";
import { loadConfigAsync } from "./handlers/config";
import { getLogger } from "./logging/logger";
import { pluginRegistry } from "./plugins";
import type { AIProviderPlugin, AsyncAIProviderPlugin } from "./plugins";
import { ssrfGuard } from "./security/ssrf-guard/ssrf-guard";
import { getUserDataRootDir } from "./app-paths";

const logger = getLogger("api-gateway-utils");

export function isAsyncPlugin(plugin: AIProviderPlugin): plugin is AIProviderPlugin & AsyncAIProviderPlugin {
  return "buildVideoRequestAsync" in plugin && typeof (plugin as AsyncAIProviderPlugin).buildVideoRequestAsync === "function";
}

export async function buildVideoRequest(plugin: AIProviderPlugin, ctx: Parameters<AIProviderPlugin["buildVideoRequest"]>[0]) {
  if (isAsyncPlugin(plugin) && plugin.buildVideoRequestAsync) {
    return plugin.buildVideoRequestAsync(ctx);
  }
  return plugin.buildVideoRequest(ctx);
}

export async function buildImageRequest(plugin: AIProviderPlugin, ctx: Parameters<AIProviderPlugin["buildImageRequest"]>[0]) {
  if (isAsyncPlugin(plugin) && plugin.buildImageRequestAsync) {
    return plugin.buildImageRequestAsync(ctx);
  }
  return plugin.buildImageRequest(ctx);
}

export async function getAuthHeaders(plugin: AIProviderPlugin, apiKey: string, endpoint?: string) {
  if (isAsyncPlugin(plugin) && plugin.getAuthHeadersAsync) {
    return plugin.getAuthHeadersAsync(apiKey, endpoint);
  }
  return plugin.getAuthHeaders(apiKey, endpoint);
}

export async function extractTaskId(plugin: AIProviderPlugin, response: Record<string, unknown>) {
  if (isAsyncPlugin(plugin) && plugin.extractTaskIdAsync) {
    return plugin.extractTaskIdAsync(response);
  }
  return plugin.extractTaskId(response);
}

export async function extractVideoUrl(plugin: AIProviderPlugin, response: Record<string, unknown>) {
  if (isAsyncPlugin(plugin) && plugin.extractVideoUrlAsync) {
    return plugin.extractVideoUrlAsync(response);
  }
  return plugin.extractVideoUrl(response);
}

export async function extractStatus(plugin: AIProviderPlugin, response: Record<string, unknown>) {
  if (isAsyncPlugin(plugin) && plugin.extractStatusAsync) {
    return plugin.extractStatusAsync(response);
  }
  return plugin.extractStatus?.(response);
}

export async function extractImageUrl(plugin: AIProviderPlugin, response: Record<string, unknown>) {
  if (isAsyncPlugin(plugin) && plugin.extractImageUrlAsync) {
    return plugin.extractImageUrlAsync(response);
  }
  return plugin.extractImageUrl(response);
}

export interface ApiConfig {
  providerId?: string;
  modelId?: string;
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  apiConfig?: { apiUrl?: string; apiKey?: string; model?: string };
}

export interface ResolvedConfig {
  effectiveApiUrl: string | undefined;
  effectiveApiKey: string | undefined;
  effectiveModel: string | undefined;
  resolvedProviderId: string | null;
  resolvedProviderModelId: string | null;
  resolvedProviderFormat: string;
  resolvedPlugin: AIProviderPlugin | undefined;
}

export interface StructuredError {
  code: string;
  message: string;
}

export interface ApiResult {
  ok?: boolean;
  success: boolean;
  error?: string | StructuredError;
  code?: string;
  httpStatus?: number;
  data?: Record<string, unknown>;
  url?: string;
  path?: string;
  filename?: string;
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export async function resolveApiConfig(
  body: ApiConfig,
  capability?: string,
): Promise<ResolvedConfig> {
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

  // 收集所有解析过程中遇到的 endpoint（用户传的、provider 配置的、mapping 解析的）。
  // 统一在函数末尾注册到 SSRF 白名单，避免分散注册导致遗漏。
  const endpointCandidates: string[] = [];
  if (effectiveApiUrl) endpointCandidates.push(effectiveApiUrl);

  if (providerId && modelId) {
    const config = await loadConfigAsync();
    const provider = config.providers.find((p) => p.id === providerId);
    if (provider) {
      if (!effectiveApiUrl) effectiveApiUrl = provider.baseUrl;
      if (!effectiveApiKey) effectiveApiKey = provider.apiKey;
      if (!effectiveModel) effectiveModel = modelId;
      if (provider.baseUrl) endpointCandidates.push(provider.baseUrl);
      const modelConfig = provider.models?.find((m) => m.id === modelId);
      if (modelConfig && !effectiveModel) effectiveModel = modelConfig.id;
    } else {
      logger.warn(`Provider not found: ${providerId}`);
    }
  }

  if (!effectiveApiKey && capability) {
    const config = await loadConfigAsync();
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
          // M8 修复：capability mapping 解析出的 endpoint 也需注册到 SSRF 白名单
          if (provider.baseUrl) endpointCandidates.push(provider.baseUrl);
        } else {
          logger.warn(`Mapping provider not found: ${pId}`);
        }
      }
    } else {
      logger.warn(`No mapping for capability: ${capability}`);
    }
  }

  // 统一注册所有候选 endpoint 到 SSRF 白名单
  // （Set 自动去重，多次注册同一 endpoint 无副作用）
  for (const endpoint of endpointCandidates) {
    registerUserEndpoint(endpoint);
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

const USER_DATA_ROOT = getUserDataRootDir();

const UPLOAD_DIR =
  process.env.AI_STUDIO_UPLOAD_DIR ||
  path.join(os.tmpdir(), "ai-animation-studio", "uploads");
const IMAGE_CACHE_DIR = path.join(USER_DATA_ROOT, "Cache", "Images");

const USER_CONFIGURED_HOSTS = new Set<string>();

/** Loopback 主机名/IP 集合（用户配置的本地服务直接放行） */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function isLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(lower)) return true;
  // 127.0.0.0/8 段全部视为 loopback
  if (/^127\./.test(lower)) return true;
  return false;
}

export function registerUserEndpoint(urlStr: string): void {
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

/** 共享的 SSRF 校验函数（带 loopback 旁路），供 api-gateway 和 test-connection 复用 */
export async function isPrivateUrl(urlStr: string): Promise<boolean> {
  try {
    const parsed = new URL(urlStr);
    const hostKey = parsed.port
      ? `${parsed.hostname}:${parsed.port}`
      : parsed.hostname;
    const hostname = parsed.hostname.toLowerCase();

    const isUserConfigured =
      USER_CONFIGURED_HOSTS.has(hostKey) ||
      USER_CONFIGURED_HOSTS.has(parsed.hostname);

    if (isUserConfigured) {
      // 用户配置的 loopback 地址（如 Ollama http://127.0.0.1:11434）直接放行
      if (isLoopbackHost(hostname)) {
        return false;
      }
      // 用户配置的非 loopback 主机仍做 DNS rebinding 检查（解析 IP，检查是否私有）
      const result = await ssrfGuard.validate(urlStr);
      if (!result.safe) {
        logger.warn("User-configured host blocked by SSRF guard", { urlStr, reason: result.reason });
        return true;
      }
      return false;
    }

    // 非用户配置的 URL 强制走完整 SSRF 校验（含 DNS 解析）
    const result = await ssrfGuard.validate(urlStr);
    if (!result.safe) {
      logger.warn("URL blocked by SSRF guard", { urlStr, reason: result.reason });
      return true;
    }
    return false;
  } catch {
    logger.warn("Failed to validate URL in SSRF guard, blocking by default (fail-close)", { urlStr });
    return true;
  }
}

async function ensureUploadDir(): Promise<void> {
  try {
    await fsp.access(UPLOAD_DIR);
  } catch {
    await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

async function ensureImageCacheDir(): Promise<void> {
  try {
    await fsp.access(IMAGE_CACHE_DIR);
  } catch {
    await fsp.mkdir(IMAGE_CACHE_DIR, { recursive: true });
  }
}

export async function cacheRemoteImageLocally(remoteUrl: string): Promise<string> {
  if (!remoteUrl.startsWith("http://") && !remoteUrl.startsWith("https://")) {
    return remoteUrl;
  }

  try {
    await ensureImageCacheDir();

    const urlHash = remoteUrl.replace(/[?#].*$/, "").split("").reduce(
      (acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0,
      0,
    );
    const ext = remoteUrl.split(".").pop()?.toLowerCase() || "png";
    const safeExts = ["png", "jpg", "jpeg", "webp", "gif"];
    const safeExt = safeExts.includes(ext) ? ext : "png";
    const filename = `${Math.abs(urlHash).toString(36)}_${Date.now()}.${safeExt}`;
    const filePath = path.join(IMAGE_CACHE_DIR, filename);

    // 重定向循环：限制最大跳数，每跳都做 SSRF 校验和协议校验
    const MAX_REDIRECTS = 3;
    let redirectCount = 0;
    let currentUrl = remoteUrl;
    let data: Buffer | null = null;

    while (redirectCount <= MAX_REDIRECTS) {
      // SSRF 防护：校验当前 URL 不指向内网/元数据端点
      if (await isPrivateUrl(currentUrl)) {
        throw new Error(`URL blocked by SSRF guard: ${currentUrl}`);
      }

      const result = await new Promise<{ type: "redirect"; url: string } | { type: "data"; data: Buffer }>((resolve, reject) => {
        const client = currentUrl.startsWith("https") ? https : http;
        client.get(currentUrl, { timeout: 30000 }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = res.headers.location;
            // 校验重定向协议
            if (!redirectUrl.startsWith("http://") && !redirectUrl.startsWith("https://")) {
              reject(new Error("Redirect to non-http protocol blocked"));
              return;
            }
            // 消费响应体以释放 socket
            res.resume();
            resolve({ type: "redirect", url: redirectUrl });
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve({ type: "data", data: Buffer.concat(chunks) }));
          res.on("error", reject);
        }).on("error", reject);
      });

      if (result.type === "redirect") {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
        }
        currentUrl = result.url;
        continue;
      }

      data = result.data;
      break;
    }

    if (!data) {
      throw new Error("Failed to fetch image data");
    }

    await fsp.writeFile(filePath, data);
    logger.info(`Cached remote image locally: ${remoteUrl.substring(0, 80)} -> ${filePath}`);
    return filePath;
  } catch (e) {
    logger.warn(`Failed to cache remote image locally, using original URL: ${e instanceof Error ? e.message : String(e)}`);
    return remoteUrl;
  }
}

export async function makeRequest(
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

export interface StreamingRequestOptions extends HttpRequestOptions {
  /** 收到一行 SSE 数据时回调（已去除换行符，可能为空字符串） */
  onLine: (line: string) => void;
}

/**
 * 流式 HTTP 请求（Task 1.0）。
 * 与 makeRequest 的区别：不缓冲完整响应，而是按行通过 onLine 回调实时传出。
 * 用于消费 AI provider 的 SSE 流式响应（Content-Type: text/event-stream）。
 *
 * 安全：与 makeRequest 一致，请求前做 SSRF 校验（fail-close）。
 * 错误处理：非 2xx 状态码会缓冲完整 body 后 reject；2xx 状态码按行回调，结束时 resolve。
 * 内存防护：流式响应累计上限 50MB，错误响应上限 1MB。
 */
export async function makeStreamingRequest(
  url: string,
  options: StreamingRequestOptions,
): Promise<void> {
  const DEFAULT_TIMEOUT = 300000; // 流式生成可能较慢，5 分钟
  if (await isPrivateUrl(url)) {
    throw new Error("Cannot access private/internal URLs");
  }

  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.request(url, options, (res) => {
      const statusCode = res.statusCode ?? 0;

      // 非 2xx：缓冲完整 body 后 reject（错误响应通常不大）
      if (statusCode < 200 || statusCode >= 300) {
        const chunks: Buffer[] = [];
        let totalSize = 0;
        const MAX_ERROR_SIZE = 1 * 1024 * 1024;
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          totalSize += chunk.length;
          if (totalSize > MAX_ERROR_SIZE) {
            req.destroy(new Error("Error response too large"));
          }
        });
        res.on("end", () => {
          const data = Buffer.concat(chunks).toString("utf-8");
          const error = new Error(`HTTP ${statusCode}: ${data}`);
          (error as Error & { statusCode?: number }).statusCode = statusCode;
          reject(error);
        });
        res.on("error", reject);
        return;
      }

      // 2xx：按行流式回调
      let lineBuffer = "";
      const MAX_RESPONSE_SIZE = 50 * 1024 * 1024;
      let totalSize = 0;

      res.on("data", (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_RESPONSE_SIZE) {
          req.destroy(new Error("Response too large"));
          return;
        }

        lineBuffer += chunk.toString("utf-8");
        const lines = lineBuffer.split("\n");
        // 最后一段可能不完整（未以 \n 结尾），保留在 buffer 等待下一个 chunk
        lineBuffer = lines.pop() || "";

        for (const line of lines) {
          try {
            options.onLine(line);
          } catch (e) {
            // 回调抛错视为致命错误，终止请求
            req.destroy(e instanceof Error ? e : new Error(String(e)));
            return;
          }
        }
      });

      res.on("end", () => {
        // flush 残留 buffer（最后一行可能未以 \n 结尾）
        if (lineBuffer) {
          try {
            options.onLine(lineBuffer);
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
            return;
          }
        }
        resolve();
      });

      res.on("error", reject);
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

export async function handleUpload(body: Record<string, unknown>): Promise<ApiResult> {
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
    await ensureUploadDir();

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
    await fsp.writeFile(filePath, buffer);

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

export function getUploadedFile(filename: string): string | null {
  if (!filename || /[^a-zA-Z0-9_.\-]/.test(filename)) {
    return null;
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return filePath;
}
