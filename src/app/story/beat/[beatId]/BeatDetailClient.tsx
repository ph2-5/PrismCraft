import { errorLogger } from "@/shared/error-logger";
import { useState, useCallback, useRef, useEffect } from "react";
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
import { t } from "@/shared/constants";
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
  const [elementNames, setElementNames] = useState<Record<string, string>>({});

  const propsVideoUrl = beat.videoGen?.videoUrl || task?.videoUrl;
  if (prevPropsVideoUrlRef.current !== propsVideoUrl) {
    prevPropsVideoUrlRef.current = propsVideoUrl;
    setVideoUrl(propsVideoUrl);
  }

  useEffect(() => {
    if (!beat.elementIds || beat.elementIds.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const mgr = await container.elementManager;
        const names: Record<string, string> = {};
        await Promise.all(
          beat.elementIds.map(async (id) => {
            const el = await mgr.getElement(id);
            if (el) names[id] = el.name;
          }),
        );
        if (!cancelled) setElementNames(names);
      } catch (err) {
        errorLogger.warn("[BeatDetailClient] 加载元素名称失败", err instanceof Error ? err : undefined);
      }
    })();
    return () => { cancelled = true; };
  }, [beat.elementIds]);

  const handleCopyPrompt = useCallback(() => {
    const prompt = beat.videoGen?.prompt || beat.generationPrompt || "";
    navigator.clipboard.writeText(prompt).then(() => {
      success(t("success.copied"), t("success.promptCopied"));
    }).catch((err) => {
      errorLogger.warn("[BeatDetailClient] 复制提示词失败:", err);
      showError(t("error.copyFailed"), t("error.clipboardUnavailable"));
    });
  }, [beat, success, showError]);

  const handleDownloadVideo = useCallback(async () => {
    const url = videoUrl || beat.videoGen?.videoUrl || task?.videoUrl;
    if (!url) {
      showError(t("error.cannotDownload"), t("error.videoNotReady"));
      return;
    }
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${beat.title || t("beat.downloadVideo")}_${beat.sequence}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      success(t("success.downloadStarted"), t("success.videoDownloadStarted"));
    } catch (err) {
      errorLogger.warn("[BeatDetailClient] 视频下载失败:", err instanceof Error ? err : undefined);
      showError(t("error.downloadFailed"), t("error.videoDownloadFallback"));
    }
  }, [videoUrl, beat, task, success, showError]);

  const handleCopyVideoUrl = useCallback(() => {
    const url = videoUrl || beat.videoGen?.videoUrl || task?.videoUrl;
    if (!url) {
      showError(t("error.cannotCopy"), t("error.videoUrlNotFound"));
      return;
    }
    navigator.clipboard.writeText(url).then(() => {
      success(t("success.copied"), t("success.videoUrlCopied"));
    }).catch((err) => {
      errorLogger.warn("[BeatDetailClient] 复制视频URL失败", err);
      showError(t("error.copyFailed"), t("error.clipboardUnavailable"));
    });
  }, [videoUrl, beat, task, success, showError]);

  const handleRefreshVideoUrl = useCallback(async () => {
    const taskId = beat.videoGen?.taskId || task?.taskId;
    if (!taskId) {
      showError(t("error.cannotRefresh"), t("error.taskIdNotFound"));
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
        success(t("success.urlRefreshed"), t("success.videoUrlUpdated"));
      } else if (response.data?.status === "completed") {
        showError(t("error.fetchFailed"), t("error.videoUrlMissing"));
      } else {
        showError(t("error.fetchFailed"), t("error.taskStatus", { status: response.data?.status || t("common.unknown") }));
      }
    } catch (err) {
      showError(t("error.fetchFailed"), err instanceof Error ? err.message : t("error.unknown"));
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
        return t("beat.statusCompleted");
      case "failed":
        return t("beat.statusFailed");
      case "generating":
        return t("beat.statusProcessing");
      case "pending":
        return t("beat.statusWaiting");
      default:
        return t("beat.statusNotStarted");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => guardedPush("/story")}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  {beat.title || t("beat.beatIndex", { index: beat.sequence })}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t("beat.shotSequence", { title: story.title, index: beat.sequence, total: story.beats?.length || 0 })}
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
                    {t("beat.download")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleCopyVideoUrl}
                  >
                    <Link2 className="w-4 h-4" />
                    {t("beat.copyUrl")}
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
            <Card className="bg-card border-border overflow-hidden">
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
                  <div className="relative aspect-video bg-muted flex items-center justify-center">
                    <img
                      src={beat.framePair.firstFrame.imageUrl}
                      alt={t("beat.firstFramePreview")}
                      className="max-w-full max-h-full object-contain"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="text-center text-white">
                        <Film className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="text-lg font-medium">{t("beat.videoNotGenerated")}</p>
                        <p className="text-sm opacity-70">{t("beat.framesReady")}</p>
                      </div>
                    </div>
                  </div>
                ) : beat.keyframe?.imageUrl ? (
                  <div className="relative aspect-video bg-muted flex items-center justify-center">
                    <img
                      src={beat.keyframe.imageUrl}
                      alt={t("beat.previewImage")}
                      className="max-w-full max-h-full object-contain"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="text-center text-white">
                        <Image className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="text-lg font-medium">{t("beat.keyframeGenerated")}</p>
                        <p className="text-sm opacity-70">{t("beat.generateFramesFirst")}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <Video className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-lg font-medium">{t("beat.notStarted")}</p>
                      <p className="text-sm opacity-70">{t("beat.generateKeyframeFirst")}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
              {beat.videoGen?.status === "failed" && (
                <Button
                  variant="outline"
                  className="gap-2 flex-1"
                  onClick={() => guardedPush("/story")}
                >
                  <RotateCcw className="w-4 h-4" />
                  {t("beat.backToStory")}
                </Button>
              )}
              {beat.framePair?.firstFrame?.imageUrl &&
                !videoUrl &&
                !beat.videoGen?.videoUrl && (
                  <Button
                    className="gap-2 flex-1"
                    onClick={() => guardedPush("/story")}
                  >
                    <Wand2 className="w-4 h-4" />
                    {t("beat.goToStoryboardGenerateVideo")}
                  </Button>
                )}
              {beat.keyframe?.imageUrl &&
                !beat.framePair?.firstFrame?.imageUrl && (
                  <Button
                    className="gap-2 flex-1"
                    onClick={() => guardedPush("/story")}
                  >
                    <Image className="w-4 h-4" />
                    {t("beat.goToStoryboardGenerateFramePair")}
                  </Button>
                )}
              {!beat.keyframe?.imageUrl && (
                <Button
                  className="gap-2 flex-1"
                  onClick={() => guardedPush("/story")}
                >
                  <Wand2 className="w-4 h-4" />
                  {t("beat.goToStoryboardGenerateKeyframe")}
                </Button>
              )}
              <p className="text-xs text-muted-foreground text-center">
                {t("beat.generateFromStoryboardHint")}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="video">{t("beat.tabVideo")}</TabsTrigger>
                <TabsTrigger value="details">{t("beat.tabDetails")}</TabsTrigger>
                <TabsTrigger value="tech">{t("beat.tabTech")}</TabsTrigger>
              </TabsList>

              <TabsContent value="video" className="space-y-4">
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-foreground">
                      {t("beat.genStatus")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t("beat.status")}</span>
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
                        <div className="text-xs text-right text-muted-foreground">
                          {task?.progress || 0}%
                        </div>
                      </>
                    )}
                    {beat.videoGen?.error && (
                      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                        <div className="flex items-center gap-2 text-destructive">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-sm font-medium">{t("beat.statusFailed")}</span>
                        </div>
                        <p className="text-xs text-destructive/80 mt-1">
                          {beat.videoGen.error}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t("beat.taskId")}</span>
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {beat.videoGen?.taskId || task?.taskId || t("story.notCreated")}
                        </code>
                        {beat.videoGen?.taskId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              const taskId = beat.videoGen?.taskId;
                              if (taskId) {
                                navigator.clipboard.writeText(taskId);
                                success(t("success.copied"), t("success.taskIdCopied"));
                              }
                            }}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-foreground">
                      {t("beat.videoUrl")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="p-3 rounded-lg bg-muted/50 border border-border">
                      <code className="text-xs text-muted-foreground break-all">
                        {videoUrl ||
                          beat.videoGen?.videoUrl ||
                          task?.videoUrl ||
                          t("beat.noVideoUrl")}
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
                          {t("beat.copyUrl")}
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
                        {isRefreshingUrl ? t("beat.fetching") : t("beat.manualFetchUrl")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("beat.manualFetchHint")}
                    </p>
                  </CardContent>
                </Card>

                {beat.consistencyCheck && (
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-foreground">
                        {t("beat.consistencyCheck")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t("beat.overallScore")}</span>
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
                            <span className="text-xs text-muted-foreground">
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
                              ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200"
                              : beat.consistencyCheck.recommendation ===
                                  "adjust"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200"
                                : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
                          }
                        >
                          {beat.consistencyCheck.recommendation === "accept" &&
                            t("beat.passed")}
                          {beat.consistencyCheck.recommendation === "adjust" &&
                            t("beat.needsAdjust")}
                          {beat.consistencyCheck.recommendation ===
                            "regenerate" && t("beat.suggestRegenerate")}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="details" className="space-y-4">
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-foreground">
                      {t("beat.content")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("beat.titleLabel")}</Label>
                      <p className="text-sm text-foreground">
                        {beat.title || t("story.untitled")}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("beat.contentDesc")}</Label>
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {beat.content || beat.description || t("story.noDesc")}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("beat.duration")}</Label>
                        <p className="text-sm text-foreground">
                          {t("beat.durationSeconds", { count: beat.duration ?? 0 })}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("beat.type")}</Label>
                        <p className="text-sm text-foreground">
                          {beat.type || t("story.notSet")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {beat.camera && (
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-foreground">
                        {t("beat.cameraParams")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {beat.camera.angle && (
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">{t("beat.angle")}</span>
                          <span className="text-sm text-foreground">
                            {beat.camera.angle}
                          </span>
                        </div>
                      )}
                      {beat.camera.movement && (
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">{t("beat.movement")}</span>
                          <span className="text-sm text-foreground">
                            {beat.camera.movement}
                          </span>
                        </div>
                      )}
                      {beat.shotType && (
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">{t("beat.shotSize")}</span>
                          <span className="text-sm text-foreground">
                            {beat.shotType}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {beat.elementIds && beat.elementIds.length > 0 && (
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-foreground">
                        {t("beat.elementBinding")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {beat.elementIds.map((elementId) => {
                        const binding = beat.elementBindings?.[elementId];
                        const name = elementNames[elementId];
                        return (
                          <div
                            key={elementId}
                            className="p-2 rounded-lg bg-muted/50 border border-border"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                {name || elementId}
                              </span>
                              {binding?.role && (
                                <Badge variant="outline" className="text-xs">
                                  {binding.role}
                                </Badge>
                              )}
                            </div>
                            {name && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {elementId}
                              </p>
                            )}
                            {binding?.action && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {t("beat.action", { action: binding.action })}
                              </p>
                            )}
                            {binding?.emotion && (
                              <p className="text-xs text-muted-foreground">
                                {t("beat.emotion", { emotion: binding.emotion })}
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
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-foreground">
                      {t("beat.genParams")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs text-muted-foreground">{t("beat.prompt")}</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={handleCopyPrompt}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          {t("story.copyButton")}
                        </Button>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 border border-border max-h-40 overflow-y-auto">
                        <code className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {beat.videoGen?.prompt ||
                            beat.generationPrompt ||
                            t("story.notGenerated")}
                        </code>
                      </div>
                    </div>

                    {beat.imageGenerationPrompt && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t("beat.keyframePrompt")}
                        </Label>
                        <div className="p-3 rounded-lg bg-muted/50 border border-border max-h-32 overflow-y-auto">
                          <code className="text-xs text-muted-foreground whitespace-pre-wrap">
                            {beat.imageGenerationPrompt}
                          </code>
                        </div>
                      </div>
                    )}

                    {beat.firstFramePrompt && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t("beat.firstFramePrompt")}
                        </Label>
                        <div className="p-3 rounded-lg bg-muted/50 border border-border max-h-32 overflow-y-auto">
                          <code className="text-xs text-muted-foreground whitespace-pre-wrap">
                            {beat.firstFramePrompt}
                          </code>
                        </div>
                      </div>
                    )}

                    {beat.lastFramePrompt && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t("beat.lastFramePrompt")}
                        </Label>
                        <div className="p-3 rounded-lg bg-muted/50 border border-border max-h-32 overflow-y-auto">
                          <code className="text-xs text-muted-foreground whitespace-pre-wrap">
                            {beat.lastFramePrompt}
                          </code>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-foreground">
                      {t("beat.genHistory")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">{t("beat.createdAt")}</span>
                      <span className="text-sm text-foreground">
                        {beat.videoGen?.createdAt
                          ? new Date(beat.videoGen.createdAt).toLocaleString()
                          : t("beat.notCreated")}
                      </span>
                    </div>
                    {task?.createdAt && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">{t("beat.taskSubmit")}</span>
                        <span className="text-sm text-foreground">
                          {new Date(task.createdAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {beat.keyframe?.generatedAt && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">
                          {t("beat.previewGeneration")}
                        </span>
                        <span className="text-sm text-foreground">
                          {new Date(beat.keyframe.generatedAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {beat.framePair?.generatedAt && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">
                          {t("beat.frameGeneration")}
                        </span>
                        <span className="text-sm text-foreground">
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!story || !beat) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <p className="text-foreground text-lg">{t("beat.notFound")}</p>
          <p className="text-muted-foreground text-sm mt-2">
              {t("beat.notFoundDesc")}
            </p>
        </div>
      </div>
    );
  }

  return (
    <PageErrorBoundary pageName={t("beat.detail")}>
      <BeatDetailContent story={story} beat={beat} task={task} />
    </PageErrorBoundary>
  );
}
