/**
 * api-gateway-av.ts
 *
 * 音频类生成函数（从 api-gateway.ts 拆分以降低文件行数）：
 *  - generateAudio：文字转语音（TTS），调用 OpenAI 兼容 /audio/speech，落盘到本地 cache
 *  - transcribeAudio：语音转文字（STT），调用 OpenAI 兼容 /audio/transcriptions（multipart）
 *
 * 业务逻辑与原 api-gateway.ts 完全一致，仅做文件拆分。
 */
import { pluginRegistry } from "./plugins";
import { API_ERROR_CODES } from "./api-gateway-error-codes";
import {
  type ApiResult,
  resolveApiConfig,
  getAuthHeaders,
  validateUrlForRequest,
} from "./api-gateway-utils";
import { getAllUserDataDirs, isPathUnderAnyRoot } from "./app-paths";

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
export async function generateAudio(body: Record<string, unknown>): Promise<ApiResult> {
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
    // SSRF 防护：校验 requestUrl 不指向内网/元数据端点（与 api-gateway.ts makeRequest 对齐）
    const ssrfCheck = await validateUrlForRequest(requestUrl);
    if (!ssrfCheck.safe) {
      return {
        success: false,
        error: `url_blocked_by_ssrf_guard`,
        httpStatus: 400,
      };
    }
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
export async function transcribeAudio(body: Record<string, unknown>): Promise<ApiResult> {
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
    // 安全修复（SSRF + 路径穿越）：
    // - http(s):// 走 validateUrlForRequest SSRF 校验 + 25MB 大小上限
    // - local:// 与裸路径走 isPathUnderAnyRoot 白名单校验（仅允许用户数据目录子树）
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    let audioBuffer: Buffer;
    let filename: string;
    const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB 上限，防止恶意大文件触发 OOM
    const allowedRoots = getAllUserDataDirs();

    if (audioUrl.startsWith("local://")) {
      const localPath = audioUrl.slice("local://".length);
      // 路径穿越防护：仅允许读取用户数据目录子树下的文件
      if (!(await isPathUnderAnyRoot(path.resolve(localPath), allowedRoots))) {
        return { success: false, error: "local_path_not_allowed", httpStatus: 400 };
      }
      const stat = await fs.stat(localPath);
      if (stat.size > MAX_AUDIO_SIZE) {
        return { success: false, error: "audio_too_large", httpStatus: 413 };
      }
      audioBuffer = await fs.readFile(localPath);
      filename = path.basename(localPath);
    } else if (audioUrl.startsWith("http://") || audioUrl.startsWith("https://")) {
      // SSRF 防护：校验 audioUrl 不指向内网/元数据端点
      const ssrfCheck = await validateUrlForRequest(audioUrl);
      if (!ssrfCheck.safe) {
        return { success: false, error: "audio_url_blocked_by_ssrf_guard", httpStatus: 400 };
      }
      const dlResponse = await fetch(audioUrl);
      if (!dlResponse.ok) {
        return { success: false, error: `download_failed: ${dlResponse.status}`, httpStatus: dlResponse.status };
      }
      const contentLength = Number(dlResponse.headers.get("content-length") || 0);
      if (contentLength > MAX_AUDIO_SIZE) {
        return { success: false, error: "audio_too_large", httpStatus: 413 };
      }
      const arrayBuffer = await dlResponse.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_AUDIO_SIZE) {
        return { success: false, error: "audio_too_large", httpStatus: 413 };
      }
      audioBuffer = Buffer.from(arrayBuffer);
      filename = audioUrl.split("/").pop() || "audio.mp3";
    } else {
      // 尝试作为本地路径（同样需路径白名单校验）
      if (!(await isPathUnderAnyRoot(path.resolve(audioUrl), allowedRoots))) {
        return { success: false, error: "local_path_not_allowed", httpStatus: 400 };
      }
      try {
        const stat = await fs.stat(audioUrl);
        if (stat.size > MAX_AUDIO_SIZE) {
          return { success: false, error: "audio_too_large", httpStatus: 413 };
        }
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

    // SSRF 防护：校验 requestUrl 不指向内网/元数据端点（与 generateAudio 对齐）
    const sttSsrfCheck = await validateUrlForRequest(requestUrl);
    if (!sttSsrfCheck.safe) {
      return {
        success: false,
        error: `url_blocked_by_ssrf_guard`,
        httpStatus: 400,
      };
    }
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
