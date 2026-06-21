import { loadConfigAsync, saveConfigAsync } from "./config";
import { keyStorage } from "../security/key-storage/key-storage";
import { makeSyncRequest } from "../sync-http-client";
import { getLogger } from "../logging/logger";

const logger = getLogger("sync-handler");

const SYNC_CREDENTIALS_KEY = "sync_credentials";

const DEFAULT_SYNC_CONFIG = {
  enabled: false,
  autoSync: true,
  syncInterval: 30000,
  conflictStrategy: "last-write-wins",
  endpoint: "",
  deviceId: "",
  server: null,
};

async function handleSyncConfig(
  method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    if (method === "GET") {
      return await getSyncConfig();
    }
    if (method === "POST") {
      return await saveSyncConfig(body);
    }
    return { success: false, error: `Method not allowed: ${method}` };
  } catch (error) {
    logger.error("handleSyncConfig failed", error instanceof Error ? error : undefined);
    return { success: false, error: (error as Error).message };
  }
}

async function getSyncConfig(): Promise<Record<string, unknown>> {
  const config = await loadConfigAsync();
  const plainConfig = (config.sync as Record<string, unknown>) || {};

  const mergedConfig: Record<string, unknown> = { ...DEFAULT_SYNC_CONFIG, ...plainConfig };

  if (!mergedConfig.server && mergedConfig.endpoint) {
    mergedConfig.server = {
      url: mergedConfig.endpoint,
      connected: false,
      lastConnectedAt: null,
      serverVersion: null,
    };
  }

  let credentials = { username: "", token: "" };
  if (mergedConfig.server) {
    const credResult = await keyStorage.load(SYNC_CREDENTIALS_KEY);
    if (credResult.ok && credResult.value) {
      try {
        const parsed = JSON.parse(credResult.value);
        credentials = { username: parsed.username || "", token: parsed.token || "" };
      } catch {
        logger.warn("Failed to parse sync credentials, using empty defaults");
        credentials = { username: "", token: "" };
      }
    }
  }

  const resultConfig: Record<string, unknown> = { ...mergedConfig };
  if (resultConfig.server) {
    resultConfig.server = {
      ...(resultConfig.server as Record<string, unknown>),
      username: credentials.username,
      token: credentials.token ? "***" : "",
    };
  }

  return { success: true, config: resultConfig };
}

async function saveSyncConfig(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const newConfig = body.config as Record<string, unknown>;
  if (!newConfig) {
    return { success: false, error: "Missing config" };
  }

  const currentConfig = await loadConfigAsync();

  const server = newConfig.server as Record<string, unknown> | null;
  let plainServer: Record<string, unknown> | null = null;

  if (server) {
    const { username, token, ...rest } = server;
    plainServer = rest;

    await keyStorage.save(
      SYNC_CREDENTIALS_KEY,
      JSON.stringify({ username: username || "", token: token || "" }),
    );
  } else {
    await keyStorage.delete(SYNC_CREDENTIALS_KEY);
  }

  const configToSave = {
    ...currentConfig,
    sync: {
      ...newConfig,
      server: plainServer,
    },
  };

  const saved = await saveConfigAsync(configToSave);
  if (!saved) {
    return { success: false, error: "Failed to save config" };
  }

  return { success: true };
}

async function handleSyncTest(
  _method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = body.url as string | undefined;
  const username = body.username as string | undefined;
  const password = body.password as string | undefined;

  if (!url) {
    return { success: false, error: "Missing url" };
  }
  if (!username || !password) {
    return { success: false, error: "Missing username or password" };
  }

  try {
    const startTime = Date.now();
    const response = await makeSyncRequest(`${url}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      timeout: 15000,
    });
    const latency = Date.now() - startTime;

    if (response.statusCode === 200) {
      const data = response.data as Record<string, unknown>;
      // 不返回 token 到前端：token 是同步服务器长期凭据，应由主进程保存
      // 前端只需知道连接是否成功及服务器版本
      return {
        success: true,
        message: "CONNECTION_SUCCESS",
        serverVersion: data.version as string | undefined,
        latency,
      };
    }

    if (response.statusCode === 401) {
      return { success: false, error: "AUTH_FAILED_INVALID_CREDENTIALS" };
    }

    return {
      success: false,
      error: `CONNECTION_FAILED: HTTP ${response.statusCode}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `CONNECTION_FAILED: ${(error as Error).message}`,
    };
  }
}

async function handleSyncProxy(
  _method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const action = body.action as string | undefined;

  if (!action) {
    return { success: false, error: "Missing action" };
  }
  if (action !== "push" && action !== "pull") {
    return { success: false, error: `Invalid action: ${action}` };
  }

  const config = await loadConfigAsync();
  const syncConfig = (config.sync as Record<string, unknown>) || {};
  const server = syncConfig.server as Record<string, unknown> | null;

  if (!server?.url) {
    return { success: false, error: "Sync server not configured" };
  }

  const serverUrl = server.url as string;

  const credResult = await keyStorage.load(SYNC_CREDENTIALS_KEY);
  if (!credResult.ok || !credResult.value) {
    return { success: false, error: "Sync credentials not found" };
  }

  let credentials: { username: string; token: string };
  try {
    credentials = JSON.parse(credResult.value);
  } catch {
    logger.warn("Failed to parse sync credentials for proxy");
    return { success: false, error: "Invalid sync credentials" };
  }

  if (!credentials.token) {
    return { success: false, error: "Sync token not available" };
  }

  try {
    const endpoint = action === "push" ? "/sync/push" : "/sync/pull";
    const method = action === "push" ? "POST" : "GET";

    let requestUrl = `${serverUrl}${endpoint}`;
    let requestBody: string | undefined;

    if (action === "push") {
      requestBody = JSON.stringify({
        deviceId: body.deviceId,
        changes: body.changes,
      });
    } else {
      const params = new URLSearchParams();
      if (body.deviceId) params.set("deviceId", body.deviceId as string);
      if (body.since) params.set("since", String(body.since));
      if (body.page) params.set("page", String(body.page));
      const qs = params.toString();
      if (qs) requestUrl += `?${qs}`;
    }

    const response = await makeSyncRequest(requestUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Token": credentials.token,
      },
      body: requestBody,
      timeout: 60000,
    });

    if (response.statusCode === 200) {
      return { success: true, data: response.data };
    }

    if (response.statusCode === 401) {
      return { success: false, error: "Authentication failed" };
    }

    return {
      success: false,
      error: `Proxy request failed: HTTP ${response.statusCode}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Proxy request failed: ${(error as Error).message}`,
    };
  }
}

export { handleSyncConfig, handleSyncTest, handleSyncProxy };
