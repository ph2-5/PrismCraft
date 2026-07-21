import https from "https";
import http from "http";
import { loadConfigAsync } from "./config";
import { pluginRegistry } from "../plugins";
import type { AIProviderPlugin, AsyncAIProviderPlugin } from "../plugins";
import { getLogger } from "../logging/logger";
import { API_ERROR_CODES } from "../api-gateway-error-codes";
import { isPrivateUrl, registerUserEndpoint } from "../api-gateway-utils";

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

async function makeRequest(
  url: string,
  options: RequestOptions,
): Promise<RequestResponse> {
  if (await isPrivateUrl(url)) {
    throw new Error("Cannot access private/internal URLs");
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
          const parsed: unknown = JSON.parse(data);
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
  code?: string;
  httpStatus?: number;
}

interface ResolvedCredentials {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}

/** 从 config 解析 provider/mapping 凭证（提取以降低 handleTestConnection 复杂度） */
async function resolveCredentialsFromConfig(
  body: {
    capability?: string;
    apiUrl?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    modelId?: string;
    providerId?: string;
  },
): Promise<ResolvedCredentials> {
  let apiUrl = body.apiUrl || body.baseUrl;
  let apiKey = body.apiKey;
  let model = body.model || body.modelId;

  if (!apiKey && body.providerId) {
    const config = await loadConfigAsync();
    const provider = config.providers?.find((p) => p.id === body.providerId);
    if (provider) {
      apiUrl = apiUrl || provider.baseUrl;
      apiKey = provider.apiKey;
      model = model || provider.models?.[0]?.id;
    }
  }

  if (!apiKey && body.capability) {
    const config = await loadConfigAsync();
    const mapping = config.mapping?.[body.capability as keyof typeof config.mapping];
    if (mapping) {
      const [mapProviderId, mapModelId] = mapping.split("/");
      const provider = config.providers.find((p) => p.id === mapProviderId);
      if (provider) {
        apiUrl = provider.baseUrl;
        apiKey = provider.apiKey;
        model = mapModelId;
      }
    }
  }

  return { apiUrl, apiKey, model };
}

/** 处理 lightweight 模式的连接测试（提取以降低 handleTestConnection 复杂度） */
async function testLightweightConnection(
  apiUrl: string,
  apiKey: string,
  isAnthropic: boolean,
  effectivePlugin: AIProviderPlugin | undefined,
): Promise<TestConnectionResult> {
  const testUrl = `${apiUrl}/models`;
  const testHeaders = isAnthropic
    ? {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      }
    : await getAuthHeaders(effectivePlugin, apiKey);

  const response = await makeRequest(testUrl, {
    method: "GET",
    headers: testHeaders,
    timeout: 15000,
  });

  if (response.statusCode === 200) {
    return { success: true, message: "CONNECTION_SUCCESS_API_KEY_VALID" };
  }
  if (response.statusCode === 401) {
    return { success: false, error: "API_KEY_INVALID_OR_EXPIRED" };
  }
  if (response.statusCode === 429) {
    return { success: true, message: "API_KEY_VALID_QUOTA_MAY_BE_INSUFFICIENT" };
  }
  return {
    success: false,
    error: `CONNECTION_FAILED: HTTP ${response.statusCode}`,
  };
}

/** 处理 text capability 的连接测试（提取以降低 handleTestConnection 复杂度） */
async function testTextCapability(
  apiUrl: string,
  apiKey: string,
  isAnthropic: boolean,
  effectivePlugin: AIProviderPlugin | undefined,
  model: string | undefined,
): Promise<TestConnectionResult> {
  let textUrl: string;
  let textHeaders: Record<string, string>;
  let textBody: string;

  if (isAnthropic) {
    textUrl = `${apiUrl}/messages`;
    textHeaders = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
    textBody = JSON.stringify({
      model: model || "claude-3-sonnet-20240229",
      max_tokens: 5,
      messages: [{ role: "user", content: "Hi" }],
    });
  } else if (effectivePlugin?.id === "google") {
    textUrl = `${apiUrl}/models/${model || "gemini-3.1-pro"}:generateContent`;
    textHeaders = await getAuthHeaders(effectivePlugin, apiKey);
    textBody = JSON.stringify({
      contents: [{ parts: [{ text: "Hi" }] }],
      generationConfig: { maxOutputTokens: 5 },
    });
  } else {
    textUrl = `${apiUrl}/chat/completions`;
    textHeaders = await getAuthHeaders(effectivePlugin, apiKey);
    textBody = JSON.stringify({
      model: model || "gpt-4o",
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
    return { success: true, message: "TEXT_GENERATION_TEST_SUCCESS" };
  }
  if (response.statusCode === 429) {
    return { success: true, message: "API_KEY_VALID_QUOTA_MAY_BE_INSUFFICIENT" };
  }
  return {
    success: false,
    error: `TEST_FAILED: HTTP ${response.statusCode}`,
  };
}

/** 处理 image/vision/video capability 的连接测试（提取以降低 handleTestConnection 复杂度） */
async function testMediaCapability(
  apiUrl: string,
  apiKey: string,
  effectivePlugin: AIProviderPlugin | undefined,
  capability: string,
): Promise<TestConnectionResult> {
  const testUrl = `${apiUrl}/models`;
  const response = await makeRequest(testUrl, {
    method: "GET",
    headers: await getAuthHeaders(effectivePlugin, apiKey),
    timeout: 15000,
  });

  if (response.statusCode === 200 || response.statusCode === 429) {
    const label =
      capability === "image" ? "IMAGE" : capability === "vision" ? "VISION" : "VIDEO";
    return {
      success: true,
      message:
        response.statusCode === 429
          ? "API_KEY_VALID_QUOTA_MAY_BE_INSUFFICIENT"
          : `${label}_API_CONNECTION_SUCCESS`,
    };
  }
  return {
    success: false,
    error: `CONNECTION_FAILED: HTTP ${response.statusCode}`,
  };
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
  const { capability, mode = "lightweight" } = body;

  const creds = await resolveCredentialsFromConfig(body);
  const apiUrl = creds.apiUrl;
  const apiKey = creds.apiKey;
  const effectiveModel = creds.model;

  if (!apiKey) {
    return {
      success: false,
      error: "api_not_configured",
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  // 注册用户配置的 endpoint 到 SSRF 白名单（loopback 地址直接放行，支持 Ollama 等本地部署）
  if (apiUrl) {
    registerUserEndpoint(apiUrl);
  }

  const isAnthropic = !!apiUrl && (apiUrl.includes("anthropic.com") || apiUrl.includes("bedrock-runtime"));
  const effectivePlugin = apiUrl ? pluginRegistry.select(apiUrl, effectiveModel) : undefined;

  try {
    if (mode === "lightweight") {
      return await testLightweightConnection(apiUrl!, apiKey, isAnthropic, effectivePlugin);
    }

    switch (capability) {
      case "text":
        return await testTextCapability(apiUrl!, apiKey, isAnthropic, effectivePlugin, effectiveModel);
      case "image":
      case "vision":
      case "video":
        return await testMediaCapability(apiUrl!, apiKey, effectivePlugin, capability);
      default:
        return { success: false, error: `UNSUPPORTED_CAPABILITY: ${capability}` };
    }
  } catch (error) {
    return {
      success: false,
      error: `CONNECTION_FAILED: ${(error as Error).message}`,
      httpStatus: 500,
    };
  }
}
