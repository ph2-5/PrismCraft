import http from "http";
import type net from "net";
import { getLogger } from "../logging";
import { extractErrorMessage } from "../logging/extract-error";
import { API_SERVER_PORT, APP_SERVER_PORT, DEV_SERVER_PORT } from "../config/ports";
import { getDb, CURRENT_SCHEMA_VERSION } from "../database";
import { routes } from "./routes";
import type { ApiRequest, Route, StreamSink } from "./types";
import {
  handleCors,
  checkAuthHeader,
  checkRateLimit,
  trackConnection,
  destroyAllConnections,
  registerAllowedOrigin,
} from "./middleware";

const logger = getLogger("api-server");
const serverStartTime = Date.now();
const MAX_REQUEST_BODY_SIZE = 50 * 1024 * 1024;
// 二进制上传路由（application/octet-stream）允许更大的 body，
// 用于支持 Seedance 2.5 30秒 4K / Kling 180秒 等大视频文件直写。
// 渲染进程的 file-http 层会在大文件场景切换到 /file/write-binary。
const MAX_BINARY_BODY_SIZE = 500 * 1024 * 1024; // 500MB
const BINARY_CONTENT_TYPE = "application/octet-stream";

let apiServer: http.Server | null = null;
const API_PORT = API_SERVER_PORT;

registerAllowedOrigin(APP_SERVER_PORT);
registerAllowedOrigin(DEV_SERVER_PORT);

/**
 * 执行流式路由（Task 1.0）。
 * 设置 SSE 响应头，创建 StreamSink 传入 handler，
 * handler 通过 sink.sendChunk 发送业务 chunk，
 * handler 返回后发送 done 事件，抛错时发送 error 事件。
 *
 * SSE 协议：
 * - chunk:  `data: {"_t":"chunk","chunk":...}\n\n`
 * - done:   `data: {"_t":"done","result":...}\n\n`
 * - error:  `data: {"_t":"error","error":"..."}\n\n`
 */
async function executeStreamRoute(
  route: Route,
  method: string,
  body: ApiRequest,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const sink: StreamSink = {
    sendChunk: (data: unknown) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ _t: "chunk", chunk: data })}\n\n`);
      }
    },
  };

  try {
    const result = await route.handler(method, body, req, sink);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ _t: "done", result })}\n\n`);
      res.end();
    }
  } catch (error: unknown) {
    logger.error("[API] Stream handler error:", error instanceof Error ? error : undefined);
    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({
          _t: "error",
          error: extractErrorMessage(error),
        })}\n\n`,
      );
      res.end();
    }
  }
}

function handleHealthEndpoint(res: http.ServerResponse): void {
  let dbStatus = "uninitialized";
  let schemaVersion: number | null = null;
  try {
    const db = getDb();
    db.pragma("schema_version");
    dbStatus = "connected";
    schemaVersion = CURRENT_SCHEMA_VERSION;
  } catch {
    logger.warn("[API] Failed to check database connection in health endpoint");
    dbStatus = "error";
  }
  res.writeHead(200);
  res.end(
    JSON.stringify({
      status: "ok",
      uptime: Math.round((Date.now() - serverStartTime) / 1000),
      timestamp: new Date().toISOString(),
      database: { status: dbStatus, schemaVersion },
    }),
  );
}

function parseQueryParams(queryString: string): Record<string, string> {
  const queryParams: Record<string, string> = {};
  if (!queryString) return queryParams;
  queryString.split("&").forEach((param) => {
    const eqIndex = param.indexOf("=");
    if (eqIndex > 0) {
      const key = param.substring(0, eqIndex);
      const value = param.substring(eqIndex + 1);
      try {
        queryParams[key] = decodeURIComponent(value || "");
      } catch {
        logger.warn("[API] Failed to decode URI component in query params", { key });
        queryParams[key] = value || "";
      }
    }
  });
  return queryParams;
}

function resolveHttpStatus(result: unknown): number {
  const resultObj = result as Record<string, unknown>;
  const isSuccess = !!(resultObj && typeof resultObj === "object" && resultObj.success !== false);
  if (resultObj && typeof resultObj === "object" && resultObj.httpStatus) {
    return resultObj.httpStatus as number;
  }
  return isSuccess ? 200 : 400;
}

function sendRouteResult(res: http.ServerResponse, result: unknown): void {
  res.writeHead(resolveHttpStatus(result));
  res.end(JSON.stringify(result));
}

async function handleBinaryBody(
  route: Route,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  chunks: Buffer[],
): Promise<void> {
  // 二进制 body：直接透传 Buffer 给 handler，不做 JSON 解析。
  // 路由通过 req 上的 __rawBuffer 读取（见 file/write-binary）。
  const rawBuffer = Buffer.concat(chunks);
  (req as http.IncomingMessage & { __rawBuffer?: Buffer }).__rawBuffer = rawBuffer;
  const result = await route.handler(req.method || "POST", {}, req);
  sendRouteResult(res, result);
}

async function handleJsonBody(
  route: Route,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  chunks: Buffer[],
  queryParams: Record<string, string>,
): Promise<void> {
  const body = Buffer.concat(chunks).toString("utf-8");
  const parsedBody = body ? JSON.parse(body) : {};
  const fullBody: ApiRequest = { ...queryParams, ...parsedBody };

  if (route.schema) {
    const parseResult = route.schema.safeParse(fullBody);
    if (!parseResult.success) {
      res.writeHead(400);
      res.end(JSON.stringify({
        success: false,
        error: "Validation error",
        details: parseResult.error.issues.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      }));
      return;
    }
    if (route.stream === true) {
      await executeStreamRoute(route, req.method || "GET", parseResult.data, req, res);
      return;
    }
    const result = await route.handler(req.method || "GET", parseResult.data, req, undefined);
    sendRouteResult(res, result);
    return;
  }

  if (route.stream === true) {
    await executeStreamRoute(route, req.method || "GET", fullBody, req, res);
    return;
  }
  const result = await route.handler(req.method || "GET", fullBody, req, undefined);
  sendRouteResult(res, result);
}

function resolveRoute(pathname: string, method: string, res: http.ServerResponse): Route | null {
  const route = routes[pathname];
  if (!route) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
    return null;
  }
  if (!route.methods.includes(method)) {
    res.writeHead(405);
    res.end(JSON.stringify({ error: `Method not allowed: ${method}` }));
    return null;
  }
  return route;
}

function collectRequestBody(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bodyLimit: number,
  onEnd: (chunks: Buffer[]) => Promise<void>,
): void {
  const chunks: Buffer[] = [];
  let bodyLength = 0;
  let bodyTooLarge = false;

  req.on("data", (chunk: Buffer) => {
    if (bodyTooLarge) return;
    bodyLength += chunk.length;
    if (bodyLength > bodyLimit) {
      bodyTooLarge = true;
      res.writeHead(413);
      res.end(JSON.stringify({ success: false, error: "Request body too large" }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", async () => {
    if (bodyTooLarge || res.writableEnded) return;
    await onEnd(chunks);
  });
}

function startApiServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    apiServer = http.createServer(async (req, res) => {
      if (!handleCors(req, res)) return;

      const urlParts = (req.url || "").split("?");
      const pathname = (urlParts[0] ?? "").replace(/^\//, "").replace(/^api\//, "");

      if (pathname === "health") {
        handleHealthEndpoint(res);
        return;
      }

      if (!checkAuthHeader(req, res)) return;

      const clientIp = req.socket.remoteAddress || "127.0.0.1";
      if (!checkRateLimit(clientIp, res)) return;

      logger.info(`[API Server] ${req.method} ${req.url} from ${clientIp}`);

      try {
        const queryString = urlParts[1] || "";
        const queryParams = parseQueryParams(queryString);
        const route = resolveRoute(pathname, req.method || "", res);
        if (!route) return;

        const contentType = (req.headers["content-type"] || "").toLowerCase();
        const isBinaryBody = contentType.includes(BINARY_CONTENT_TYPE);
        const bodyLimit = isBinaryBody ? MAX_BINARY_BODY_SIZE : MAX_REQUEST_BODY_SIZE;

        collectRequestBody(req, res, bodyLimit, async (chunks) => {
          try {
            if (isBinaryBody) {
              await handleBinaryBody(route, req, res, chunks);
              return;
            }
            await handleJsonBody(route, req, res, chunks, queryParams);
          } catch (error: unknown) {
            logger.error("[API] Handler error:", error instanceof Error ? error : undefined);
            if (!res.writableEnded) {
              res.writeHead(500);
              res.end(
                JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : "Internal server error",
                }),
              );
            }
          }
        });
      } catch (error) {
        logger.error("[API] Server error:", error instanceof Error ? error : undefined);
        if (!res.writableEnded) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: "Internal server error" }));
        }
      }
    });

    apiServer.on("connection", (socket: net.Socket) => {
      trackConnection(socket);
    });

    apiServer.listen(API_PORT, "127.0.0.1", () => {
      logger.info(`[API Server] Running on http://localhost:${API_PORT}`);
      resolve();
    });

    apiServer.on("error", reject);
  });
}

function stopApiServer(): void {
  if (apiServer) {
    logger.info("[API Server] Stopping...");
    const server = apiServer;
    apiServer = null;
    destroyAllConnections();
    server.close((err) => {
      if (err) {
        logger.error("[API Server] Error stopping:", err instanceof Error ? err : new Error(String(err)));
      } else {
        logger.info("[API Server] Stopped");
      }
    });
  }
}

export { startApiServer, stopApiServer, API_PORT, registerAllowedOrigin };
