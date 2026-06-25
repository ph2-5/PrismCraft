import { useState, useCallback, useEffect } from "react";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import {
  Settings,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import type { SyncConfig, SyncStatusInfo } from "@/modules/sync";
import type { SyncServerConfig, SyncTestResult } from "@/domain/types/sync";
import {
  initSyncEngine,
  updateSyncConfig,
  performSync,
  setConflictCallback,
} from "@/modules/sync";
import { getSyncStatus } from "@/modules/sync";
import { SyncConflictPanel } from "./SyncConflictPanel";
import type { SyncConflict } from "@/modules/sync";
import { container } from "@/infrastructure/di";
import { safeRun } from "@/shared/db-core";
import { t } from "@/shared/constants";
import { Modal } from "@/shared/presentation/Modal";
import { ServerConfigSection } from "./ServerConfigSection";
import type { ConnectionStatus } from "./ServerConfigSection";
import { SyncStatusSection } from "./SyncStatusSection";
import { ConflictResolutionSection } from "./ConflictResolutionSection";

interface SyncSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SyncSettingsPanel({ isOpen, onClose }: SyncSettingsPanelProps) {
  const [config, setConfig] = useState<SyncConfig & { server: SyncServerConfig | null }>({
    enabled: false,
    autoSync: true,
    syncInterval: 30000,
    conflictStrategy: "last-write-wins",
    endpoint: "",
    deviceId: "",
    server: null,
  });
  const [status, setStatus] = useState<SyncStatusInfo | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    pushed: number;
    pulled: number;
    conflicts: number;
  } | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [showConflictPanel, setShowConflictPanel] = useState(false);

  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const result = await container.apiClient.get<{
        success: boolean;
        config: SyncConfig & { server: SyncServerConfig & { username?: string; token?: string } | null };
      }>("sync/config");
      if (result.ok && result.value.success && result.value.config) {
        const loaded = result.value.config;
        setConfig(loaded);
        if (loaded.server) {
          setServerUrl(loaded.server.url || "");
          setUsername(loaded.server.username ?? "");
          setConnectionStatus(loaded.server.connected ? "connected" : "disconnected");
          setServerVersion(loaded.server.serverVersion || null);
        } else if (loaded.endpoint) {
          setServerUrl(loaded.endpoint);
          setConnectionStatus("disconnected");
        }
      }
    } catch (e) {
      errorLogger.warn("加载同步配置失败", e);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    const s = await getSyncStatus();
    setStatus(s);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const init = async () => {
      await loadConfig();
      if (cancelled) return;
      await refreshStatus();
    };
    init();
    return () => { cancelled = true; };
  }, [isOpen, loadConfig, refreshStatus]);

  useEffect(() => {
    setConflictCallback((newConflicts: SyncConflict[]) => {
      setConflicts((prev) => [...prev, ...newConflicts]);
      setShowConflictPanel(true);
    });
    return () => setConflictCallback(null);
  }, []);

  const handleTestConnection = async () => {
    if (!serverUrl || !username || !password) {
      setConnectionStatus("error");
      setConnectionMessage(t("sync.fillServerInfo"));
      return;
    }

    setConnectionStatus("testing");
    setConnectionMessage("");

    try {
      const result = await container.apiClient.post<SyncTestResult>("sync/test", {
        url: serverUrl,
        username,
        password,
      });

      if (result.ok && result.value.success) {
        setConnectionStatus("connected");
        setConnectionMessage(`${t("sync.connectionSuccess")}${result.value.latency ? ` (${result.value.latency}ms)` : ""}`);
        setServerVersion(result.value.serverVersion || null);
      } else {
        setConnectionStatus("error");
        setConnectionMessage(result.ok ? result.value.message || t("sync.connectionFailed") : t("error.requestFailed"));
      }
    } catch (e) {
      setConnectionStatus("error");
      setConnectionMessage(`${t("sync.connectionFailed")}: ${(e as Error).message}`);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const serverConfig: SyncServerConfig & { username?: string; token?: string } | null =
        serverUrl
          ? {
              url: serverUrl,
              connected: connectionStatus === "connected",
              lastConnectedAt:
                connectionStatus === "connected" ? Date.now() : null,
              serverVersion,
              username,
              token: password,
            }
          : null;

      const newConfig = {
        ...config,
        enabled: config.enabled,
        autoSync: config.autoSync,
        syncInterval: config.syncInterval,
        conflictStrategy: config.conflictStrategy,
        endpoint: config.endpoint,
        deviceId: config.deviceId,
        server: serverConfig,
      };

      const result = await container.apiClient.post<{ success: boolean; error?: string }>(
        "sync/config",
        { config: newConfig },
      );

      if (result.ok && result.value.success) {
        updateSyncConfig(newConfig);
        if (config.enabled) {
          await initSyncEngine(newConfig);
        }
        emitToast("success", t("success.syncConfigSaved"));
        onClose();
      } else {
        errorLogger.warn("保存同步配置失败", result.ok ? result.value.error : "请求失败");
        emitToast("error", t("error.syncConfigSaveFailed"));
      }
    } catch (e) {
      errorLogger.warn("保存同步配置失败", e);
      emitToast("error", t("error.syncConfigSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await performSync();
      setSyncResult(result);
      await refreshStatus();
    } catch (error) {
      errorLogger.warn("手动同步失败", error);
      emitToast("error", t("error.syncFailed"));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResolveConflict = async (
    conflictId: string,
    resolution: "local" | "remote" | "merge",
    mergedData?: Record<string, unknown>,
  ) => {
    const [entityType, entityId] = conflictId.split(":");
    const tableMap: Record<string, string> = {
      character: "characters",
      scene: "scenes",
      story: "stories",
      media_asset: "media_assets",
      storyboard_asset: "storyboard_assets",
      video_task: "video_tasks",
      story_version: "story_versions",
      collection: "collections",
    };
    const tableName = tableMap[entityType as keyof typeof tableMap];
    if (!tableName) return;

    const pk = tableName === "video_tasks" ? "task_id" : "id";

    try {
      const sqliteRun = safeRun;
      if (resolution === "local") {
        await sqliteRun(
          `UPDATE ${tableName} SET sync_status = 'pending' WHERE ${pk} = ?`,
          [entityId],
        );
      } else if (resolution === "remote" || resolution === "merge") {
        const data = resolution === "merge" ? mergedData : conflicts.find(
          (c) => `${c.entityType}:${c.entityId}` === conflictId,
        )?.remoteData;
        const remoteVectorClock = conflicts.find(
          (c) => `${c.entityType}:${c.entityId}` === conflictId,
        )?.remoteVectorClock;
        if (data) {
          const columns = Object.keys(data).filter((k) =>
            /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k),
          );
          const setClauses = columns.map((k) => `${k} = ?`).join(", ");
          const values = columns.map((k) => data[k]);
          await sqliteRun(
            `UPDATE ${tableName} SET ${setClauses}, vector_clock = ?, sync_status = 'synced' WHERE ${pk} = ?`,
            [...values, JSON.stringify(remoteVectorClock || {}), entityId],
          );
        }
      }

      setConflicts((prev) =>
        prev.filter((c) => `${c.entityType}:${c.entityId}` !== conflictId),
      );
    } catch (error) {
      errorLogger.warn("解决冲突失败", error);
    }
  };

  const handleResolveAll = async (resolution: "local" | "remote") => {
    for (const c of conflicts) {
      await handleResolveConflict(`${c.entityType}:${c.entityId}`, resolution);
    }
  };

  const hasServerConfig = serverUrl && username;

  const handleServerUrlChange = (url: string) => {
    setServerUrl(url);
    setConnectionStatus("disconnected");
    setConnectionMessage("");
  };

  const handleUsernameChange = (name: string) => {
    setUsername(name);
    setConnectionStatus("disconnected");
    setConnectionMessage("");
  };

  const handlePasswordChange = (pass: string) => {
    setPassword(pass);
    setConnectionStatus("disconnected");
    setConnectionMessage("");
  };

  return (
    <>
      <Modal
        open={isOpen}
        onClose={onClose}
        ariaLabel={t("sync.settingsTitle")}
        style={{ maxWidth: "32rem", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }} className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t("sync.settingsTitle")}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
            {t("sync.description")}
          </div>
        </div>

        <div className="space-y-6 py-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200">
              {t("sync.devWarning")}
            </p>
          </div>

          {/* 同步开关 */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label>{t("sync.enableSync")}</label>
              <p className="text-xs text-muted-foreground">
                {t("sync.enableSyncHint")}
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, enabled: e.target.checked }))
              }
            />
          </div>

          {/* 服务器配置 */}
          <ServerConfigSection
            serverUrl={serverUrl}
            onServerUrlChange={handleServerUrlChange}
            username={username}
            onUsernameChange={handleUsernameChange}
            password={password}
            onPasswordChange={handlePasswordChange}
            connectionStatus={connectionStatus}
            connectionMessage={connectionMessage}
            serverVersion={serverVersion}
            onTestConnection={handleTestConnection}
            enabled={config.enabled}
          />

          {/* 自动同步 */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label>{t("sync.autoSync")}</label>
              <p className="text-xs text-muted-foreground">
                {t("sync.autoSyncHint")}
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.autoSync}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, autoSync: e.target.checked }))
              }
              disabled={!config.enabled}
            />
          </div>

          {/* 同步间隔 */}
          <div className="space-y-2">
            <label>{t("sync.syncIntervalSeconds")}</label>
            <input
              className="input"
              type="number"
              min={10}
              max={3600}
              value={Math.floor(config.syncInterval / 1000)}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  syncInterval: Math.max(10, parseInt(e.target.value) || 30) * 1000,
                }))
              }
              disabled={!config.enabled || !config.autoSync}
            />
          </div>

          <ConflictResolutionSection
            conflictStrategy={config.conflictStrategy}
            onConflictStrategyChange={(strategy) => setConfig((prev) => ({ ...prev, conflictStrategy: strategy }))}
            enabled={config.enabled}
          />

          <SyncStatusSection status={status} syncResult={syncResult} />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-outline btn-sm gap-1"
            onClick={handleSyncNow}
            disabled={isSyncing || !config.enabled || !hasServerConfig}
          >
            <RefreshCw
              className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? t("sync.syncing") : t("sync.syncNow")}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? t("common.saving") : t("sync.saveSettings")}
          </button>
        </div>
      </Modal>

      <SyncConflictPanel
        conflicts={conflicts}
        isOpen={showConflictPanel}
        onClose={() => setShowConflictPanel(false)}
        onResolve={handleResolveConflict}
        onResolveAll={handleResolveAll}
      />
    </>
  );
}
