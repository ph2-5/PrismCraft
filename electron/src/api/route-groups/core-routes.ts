import type { Route } from "../types";
import { defineRoute } from "../types";
import { handleConfig, handleSecureConfig } from "../../handlers/config";
import { handleTestConnection } from "../../handlers/test-connection";
import { handleSyncConfig, handleSyncTest, handleSyncProxy } from "../../handlers/sync";
import * as apiGateway from "../../api-gateway";
import {
  testConnectionSchema,
  exportSchema,
  configGetSchema,
  configSetSchema,
} from "../schemas";
import {
  validateConfigKey,
  validateConfigValue,
  getConfigValue,
  applyConfigValue,
  loadConfig,
  saveConfig,
} from "../../main-common";
import { getLogger } from "../../logging";

const logger = getLogger("core-routes");

export const coreRoutes: Record<string, Route> = {
  config: defineRoute({ handler: handleConfig, methods: ["GET", "POST", "HEAD"] }),
  "secure-config": defineRoute({ handler: handleSecureConfig, methods: ["POST"] }),

  // 通用 key-value 配置存储（对齐 IPC config:get/config:set）
  "config/get": defineRoute({
    schema: configGetSchema,
    handler: async (_method, body) => {
      try {
        const { key } = body;
        if (!validateConfigKey(key)) {
          return { success: false, error: "Invalid config key" };
        }
        const config = loadConfig();
        const value = getConfigValue(config, key);
        return { success: true, data: { value } };
      } catch (error) {
        logger.error("[Core HTTP] config/get failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),

  "config/set": defineRoute({
    schema: configSetSchema,
    handler: async (_method, body) => {
      try {
        const { key, value } = body;
        if (!validateConfigKey(key)) {
          return { success: false, error: "Invalid config key" };
        }
        if (!validateConfigValue(value)) {
          return { success: false, error: "Invalid config value" };
        }
        const config = loadConfig();
        applyConfigValue(config, key, value);
        saveConfig(config);
        return { success: true };
      } catch (error) {
        logger.error("[Core HTTP] config/set failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),

  upload: defineRoute({
    handler: (_m, b) => apiGateway.handleUpload(b),
    methods: ["POST"],
  }),
  "test-connection": defineRoute({
    schema: testConnectionSchema,
    handler: handleTestConnection,
    methods: ["POST"],
  }),
  "sync/config": defineRoute({ handler: handleSyncConfig, methods: ["GET", "POST"] }),
  "sync/test": defineRoute({ handler: handleSyncTest, methods: ["POST"] }),
  "sync/proxy": defineRoute({ handler: handleSyncProxy, methods: ["POST"] }),
  export: defineRoute({
    schema: exportSchema,
    handler: async (_m, b) => {
      const { data, format } = b;
      if (!data) {
        return { success: false, error: "No data provided" };
      }
      const content =
        typeof data === "string" ? data : JSON.stringify(data, null, 2);
      const filename = `ai-animation-export-${crypto.randomUUID()}.${format || "json"}`;
      return { success: true, data: { content, filename } };
    },
    methods: ["POST"],
  }),
};
