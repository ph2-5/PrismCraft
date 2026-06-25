import { useState, useRef } from "react";
import {
  Upload,
  Video,
  Sliders,
  Trash2,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { container } from "@/infrastructure/di";
import type { ReferenceVideoConfig } from "@/domain/schemas";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { createSimpleVideoErrorHandler } from "@/shared/utils/media-error-handler";

interface MinimalAsset {
  id: string;
  name: string;
  type: string;
  url?: string;
}

interface ReferenceVideoUploaderProps {
  referenceVideo: ReferenceVideoConfig | undefined;
  assets: MinimalAsset[];
  onUpdate: (config: ReferenceVideoConfig) => void;
  onError?: (message: string) => void;
}

const mimicryLevelLabels = {
  light: t("refVideo.lightMimicry"),
  medium: t("refVideo.mediumMimicry"),
  deep: t("refVideo.deepMimicry"),
};

const mimicryLevelDescriptions = {
  light: t("refVideo.lightMimicryDesc"),
  medium: t("refVideo.mediumMimicryDesc"),
  deep: t("refVideo.deepMimicryDesc"),
};

export function ReferenceVideoUploader({
  referenceVideo,
  assets,
  onUpdate,
  onError,
}: ReferenceVideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [assetSelectorOpen, setAssetSelectorOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = referenceVideo || {
    enabled: false,
    mimicryLevel: "medium" as const,
  };

  const uploadVideo = async (file: File): Promise<string | null> => {
    try {
      const result = await container.fileUploader.uploadFile(file);

      if (!result.success || !result.data?.url) {
        throw new Error(result.error || t("error.uploadResponseInvalid"));
      }

      return result.data.url;
    } catch (error) {
      errorLogger.error(`[ReferenceVideo] ${t("error.uploadFailed")}:`, error);
      onError?.(extractErrorMessage(error));
      return null;
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      onError?.(t("refVideo.selectVideoFile"));
      return;
    }

    const MAX_VIDEO_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_VIDEO_SIZE) {
      onError?.(t("refVideo.videoSizeLimit"));
      return;
    }

    setIsUploading(true);

    try {
      const uploadedUrl = await uploadVideo(file);
      if (!uploadedUrl) {
        setIsUploading(false);
        return;
      }

      onUpdate({
        ...config,
        enabled: true,
        videoUrl: uploadedUrl,
        name: file.name,
      });
    } catch (e) {
      errorLogger.warn("[ReferenceVideo] Failed to upload reference video", e as Error);
      onError?.(t("refVideo.uploadFailedRetry"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]!);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]!);
    }
  };

  const handleRemoveVideo = () => {
    onUpdate({
      ...config,
      enabled: false,
      videoUrl: undefined,
      name: undefined,
      duration: undefined,
    });
  };

  const toggleEnabled = (checked: boolean) => {
    onUpdate({
      ...config,
      enabled: checked,
    });
  };

  const updateMimicryLevel = (level: "light" | "medium" | "deep") => {
    onUpdate({
      ...config,
      mimicryLevel: level,
    });
  };

  const handleSelectFromAssetLibrary = (asset: MinimalAsset) => {
    onUpdate({
      ...config,
      enabled: true,
      videoUrl: asset.url,
      name: asset.name,
    });
    setAssetSelectorOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* 开关 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-purple-400" />
          <label className="text-purple-100">{t("refVideo.useRefVideo")}</label>
        </div>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => toggleEnabled(e.target.checked)}
        />
      </div>

      {config.enabled && (
        <div className="space-y-4">
          {/* 视频预览/上传区 */}
          {config.videoUrl ? (
            <div className="card bg-slate-800/50 border-purple-700/50" style={{ padding: 16 }}>
              <div>
                <div className="space-y-3">
                  {/* 视频预览 */}
                  <div className="relative aspect-video bg-slate-900/50 rounded-lg overflow-hidden">
                    <video
                      src={config.videoUrl}
                      controls
                      className="w-full h-full object-cover"
                      onError={createSimpleVideoErrorHandler()}
                    />
                  </div>

                  {/* 视频信息 */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <p className="text-purple-100 font-medium">
                        {config.name || t("refVideo.refVideoName")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm gap-1"
                      onClick={handleRemoveVideo}
                    >
                      <Trash2 className="w-4 h-4" />
                      {t("refVideo.remove")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                  isDragging
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-purple-700/50 bg-slate-800/50 hover:border-purple-500 hover:bg-purple-500/5"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
                    <p className="text-purple-100">{t("refVideo.uploading")}</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-12 h-12 mx-auto mb-4 text-purple-400" />
                    <p className="text-purple-100 mb-2">{t("refVideo.uploadRefVideo")}</p>
                    <p className="text-sm text-purple-300">
                      {t("refVideo.clickOrDrag")}
                    </p>
                  </>
                )}
              </div>

              {assets.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm w-full bg-slate-800 border-purple-700/50 text-purple-100 hover:bg-purple-900/20"
                  onClick={() => setAssetSelectorOpen(true)}
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  {t("refVideo.selectFromLibrary")}
                </button>
              )}
            </div>
          )}

          {/* 模仿级别设置 */}
          {config.videoUrl && (
            <div className="space-y-3">
              <label className="text-purple-100 flex items-center gap-2">
                <Sliders className="w-4 h-4" />
                {t("refVideo.mimicryLevel")}
              </label>
              <select
                className="select bg-slate-800/50 border-purple-700/50 text-purple-100"
                value={config.mimicryLevel}
                onChange={(e) =>
                  updateMimicryLevel(e.target.value as "light" | "medium" | "deep")
                }
              >
                {Object.entries(mimicryLevelLabels).map(([key, label]) => (
                  <option
                    key={key}
                    value={key}
                    className="text-purple-100"
                  >
                    {label}
                  </option>
                ))}
              </select>
              <p className="text-sm text-purple-300">
                {mimicryLevelDescriptions[config.mimicryLevel]}
              </p>
            </div>
          )}
        </div>
      )}

      {assetSelectorOpen && (
        <div className="modal-overlay" onClick={() => setAssetSelectorOpen(false)}>
          <div
            className="modal bg-slate-800 border-slate-700 text-white"
            style={{ maxWidth: "56rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{t("refVideo.selectFromLibrary")}</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 py-4 max-h-96 overflow-y-auto">
              {assets.filter((asset) => asset.type === "video").length > 0 ? (
                assets
                  .filter((asset) => asset.type === "video")
                  .map((asset) => (
                    <div
                      key={asset.id}
                      onClick={() => handleSelectFromAssetLibrary(asset)}
                      className="cursor-pointer group relative aspect-video rounded-lg overflow-hidden border border-slate-700 hover:border-purple-500 transition-all bg-slate-900"
                    >
                      <video
                        src={asset.url}
                        className="w-full h-full object-cover"
                        muted
                        onError={createSimpleVideoErrorHandler()}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                        <p className="text-xs text-white font-medium truncate">
                          {asset.name}
                        </p>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        <Video className="w-8 h-8 text-white" />
                      </div>
                    </div>
                  ))
              ) : (
                <div className="col-span-full text-center py-8 text-slate-400">
                  <Video className="w-12 h-12 mx-auto mb-3 text-slate-500" />
                  <p className="text-sm">{t("refVideo.noVideosInLibrary")}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t("refVideo.uploadImageOrVideoFirst")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
