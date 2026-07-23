import type { Route } from "../types";
import { defineRoute } from "../types";
import { extractErrorMessage } from "../../logging/extract-error";
import { handleConfig, handleSecureConfig, maskApiKey } from "../../handlers/config";
import type { AppConfig, ProviderConfig } from "../../handlers/config";
import { handleTestConnection } from "../../handlers/test-connection";
import { handleSyncConfig, handleSyncTest, handleSyncProxy } from "../../handlers/sync";
import * as apiGateway from "../../api-gateway";
import {
  testConnectionSchema,
  exportSchema,
  configGetSchema,
  configSetSchema,
  uploadSchema,
  syncTestSchema,
  syncProxySchema,
  configRouteSchema,
  secureConfigRouteSchema,
  syncConfigRouteSchema,
} from "../schemas";
import {
  validateConfigKey,
  validateConfigValue,
  getConfigValue,
  applyConfigValue,
  loadConfigAsync,
} from "../../main-common";
import { saveConfigAsync } from "../../handlers/config";
import { getLogger } from "../../logging";

const logger = getLogger("core-routes");

/** 对 config 中每个 provider 的 apiKey 做脱敏处理，防止明文 apiKey 通过 HTTP 返回前端 */
function maskConfigApiKeys(config: AppConfig): AppConfig {
  const providers: ProviderConfig[] = config.providers.map((p) => ({
    ...p,
    apiKey: p.apiKey ? maskApiKey(p.apiKey) : "",
  }));
  return { ...config, providers };
}

export const coreRoutes: Record<string, Route> = {
  config: defineRoute({ schema: configRouteSchema, handler: handleConfig, methods: ["GET", "POST", "HEAD"] }),
  "secure-config": defineRoute({ schema: secureConfigRouteSchema, handler: handleSecureConfig, methods: ["POST"] }),

  // 通用 key-value 配置存储（对齐 IPC config:get/config:set）
  "config/get": defineRoute({
    schema: configGetSchema,
    handler: async (_method, body) => {
      try {
        const { key } = body;
        if (!validateConfigKey(key)) {
          return { success: false, error: "Invalid config key" };
        }
        const config = await loadConfigAsync();
        // R-SEC1: 对 apiKey 做脱敏处理，防止明文 apiKey 通过 HTTP 返回前端。
        // 前端需要明文 apiKey 时通过 secure-config:resolve IPC 获取。
        const safeConfig = maskConfigApiKeys(config);
        const value = getConfigValue(safeConfig, key);
        return { success: true, data: { value } };
      } catch (error) {
        logger.error("[Core HTTP] config/get failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
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
        const config = await loadConfigAsync();
        applyConfigValue(config, key, value);
        // R182: 必须使用 saveConfigAsync 以确保 apiKey 通过 keyStorage 加密持久化，
        // 同步 saveConfig 仅清理明文 apiKey 不写入 keyStorage，会导致 apiKey 更新丢失。
        const saved = await saveConfigAsync(config);
        if (!saved) {
          return { success: false, error: "Failed to persist config (saveConfigAsync returned false)" };
        }
        return { success: true };
      } catch (error) {
        logger.error("[Core HTTP] config/set failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
      }
    },
    methods: ["POST"],
  }),

  upload: defineRoute({
    schema: uploadSchema,
    handler: (_m, b) => apiGateway.handleUpload(b),
    methods: ["POST"],
  }),
  "test-connection": defineRoute({
    schema: testConnectionSchema,
    handler: handleTestConnection,
    methods: ["POST"],
  }),
  "sync/config": defineRoute({ schema: syncConfigRouteSchema, handler: handleSyncConfig, methods: ["GET", "POST"] }),
  "sync/test": defineRoute({
    schema: syncTestSchema,
    handler: handleSyncTest,
    methods: ["POST"],
  }),
  "sync/proxy": defineRoute({
    schema: syncProxySchema,
    handler: handleSyncProxy,
    methods: ["POST"],
  }),
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
