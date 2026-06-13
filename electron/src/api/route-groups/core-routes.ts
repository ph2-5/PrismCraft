import type { Route } from "../types";
import { handleConfig, handleSecureConfig } from "../../handlers/config";
import { handleTestConnection } from "../../handlers/test-connection";
import { handleSyncConfig, handleSyncTest, handleSyncProxy } from "../../handlers/sync";
import * as apiGateway from "../../api-gateway";
import {
  testConnectionSchema,
  exportSchema,
} from "../schemas";

export const coreRoutes: Record<string, Route> = {
  config: { handler: handleConfig, methods: ["GET", "POST", "HEAD"] },
  "secure-config": { handler: handleSecureConfig, methods: ["POST"] },
  upload: {
    handler: (_m, b) => apiGateway.handleUpload(b),
    methods: ["POST"],
  },
  "test-connection": {
    schema: testConnectionSchema,
    handler: handleTestConnection,
    methods: ["POST"],
  },
  "sync/config": { handler: handleSyncConfig, methods: ["GET", "POST"] },
  "sync/test": { handler: handleSyncTest, methods: ["POST"] },
  "sync/proxy": { handler: handleSyncProxy, methods: ["POST"] },
  export: {
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
  },
};
