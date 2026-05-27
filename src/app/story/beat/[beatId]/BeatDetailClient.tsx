"use client";

import { errorLogger } from "@/shared/error-logger";
import { useState, useCallback, useRef } from "react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Progress } from "@/shared/ui/progress";
import {
  ArrowLeft,
  RotateCcw,
  Download,
  Film,
  Image,
  Video,
  Wand2,
  AlertTriangle,
  Copy,
  Link2,
  RefreshCw,
} from "lucide-react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import type { StoryBeat, Story } from "@/domain/schemas";
import type { VideoTask } from "@/modules/video";
import { container } from "@/infrastructure/di";
import { useBeatDetail } from "./use-beat-detail";

interface BeatDetailPageProps {
  story: Story;
  beat: StoryBeat;
  task?: VideoTask;
}

function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-xs font-medium mb-1 ${className}`}>{children}</div>
  );
}

function BeatDetailContent({ story, beat, task }: BeatDetailPageProps) {
  const { guardedPush } = useNavigationGuard();
  const { success, error: showError } = useToastHelpers();
  const [activeTab, setActiveTab] = useState("video");
  const [videoUrl, setVideoUrl] = useState<string | undefined>(
    beat.videoGen?.videoUrl || task?.videoUrl,
  );
  const [isRefreshingUrl, setIsRefreshingUrl] = useState(false);
  const prevPropsVideoUrlRef = useRef(beat.videoGen?.videoUrl || task?.videoUrl);

  const propsVideoUrl = beat.videoGen?.videoUrl || task?.videoUrl;
  if (prevPropsVideoUrlRef.current !== propsVideoUrl) {
    prevPropsVideoUrlRef.current = propsVideoUrl;
    setVideoUrl(propsVideoUrl);
  }

  const handleCopyPrompt = useCallback(() => {
    const prompt = beat.videoGen?.prompt || beat.generationPrompt || "";
    navigator.clipboard.writeText(prompt).then(() => {
      success("已复制", "提示词已复制到剪贴板");
    }).catch((err) => {
      errorLogger.warn("[BeatDetailClient] 复制提示词失败:", err);
      showError("复制失败", "无法复制到剪贴板");
    });
  }, [beat, success, showError]);

  const handleDownloadVideo = useCallback(() => {
    const url = videoUrl || beat.videoGen?.videoUrl || task?.videoUrl;
    if (!url) {
      showError("无法下载", "视频尚未生成完成");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `${beat.title || "分镜"}_${beat.sequence}.mp4`;
    a.click();
    success("开始下载", "视频下载已启动");
  }, [videoUrl, beat, task, success, showError]);

  const handleCopyVideoUrl = useCallback(() => {
    const url = videoUrl || beat.videoGen?.videoUrl || task?.videoUrl;
    if (!url) {
      showError("无法复制", "视频URL不存在");
      return;
    }
    navigator.clipboard.writeText(url).then(() => {
      success("已复制", "视频URL已复制到剪贴板");
    }).catch((err) => {
      errorLogger.warn("[BeatDetailClient] 复制视频URL失败", err);
      showError("复制失败", "无法复制到剪贴板");
    });
  }, [videoUrl, beat, task, success, showError]);

  const handleRefreshVideoUrl = useCallback(async () => {
    const taskId = beat.videoGen?.taskId || task?.taskId;
    if (!taskId) {
      showError("无法刷新", "任务ID不存在，无法获取视频URL");
      return;
    }
    setIsRefreshingUrl(true);
    try {
      const response = await container.videoProvider.queryVideoStatus(
        taskId,
        {
          providerId: task?.providerId,
          modelId: task?.providerModelId,
          format: task?.providerFormat,
        },
      );
      if (response.data?.videoUrl) {
        setVideoUrl(response.data.videoUrl);
        success("获取成功", "视频URL已更新");
      } else if (response.data?.status === "completed") {
        showError("获取失败", "任务已完成但未返回视频URL");
      } else {
        showError("获取失败", `任务状态: ${response.data?.status || "未知"}`);
      }
    } catch (err) {
      showError("获取失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setIsRefreshingUrl(false);
    }
  }, [beat, task, success, showError]);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "generating":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case "completed":
        return "已完成";
      case "failed":
        return "失败";
      case "generating":
        return "处理中";
      case "pending":
        return "等待中";
      default:
        return "未开始";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-purple-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => guardedPush("/story")}
                className="text-purple-200 hover:text-purple-100 hover:bg-purple-800/50"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-purple-100">
                  {beat.title || `分镜 ${beat.sequence}`}
                </h1>
                <p className="text-sm text-purple-300">
                  {story.title} · 镜头 {beat.sequence}/
                  {story.beats?.length || 0}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                className={getStatusColor(
                  beat.videoGen?.status || task?.status,
                )}
              >
                {getStatusLabel(beat.videoGen?.status || task?.status)}
              </Badge>
              {(videoUrl || beat.videoGen?.videoUrl || task?.videoUrl) && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleDownloadVideo}
                  >
                    <Download className="w-4 h-4" />
                    下载
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleCopyVideoUrl}
                  >
                    <Link2 className="w-4 h-4" />
                    复制URL
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Card className="bg-slate-800/50 border-purple-800/50 overflow-hidden">
              <CardContent className="p-0">
                {videoUrl || beat.videoGen?.videoUrl || task?.videoUrl ? (
                  <div className="relative aspect-video bg-black">
                    <video
                      src={
                        videoUrl || beat.videoGen?.videoUrl || task?.videoUrl
                      }
                      className="w-full h-full"
                      controls
                      onError={(e) => {
                        const target = e.target as HTMLVideoElement;
                        if (!target.dataset.retried && beat.videoGen?.videoUrl) {
                          target.dataset.retried = "1";
                          target.src = beat.videoGen.videoUrl;
                        }
                      }}
                    />
                  </div>
                ) : beat.framePair?.firstFrame?.imageUrl ? (
                  <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
                    <img
                      src={beat.framePair.firstFrame.imageUrl}
                      alt="首帧预览"
                      className="max-w-full max-h-full object-contain"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="text-center text-white">
                        <Film className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="text-lg font-medium">视频尚未生成</p>
                        <p className="text-sm opacity-70">首尾帧已准备就绪</p>
                      </div>
                    </div>
                  </div>
                ) : beat.keyframe?.imageUrl ? (
                  <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
                    <img
                      src={beat.keyframe.imageUrl}
                      alt="预览图"
                      className="max-w-full max-h-full object-contain"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="text-center text-white">
                        <Image className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="text-lg font-medium">预览图已生成</p>
                        <p className="text-sm opacity-70">请先生成首尾帧</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video bg-slate-900 flex items-center justify-center">
                    <div className="text-center text-slate-400">
                      <Video className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-lg font-medium">尚未开始生成</p>
                      <p className="text-sm opacity-70">请先生成预览图</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              {beat.videoGen?.status === "failed" && (
                <Button
                  variant="outline"
                  className="gap-2 flex-1"
                  onClick={() => guardedPush("/story")}
                >
                  <RotateCcw className="w-4 h-4" />
                  返回故事页重试
                </Button>
              )}
              {beat.framePair?.firstFrame?.imageUrl &&
                !videoUrl &&
                !beat.videoGen?.videoUrl && (
                  <Button
                    className="gap-2 flex-1 bg-gradient-to-r from-purple-600 to-pink-600"
                    onClick={() => guardedPush("/story")}
                  >
                    <Wand2 className="w-4 h-4" />
                    生成视频
                  </Button>
                )}
              {beat.keyframe?.imageUrl &&
                !beat.framePair?.firstFrame?.imageUrl && (
                  <Button
                    className="gap-2 flex-1 bg-gradient-to-r from-purple-600 to-pink-600"
                    onClick={() => guardedPush("/story")}
                  >
                    <Image className="w-4 h-4" />
                    生成首尾帧
                  </Button>
                )}
              {!beat.keyframe?.imageUrl && (
                <Button
                  className="gap-2 flex-1 bg-gradient-to-r from-purple-600 to-pink-600"
                  onClick={() => guardedPush("/story")}
                >
                  <Wand2 className="w-4 h-4" />
                  生成预览图
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3 bg-slate-800/50">
                <TabsTrigger value="video">视频</TabsTrigger>
                <TabsTrigger value="edit">编辑</TabsTrigger>
                <TabsTrigger value="tech">技术</TabsTrigger>
              </TabsList>

              <TabsContent value="video" className="space-y-4">
                <Card className="bg-slate-800/50 border-purple-800/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-purple-100">
                      生成状态
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">状态</span>
                      <Badge
                        className={getStatusColor(
                          beat.videoGen?.status || task?.status,
                        )}
                      >
                        {getStatusLabel(beat.videoGen?.status || task?.status)}
                      </Badge>
                    </div>
                    {beat.videoGen?.status === "generating" && (
                      <>
                        <Progress value={task?.progress || 0} className="h-2" />
                        <div className="text-xs text-right text-slate-400">
                          {task?.progress || 0}%
                        </div>
                      </>
                    )}
                    {beat.videoGen?.error && (
                      <div className="p-3 rounded-lg bg-red-900/20 border border-red-800/50">
                        <div className="flex items-center gap-2 text-red-400">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-sm font-medium">生成失败</span>
                        </div>
                        <p className="text-xs text-red-300 mt-1">
                          {beat.videoGen.error}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">任务ID</span>
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-slate-900 px-2 py-1 rounded">
                          {beat.videoGen?.taskId || task?.taskId || "未创建"}
                        </code>
                        {beat.videoGen?.taskId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                beat.videoGen!.taskId!,
                              );
                              success("已复制", "任务ID已复制");
                            }}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-800/50 border-purple-800/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-purple-100">
                      视频地址
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="p-3 rounded-lg bg-slate-900/50 border border-purple-800/30">
                      <code className="text-xs text-slate-300 break-all">
                        {videoUrl ||
                          beat.videoGen?.videoUrl ||
                          task?.videoUrl ||
                          "暂无视频URL"}
                      </code>
                    </div>
                    <div className="flex gap-2">
                      {(videoUrl ||
                        beat.videoGen?.videoUrl ||
                        task?.videoUrl) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 flex-1"
                          onClick={handleCopyVideoUrl}
                        >
                          <Copy className="w-3.5 h-3.5" />
                          复制URL
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 flex-1"
                        onClick={handleRefreshVideoUrl}
                        disabled={isRefreshingUrl}
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isRefreshingUrl ? "animate-spin" : ""}`}
                        />
                        {isRefreshingUrl ? "获取中..." : "手动获取URL"}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500">
                      如果视频已生成但URL未显示，点击"手动获取URL"按钮从服务器拉取最新状态。
                    </p>
                  </CardContent>
                </Card>

                {beat.consistencyCheck && (
                  <Card className="bg-slate-800/50 border-purple-800/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-purple-100">
                        一致性检查
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">总体评分</span>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={
                              (beat.consistencyCheck.overallScore || 0) * 100
                            }
                            className="w-20 h-2"
                          />
                          <span className="text-sm font-medium">
                            {(
                              (beat.consistencyCheck.overallScore || 0) * 100
                            ).toFixed(0)}
                            %
                          </span>
                        </div>
                      </div>
                      {beat.consistencyCheck.characterScores?.map((score) => (
                        <div key={score.elementId} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400">
                              {score.elementName}
                            </span>
                            <span className="text-xs">
                              {(score.score * 100).toFixed(0)}%
                            </span>
                          </div>
                          <Progress
                            value={score.score * 100}
                            className="h-1.5"
                          />
                        </div>
                      ))}
                      {beat.consistencyCheck.recommendation && (
                        <Badge
                          className={
                            beat.consistencyCheck.recommendation === "accept"
                              ? "bg-green-900/50 text-green-200"
                              : beat.consistencyCheck.recommendation ===
                                  "adjust"
                                ? "bg-yellow-900/50 text-yellow-200"
                                : "bg-red-900/50 text-red-200"
                          }
                        >
                          {beat.consistencyCheck.recommendation === "accept" &&
                            "通过"}
                          {beat.consistencyCheck.recommendation === "adjust" &&
                            "需调整"}
                          {beat.consistencyCheck.recommendation ===
                            "regenerate" && "建议重生成"}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="edit" className="space-y-4">
                <Card className="bg-slate-800/50 border-purple-800/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-purple-100">
                      分镜内容
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs text-slate-400">标题</Label>
                      <p className="text-sm text-slate-200">
                        {beat.title || "未命名"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-400">内容描述</Label>
                      <p className="text-sm text-slate-200 whitespace-pre-wrap">
                        {beat.content || beat.description || "无描述"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-slate-400">时长</Label>
                        <p className="text-sm text-slate-200">
                          {beat.duration} 秒
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-400">类型</Label>
                        <p className="text-sm text-slate-200">
                          {beat.type || "未设置"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {beat.camera && (
                  <Card className="bg-slate-800/50 border-purple-800/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-purple-100">
                        镜头参数
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {beat.camera.angle && (
                        <div className="flex justify-between">
                          <span className="text-xs text-slate-400">角度</span>
                          <span className="text-sm text-slate-200">
                            {beat.camera.angle}
                          </span>
                        </div>
                      )}
                      {beat.camera.movement && (
                        <div className="flex justify-between">
                          <span className="text-xs text-slate-400">运动</span>
                          <span className="text-sm text-slate-200">
                            {beat.camera.movement}
                          </span>
                        </div>
                      )}
                      {beat.shotType && (
                        <div className="flex justify-between">
                          <span className="text-xs text-slate-400">景别</span>
                          <span className="text-sm text-slate-200">
                            {beat.shotType}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {beat.elementIds && beat.elementIds.length > 0 && (
                  <Card className="bg-slate-800/50 border-purple-800/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-purple-100">
                        元素绑定
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {beat.elementIds.map((elementId) => {
                        const binding = beat.elementBindings?.[elementId];
                        return (
                          <div
                            key={elementId}
                            className="p-2 rounded-lg bg-slate-900/50 border border-purple-800/30"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-purple-200">
                                {elementId}
                              </span>
                              {binding?.role && (
                                <Badge variant="outline" className="text-xs">
                                  {binding.role}
                                </Badge>
                              )}
                            </div>
                            {binding?.action && (
                              <p className="text-xs text-slate-400 mt-1">
                                动作: {binding.action}
                              </p>
                            )}
                            {binding?.emotion && (
                              <p className="text-xs text-slate-400">
                                情绪: {binding.emotion}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="tech" className="space-y-4">
                <Card className="bg-slate-800/50 border-purple-800/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-purple-100">
                      生成参数
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs text-slate-400">提示词</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={handleCopyPrompt}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          复制
                        </Button>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-900/50 border border-purple-800/30 max-h-40 overflow-y-auto">
                        <code className="text-xs text-slate-300 whitespace-pre-wrap">
                          {beat.videoGen?.prompt ||
                            beat.generationPrompt ||
                            "未生成"}
                        </code>
                      </div>
                    </div>

                    {beat.imageGenerationPrompt && (
                      <div>
                        <Label className="text-xs text-slate-400">
                          预览图提示词
                        </Label>
                        <div className="p-3 rounded-lg bg-slate-900/50 border border-purple-800/30 max-h-32 overflow-y-auto">
                          <code className="text-xs text-slate-300 whitespace-pre-wrap">
                            {beat.imageGenerationPrompt}
                          </code>
                        </div>
                      </div>
                    )}

                    {beat.firstFramePrompt && (
                      <div>
                        <Label className="text-xs text-slate-400">
                          首帧提示词
                        </Label>
                        <div className="p-3 rounded-lg bg-slate-900/50 border border-purple-800/30 max-h-32 overflow-y-auto">
                          <code className="text-xs text-slate-300 whitespace-pre-wrap">
                            {beat.firstFramePrompt}
                          </code>
                        </div>
                      </div>
                    )}

                    {beat.lastFramePrompt && (
                      <div>
                        <Label className="text-xs text-slate-400">
                          尾帧提示词
                        </Label>
                        <div className="p-3 rounded-lg bg-slate-900/50 border border-purple-800/30 max-h-32 overflow-y-auto">
                          <code className="text-xs text-slate-300 whitespace-pre-wrap">
                            {beat.lastFramePrompt}
                          </code>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-slate-800/50 border-purple-800/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-purple-100">
                      生成历史
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-400">创建时间</span>
                      <span className="text-sm text-slate-200">
                        {beat.videoGen?.createdAt
                          ? new Date(beat.videoGen.createdAt).toLocaleString()
                          : "未创建"}
                      </span>
                    </div>
                    {task?.createdAt && (
                      <div className="flex justify-between">
                        <span className="text-xs text-slate-400">任务提交</span>
                        <span className="text-sm text-slate-200">
                          {new Date(task.createdAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {beat.keyframe?.generatedAt && (
                      <div className="flex justify-between">
                        <span className="text-xs text-slate-400">
                          预览图生成
                        </span>
                        <span className="text-sm text-slate-200">
                          {new Date(beat.keyframe.generatedAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {beat.framePair?.generatedAt && (
                      <div className="flex justify-between">
                        <span className="text-xs text-slate-400">
                          首尾帧生成
                        </span>
                        <span className="text-sm text-slate-200">
                          {new Date(
                            beat.framePair.generatedAt,
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function BeatDetailClient() {
  const { story, beat, task, loading } = useBeatDetail();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!story || !beat) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <p className="text-slate-200 text-lg">分镜未找到</p>
          <p className="text-slate-400 text-sm mt-2">
            该分镜可能已被删除或ID错误
          </p>
        </div>
      </div>
    );
  }

  return (
    <PageErrorBoundary pageName="分镜详情">
      <BeatDetailContent story={story} beat={beat} task={task} />
    </PageErrorBoundary>
  );
}
