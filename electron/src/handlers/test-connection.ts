import https from "https";
import http from "http";
import { loadConfig } from "./config";
import { pluginRegistry } from "../plugins";
import type { AIProviderPlugin, AsyncAIProviderPlugin } from "../plugins";
import { getLogger } from "../logging/logger";

const logger = getLogger("test-connection");

function isAsyncPlugin(plugin: AIProviderPlugin): plugin is AIProviderPlugin & AsyncAIProviderPlugin {
  return "getAuthHeadersAsync" in plugin && typeof (plugin as AsyncAIProviderPlugin).getAuthHeadersAsync === "function";
}

async function getAuthHeaders(plugin: AIProviderPlugin | undefined, apiKey: string): Promise<Record<string, string>> {
  if (!plugin) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
  }
  if (isAsyncPlugin(plugin) && plugin.getAuthHeadersAsync) {
    return plugin.getAuthHeadersAsync(apiKey);
  }
  return {
    "Content-Type": "application/json",
    ...plugin.getAuthHeaders(apiKey),
  };
}

function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname === "169.254.169.254") return true;
    if (parsed.hostname === "metadata.google.internal") return true;
    return false;
  } catch {
    logger.warn("Failed to parse URL in private URL check", { urlStr });
    return false;
  }
}

function buildAuthUrl(
  baseUrl: string,
  endpoint: string,
  plugin: AIProviderPlugin | undefined,
  apiKey: string,
): string {
  if (plugin?.id === "google") {
    const separator = endpoint.includes("?") ? "&" : "?";
    return `${baseUrl}${endpoint}${separator}key=${apiKey}`;
  }
  return `${baseUrl}${endpoint}`;
}

interface RequestOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeout?: number;
}

interface RequestResponse {
  statusCode?: number;
  data: unknown;
}

function makeRequest(
  url: string,
  options: RequestOptions,
): Promise<RequestResponse> {
  if (isPrivateUrl(url)) {
    return Promise.reject(new Error("Cannot access private/internal URLs"));
  }
  const DEFAULT_TIMEOUT = 30000;
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.request(url, options, (res) => {
      const chunks: Buffer[] = [];
      const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
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
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch {
          logger.warn("Failed to parse test connection response as JSON");
          resolve({ statusCode: res.statusCode, data });
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

interface TestConnectionResult {
  success: boolean;
  message?: string;
  error?: string;
  httpStatus?: number;
}

export async function handleTestConnection(
  _method: string,
  body: {
    capability?: string;
    apiUrl?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    modelId?: string;
    providerId?: string;
    format?: string;
    mode?: string;
  },
): Promise<TestConnectionResult> {
  const {
    capability,
    apiUrl: bodyApiUrl,
    apiKey: bodyApiKey,
    model: bodyModel,
    baseUrl,
    apiKey: altApiKey,
    modelId,
    providerId,
    mode = "lightweight",
  } = body;

  let effectiveApiUrl = bodyApiUrl || baseUrl;
  let effectiveApiKey = bodyApiKey || altApiKey;
  let effectiveModel = bodyModel || modelId;

  if (!effectiveApiKey && providerId) {
    const config = loadConfig();
    const provider = config.providers?.find((p) => p.id === providerId);
    if (provider) {
      effectiveApiUrl = effectiveApiUrl || provider.baseUrl;
      effectiveApiKey = provider.apiKey;
      effectiveModel = effectiveModel || provider.models?.[0]?.id;
    }
  }

  if (!effectiveApiKey) {
    const config = loadConfig();
    const mapping = config.mapping?.[capability as keyof typeof config.mapping];
    if (mapping) {
      const [mapProviderId, mapModelId] = mapping.split("/");
      const provider = config.providers.find((p) => p.id === mapProviderId);
      if (provider) {
        effectiveApiUrl = provider.baseUrl;
        effectiveApiKey = provider.apiKey;
        effectiveModel = mapModelId;
      }
    }
  }

  const isAnthropic = !!effectiveApiUrl && (effectiveApiUrl.includes("anthropic.com") || effectiveApiUrl.includes("bedrock-runtime"));
  const effectivePlugin = effectiveApiUrl ? pluginRegistry.select(effectiveApiUrl, effectiveModel) : undefined;

  if (!effectiveApiKey) {
    return {
      success: false,
      error: `未配置${capability === "text" ? "文本" : capability === "image" ? "图片" : capability === "vision" ? "视觉" : "视频"} API`,
      httpStatus: 400,
    };
  }

  try {
    if (mode === "lightweight") {
      let testUrl: string;
      let testHeaders: Record<string, string>;
      if (isAnthropic) {
        testUrl = `${effectiveApiUrl}/models`;
        testHeaders = {
          "Content-Type": "application/json",
          "x-api-key": effectiveApiKey!,
          "anthropic-version": "2023-06-01",
        };
      } else if (effectivePlugin?.id === "google") {
        testUrl = buildAuthUrl(
          effectiveApiUrl!,
          `/models`,
          effectivePlugin,
          effectiveApiKey!,
        );
        testHeaders = await getAuthHeaders(effectivePlugin, effectiveApiKey!);
      } else {
        testUrl = `${effectiveApiUrl}/models`;
        testHeaders = await getAuthHeaders(effectivePlugin, effectiveApiKey!);
      }

      const response = await makeRequest(testUrl, {
        method: "GET",
        headers: testHeaders,
        timeout: 15000,
      });

      if (response.statusCode === 200) {
        return { success: true, message: "连接成功，API Key 有效" };
      } else if (response.statusCode === 401) {
        return { success: false, error: "API Key 无效或已过期" };
      } else if (response.statusCode === 429) {
        return { success: true, message: "API Key 有效（额度可能不足）" };
      } else {
        return {
          success: false,
          error: `连接失败: HTTP ${response.statusCode}`,
        };
      }
    }

    switch (capability) {
      case "text": {
        let textUrl: string;
        let textHeaders: Record<string, string>;
        let textBody: string;

        if (isAnthropic) {
          textUrl = `${effectiveApiUrl}/messages`;
          textHeaders = {
            "Content-Type": "application/json",
            "x-api-key": effectiveApiKey!,
            "anthropic-version": "2023-06-01",
          };
          textBody = JSON.stringify({
            model: effectiveModel || "claude-3-sonnet-20240229",
            max_tokens: 5,
            messages: [{ role: "user", content: "Hi" }],
          });
        } else if (effectivePlugin?.id === "google") {
          textUrl = buildAuthUrl(
            effectiveApiUrl!,
            `/models/${effectiveModel || "gemini-3.1-pro"}:generateContent`,
            effectivePlugin,
            effectiveApiKey!,
          );
          textHeaders = await getAuthHeaders(effectivePlugin, effectiveApiKey!);
          textBody = JSON.stringify({
            contents: [{ parts: [{ text: "Hi" }] }],
            generationConfig: { maxOutputTokens: 5 },
          });
        } else {
          textUrl = `${effectiveApiUrl}/chat/completions`;
          textHeaders = await getAuthHeaders(effectivePlugin, effectiveApiKey!);
          textBody = JSON.stringify({
            model: effectiveModel || "gpt-4o",
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 5,
          });
        }

        const response = await makeRequest(textUrl, {
          method: "POST",
          headers: textHeaders,
          body: textBody,
          timeout: 30000,
        });

        if (response.statusCode === 200) {
          return { success: true, message: "文本生成测试成功" };
        } else if (response.statusCode === 429) {
          return { success: true, message: "API Key 有效（额度可能不足）" };
        } else {
          return {
            success: false,
            error: `测试失败: HTTP ${response.statusCode}`,
          };
        }
      }

      case "image":
      case "vision":
      case "video": {
        const testUrl =
          effectivePlugin?.id === "google"
            ? buildAuthUrl(
                effectiveApiUrl!,
                `/models`,
                effectivePlugin,
                effectiveApiKey!,
              )
            : `${effectiveApiUrl}/models`;
        const response = await makeRequest(testUrl, {
          method: "GET",
          headers: await getAuthHeaders(effectivePlugin, effectiveApiKey!),
          timeout: 15000,
        });

        if (response.statusCode === 200 || response.statusCode === 429) {
          const label =
            capability === "image"
              ? "图片"
              : capability === "vision"
                ? "视觉"
                : "视频";
          return {
            success: true,
            message:
              response.statusCode === 429
                ? "API Key 有效（额度可能不足）"
                : `${label} API 连接成功`,
          };
        }
        return {
          success: false,
          error: `连接失败: HTTP ${response.statusCode}`,
        };
      }

      default:
        return { success: false, error: `不支持的功能: ${capability}` };
    }
  } catch (error) {
    return {
      success: false,
      error: `连接失败: ${(error as Error).message}`,
      httpStatus: 500,
    };
  }
}
