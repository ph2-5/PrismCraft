"use client";

import { useState, useRef } from "react";
import {
  Upload,
  Video,
  Sliders,
  Trash2,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { container } from "@/infrastructure/di";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import type { ReferenceVideoConfig } from "@/domain/schemas";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
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
  light: "轻度模仿",
  medium: "中度模仿",
  deep: "深度模仿",
};

const mimicryLevelDescriptions = {
  light: "只参考视频的大致风格和氛围",
  medium: "参考视频的构图和运镜",
  deep: "深度模仿视频的所有元素",
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
        throw new Error(result.error || "上传响应无效");
      }

      return result.data!.url;
    } catch (error) {
      errorLogger.error("[ReferenceVideo] 上传失败:", error);
      onError?.(extractErrorMessage(error));
      return null;
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      onError?.("请选择视频文件");
      return;
    }

    const MAX_VIDEO_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_VIDEO_SIZE) {
      onError?.("视频文件不能超过20MB，请压缩后上传");
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
    } catch {
      onError?.("视频上传失败，请重试");
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
      handleFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
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
          <Label className="text-purple-100">使用参考视频</Label>
        </div>
        <Switch checked={config.enabled} onCheckedChange={toggleEnabled} />
      </div>

      {config.enabled && (
        <div className="space-y-4">
          {/* 视频预览/上传区 */}
          {config.videoUrl ? (
            <Card className="bg-slate-800/50 border-purple-700/50">
              <CardContent className="p-4">
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
                        {config.name || "参考视频"}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleRemoveVideo}
                      className="gap-1"
                    >
                      <Trash2 className="w-4 h-4" />
                      移除
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
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
                    <p className="text-purple-100">正在上传...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-12 h-12 mx-auto mb-4 text-purple-400" />
                    <p className="text-purple-100 mb-2">上传参考视频</p>
                    <p className="text-sm text-purple-300">
                      点击或拖拽视频文件到此处
                    </p>
                  </>
                )}
              </div>

              {assets.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAssetSelectorOpen(true)}
                  className="w-full bg-slate-800 border-purple-700/50 text-purple-100 hover:bg-purple-900/20"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  从素材库选择视频
                </Button>
              )}
            </div>
          )}

          {/* 模仿级别设置 */}
          {config.videoUrl && (
            <div className="space-y-3">
              <Label className="text-purple-100 flex items-center gap-2">
                <Sliders className="w-4 h-4" />
                模仿级别
              </Label>
              <Select
                value={config.mimicryLevel}
                onValueChange={(v) =>
                  updateMimicryLevel(v as "light" | "medium" | "deep")
                }
              >
                <SelectTrigger className="bg-slate-800/50 border-purple-700/50 text-purple-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-purple-700/50">
                  {Object.entries(mimicryLevelLabels).map(([key, label]) => (
                    <SelectItem
                      key={key}
                      value={key}
                      className="text-purple-100"
                    >
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-purple-300">
                {mimicryLevelDescriptions[config.mimicryLevel]}
              </p>
            </div>
          )}
        </div>
      )}

      <Dialog open={assetSelectorOpen} onOpenChange={setAssetSelectorOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-4xl">
          <DialogHeader>
            <DialogTitle>从素材库选择视频</DialogTitle>
          </DialogHeader>
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
                <p className="text-sm">素材库中还没有可用的视频</p>
                <p className="text-xs text-slate-500 mt-1">
                  请先在素材库中上传视频，或者从角色列表添加图片
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
