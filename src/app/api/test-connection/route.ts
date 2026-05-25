export const dynamic = "force-static";

import { NextRequest, NextResponse } from "next/server";
import { ApiCapability, ProviderConfig } from "@/infrastructure/ai-providers/api-config/types";
import {
  getCapabilityConfigForServer,
  loadServerConfig,
} from "@/infrastructure/ai-providers/api-config/server";

function getProviderFormat(provider: ProviderConfig | null): string {
  return provider?.format || "openai";
}

const TIMEOUT = 30000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = TIMEOUT,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`请求超时（${timeout}ms）`);
    }
    throw error;
  }
}

function buildAuthHeaders(
  format: string,
  apiKey: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (format === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

function buildAuthUrl(
  baseUrl: string,
  endpoint: string,
  format: string,
  apiKey: string,
): string {
  if (format === "google") {
    return `${baseUrl}${endpoint}?key=${apiKey}`;
  }
  return `${baseUrl}${endpoint}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      capability,
      providerId,
      modelId,
      testMode = "full",
      format: bodyFormat,
    } = body;

    let baseUrl: string | undefined;
    let apiKey: string | undefined;
    let model: string | undefined;
    let effectiveFormat: string = "openai";

    if (providerId && modelId) {
      const config = await loadServerConfig();
      const provider = config.providers.find((p) => p.id === providerId);
      const foundModel = provider?.models.find((m) => m.id === modelId);
      if (provider && foundModel) {
        baseUrl = provider.baseUrl;
        apiKey = provider.apiKey;
        model = foundModel.id;
        effectiveFormat = getProviderFormat(provider);
      }
    }

    if (!apiKey) {
      const { provider, modelId: configModelId } =
        await getCapabilityConfigForServer(capability as ApiCapability);
      if (!provider || !configModelId) {
        return NextResponse.json(
          {
            success: false,
            error: "未配置 API，请在设置中配置",
          },
          { status: 400 },
        );
      }
      baseUrl = provider.baseUrl;
      apiKey = provider.apiKey;
      model = configModelId;
      effectiveFormat = getProviderFormat(provider);
    }

    if (bodyFormat && bodyFormat !== "openai") {
      effectiveFormat = bodyFormat;
    }

    if (!baseUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "未配置 API 基础 URL",
        },
        { status: 400 },
      );
    }

    switch (capability as ApiCapability) {
      case "text":
        return await testTextApi(
          baseUrl,
          apiKey,
          model || "gpt-4o",
          testMode,
          effectiveFormat,
        );
      case "image":
        if (testMode === "full") {
          return NextResponse.json({
            success: false,
            error:
              "图片API完整测试会消耗额度，请使用light模式验证Key有效性，或直接在角色/场景页面生成图片来测试",
            suggestion: "light",
          });
        }
        return await testImageApi(
          baseUrl,
          apiKey,
          model || "dall-e-3",
          testMode,
          effectiveFormat,
        );
      case "vision":
        return await testVisionApi(
          baseUrl,
          apiKey,
          model || "gpt-4o",
          testMode,
          effectiveFormat,
        );
      case "video":
        if (testMode === "full") {
          return NextResponse.json({
            success: false,
            error:
              "视频API完整测试会消耗额度并创建异步任务，请使用light模式验证Key有效性，或直接在故事页面生成视频来测试",
            suggestion: "light",
          });
        }
        return await testVideoApi(
          baseUrl,
          apiKey,
          model || "cogvideox-3",
          testMode,
          effectiveFormat,
        );
      default:
        return NextResponse.json(
          {
            success: false,
            error: "未知的功能类型",
          },
          { status: 400 },
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}

async function testTextApi(
  baseUrl: string,
  apiKey: string,
  model: string,
  testMode: string,
  format: string = "openai",
) {
  try {
    const headers = buildAuthHeaders(format, apiKey);

    if (testMode === "light") {
      const modelsUrl = buildAuthUrl(baseUrl, "/models", format, apiKey);
      const response = await fetchWithTimeout(modelsUrl, {
        method: "GET",
        headers:
          format === "google"
            ? { "Content-Type": "application/json" }
            : headers,
      });

      if (response.ok || response.status === 401) {
        return NextResponse.json({
          success: response.ok,
          message: response.ok ? "API Key 有效" : "API Key 无效",
        });
      } else {
        const error = await response.text();
        return NextResponse.json({
          success: false,
          error: `API 错误: ${response.status} - ${error}`,
        });
      }
    }

    let endpoint: string;
    let requestBody: Record<string, unknown>;

    if (format === "anthropic") {
      endpoint = buildAuthUrl(baseUrl, "/messages", format, apiKey);
      requestBody = {
        model: model || "claude-3-5-sonnet-20241022",
        max_tokens: 5,
        messages: [{ role: "user", content: "Hello" }],
      };
    } else if (format === "google") {
      endpoint = buildAuthUrl(
        baseUrl,
        `/models/${model || "gemini-pro"}:generateContent`,
        format,
        apiKey,
      );
      requestBody = {
        contents: [{ parts: [{ text: "Hello" }] }],
      };
    } else {
      endpoint = buildAuthUrl(baseUrl, "/chat/completions", format, apiKey);
      requestBody = {
        model: model || "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 5,
      };
    }

    const fetchHeaders =
      format === "google" ? { "Content-Type": "application/json" } : headers;

    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        success: true,
        message: "文本 API 测试成功",
        response: {
          model: data.model,
          usage: data.usage,
          completion:
            data.choices?.[0]?.message?.content ||
            data.content?.[0]?.text ||
            "No completion",
        },
      });
    } else if (response.status === 429) {
      return NextResponse.json({
        success: false,
        message:
          "API Key 有效但触发速率限制（429），可能额度不足或请求过于频繁",
      });
    } else {
      const error = await response.text();
      return NextResponse.json({
        success: false,
        error: `API 错误: ${response.status} - ${error}`,
      });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "连接失败: " + (error as Error).message,
    });
  }
}

async function testImageApi(
  baseUrl: string,
  apiKey: string,
  model: string,
  testMode: string,
  format: string = "openai",
) {
  try {
    if (baseUrl.includes("pollinations")) {
      return NextResponse.json({
        success: true,
        message: "Pollinations 服务可用",
      });
    }

    const headers = buildAuthHeaders(format, apiKey);

    if (testMode === "light") {
      const modelsUrl = buildAuthUrl(baseUrl, "/models", format, apiKey);
      const response = await fetchWithTimeout(modelsUrl, {
        method: "GET",
        headers:
          format === "google"
            ? { "Content-Type": "application/json" }
            : headers,
      });

      if (response.ok || response.status === 401) {
        return NextResponse.json({
          success: response.ok,
          message: response.ok ? "API Key 有效" : "API Key 无效",
        });
      } else {
        const error = await response.text();
        return NextResponse.json({
          success: false,
          error: `API 错误: ${response.status} - ${error}`,
        });
      }
    }

    const endpoint = buildAuthUrl(
      baseUrl,
      "/images/generations",
      format,
      apiKey,
    );

    let size = "1024x1024";
    if (baseUrl.includes("volces.com")) {
      size = "1920x1080";
    }

    const requestBody: Record<string, unknown> = {
      model: model || "dall-e-3",
      prompt: "A simple test",
      n: 1,
      size: size,
    };

    const fetchHeaders =
      format === "google" ? { "Content-Type": "application/json" } : headers;

    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        success: true,
        message: "图片 API 测试成功",
        response: {
          model: data.model,
          imageCount: data.data?.length || 0,
          imageUrl: data.data?.[0]?.url || "No image URL",
        },
      });
    } else if (response.status === 429) {
      return NextResponse.json({
        success: false,
        message:
          "API Key 有效但触发速率限制（429），可能额度不足或请求过于频繁",
      });
    } else {
      const error = await response.text();
      return NextResponse.json({
        success: false,
        error: `API 错误: ${response.status} - ${error}`,
      });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "连接失败: " + (error as Error).message,
    });
  }
}

async function testVisionApi(
  baseUrl: string,
  apiKey: string,
  model: string,
  testMode: string,
  format: string = "openai",
) {
  try {
    const headers = buildAuthHeaders(format, apiKey);

    if (testMode === "light") {
      const modelsUrl = buildAuthUrl(baseUrl, "/models", format, apiKey);
      const response = await fetchWithTimeout(modelsUrl, {
        method: "GET",
        headers:
          format === "google"
            ? { "Content-Type": "application/json" }
            : headers,
      });

      if (response.ok || response.status === 401) {
        return NextResponse.json({
          success: response.ok,
          message: response.ok ? "API Key 有效" : "API Key 无效",
        });
      } else {
        const error = await response.text();
        return NextResponse.json({
          success: false,
          error: `API 错误: ${response.status} - ${error}`,
        });
      }
    }

    const testBase64Image =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    let endpoint: string;
    let requestBody: Record<string, unknown>;
    const fetchHeaders =
      format === "google" ? { "Content-Type": "application/json" } : headers;

    if (format === "anthropic") {
      endpoint = buildAuthUrl(baseUrl, "/messages", format, apiKey);
      requestBody = {
        model: model || "claude-3-5-sonnet-20241022",
        max_tokens: 10,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What is in this image?" },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: testBase64Image,
                },
              },
            ],
          },
        ],
      };
    } else if (format === "google") {
      endpoint = buildAuthUrl(
        baseUrl,
        `/models/${model || "gemini-pro-vision"}:generateContent`,
        format,
        apiKey,
      );
      requestBody = {
        contents: [
          {
            parts: [
              { text: "What is in this image?" },
              {
                inline_data: {
                  mime_type: "image/png",
                  data: testBase64Image,
                },
              },
            ],
          },
        ],
      };
    } else {
      endpoint = buildAuthUrl(baseUrl, "/chat/completions", format, apiKey);
      const messageContent: Array<Record<string, unknown>> = [
        { type: "text", text: "What is in this image?" },
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${testBase64Image}`,
          },
        },
      ];

      requestBody = {
        model: model || "gpt-4o",
        messages: [
          {
            role: "user",
            content: messageContent,
          },
        ],
        max_tokens: 10,
      };
    }

    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        success: true,
        message: "视觉 API 测试成功",
        response: {
          model: data.model,
          completion:
            data.choices?.[0]?.message?.content ||
            data.content?.[0]?.text ||
            "No completion",
        },
      });
    } else if (response.status === 429) {
      return NextResponse.json({
        success: false,
        message:
          "API Key 有效但触发速率限制（429），可能额度不足或请求过于频繁",
      });
    } else {
      const error = await response.text();
      return NextResponse.json({
        success: false,
        error: `API 错误: ${response.status} - ${error}`,
      });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "连接失败: " + (error as Error).message,
    });
  }
}

async function testVideoApi(
  baseUrl: string,
  apiKey: string,
  model: string,
  testMode: string,
  format: string = "openai",
) {
  try {
    const headers = buildAuthHeaders(format, apiKey);

    if (testMode === "light") {
      const modelsUrl = buildAuthUrl(baseUrl, "/models", format, apiKey);
      const response = await fetchWithTimeout(modelsUrl, {
        method: "GET",
        headers:
          format === "google"
            ? { "Content-Type": "application/json" }
            : headers,
      });

      if (response.ok || response.status === 401) {
        return NextResponse.json({
          success: response.ok,
          message: response.ok ? "API Key 有效" : "API Key 无效",
        });
      } else {
        const error = await response.text();
        return NextResponse.json({
          success: false,
          error: `API 错误: ${response.status} - ${error}`,
        });
      }
    }

    let requestBody: Record<string, unknown>;
    let endpoint: string;
    let extraHeaders: Record<string, string> = {};

    if (baseUrl.includes("volces.com")) {
      endpoint = "/contents/generations/tasks";
      requestBody = {
        model: model || "doubao-seedance-1-0-pro-250528",
        content: [
          {
            type: "text",
            text: "A simple test video",
          },
        ],
        duration: 2,
      };
    } else if (baseUrl.includes("dashscope.aliyuncs.com")) {
      if (model?.includes("qwen")) {
        const textEndpoint = buildAuthUrl(
          baseUrl,
          "/chat/completions",
          format,
          apiKey,
        );
        const textResponse = await fetchWithTimeout(textEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: model || "qwen-max",
            messages: [{ role: "user", content: "Hello" }],
            max_tokens: 5,
          }),
        });

        if (textResponse.ok || textResponse.status === 429) {
          return NextResponse.json({
            success: textResponse.ok,
            message:
              textResponse.status === 429
                ? "API Key 有效但触发速率限制（429），可能额度不足或请求过于频繁"
                : "通义千问 API 测试成功",
          });
        } else {
          const error = await textResponse.text();
          return NextResponse.json({
            success: false,
            error: `API 错误: ${textResponse.status} - ${error}`,
          });
        }
      }

      endpoint = "/services/aigc/video-generation/video-synthesis";
      extraHeaders = {
        "X-DashScope-Async": "enable",
      };
      requestBody = {
        model: model || "pixverse/pixverse-v6-t2v",
        input: {
          prompt: "A simple test video",
        },
        parameters: {
          size: "1280*720",
          duration: 2,
          watermark: true,
        },
      };
    } else if (baseUrl.includes("klingai.com")) {
      endpoint = "/v1/videos/text2video";
      requestBody = {
        model: model || "kling-v2-master",
        prompt: "A simple test video",
        duration: 5,
        aspect_ratio: "16:9",
      };
    } else if (baseUrl.includes("bigmodel.cn")) {
      endpoint = "/videos/generations";
      requestBody = {
        model: model || "cogvideox-3",
        prompt: "A simple test video",
        duration: 2,
      };
    } else {
      endpoint = "/videos/generations";
      if (model?.includes("seedance") || model?.includes("doubao-seedance")) {
        endpoint = "/seedance/video";
      }
      requestBody = {
        model: model || "cogvideox",
        prompt: "A simple test video",
        duration: 2,
      };
    }

    const fetchUrl = buildAuthUrl(baseUrl, endpoint, format, apiKey);
    const fetchHeaders =
      format === "google"
        ? { "Content-Type": "application/json", ...extraHeaders }
        : { ...headers, ...extraHeaders };

    const response = await fetchWithTimeout(fetchUrl, {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify(requestBody),
    });

    if (response.ok || response.status === 429) {
      return NextResponse.json({
        success: response.ok,
        message:
          response.status === 429
            ? "API Key 有效但触发速率限制（429），可能额度不足或请求过于频繁"
            : "视频 API 测试成功",
      });
    } else {
      const error = await response.text();
      return NextResponse.json({
        success: false,
        error: `API 错误: ${response.status} - ${error}`,
      });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "连接失败: " + (error as Error).message,
    });
  }
}
