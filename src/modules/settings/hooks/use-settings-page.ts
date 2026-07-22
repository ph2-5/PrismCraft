import { useState } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { container } from "@/infrastructure/di";
import { usePreference } from "@/shared/utils/preferences";

const AUTOSAVE_STORAGE_KEY = "ai-animation-autosave-settings";
/** 设置页错误日志显示上限，超过则清理 */
const SETTINGS_ERROR_LOG_LIMIT = 100;
/** 清理后保留的条数 */
const SETTINGS_ERROR_LOG_KEEP = 50;

export type SettingsTab =
  | "api"
  | "autosave"
  | "sync"
  | "embedding"
  | "prompt-templates"
  | "plugins"
  | "system";

interface AutoSaveSettingsData {
  enabled?: boolean;
  interval?: number;
}

export function useSettingsPage() {
  // ── UI 状态:当前激活的 Tab ──
  const [activeTab, setActiveTab] = useState<SettingsTab>("api");

  // ── Sync dialog ──
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const openSyncDialog = () => setSyncDialogOpen(true);
  const closeSyncDialog = () => setSyncDialogOpen(false);

  // ── AutoSave settings ──
  const { success } = useToastHelpers();
  const [settings, setSettings] = usePreference<AutoSaveSettingsData>(AUTOSAVE_STORAGE_KEY, {});
  const autoSaveEnabled = typeof settings.enabled === "boolean" ? settings.enabled : true;
  const autoSaveIntervalMinutes = typeof settings.interval === "number" && settings.interval > 0 ? settings.interval : 5;

  const persistAutoSaveSettings = (nextEnabled: boolean, nextInterval: number) => {
    try {
      setSettings({ enabled: nextEnabled, interval: nextInterval });
      success(t("success.saved"), t("success.settingsSaved"));
    } catch (e) {
      errorLogger.warn("[AutoSaveSettings] Failed to persist auto-save settings", e);
    }
  };

  const onAutoSaveEnabledChange = (val: boolean) => {
    persistAutoSaveSettings(val, autoSaveIntervalMinutes);
  };

  const onAutoSaveIntervalChange = (val: string | null) => {
    if (val == null) return;
    const num = Number(val);
    persistAutoSaveSettings(autoSaveEnabled, num);
  };

  // ── Error log handlers ──
  const clearErrorLogs = async () => {
    const logs = await container.errorLogStorage.getErrorLogs<{ timestamp: number }>();
    if (logs.length > SETTINGS_ERROR_LOG_LIMIT) {
      await container.errorLogStorage.deleteOldErrorLogs(SETTINGS_ERROR_LOG_KEEP);
    }
  };

  const loadErrorLogs = () =>
    container.errorLogStorage.getErrorLogs<{ timestamp: number; message: string; component?: string }>();

  const clearErrorLogsAll = () => container.errorLogStorage.clearErrorLogs();

  return {
    // UI 状态
    activeTab,
    setActiveTab,

    // Sync dialog
    syncDialogOpen,
    openSyncDialog,
    closeSyncDialog,

    // AutoSave settings
    autoSaveEnabled,
    autoSaveIntervalMinutes,
    onAutoSaveEnabledChange,
    onAutoSaveIntervalChange,

    // Error log handlers
    clearErrorLogs,
    loadErrorLogs,
    clearErrorLogsAll,
  };
}
