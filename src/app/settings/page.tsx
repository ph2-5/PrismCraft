import { useEffect, useState } from "react";
import { t, APP_VERSION } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { ProjectExportImport } from "@/modules/asset";
import { MemoryMonitorPanel } from "@/shared/presentation/MemoryMonitorPanel";
import { ErrorLogViewer } from "@/shared/presentation/ErrorBoundary";
import { ApiConfigPanel } from "./ApiConfigPanel";
import { SyncSettingsPanel } from "@/modules/sync";
import { useSettingsPage, type SettingsTab } from "./hooks/useSettingsPage";
import { getCacheDirectory, getDiskSpace } from "@/shared/file-http";
import { storyService } from "@/modules/story";
import { errorLogger } from "@/shared/error-logger";
import { formatBytes } from "@/shared/utils/format";

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
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div className="section-label">
        <span className="dot ok"></span> {t("settings.autoSave")}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--muted-fg)",
          marginBottom: 12,
          padding: 8,
          background: "var(--card2)",
          borderRadius: 6,
        }}
      >
        💡 {t("settings.autoSaveHint")}
      </div>
      <div
        className="element-card"
        style={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{t("settings.enableAutoSave")}</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
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
      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: 10,
          background: "var(--card2)",
          borderRadius: 8,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>{t("settings.saveInterval")}</span>
        <select
          className="select"
          style={{ fontSize: 12 }}
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
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div className="section-label">
        <span className="dot ok"></span> {t("sync.settingsTitle")}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--muted-fg)",
          marginBottom: 12,
          padding: 8,
          background: "var(--card2)",
          borderRadius: 6,
        }}
      >
        💡 {t("sync.description")}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={openDialog}>
          🔄 {t("sync.settingsTitle")}
        </button>
      </div>
    </div>
  );
}

function SystemInfoCard() {
  const [diskInfo, setDiskInfo] = useState<{ text: string; ok: boolean } | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [uptime, setUptime] = useState<string>("—");

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
    <div className="card" style={{ padding: 16 }}>
      <div className="section-label">
        <span className={`dot ${systemOk ? "ok" : "error"}`}></span> {t("settings.systemInfo")}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginTop: 8,
        }}
      >
        <div className="card2" style={{ padding: 12, borderRadius: 8, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{diskInfo?.text ?? "..."}</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{t("settings.diskSpace")}</div>
        </div>
        <div className="card2" style={{ padding: 12, borderRadius: 8, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{projectCount ?? "..."}</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{t("settings.totalProjects")}</div>
        </div>
        <div className="card2" style={{ padding: 12, borderRadius: 8, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--success)" }}>{APP_VERSION}</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{t("settings.version")}</div>
        </div>
        <div className="card2" style={{ padding: 12, borderRadius: 8, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{uptime}</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{t("settings.uptime")}</div>
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
    { id: "api", icon: "🔑", label: t("settings.apiConfig") },
    { id: "autosave", icon: "💾", label: t("settings.autoSave") },
    { id: "sync", icon: "🔄", label: t("sync.settingsTitle") },
    { id: "project", icon: "📦", label: t("settings.projectPack") },
    { id: "system", icon: "📊", label: t("settings.systemStatus") },
  ];

  return (
    <PageErrorBoundary pageName={t("page.settings")}>
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* top-tabs 标题栏 - 对齐预览页面 */}
        <div className="top-tabs" style={{ justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>⚙ {t("page.settings")}</span>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {t("settings.apiConfig")} · {t("settings.autoSave")} · {t("sync.settingsTitle")} · {t("settings.projectPack")} · {t("settings.systemStatus")}
          </span>
        </div>

        {/* 内容区 */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            maxWidth: 800,
            margin: "0 auto",
            width: "100%",
          }}
        >
          {/* Settings Tabs - 对齐预览页面的Tab容器 */}
          <div
            style={{
              display: "flex",
              gap: 2,
              marginBottom: 16,
              background: "var(--card)",
              padding: 4,
              borderRadius: 10,
              border: "1px solid var(--border)",
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`btn btn-sm ${activeTab === tab.id ? "btn-primary" : "btn-ghost"}`}
                style={{
                  flex: 1,
                  justifyContent: "center",
                }}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: API配置 */}
          {activeTab === "api" && (
            <>
              <div
                style={{
                  padding: 12,
                  background: "rgba(99, 102, 241, 0.08)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  borderRadius: 8,
                  marginBottom: 12,
                  fontSize: 11,
                  color: "var(--muted-fg)",
                }}
              >
                💡 {t("settings.apiConfigTip")}
              </div>
              <ApiConfigPanel />
            </>
          )}

          {/* Tab: 自动保存 */}
          {activeTab === "autosave" && (
            <AutoSaveSettings
              enabled={autoSaveEnabled}
              intervalMinutes={autoSaveIntervalMinutes}
              onEnabledChange={onAutoSaveEnabledChange}
              onIntervalChange={onAutoSaveIntervalChange}
            />
          )}

          {/* Tab: 同步 */}
          {activeTab === "sync" && <SyncSettings openDialog={openSyncDialog} />}

          {/* Tab: 项目包 */}
          {activeTab === "project" && <ProjectExportImport />}

          {/* Tab: 系统状态 */}
          {activeTab === "system" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
