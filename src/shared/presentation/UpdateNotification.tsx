import { useEffect, useState } from "react";
import { Download, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import { t } from "@/shared/constants/messages";
import { isElectron } from "@/shared/utils/platform";

type UpdateState = "idle" | "available" | "downloading" | "downloaded" | "error";

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>("idle");
  const [version, setVersion] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!isElectron()) return;
    const api = window.electronAPI;
    if (!api) return;

    const unsubs: Array<() => void> = [];

    if (api.onUpdateAvailable) {
      unsubs.push(
        api.onUpdateAvailable((info) => {
          setVersion(info.version);
          setState("downloading");
        }),
      );
    }
    if (api.onUpdateDownloaded) {
      unsubs.push(
        api.onUpdateDownloaded((info) => {
          setVersion(info.version);
          setState("downloaded");
        }),
      );
    }
    if (api.onUpdateError) {
      unsubs.push(
        api.onUpdateError((message) => {
          setErrorMessage(message);
          setState("error");
        }),
      );
    }

    return () => unsubs.forEach((fn) => fn());
  }, []);

  if (state === "idle" || state === "available") return null;

  if (state === "error") {
    return (
      <div className="fixed top-16 left-0 right-0 z-50 px-4">
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--danger)",
            background: "var(--card2)",
          }}
          className="max-w-2xl mx-auto"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 mt-0.5" style={{ color: "var(--danger)" }} />
            <div className="flex-1">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {t("settings.updateError")}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>{errorMessage}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state === "downloading") {
    return (
      <div className="fixed top-16 left-0 right-0 z-50 px-4">
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--card2)",
          }}
          className="max-w-2xl mx-auto"
        >
          <div className="flex items-start gap-3">
            <Download className="h-4 w-4 mt-0.5 animate-pulse" />
            <div className="flex-1">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {version
                  ? t("settings.updateAvailable", { version })
                  : t("settings.updateDownloading")}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
                {t("settings.updateDownloading")}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // state === "downloaded"
  return (
    <div className="fixed top-16 left-0 right-0 z-50 px-4">
      <div
        style={{
          padding: 12,
          borderRadius: 8,
          border: "1px solid var(--success)",
          background: "var(--card2)",
        }}
        className="max-w-2xl mx-auto"
      >
        <div className="flex items-start gap-3">
          <CheckCircle className="h-4 w-4 mt-0.5" style={{ color: "var(--success)" }} />
          <div className="flex-1">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: "var(--success)" }}>
              {t("settings.updateDownloaded")}
            </div>
            <div className="flex items-center justify-between" style={{ fontSize: 12, color: "var(--muted-fg)" }}>
              <span>{version ? `v${version.replace(/^v/, "")}` : ""}</span>
              <button
                type="button"
                className="btn btn-primary btn-sm ml-4"
                onClick={() => {
                  void window.electronAPI?.restartApp?.();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("settings.updateRestart")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
