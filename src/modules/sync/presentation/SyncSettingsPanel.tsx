"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";
import { Label } from "@/shared/ui/label";
import { errorLogger } from "@/shared/error-logger";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Settings,
  RefreshCw,
  Cloud,
  CloudOff,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Server,
  Unplug,
  AlertCircle,
} from "lucide-react";
import type { SyncConfig, SyncStatusInfo, ConflictStrategy } from "@/modules/sync";
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

interface SyncSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type ConnectionStatus = "disconnected" | "testing" | "connected" | "error";

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
          setUsername((loaded.server as unknown as Record<string, unknown>).username as string || "");
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
      setConnectionMessage("请填写服务器地址、用户名和密码");
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
        setConnectionMessage(`连接成功${result.value.latency ? ` (${result.value.latency}ms)` : ""}`);
        setServerVersion(result.value.serverVersion || null);
      } else {
        setConnectionStatus("error");
        setConnectionMessage(result.ok ? (result.value as unknown as Record<string, unknown>).error as string || "连接失败" : "请求失败");
      }
    } catch (e) {
      setConnectionStatus("error");
      setConnectionMessage(`连接失败: ${(e as Error).message}`);
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
        onClose();
      } else {
        errorLogger.warn("保存同步配置失败", result.ok ? result.value.error : "请求失败");
      }
    } catch (e) {
      errorLogger.warn("保存同步配置失败", e);
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
    const tableName = tableMap[entityType];
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

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              同步设置
            </DialogTitle>
            <DialogDescription>
              配置同步服务器和冲突解决策略
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-200">
                同步功能正在开发中，当前配置可能无法正常工作
              </p>
            </div>

            {/* 同步开关 */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>启用同步</Label>
                <p className="text-xs text-muted-foreground">
                  开启后将自动同步数据到服务器
                </p>
              </div>
              <Switch
                checked={config.enabled}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>

            {/* 服务器配置 */}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Server className="h-4 w-4" />
                服务器配置
              </div>

              <div className="space-y-2">
                <Label className="text-xs">服务器地址</Label>
                <Input
                  placeholder="https://sync.example.com"
                  value={serverUrl}
                  onChange={(e) => {
                    setServerUrl(e.target.value);
                    setConnectionStatus("disconnected");
                    setConnectionMessage("");
                  }}
                  disabled={!config.enabled}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">用户名</Label>
                  <Input
                    placeholder="admin"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setConnectionStatus("disconnected");
                      setConnectionMessage("");
                    }}
                    disabled={!config.enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">密码</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setConnectionStatus("disconnected");
                      setConnectionMessage("");
                    }}
                    disabled={!config.enabled}
                  />
                </div>
              </div>

              {/* 连接状态 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  {connectionStatus === "connected" && (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-green-600">{connectionMessage}</span>
                      {serverVersion && (
                        <span className="text-muted-foreground">({serverVersion})</span>
                      )}
                    </>
                  )}
                  {connectionStatus === "testing" && (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                      <span className="text-blue-500">正在测试连接...</span>
                    </>
                  )}
                  {connectionStatus === "error" && (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-red-500">{connectionMessage}</span>
                    </>
                  )}
                  {connectionStatus === "disconnected" && (
                    <>
                      <Unplug className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">未连接</span>
                    </>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={
                    !config.enabled ||
                    !serverUrl ||
                    !username ||
                    !password ||
                    connectionStatus === "testing"
                  }
                  className="h-7 text-xs"
                >
                  {connectionStatus === "testing" ? "测试中..." : "测试连接"}
                </Button>
              </div>
            </div>

            {/* 自动同步 */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>自动同步</Label>
                <p className="text-xs text-muted-foreground">
                  定时自动执行同步
                </p>
              </div>
              <Switch
                checked={config.autoSync}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({ ...prev, autoSync: checked }))
                }
                disabled={!config.enabled}
              />
            </div>

            {/* 同步间隔 */}
            <div className="space-y-2">
              <Label>同步间隔（秒）</Label>
              <Input
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

            {/* 冲突策略 */}
            <div className="space-y-2">
              <Label>冲突解决策略</Label>
              <Select
                value={config.conflictStrategy}
                onValueChange={(value) =>
                  setConfig((prev) => ({ ...prev, conflictStrategy: value as ConflictStrategy }))
                }
                disabled={!config.enabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last-write-wins">最后写入优先</SelectItem>
                  <SelectItem value="local-wins">本地优先</SelectItem>
                  <SelectItem value="remote-wins">远程优先</SelectItem>
                  <SelectItem value="manual">手动解决</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {config.conflictStrategy === "last-write-wins" &&
                  "根据时间戳自动选择最新版本"}
                {config.conflictStrategy === "local-wins" &&
                  "发生冲突时始终保留本地版本"}
                {config.conflictStrategy === "remote-wins" &&
                  "发生冲突时始终使用远程版本"}
                {config.conflictStrategy === "manual" &&
                  "发生冲突时弹出面板供手动选择"}
              </p>
            </div>

            {/* 同步状态 */}
            {status && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {status.conflicts > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  ) : status.pendingChanges > 0 ? (
                    <Cloud className="h-4 w-4 text-blue-500" />
                  ) : status.lastSyncAt ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <CloudOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>同步状态</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    上次同步:{" "}
                    {status.lastSyncAt
                      ? new Date(status.lastSyncAt).toLocaleString("zh-CN")
                      : "尚未同步"}
                  </p>
                  <p>待同步: {status.pendingChanges} 项</p>
                  <p>冲突: {status.conflicts} 项</p>
                </div>
              </div>
            )}

            {/* 同步结果 */}
            {syncResult && (
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <p>推送: {syncResult.pushed} 项</p>
                <p>拉取: {syncResult.pulled} 项</p>
                <p>冲突: {syncResult.conflicts} 项</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleSyncNow}
              disabled={isSyncing || !config.enabled || !hasServerConfig}
              className="gap-1"
            >
              <RefreshCw
                className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
              />
              {isSyncing ? "同步中..." : "立即同步"}
            </Button>
            <Button variant="default" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存设置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
