import https from "https";
import http from "http";
import { getLogger } from "./logging/logger";

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
          resolve({ statusCode: res.statusCode || 0, data: JSON.parse(data) });
        } catch {
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
