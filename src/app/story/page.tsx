"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Plus, Save, Trash2, Sparkles, Video, ChevronDown } from "lucide-react";
import { container } from "@/infrastructure/di";
import {
  DEFAULT_STORY,
  genres,
  tones,
} from "@/modules/story";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { getErrorMessage } from "@/shared/error-handler";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { generateProfessionalVideoPrompt } from "@/modules/prompt";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { useGlobalKeyboardActions } from "@/shared/hooks/use-global-keyboard-actions";
import { SaveStatusIndicator } from "@/shared/presentation/SaveStatusIndicator";
import { VideoTaskManager } from "@/modules/video";
import { ProfessionalModeEditor } from "@/modules/story";
import type { PromptEditorContext } from "@/modules/story";
import { VersionDialog } from "@/modules/story";
import { TemplateManagerDialog } from "@/modules/story";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { ModelSelector } from "@/modules/prompt";
import { confirm } from "@/shared/utils/confirm";
import { useAutoSave } from "@/modules/persistence";
import { preferencesStorage } from "@/shared/utils/preferences";
import { StoryProvider, useStory } from "./StoryProvider";

function useAutoSaveSettings() {
  const [enabled, _setEnabled] = useState(() => {
    try {
      const parsed = preferencesStorage.get<{ enabled?: boolean }>("ai-animation-autosave-settings", {});
      return typeof parsed.enabled === "boolean" ? parsed.enabled : true;
    } catch (err) {
      errorLogger.error("[Story] 读取自动保存设置失败", err instanceof Error ? err : undefined);
      return true;
    }
  });
  const [intervalMinutes, _setIntervalMinutes] = useState(() => {
    try {
      const parsed = preferencesStorage.get<{ interval?: number }>("ai-animation-autosave-settings", {});
      return typeof parsed.interval === "number" && parsed.interval > 0 ? parsed.interval : 5;
    } catch (err) {
      errorLogger.error("[Story] 读取自动保存间隔设置失败", err instanceof Error ? err : undefined);
      return 5;
    }
  });

  return { enabled, intervalMinutes };
}

const PROMPT_FIELD_MAP: Record<PromptEditorContext, "imageGenerationPrompt" | "firstFramePrompt" | "lastFramePrompt"> = {
  keyframe: "imageGenerationPrompt",
  firstFrame: "firstFramePrompt",
  lastFrame: "lastFramePrompt",
};

function StoryPageContent() {
  const story = useStory();
  const { success, error: showError, warning: showWarning } = useToastHelpers();
  const autoSaveSettings = useAutoSaveSettings();

  const handleSaveRef = useRef(story.handleSave);
  useEffect(() => {
    handleSaveRef.current = story.handleSave;
  }, [story.handleSave]);

  useGlobalKeyboardActions({
    onSave: () => handleSaveRef.current(),
  });

  useAutoSave({
    enabled: autoSaveSettings.enabled && story.hasUnsavedChanges && story.beats.length > 0,
    intervalMinutes: autoSaveSettings.intervalMinutes,
    onSave: () => story.handleSave(),
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showSwitchConfirmDialog, setShowSwitchConfirmDialog] = useState(false);
  const [pendingSwitchStory, setPendingSwitchStory] = useState<(typeof story.stories)[number] | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowProjectDropdown(false);
      }
    };
    if (showProjectDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showProjectDropdown]);

  const generateVideo = useCallback(async () => {
    if (
      !story.selectedVideoModel?.providerId ||
      !story.selectedVideoModel?.modelId
    ) {
      story.showError("无法生成视频", "请先在顶部工具栏选择视频生成模型");
      return;
    }
    setIsGenerating(true);
    try {
      const prompt = generateProfessionalVideoPrompt({
        story: {
          title: story.currentStory.title || "未命名",
          description: story.currentStory.description || "无",
          genre: story.currentStory.genre || "drama",
          tone: story.currentStory.tone || "neutral",
          targetDuration: story.currentStory.targetDuration || 60,
        },
        beats: story.beats,
        characters: story.charactersRef.current,
        scenes: story.scenesRef.current,
      });

      const videoOptions: {
        duration: number;
        providerId?: string;
        modelId?: string;
      } = {
        duration: Math.min(story.currentStory.targetDuration || 5, 12),
      };
      if (story.selectedVideoModel) {
        videoOptions.providerId = story.selectedVideoModel.providerId;
        videoOptions.modelId = story.selectedVideoModel.modelId;
      }
      const apiGenerateVideo = container.videoProvider.generateVideo;
      const result = await apiGenerateVideo(prompt, videoOptions);
      if (result.success && result.data?.taskId) {
        story.addTask({
          taskId: result.data.taskId,
          status: "pending",
          message: "视频生成任务已提交",
          providerId: result.data.providerId,
          providerModelId: result.data.providerModelId,
          providerFormat: result.data.providerFormat,
        });
        success("任务已提交", "视频生成任务已提交，正在处理中...");
      } else if (result.success && result.data?.videoUrl) {
        setGeneratedVideo(result.data.videoUrl);
        success("视频生成成功", "视频已生成");
      } else {
        throw new Error(result.error || "生成失败");
      }
    } catch (err) {
      errorLogger.error("[Story] 视频生成失败", err instanceof Error ? err : undefined);
      showError("视频生成失败", getErrorMessage(err));
    } finally {
      setIsGenerating(false);
    }
  }, [story, success, showError]);

  const switchStory = (s: (typeof story.stories)[number]) => {
    if (story.isVideoUrlPersisting) {
      showWarning("请稍候", "视频URL正在保存中，请等待保存完成后再切换故事");
      return;
    }
    if (story.hasUnsavedChanges && story.beats.length > 0) {
      setPendingSwitchStory(s);
      setShowSwitchConfirmDialog(true);
      return;
    }
    performSwitchStory(s);
  };

  const performSwitchStory = (s: (typeof story.stories)[number]) => {
    story.setCurrentStory(s, true);
    story.setBeats(s.beats || [], true);
    story.markClean("story");
    setShowProjectDropdown(false);
    setShowSwitchConfirmDialog(false);
    setPendingSwitchStory(null);
  };

  const handleSaveAndSwitch = async () => {
    if (!pendingSwitchStory) return;
    try {
      await story.handleSave();
      performSwitchStory(pendingSwitchStory);
      success("已保存并切换", "当前修改已保存");
    } catch (error) {
      errorLogger.error("[Story] 保存并切换失败", error instanceof Error ? error : undefined);
      showError("保存失败", extractErrorMessage(error));
    }
  };

  const { updateBeat } = story;

  const handlePromptChange = useCallback(
    (beatId: string, context: PromptEditorContext, prompt: string) => {
      updateBeat(beatId, { [PROMPT_FIELD_MAP[context]]: prompt });
    },
    [updateBeat],
  );

  return (
    <PageErrorBoundary pageName="分镜">
      <div className="h-full flex flex-col">
        {/* Top Toolbar */}
        <div className="shrink-0 border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Project Selector */}
            <div className="relative" ref={dropdownRef}>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 min-w-[160px] justify-between"
                onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              >
                <span className="truncate">
                  {story.currentStory.title || "未命名项目"}
                </span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              </Button>
              {showProjectDropdown && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                    onClick={async () => {
                      if (story.hasUnsavedChanges && story.beats.length > 0) {
                        const confirmed = await confirm(
                          "当前有未保存的修改，创建新分镜将丢失这些修改。确定要继续吗？",
                          "未保存的修改",
                        );
                        if (!confirmed) return;
                      }
                      story.setCurrentStory(DEFAULT_STORY, true);
                      story.setBeats([]);
                      setShowProjectDropdown(false);
                    }}
                  >
                    <Plus className="w-4 h-4 text-primary" />
                    创建新分镜
                  </button>
                  {story.stories.length > 0 && (
                    <div className="border-t border-border my-1" />
                  )}
                  {story.stories.map((s) => (
                    <div
                      key={s.id}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between group ${
                        s.id === story.currentStory.id ? "bg-muted" : ""
                      }`}
                      onClick={() => switchStory(s)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {(s.title || "?").charAt(0)}
                        </div>
                        <span className="truncate">
                          {s.title || "未命名项目"}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {(s.beats || []).length}镜
                        </span>
                      </div>
                      <Trash2
                        className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          story.handleDeleteStory(s.id);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Title Input */}
            <Input
              placeholder="分镜项目标题..."
              value={story.currentStory.title ?? ""}
              onChange={(e) =>
                story.setCurrentStory((prev) => ({
                  ...prev,
                  title: e.target.value,
                }))
              }
              className="max-w-[200px] h-8 text-sm"
            />

            {/* Description - compact */}
            <Input
              placeholder="简介..."
              value={story.currentStory.description ?? ""}
              onChange={(e) =>
                story.setCurrentStory((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              className="max-w-[240px] h-8 text-sm flex-1"
            />

            {/* Genre & Tone */}
            <Select
              value={story.currentStory.genre ?? ""}
              onValueChange={(value) =>
                story.setCurrentStory((prev) => ({
                  ...prev,
                  genre: value || undefined,
                }))
              }
            >
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {genres.map((genre) => (
                  <SelectItem key={genre.value} value={genre.value}>
                    {genre.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={story.currentStory.tone ?? ""}
              onValueChange={(value) =>
                story.setCurrentStory((prev) => ({
                  ...prev,
                  tone: value || undefined,
                }))
              }
            >
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tones.map((tone) => (
                  <SelectItem key={tone.value} value={tone.value}>
                    {tone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex-1" />

            {/* Model Selectors */}
            <ModelSelector
              capability="video"
              value={story.selectedVideoModel}
              onChange={story.setSelectedVideoModel}
            />
            <ModelSelector
              capability="image"
              value={story.selectedImageModel}
              onChange={story.setSelectedImageModel}
            />

            {/* Action Buttons */}
            <SaveStatusIndicator
              status={story.hasUnsavedChanges ? "unsaved" : story.saveStatus}
              errorMessage={story.saveError}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={story.handleSave}
              disabled={story.saveStatus === "saving"}
              className="gap-1.5 h-8"
            >
              <Save className="w-3.5 h-3.5" />
              保存
            </Button>
            <Button
              size="sm"
              onClick={generateVideo}
              disabled={isGenerating}
              className="gap-1.5 h-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
            >
              {isGenerating ? (
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Video className="w-3.5 h-3.5" />
              )}
              {isGenerating ? "生成中..." : "生成视频"}
            </Button>
          </div>
        </div>

        {/* Main Editor Area */}
        <div className="flex-1 min-h-0">
          <ProfessionalModeEditor
            currentStory={story.currentStory}
            beats={story.beats}
            characters={story.characters}
            scenes={story.scenes}
            assets={story.assets}
            onUpdateBeat={story.updateBeat}
            onAddBeat={story.addBeat}
            onDeleteBeat={story.deleteBeat}
            onMoveBeat={story.moveBeat}
            onReorderBeats={story.setBeats}
            onPlanStoryWithAI={story.planStoryWithAI}
            onOpenTemplateDialog={() => story.setTemplateDialogOpen(true)}
            onOpenVersionDialog={() => story.setVersionDialogOpen(true)}
            isGenerating={isGenerating}
            isPlanningStory={story.isPlanningStory}
            generationEnhanced={story.generationEnhanced}
            onToggleGenerationEnhanced={async (enabled) => {
              story.setGenerationEnhanced(enabled);
              if (story.beats.length > 0) {
                const confirmed = await confirm(
                  `是否将此全局设置应用到所有 ${story.beats.length} 个现有分镜？\n\n是：所有分镜的局部开关都将同步更新\n否：仅影响新添加的分镜`,
                  "应用到所有分镜",
                );
                if (confirmed) {
                  story.setBeats((prev) =>
                    prev.map((b) => ({
                      ...b,
                      enhancedGeneration: enabled,
                    })),
                  );
                }
              }
            }}
            onGenerateKeyframe={story.generateKeyframe}
            onGenerateFramePair={story.generateFramePair}
            onGenerateVideoNew={story.generateVideoNew}
            onRegenerateKeyframe={story.regenerateKeyframe}
            generatingKeyframe={story.generatingBeats}
            onUploadKeyframe={story.handleUploadKeyframe}
            onUploadFirstFrame={story.handleUploadFirstFrame}
            onUploadLastFrame={story.handleUploadLastFrame}
            onUploadVideo={story.handleUploadVideo}
            onBatchGenerateKeyframes={story.batchGenerateKeyframes}
            onBatchGenerateFramePairs={story.batchGenerateFramePairs}
            onBatchGenerateVideos={story.batchGenerateVideos}
            onPromptChange={handlePromptChange}
            imageProviderId={story.selectedImageModel?.providerId}
            imageModelId={story.selectedImageModel?.modelId}
            assetsLoading={story.assetsLoading}
          />
        </div>

        {/* Generated Video */}
        {generatedVideo && (
          <div className="shrink-0 border-t border-border bg-card p-4">
            <video
              src={resolveImageUrl(generatedVideo)}
              controls
              className="w-full max-h-48 rounded-lg border border-border"
              onError={createVideoErrorHandler()}
            />
          </div>
        )}

        {/* Video Task Manager */}
        {story.tasks.length > 0 && (
          <div className="shrink-0 border-t border-border bg-card">
            <VideoTaskManager
              tasks={story.tasks}
              pollTask={story.pollTask}
              removeTask={story.removeTask}
              removeTasks={story.removeTasks}
            />
          </div>
        )}

        {/* Template Dialog */}
        <TemplateManagerDialog
          isOpen={story.templateDialogOpen}
          onClose={() => story.setTemplateDialogOpen(false)}
          currentBeats={story.beats}
          onApplyTemplate={story.applyStoryboardTemplate}
          savedTemplates={story.savedTemplates}
          onSaveTemplate={story.handleSaveTemplate}
          onDeleteTemplate={story.handleDeleteTemplate}
        />

        {/* Version Dialog */}
        <VersionDialog
          open={story.versionDialogOpen}
          onOpenChange={story.setVersionDialogOpen}
          currentStory={story.currentStory}
          beats={story.beats}
          onRestoreVersion={story.handleRestoreVersion}
        />

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={story.deleteDialogOpen}
          onOpenChange={story.setDeleteDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                确认删除项目
              </DialogTitle>
              <DialogDescription>
                确定要删除这个分镜项目吗？系统会自动创建备份版本，方便您后续恢复。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => story.setDeleteDialogOpen(false)}
              >
                取消
              </Button>
              <Button variant="destructive" onClick={story.performDeleteStory}>
                确认删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Switch Story Confirmation Dialog */}
        <Dialog
          open={showSwitchConfirmDialog}
          onOpenChange={(open) => {
            setShowSwitchConfirmDialog(open);
            if (!open) {
              setPendingSwitchStory(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Save className="w-5 h-5" />
                切换项目
              </DialogTitle>
              <DialogDescription>
                当前项目有未保存的修改，您希望如何处理？
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Button
                className="w-full justify-start text-left"
                onClick={handleSaveAndSwitch}
              >
                <Save className="w-4 h-4 mr-2" />
                保存后切换
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start text-left"
                onClick={() => pendingSwitchStory && performSwitchStory(pendingSwitchStory)}
              >
                直接切换（不保存）
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-left text-muted-foreground"
                onClick={() => setShowSwitchConfirmDialog(false)}
              >
                取消
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageErrorBoundary>
  );
}

export default function StoryPage() {
  return (
    <StoryProvider>
      <StoryPageContent />
    </StoryProvider>
  );
}
