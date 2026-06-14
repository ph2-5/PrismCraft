import http from "http";
import type net from "net";
import { getLogger } from "../logging";
import { API_SERVER_PORT, APP_SERVER_PORT, DEV_SERVER_PORT } from "../config/ports";
import { getDb, CURRENT_SCHEMA_VERSION } from "../database";
import { routes } from "./routes";
import type { ApiRequest } from "./types";
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

let apiServer: http.Server | null = null;
const API_PORT = API_SERVER_PORT;

registerAllowedOrigin(APP_SERVER_PORT);
registerAllowedOrigin(DEV_SERVER_PORT);

function startApiServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    apiServer = http.createServer(async (req, res) => {
      if (!handleCors(req, res)) return;

      const urlParts = (req.url || "").split("?");
      const pathname = (urlParts[0] ?? "").replace(/^\//, "").replace(/^api\//, "");

      if (pathname === "health") {
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
        return;
      }

      if (!checkAuthHeader(req, res)) return;

      const clientIp = req.socket.remoteAddress || "127.0.0.1";

      if (!checkRateLimit(clientIp, res)) return;

      logger.info(`[API Server] ${req.method} ${req.url} from ${clientIp}`);

      try {
        const queryString = urlParts[1] || "";

        const queryParams: Record<string, string> = {};
        if (queryString) {
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
        }

        const route = routes[pathname];

        if (!route) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
          return;
        }

        if (!route.methods.includes(req.method || "")) {
          res.writeHead(405);
          res.end(
            JSON.stringify({ error: `Method not allowed: ${req.method}` }),
          );
          return;
        }

        const chunks: Buffer[] = [];
        let bodyLength = 0;
        let bodyTooLarge = false;

        req.on("data", (chunk: Buffer) => {
          if (bodyTooLarge) return;
          bodyLength += chunk.length;
          if (bodyLength > MAX_REQUEST_BODY_SIZE) {
            bodyTooLarge = true;
            res.writeHead(413);
            res.end(
              JSON.stringify({
                success: false,
                error: "Request body too large",
              }),
            );
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });

        req.on("end", async () => {
          if (bodyTooLarge || res.writableEnded) return;
          try {
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
              const result = await route.handler(req.method || "GET", parseResult.data, req);

              const resultObj = result as Record<string, unknown>;
              const httpStatus: number =
                resultObj && typeof resultObj === "object" && resultObj.httpStatus
                  ? (resultObj.httpStatus as number)
                  : 200;
              res.writeHead(httpStatus);
              res.end(JSON.stringify(result));
            } else {
              const result = await route.handler(req.method || "GET", fullBody, req);

              const resultObj = result as Record<string, unknown>;
              const httpStatus: number =
                resultObj && typeof resultObj === "object" && resultObj.httpStatus
                  ? (resultObj.httpStatus as number)
                  : 200;
              res.writeHead(httpStatus);
              res.end(JSON.stringify(result));
            }
          } catch (error: unknown) {
            logger.error("[API] Handler error:", error instanceof Error ? error : undefined);
            res.writeHead(500);
            res.end(
              JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Internal server error",
              }),
            );
          }
        });
      } catch (error) {
        logger.error("[API] Server error:", error instanceof Error ? error : undefined);
        res.writeHead(500);
        res.end(
          JSON.stringify({
            success: false,
            error: "Internal server error",
          }),
        );
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
