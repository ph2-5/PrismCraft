import { useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Video,
  Settings,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { Character, Scene } from "@/domain/schemas";
import { downloadJSONFile } from "@/shared/utils/file-download";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";

interface MediaExporterProps {
  type: "character" | "scene";
  item: Character | Scene;
}

function isCharacter(item: Character | Scene): item is Character {
  return "personality" in item;
}

function isScene(item: Character | Scene): item is Scene {
  return "timeOfDay" in item;
}

// 导出项目数据
export interface CharacterExportData {
  version: string;
  type: "character";
  character: Character;
  exportedAt: string;
}

export interface SceneExportData {
  version: string;
  type: "scene";
  scene: Scene;
  exportedAt: string;
}

export function MediaExporter({ type, item }: MediaExporterProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<
    "idle" | "exporting" | "success" | "error"
  >("idle");

  const hasImage = "generatedImage" in item && item.generatedImage;
  const hasVideo = "generatedVideo" in item && item.generatedVideo;
  const itemName = "name" in item ? item.name : t("asset.unnamed");

  // 导出项目JSON
  const handleExportProject = async () => {
    setIsExporting(true);
    setExportStatus("exporting");

    try {
      let exportData;
      let filename;

      if (type === "character" && isCharacter(item)) {
        exportData = {
          version: "1.0.0",
          type: "character" as const,
          character: item,
          exportedAt: new Date().toISOString(),
        } satisfies CharacterExportData;
        filename = `${itemName || "character"}-project.json`;
      } else if (isScene(item)) {
        exportData = {
          version: "1.0.0",
          type: "scene" as const,
          scene: item,
          exportedAt: new Date().toISOString(),
        } satisfies SceneExportData;
        filename = `${itemName || "scene"}-project.json`;
      } else {
        // Defensive: should not happen for well-formed Character/Scene items
        throw new Error(`Cannot export item of type "${type}": missing required fields`);
      }

      downloadJSONFile(exportData, filename);
      setExportStatus("success");
    } catch (error) {
      errorLogger.error("导出失败:", error);
      setExportStatus("error");
    } finally {
      setIsExporting(false);
    }
  };

  // 下载图片
  const handleDownloadImage = async () => {
    if (!("generatedImage" in item) || !item.generatedImage) return;

    try {
      setIsExporting(true);

      const imageUrl = item.generatedImage;
      if (imageUrl.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = imageUrl;
        link.download = `${itemName || type}-image.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setExportStatus("success");
      } else {
        const response = await fetch(imageUrl, { mode: "cors" }).catch((e) => { errorLogger.warn("[MediaExporter] fetch image failed", e); return null; });
        if (response && response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${itemName || type}-image.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          setExportStatus("success");
        } else {
          window.open(imageUrl, "_blank");
          setExportStatus("success");
        }
      }
    } catch (error) {
      errorLogger.error("下载图片失败:", error);
      setExportStatus("error");
    } finally {
      setIsExporting(false);
    }
  };

  // 下载视频
  const handleDownloadVideo = async () => {
    if (!("generatedVideo" in item) || !item.generatedVideo) return;

    try {
      setIsExporting(true);

      const videoUrl = item.generatedVideo;
      if (videoUrl.startsWith("data:") || videoUrl.startsWith("blob:")) {
        const link = document.createElement("a");
        link.href = videoUrl;
        link.download = `${itemName || type}-video.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setExportStatus("success");
      } else {
        const response = await fetch(videoUrl, { mode: "cors" }).catch((e) => { errorLogger.warn("[MediaExporter] fetch video failed", e); return null; });
        if (response && response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${itemName || type}-video.mp4`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          setExportStatus("success");
        } else {
          window.open(videoUrl, "_blank");
          setExportStatus("success");
        }
      }
    } catch (error) {
      errorLogger.error("下载视频失败:", error);
      setExportStatus("error");
    } finally {
      setIsExporting(false);
    }
  };

  // 重置状态
  const resetStatus = () => {
    setExportStatus("idle");
  };

  const themeClasses = type === "character"
    ? {
        card: "bg-card2 border-purple-800/50 shadow-lg shadow-purple-500/10",
        header: "bg-gradient-to-r from-purple-900/30 to-violet-900/30 border-b border-purple-800/30",
        title: "text-purple-100",
        desc: "text-purple-300",
        imageBadge: "bg-purple-900/50 border-purple-700 text-purple-200",
        videoBadge: "bg-violet-900/50 border-violet-700 text-violet-200",
        exportBtn: "bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 shadow-lg shadow-purple-500/20",
        infoBorder: "border-purple-800/20",
        infoTitle: "text-purple-300",
      }
    : {
        card: "bg-card2 border-primary shadow-lg shadow-primary/10",
        header: "bg-gradient-to-r from-primary/30 to-cyan-900/30 border-b border-primary",
        title: "text-primary",
        desc: "text-primary",
        imageBadge: "bg-primary/20 border-primary text-primary",
        videoBadge: "bg-cyan-900/50 border-cyan-700 text-cyan-200",
        exportBtn: "bg-gradient-to-r from-primary to-cyan-600 hover:from-primary hover:to-cyan-500 shadow-lg shadow-primary/20",
        infoBorder: "border-primary/20",
        infoTitle: "text-primary",
      };

  return (
    <div
      className={`card ${themeClasses.card}`}
      style={{ padding: 16 }}
    >
      <div
        className={themeClasses.header}
        style={{ paddingBottom: 12 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className={`${themeClasses.title} flex items-center gap-2`} style={{ fontSize: 16, fontWeight: 600 }}>
              {type === "character" ? (
                <User className="w-5 h-5" />
              ) : (
                <Settings className="w-5 h-5" />
              )}
              {type === "character" ? t("asset.characterExportTitle") : t("asset.sceneExportTitle")}
            </div>
            <div className={themeClasses.desc} style={{ fontSize: 12 }}>
              {t("asset.exportTypeData", { type: type === "character" ? t("sidebar.characters") : t("sidebar.scenes") })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasImage && (
              <span className={`badge ${themeClasses.imageBadge}`}>
                {t("asset.hasImage")}
              </span>
            )}
            {hasVideo && (
              <span className={`badge ${themeClasses.videoBadge}`}>
                {t("asset.hasVideo")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6 pt-6">
        {/* 状态提示 */}
        {exportStatus === "success" && (
          <div
            className={`flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/50`}
          >
            <CheckCircle2 className="w-5 h-5 text-success" />
            <span className="text-success">{t("asset.exportSuccess")}</span>
            <button
              type="button"
              className={`btn btn-ghost btn-sm ml-auto h-8 text-success hover:text-success hover:bg-success/10`}
              onClick={resetStatus}
            >
              {t("asset.continueButton")}
            </button>
          </div>
        )}

        {exportStatus === "error" && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/50">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <span className="text-destructive">{t("asset.exportFailedRetry")}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm ml-auto h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={resetStatus}
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {/* 导出按钮 */}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={`btn btn-primary gap-2 ${themeClasses.exportBtn}`}
            onClick={handleExportProject}
            disabled={isExporting || !item.id}
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            {t("asset.exportProjectFile")}
          </button>

          {hasImage && (
            <button
              type="button"
              className="btn btn-outline gap-2 bg-muted hover:bg-muted text-foreground border-0"
              onClick={handleDownloadImage}
              disabled={isExporting}
            >
              <ImageIcon className="w-4 h-4" />
              {t("asset.downloadImage")}
            </button>
          )}

          {hasVideo && (
            <button
              type="button"
              className="btn btn-outline gap-2 bg-muted hover:bg-muted text-foreground border-0"
              onClick={handleDownloadVideo}
              disabled={isExporting}
            >
              <Video className="w-4 h-4" />
              {t("asset.downloadVideo")}
            </button>
          )}
        </div>

        {/* 说明 */}
        <div
          className={`p-4 rounded-lg bg-background/30 border ${themeClasses.infoBorder} text-sm text-muted-foreground`}
        >
          <p className={`font-medium ${themeClasses.infoTitle} mb-2`}>
            {t("asset.usageGuide")}
          </p>
          <ul className="space-y-1 list-disc list-inside">
            <li>
              {t("asset.projectFileDesc", { type: type === "character" ? t("sidebar.characters") : t("sidebar.scenes") })}
            </li>
            <li>
              {t("asset.mediaFileDesc")}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// 引入缺失的User图标
function User({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
