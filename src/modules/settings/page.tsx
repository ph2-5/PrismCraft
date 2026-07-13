import { useEffect, useState } from "react";
import { Lightbulb, RefreshCw, Settings, Download } from "lucide-react";
import { t, APP_VERSION } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { MemoryMonitorPanel } from "@/shared/presentation/MemoryMonitorPanel";
import { ErrorLogViewer } from "@/shared/presentation/ErrorBoundary";
import { ApiConfigPanel } from "./ApiConfigPanel";
import { EmbeddingModelPanel } from "./EmbeddingModelPanel";
import { PromptTemplatePanel } from "./PromptTemplatePanel";
import { SyncSettingsPanel } from "@/modules/sync";
import { useSettingsPage, type SettingsTab } from "./hooks/use-settings-page";
import { getCacheDirectory, getDiskSpace } from "@/shared/file-http";
import { storyService } from "@/modules/story";
import { errorLogger } from "@/shared/error-logger";
import { formatBytes } from "@/shared/utils/format";
import { isElectron } from "@/shared/utils/platform";

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function AutoSaveSettings({
  enabled,
  intervalMinutes,
  onEnabledChange,
  onIntervalChange,
}: {
  enabled: boolean;
  intervalMinutes: number;
  onEnabledChange: (val: boolean) => void;
  onIntervalChange: (val: string | null) => void;
}) {
  return (
    <div className="card mb-3">
      <div className="section-label">
        <span className="dot ok"></span> {t("settings.autoSave")}
      </div>
      <div className="tip-box-sub mb-3">
        <Lightbulb className="inline-block" size={12} /> {t("settings.autoSaveHint")}
      </div>
      <div className="element-card items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold">{t("settings.enableAutoSave")}</div>
          <div className="text-[10px] text-muted-foreground">
            {t("settings.autoSaveHint")}
          </div>
        </div>
        <button
          type="button"
          className={`toggle ${enabled ? "on" : ""}`}
          onClick={() => onEnabledChange(!enabled)}
          aria-label={t("settings.enableAutoSave")}
        />
      </div>
      <div className="mt-2.5 flex items-center gap-2.5 p-2.5 bg-card2 rounded-lg">
        <span className="text-xs text-muted-foreground">{t("settings.saveInterval")}</span>
        <select
          className="select text-xs"
          value={String(intervalMinutes)}
          onChange={(e) => onIntervalChange(e.target.value)}
        >
          <option value="1">{t("settings.minutes", { count: 1 })}</option>
          <option value="3">{t("settings.minutes", { count: 3 })}</option>
          <option value="5">{t("settings.minutes", { count: 5 })}</option>
          <option value="10">{t("settings.minutes", { count: 10 })}</option>
          <option value="15">{t("settings.minutes", { count: 15 })}</option>
          <option value="30">{t("settings.minutes", { count: 30 })}</option>
        </select>
      </div>
    </div>
  );
}

function SyncSettings({ openDialog }: { openDialog: () => void }) {
  return (
    <div className="card mb-3">
      <div className="section-label">
        <span className="dot ok"></span> {t("sync.settingsTitle")}
      </div>
      <div className="tip-box-sub mb-3">
        <Lightbulb className="inline-block" size={12} /> {t("sync.description")}
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn btn-primary btn-sm" onClick={openDialog}>
          <RefreshCw className="inline-block" size={12} /> {t("sync.settingsTitle")}
        </button>
      </div>
    </div>
  );
}

function SystemInfoCard() {
  const [diskInfo, setDiskInfo] = useState<{ text: string; ok: boolean } | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [uptime, setUptime] = useState<string>("—");
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const cacheDirResult = await getCacheDirectory().catch((e) => { errorLogger.warn("[Settings] getCacheDirectory failed", e); return null; });
        const dirPath = cacheDirResult?.path ?? "";
        const [diskResult, storiesResult] = await Promise.all([
          getDiskSpace(dirPath).catch((e) => { errorLogger.warn("[Settings] getDiskSpace failed", e); return null; }),
          storyService.getAll().catch((e) => { errorLogger.warn("[Settings] storyService.getAll failed", e); return null; }),
        ]);
        if (cancelled) return;
        if (diskResult && diskResult.success && diskResult.totalBytes && diskResult.availableBytes !== undefined) {
          const used = diskResult.totalBytes - diskResult.availableBytes;
          const usedPct = (used / diskResult.totalBytes) * 100;
          setDiskInfo({
            text: `${formatBytes(used)} / ${formatBytes(diskResult.totalBytes)}`,
            ok: usedPct < 90,
          });
        } else {
          setDiskInfo({ text: "—", ok: false });
        }
        if (storiesResult?.ok && Array.isArray(storiesResult.value)) {
          setProjectCount(storiesResult.value.length);
        } else {
          setProjectCount(null);
        }
      } catch {
        if (!cancelled) {
          setDiskInfo({ text: "—", ok: false });
          setProjectCount(null);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const STORAGE_KEY = "prismcraft-start-time";
    let startTime = Number(sessionStorage.getItem(STORAGE_KEY));
    if (!startTime || Number.isNaN(startTime)) {
      startTime = Date.now();
      sessionStorage.setItem(STORAGE_KEY, String(startTime));
    }
    const update = () => setUptime(formatUptime(Date.now() - startTime));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const systemOk = diskInfo?.ok !== false;

  return (
    <div className="card">
      <div className="section-label">
        <span className={`dot ${systemOk ? "ok" : "error"}`}></span> {t("settings.systemInfo")}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="card2 p-3 rounded-lg text-center">
          <div className="text-sm font-bold">{diskInfo?.text ?? "..."}</div>
          <div className="text-[10px] text-muted-foreground">{t("settings.diskSpace")}</div>
        </div>
        <div className="card2 p-3 rounded-lg text-center">
          <div className="text-xl font-bold">{projectCount ?? "..."}</div>
          <div className="text-[10px] text-muted-foreground">{t("settings.totalProjects")}</div>
        </div>
        <div className="card2 p-3 rounded-lg text-center">
          <div className="text-xl font-bold text-success">{APP_VERSION}</div>
          <div className="text-[10px] text-muted-foreground">{t("settings.version")}</div>
          {isElectron() && window.electronAPI?.checkForUpdates && (
            <button
              type="button"
              className="btn btn-outline btn-sm mt-2 text-[11px]"
              disabled={updateChecking}
              onClick={async () => {
                setUpdateChecking(true);
                setUpdateMessage("");
                try {
                  const result = await window.electronAPI!.checkForUpdates!();
                  if (result.success && result.updateAvailable) {
                    setUpdateMessage(t("settings.updateAvailable", { version: result.version ?? "" }));
                  } else if (result.success) {
                    setUpdateMessage(t("settings.updateLatest"));
                  } else {
                    setUpdateMessage(t("settings.updateError") + (result.error ? `: ${result.error}` : ""));
                  }
                } catch {
                  setUpdateMessage(t("settings.updateError"));
                } finally {
                  setUpdateChecking(false);
                }
              }}
            >
              {updateChecking ? (
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Download className="h-3 w-3 mr-1" />
              )}
              {updateChecking ? t("settings.checkingUpdates") : t("settings.checkUpdates")}
            </button>
          )}
          {updateMessage && (
            <div className="text-[10px] text-muted-foreground mt-1.5">{updateMessage}</div>
          )}
        </div>
        <div className="card2 p-3 rounded-lg text-center">
          <div className="text-sm font-bold">{uptime}</div>
          <div className="text-[10px] text-muted-foreground">{t("settings.uptime")}</div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const {
    activeTab,
    setActiveTab,
    syncDialogOpen,
    openSyncDialog,
    closeSyncDialog,
    autoSaveEnabled,
    autoSaveIntervalMinutes,
    onAutoSaveEnabledChange,
    onAutoSaveIntervalChange,
    clearErrorLogs,
    loadErrorLogs,
    clearErrorLogsAll,
  } = useSettingsPage();

  const tabs: { id: SettingsTab; icon: string; label: string }[] = [
    { id: "api", icon: "", label: t("settings.apiConfig") },
    { id: "autosave", icon: "", label: t("settings.autoSave") },
    { id: "sync", icon: "", label: t("sync.settingsTitle") },
    { id: "embedding", icon: "", label: t("settings.embeddingModel") },
    { id: "prompt-templates", icon: "", label: t("settings.promptTemplates") },
    { id: "system", icon: "", label: t("settings.systemStatus") },
  ];

  return (
    <PageErrorBoundary pageName={t("page.settings")}>
      <div className="fade-in flex flex-col h-full">
        {/* top-tabs 标题栏 - 对齐预览页面 */}
        <div className="top-tabs justify-between">
          <span className="font-semibold text-sm"><Settings className="inline-block" size={14} /> {t("page.settings")}</span>
          <span className="text-[11px] text-muted-foreground">
            {t("settings.apiConfig")} · {t("settings.autoSave")} · {t("sync.settingsTitle")} · {t("settings.embeddingModel")} · {t("settings.promptTemplates")} · {t("settings.systemStatus")}
          </span>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-4 max-w-[800px] mx-auto w-full">
          {/* Settings Tabs - 对齐预览页面的Tab容器 */}
          <div
            role="tablist"
            aria-label={t("page.settings")}
            className="flex gap-0.5 mb-4 bg-card p-1 rounded-[10px] border border-border"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                data-active={activeTab === tab.id ? "true" : undefined}
                className={`btn btn-sm flex-1 justify-center ${activeTab === tab.id ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: API配置 */}
          {activeTab === "api" && (
            <div role="tabpanel" aria-label={t("settings.apiConfig")}>
              <div className="tip-box mb-3">
                <Lightbulb className="inline-block" size={12} /> {t("settings.apiConfigTip")}
              </div>
              <ApiConfigPanel />
            </div>
          )}

          {/* Tab: 自动保存 */}
          {activeTab === "autosave" && (
            <div role="tabpanel" aria-label={t("settings.autoSave")}>
              <AutoSaveSettings
                enabled={autoSaveEnabled}
                intervalMinutes={autoSaveIntervalMinutes}
                onEnabledChange={onAutoSaveEnabledChange}
                onIntervalChange={onAutoSaveIntervalChange}
              />
            </div>
          )}

          {/* Tab: 同步 */}
          {activeTab === "sync" && (
            <div role="tabpanel" aria-label={t("sync.settingsTitle")}>
              <SyncSettings openDialog={openSyncDialog} />
            </div>
          )}

          {/* Tab: 向量模型 */}
          {activeTab === "embedding" && (
            <div role="tabpanel" aria-label={t("settings.embeddingModel")}>
              <EmbeddingModelPanel />
            </div>
          )}

          {/* Tab: 提示词模板 */}
          {activeTab === "prompt-templates" && (
            <div role="tabpanel" aria-label={t("settings.promptTemplates")}>
              <PromptTemplatePanel />
            </div>
          )}

          {/* Tab: 系统状态 */}
          {activeTab === "system" && (
            <div role="tabpanel" aria-label={t("settings.systemStatus")} className="flex flex-col gap-3">
              <MemoryMonitorPanel clearErrorLogs={clearErrorLogs} />
              <ErrorLogViewer loadLogs={loadErrorLogs} clearLogs={clearErrorLogsAll} />
              <SystemInfoCard />
            </div>
          )}
        </div>
      </div>

      <SyncSettingsPanel isOpen={syncDialogOpen} onClose={closeSyncDialog} />
    </PageErrorBoundary>
  );
}
