import { useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
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

      if (type === "character") {
        exportData = {
          version: "1.0.0",
          type: "character" as const,
          character: item as Character,
          exportedAt: new Date().toISOString(),
        } satisfies CharacterExportData;
        filename = `${itemName || "character"}-project.json`;
      } else {
        exportData = {
          version: "1.0.0",
          type: "scene" as const,
          scene: item as Scene,
          exportedAt: new Date().toISOString(),
        } satisfies SceneExportData;
        filename = `${itemName || "scene"}-project.json`;
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
        const response = await fetch(imageUrl, { mode: "cors" }).catch(() => null);
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
        const response = await fetch(videoUrl, { mode: "cors" }).catch(() => null);
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
        card: "bg-slate-800/50 border-purple-800/50 shadow-lg shadow-purple-500/10",
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
        card: "bg-slate-800/50 border-blue-800/50 shadow-lg shadow-blue-500/10",
        header: "bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border-b border-blue-800/30",
        title: "text-blue-100",
        desc: "text-blue-300",
        imageBadge: "bg-blue-900/50 border-blue-700 text-blue-200",
        videoBadge: "bg-cyan-900/50 border-cyan-700 text-cyan-200",
        exportBtn: "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-lg shadow-blue-500/20",
        infoBorder: "border-blue-800/20",
        infoTitle: "text-blue-300",
      };

  return (
    <Card
      className={themeClasses.card}
    >
      <CardHeader
        className={themeClasses.header}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className={`${themeClasses.title} flex items-center gap-2`}>
              {type === "character" ? (
                <User className="w-5 h-5" />
              ) : (
                <Settings className="w-5 h-5" />
              )}
              {type === "character" ? t("asset.characterExportTitle") : t("asset.sceneExportTitle")}
            </CardTitle>
            <CardDescription className={themeClasses.desc}>
              {t("asset.exportTypeData", { type: type === "character" ? t("sidebar.characters") : t("sidebar.scenes") })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {hasImage && (
              <Badge
                className={themeClasses.imageBadge}
              >
                {t("asset.hasImage")}
              </Badge>
            )}
            {hasVideo && (
              <Badge
                className={themeClasses.videoBadge}
              >
                {t("asset.hasVideo")}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {/* 状态提示 */}
        {exportStatus === "success" && (
          <div
            className={`flex items-center gap-2 p-3 rounded-lg bg-emerald-900/30 border border-emerald-700/50`}
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-200">{t("asset.exportSuccess")}</span>
            <Button
              variant="ghost"
              size="sm"
              className={`ml-auto h-8 text-emerald-300 hover:text-emerald-100 hover:bg-emerald-900/30`}
              onClick={resetStatus}
            >
              {t("asset.continueButton")}
            </Button>
          </div>
        )}

        {exportStatus === "error" && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-900/30 border border-rose-700/50">
            <AlertCircle className="w-5 h-5 text-rose-400" />
            <span className="text-rose-200">{t("asset.exportFailedRetry")}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-8 text-rose-300 hover:text-rose-100 hover:bg-rose-900/30"
              onClick={resetStatus}
            >
              {t("common.retry")}
            </Button>
          </div>
        )}

        {/* 导出按钮 */}
        <div className="flex flex-wrap gap-3">
          <Button
            className={`gap-2 ${themeClasses.exportBtn}`}
            onClick={handleExportProject}
            disabled={isExporting || !item.id}
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            {t("asset.exportProjectFile")}
          </Button>

          {hasImage && (
            <Button
              variant="secondary"
              className="gap-2 bg-slate-700 hover:bg-slate-600 text-slate-100 border-0"
              onClick={handleDownloadImage}
              disabled={isExporting}
            >
              <ImageIcon className="w-4 h-4" />
              {t("asset.downloadImage")}
            </Button>
          )}

          {hasVideo && (
            <Button
              variant="secondary"
              className="gap-2 bg-slate-700 hover:bg-slate-600 text-slate-100 border-0"
              onClick={handleDownloadVideo}
              disabled={isExporting}
            >
              <Video className="w-4 h-4" />
              {t("asset.downloadVideo")}
            </Button>
          )}
        </div>

        {/* 说明 */}
        <div
          className={`p-4 rounded-lg bg-slate-900/30 border ${themeClasses.infoBorder} text-sm text-slate-400`}
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
      </CardContent>
    </Card>
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
