"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { errorLogger } from "@/shared/error-logger";
import {
  Image,
  Play,
  Loader2,
  CheckCircle,
  Link,
  RefreshCw,
  Film,
  Camera,
  Upload,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { AppCard } from "@/shared/ui/app-card";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { StatusBadge } from "@/shared/ui/status-badge";
import { PromptEditor, PromptFloatingBall } from "../../prompt-editor";
import type { PromptEditorContext } from "../../prompt-editor";
import type { Character, Scene, StoryBeat } from "@/domain/schemas";

interface KeyframePanelProps {
  beat: StoryBeat;
  index: number;
  totalBeats: number;
  prevBeat: StoryBeat | null;
  isGenerating: boolean;
  onGenerateKeyframe: (customPrompt?: string) => Promise<StoryBeat | void>;
  onGenerateFramePair: (customFirstFramePrompt?: string, customLastFramePrompt?: string) => Promise<StoryBeat | void>;
  onGenerateVideo: () => Promise<StoryBeat | void>;
  onRegenerateKeyframe: () => Promise<void>;
  onUploadKeyframe?: (file: File) => void;
  onUploadFirstFrame?: (file: File) => void;
  onUploadLastFrame?: (file: File) => void;
  onUploadVideo?: (file: File) => void;
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
  providerId?: string;
  modelId?: string;
  characters?: Character[];
  scenes?: Scene[];
}

export function KeyframePanel({
  beat,
  index,
  totalBeats: _totalBeats,
  prevBeat,
  isGenerating,
  onGenerateKeyframe,
  onGenerateFramePair,
  onGenerateVideo,
  onRegenerateKeyframe,
  onUploadKeyframe,
  onUploadFirstFrame,
  onUploadLastFrame,
  onUploadVideo,
  onPromptChange,
  providerId,
  modelId,
  characters,
  scenes,
}: KeyframePanelProps) {
  const [activeStep, setActiveStep] = useState<number>(0);
  const [expandedPrompt, setExpandedPrompt] = useState<PromptEditorContext | null>(null);
  const keyframeInputRef = useRef<HTMLInputElement>(null);
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (
      e: React.ChangeEvent<HTMLInputElement>,
      handler?: (file: File) => void,
    ) => {
      const file = e.target.files?.[0];
      if (file && handler) {
        handler(file);
      }
      e.target.value = "";
    },
    [],
  );

  const hasKeyframe = !!beat.keyframe?.imageUrl;
  const hasFramePair = !!beat.framePair?.firstFrame?.imageUrl;
  const hasVideo = !!beat.videoGen?.videoUrl;

  const beatRef = useRef(beat);
  useEffect(() => {
    beatRef.current = beat;
  }, [beat]);

  const isFirstBeat = index === 0;
  const hasPrevKeyframe = !!prevBeat?.keyframe?.imageUrl;

  const togglePromptEditor = useCallback((context: PromptEditorContext) => {
    setExpandedPrompt((prev) => (prev === context ? null : context));
  }, []);

  const handleFloatingBallPrompt = useCallback(
    (context: PromptEditorContext, prompt: string) => {
      onPromptChange?.(context, prompt);
    },
    [onPromptChange],
  );

  const handlePreEditGenerate = useCallback(
    (context: PromptEditorContext) => {
      setExpandedPrompt(context);
    },
    [],
  );

  const handleConfirmKeyframeGenerate = useCallback(
    (context: PromptEditorContext, prompt: string) => {
      onPromptChange?.(context, prompt);
      onGenerateKeyframe(prompt);
    },
    [onPromptChange, onGenerateKeyframe],
  );

  const [_pendingFramePrompts, setPendingFramePrompts] = useState<{
    firstFrame?: string;
    lastFrame?: string;
  }>({});

  const handleConfirmFramePairGenerate = useCallback(
    (context: PromptEditorContext, prompt: string) => {
      onPromptChange?.(context, prompt);
      setPendingFramePrompts((prev) => {
        const updated = { ...prev, [context]: prompt };
        if (updated.firstFrame && updated.lastFrame) {
          onGenerateFramePair(updated.firstFrame, updated.lastFrame);
          return {};
        }
        return updated;
      });
    },
    [onPromptChange, onGenerateFramePair],
  );

  const steps = [
    {
      id: "keyframe" as const,
      label: "预览图",
      description: hasKeyframe
        ? "已生成预览图"
        : isFirstBeat
          ? "生成分镜预览图"
          : "基于上一分镜风格生成",
      completed: hasKeyframe,
      icon: Image,
      promptContext: "keyframe" as PromptEditorContext,
    },
    {
      id: "framePair" as const,
      label: "首尾帧",
      description: hasFramePair ? "已生成首尾帧" : "基于预览图生成首帧和尾帧",
      completed: hasFramePair,
      icon: Camera,
      promptContext: "firstFrame" as PromptEditorContext,
    },
    {
      id: "video" as const,
      label: "视频",
      description: hasVideo ? "已生成视频" : "基于首尾帧生成视频",
      completed: hasVideo,
      icon: Play,
      promptContext: undefined,
    },
  ];

  const getStepStatus = (stepIndex: number) => {
    if (steps[stepIndex].completed) return "completed";
    if (stepIndex === activeStep && isGenerating) return "generating";
    if (stepIndex > activeStep) return "pending";
    return "ready";
  };

  return (
    <div className="space-y-4">
      {!isFirstBeat && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
          <div className="flex items-center gap-2 text-xs text-primary">
            <Link className="w-3.5 h-3.5" />
            <span>
              {hasPrevKeyframe
                ? `已链接上一分镜预览图，保持风格连贯`
                : `上一分镜无预览图，将独立生成风格`}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step, stepIndex) => {
          const status = getStepStatus(stepIndex);
          const Icon = step.icon;

          return (
            <AppCard
              key={step.id}
              className={
                status === "completed"
                  ? "border-emerald-500/30"
                  : status === "generating"
                    ? "border-primary/50"
                    : ""
              }
            >
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      status === "completed"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : status === "generating"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {status === "completed" ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : status === "generating" ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {step.label}
                      </span>
                      {status === "completed" && (
                        <StatusBadge variant="success">已完成</StatusBadge>
                      )}
                      {status === "generating" && (
                        <StatusBadge variant="pending">生成中</StatusBadge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {step.description}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {step.id === "keyframe" && (
                      <>
                        {hasKeyframe ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => keyframeInputRef.current?.click()}
                              disabled={isGenerating}
                              className="gap-1.5"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              上传
                            </Button>
                            <input
                              ref={keyframeInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                handleFileSelect(e, onUploadKeyframe)
                              }
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={onRegenerateKeyframe}
                              disabled={isGenerating}
                              className="gap-1.5"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              重新生成
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => keyframeInputRef.current?.click()}
                              disabled={isGenerating}
                              className="gap-1.5"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              上传
                            </Button>
                            <input
                              ref={keyframeInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                handleFileSelect(e, onUploadKeyframe)
                              }
                            />
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handlePreEditGenerate("keyframe")}
                              disabled={isGenerating}
                              className="gap-1.5"
                            >
                              {isGenerating && activeStep === 0 ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Image className="w-3.5 h-3.5" />
                              )}
                              生成
                            </Button>
                          </>
                        )}
                      </>
                    )}
                    {step.id === "framePair" && hasKeyframe && (
                      <>
                        {hasFramePair ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onGenerateFramePair()}
                            disabled={isGenerating}
                            className="gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            重新生成
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handlePreEditGenerate("firstFrame")}
                            disabled={isGenerating}
                            className="gap-1.5"
                          >
                            {isGenerating && activeStep === 1 ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Camera className="w-3.5 h-3.5" />
                            )}
                            生成
                          </Button>
                        )}
                      </>
                    )}
                    {step.id === "video" && hasFramePair && (
                      <>
                        {hasVideo ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => videoInputRef.current?.click()}
                              disabled={isGenerating}
                              className="gap-1.5"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              上传
                            </Button>
                            <input
                              ref={videoInputRef}
                              type="file"
                              accept="video/*"
                              className="hidden"
                              onChange={(e) =>
                                handleFileSelect(e, onUploadVideo)
                              }
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={onGenerateVideo}
                              disabled={isGenerating}
                              className="gap-1.5"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              重新生成
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => videoInputRef.current?.click()}
                              disabled={isGenerating}
                              className="gap-1.5"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              上传
                            </Button>
                            <input
                              ref={videoInputRef}
                              type="file"
                              accept="video/*"
                              className="hidden"
                              onChange={(e) =>
                                handleFileSelect(e, onUploadVideo)
                              }
                            />
                            <Button
                              variant="default"
                              size="sm"
                              onClick={onGenerateVideo}
                              disabled={isGenerating}
                              className="gap-1.5"
                            >
                              {isGenerating && activeStep === 2 ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                              生成
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {step.id === "keyframe" && beat.keyframe?.imageUrl && (
                  <div className="mt-3">
                    <img
                      src={resolveMediaUrl(beat.localKeyframePath, beat.keyframe.imageUrl) || ""}
                      alt="预览图"
                      className="w-full aspect-video object-cover rounded-lg border border-border"
                    />
                    {beat.keyframe.referencedPrevKeyframe && (
                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-primary">
                        <Link className="w-3 h-3" />
                        <span>链式参考: 继承上一分镜风格</span>
                      </div>
                    )}
                  </div>
                )}

                {step.id === "framePair" && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground">
                          首帧
                        </span>
                        <button
                          onClick={() => firstFrameInputRef.current?.click()}
                          className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5"
                        >
                          <Upload className="w-3 h-3" />
                          上传
                        </button>
                        <input
                          ref={firstFrameInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            handleFileSelect(e, onUploadFirstFrame)
                          }
                        />
                      </div>
                      {beat.framePair?.firstFrame?.imageUrl ? (
                        <img
                          src={
                            resolveMediaUrl(
                              beat.localFirstFramePath,
                              beat.framePair.firstFrame.imageUrl,
                            ) || ""
                          }
                          alt="首帧"
                          className="w-full aspect-video object-cover rounded-lg border border-border"
                        />
                      ) : (
                        <div className="w-full aspect-video rounded-lg border border-dashed border-border flex items-center justify-center bg-muted/30">
                          <span className="text-xs text-muted-foreground">
                            暂无首帧
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground">
                          尾帧
                        </span>
                        <button
                          onClick={() => lastFrameInputRef.current?.click()}
                          className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5"
                        >
                          <Upload className="w-3 h-3" />
                          上传
                        </button>
                        <input
                          ref={lastFrameInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            handleFileSelect(e, onUploadLastFrame)
                          }
                        />
                      </div>
                      {beat.framePair?.lastFrame?.imageUrl ? (
                        <img
                          src={
                            resolveMediaUrl(
                              beat.localLastFramePath,
                              beat.framePair.lastFrame.imageUrl,
                            ) || ""
                          }
                          alt="尾帧"
                          className="w-full aspect-video object-cover rounded-lg border border-border"
                        />
                      ) : (
                        <div className="w-full aspect-video rounded-lg border border-dashed border-border flex items-center justify-center bg-muted/30">
                          <span className="text-xs text-muted-foreground">
                            暂无尾帧
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {step.id === "video" && beat.videoGen?.videoUrl && (
                  <div className="mt-3">
                    <video
                      src={resolveMediaUrl(beat.localVideoPath, beat.videoGen.videoUrl)}
                      controls
                      className="w-full aspect-video rounded-lg border border-border"
                      onError={createVideoErrorHandler()}
                    />
                  </div>
                )}

                {step.promptContext && (
                  <div className="mt-3 border-t border-border pt-2">
                    <button
                      onClick={() => togglePromptEditor(step.promptContext!)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      {expandedPrompt === step.promptContext ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                      编辑提示词
                    </button>
                    {expandedPrompt === step.promptContext && (
                      <div className="mt-2">
                        <PromptEditor
                          beat={beat}
                          context={step.promptContext}
                          keyframeImageUrl={beat.keyframe?.imageUrl}
                          onPromptChange={onPromptChange}
                          onConfirmGenerate={
                            step.id === "keyframe"
                              ? handleConfirmKeyframeGenerate
                              : step.id === "framePair"
                                ? handleConfirmFramePairGenerate
                                : undefined
                          }
                          providerId={providerId}
                          modelId={modelId}
                          compact
                          characters={characters}
                          scenes={scenes}
                        />
                      </div>
                    )}
                  </div>
                )}

                {step.id === "framePair" && expandedPrompt === "firstFrame" && (
                  <div className="mt-2 border-t border-border pt-2">
                    <PromptEditor
                      beat={beat}
                      context="lastFrame"
                      keyframeImageUrl={beat.keyframe?.imageUrl}
                      onPromptChange={onPromptChange}
                      onConfirmGenerate={handleConfirmFramePairGenerate}
                      providerId={providerId}
                      modelId={modelId}
                      compact
                      characters={characters}
                      scenes={scenes}
                    />
                  </div>
                )}
              </div>
            </AppCard>
          );
        })}
      </div>

      {!hasVideo && (
        <Button
          variant="default"
          className="w-full"
          onClick={async () => {
            try {
              let currentBeat = beat;
              if (!currentBeat.keyframe?.imageUrl) {
                setActiveStep(0);
                const result = await onGenerateKeyframe();
                if (result) currentBeat = result;
              }
              if (!currentBeat.framePair?.firstFrame?.imageUrl) {
                setActiveStep(1);
                const result = await onGenerateFramePair();
                if (result) currentBeat = result;
              }
              if (!currentBeat.videoGen?.videoUrl) {
                setActiveStep(2);
                await onGenerateVideo();
              }
            } catch (error) {
              errorLogger.error("一键生成失败", error);
            }
          }}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              生成中...
            </>
          ) : (
            <>
              <Film className="w-4 h-4 mr-2" />
              {hasKeyframe
                ? hasFramePair
                  ? "生成视频"
                  : "生成首尾帧并视频"
                : "一键生成完整分镜"}
            </>
          )}
        </Button>
      )}

      <PromptFloatingBall
        beat={beat}
        context={expandedPrompt ?? "keyframe"}
        keyframeImageUrl={beat.keyframe?.imageUrl}
        onPromptGenerated={handleFloatingBallPrompt}
        providerId={providerId}
        modelId={modelId}
        characters={characters}
        scenes={scenes}
      />
    </div>
  );
}
