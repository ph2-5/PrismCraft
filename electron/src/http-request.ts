import http from "http";
import https from "https";
import { getLogger } from "./logging/logger";
import { ApiClientError, validateUrlForRequest } from "./api-gateway-utils";

const logger = getLogger("http-request");

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

/**
 * 使用 resolvedIp 构造直连 URL，防止 DNS Rebinding TOCTOU 攻击。
 *
 * 攻击场景：ssrfGuard.validate 解析 DNS 得到公网 IP（通过校验），
 * 但后续 http.request 再次 DNS 解析时，攻击者控制权威 DNS 返回内网 IP，
 * 从而访问云元数据端点等内部服务。
 *
 * 防护：用校验时的 resolvedIp 替换 URL 的 hostname，确保 TCP 连接使用校验过的 IP。
 * - Host header 设为原 hostname，确保虚拟主机正确响应
 * - HTTPS 通过 servername 保留原 hostname 用于 TLS SNI 和证书验证
 * - IPv6 地址用方括号包裹
 *
 * @returns { url: string | URL, headers, extraOptions } 用于 http.request
 */
function buildRequestWithResolvedIp(
  originalUrl: string,
  resolvedIp: string | undefined,
  options: HttpRequestOptions,
): { url: string | URL; headers: Record<string, string>; servername?: string } {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };

  if (!resolvedIp) {
    return { url: originalUrl, headers };
  }

  try {
    const parsed = new URL(originalUrl);
    const originalHost = parsed.host;
    const originalHostname = parsed.hostname;
    const isHttps = parsed.protocol === "https:";

    // IPv6 地址需要用方括号包裹
    const ipHost = resolvedIp.includes(":") ? `[${resolvedIp}]` : resolvedIp;

    // 用 IP 替换 hostname，确保 TCP 连接使用校验过的 IP
    parsed.host = parsed.port ? `${ipHost}:${parsed.port}` : ipHost;

    // 设置 Host header 为原 hostname，确保服务器正确响应虚拟主机
    headers["Host"] = originalHost;

    const result: { url: string | URL; headers: Record<string, string>; servername?: string } = {
      url: parsed,
      headers,
    };

    // HTTPS 需要设置 servername 用于 TLS SNI 和证书验证
    if (isHttps) {
      result.servername = originalHostname;
    }

    return result;
  } catch {
    // URL 解析失败，回退到原始 URL（仍有 SSRF 校验）
    return { url: originalUrl, headers };
  }
}

export async function makeRequest(
  url: string,
  options: HttpRequestOptions,
): Promise<unknown> {
  const DEFAULT_TIMEOUT = 120000;
  // SSRF 校验 + 获取 resolvedIp 用于 DNS Rebinding TOCTOU 防护
  const ssrfResult = await validateUrlForRequest(url);
  if (!ssrfResult.safe) {
    throw new Error(`Cannot access private/internal URLs: ${ssrfResult.reason ?? "blocked"}`);
  }

  // 使用 resolvedIp 直连，防止校验后 DNS 解析结果变化
  const { url: requestUrl, headers, servername } = buildRequestWithResolvedIp(url, ssrfResult.resolvedIp, options);
  const requestOptions: HttpRequestOptions & { servername?: string } = { ...options, headers };
  if (servername) {
    requestOptions.servername = servername;
  }

  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.request(requestUrl, requestOptions, (res) => {
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
            reject(new ApiClientError(`HTTP ${statusCode}: ${data}`, statusCode));
          }
          return;
        }
        if (statusCode >= 200 && statusCode < 300) {
          resolve(parsed);
        } else {
          const error = new ApiClientError(
            (parsed as Record<string, unknown>)?.error
              ? String(((parsed as Record<string, unknown>).error as Record<string, unknown>)?.message || `HTTP ${statusCode}`)
              : `HTTP ${statusCode}`,
            statusCode,
          );
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
  // SSRF 校验 + 获取 resolvedIp 用于 DNS Rebinding TOCTOU 防护
  const ssrfResult = await validateUrlForRequest(url);
  if (!ssrfResult.safe) {
    throw new Error(`Cannot access private/internal URLs: ${ssrfResult.reason ?? "blocked"}`);
  }

  // 使用 resolvedIp 直连，防止校验后 DNS 解析结果变化
  const { url: requestUrl, headers, servername } = buildRequestWithResolvedIp(url, ssrfResult.resolvedIp, options);
  const requestOptions: StreamingRequestOptions & { servername?: string } = { ...options, headers };
  if (servername) {
    requestOptions.servername = servername;
  }

  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.request(requestUrl, requestOptions, (res) => {
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
          reject(new ApiClientError(`HTTP ${statusCode}: ${data}`, statusCode));
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
