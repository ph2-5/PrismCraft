import https from "https";
import http from "http";
import { URL } from "url";
import { getLogger } from "./logging/logger";
import { ssrfGuard } from "./security/ssrf-guard/ssrf-guard";

const logger = getLogger("sync-http-client");

export interface SyncHttpRequestOptions {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface SyncHttpResponse {
  statusCode: number;
  data: unknown;
}

export async function makeSyncRequest(
  url: string,
  options: SyncHttpRequestOptions,
): Promise<SyncHttpResponse> {
  // SSRF 防护：校验 URL 不指向内网/元数据端点
  const ssrfResult = await ssrfGuard.validate(url);
  if (!ssrfResult.safe) {
    logger.warn("Sync HTTP request blocked by SSRF guard", { url, reason: ssrfResult.reason });
    throw new Error(`URL blocked by SSRF guard: ${ssrfResult.reason}`);
  }

  // DNS Rebinding TOCTOU 防护：使用 SSRF 校验时解析到的 IP 直接连接，
  // 确保实际连接的 IP 与校验的 IP 一致，避免 DNS 在校验后发生变化。
  // 对于 HTTPS，通过 servername 选项保留原 hostname 用于 TLS SNI 和证书验证。
  const requestHeaders: Record<string, string> = { ...options.headers };
  let requestUrl: string | URL = url;
  const extraOptions: { servername?: string } = {};

  if (ssrfResult.resolvedIp) {
    try {
      const parsed = new URL(url);
      const originalHost = parsed.host;
      const originalHostname = parsed.hostname;
      const isHttps = parsed.protocol === "https:";

      // IPv6 地址需要用方括号包裹
      const ipHost = ssrfResult.resolvedIp.includes(":")
        ? `[${ssrfResult.resolvedIp}]`
        : ssrfResult.resolvedIp;

      // 用 IP 替换 hostname，确保 TCP 连接使用校验过的 IP
      parsed.host = parsed.port ? `${ipHost}:${parsed.port}` : ipHost;
      requestUrl = parsed;

      // 设置 Host header 为原 hostname，确保服务器正确响应虚拟主机
      requestHeaders["Host"] = originalHost;

      // HTTPS 需要设置 servername 用于 TLS SNI 和证书验证
      if (isHttps) {
        extraOptions.servername = originalHostname;
      }
    } catch {
      // URL 解析失败，回退到原始 URL（仍有 SSRF 校验）
      requestUrl = url;
    }
  }

  return new Promise((resolve, reject) => {
    const isHttps = typeof requestUrl === "string"
      ? requestUrl.startsWith("https")
      : requestUrl.protocol === "https:";
    const client = isHttps ? https : http;
    const req = client.request(requestUrl, {
      method: options.method,
      headers: requestHeaders,
      ...extraOptions,
    }, (res) => {
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
          resolve({ statusCode: res.statusCode || 0, data: JSON.parse(data) });
        } catch {
          logger.warn("Failed to parse sync response as JSON, returning raw data");
          resolve({ statusCode: res.statusCode || 0, data });
        }
      });
    });
    req.setTimeout(options.timeout || 30000, () => {
      req.destroy(new Error("Request timeout"));
    });
    req.on("error", (err) => {
      logger.warn("Sync HTTP request failed", { error: err.message });
      reject(err);
    });
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}
