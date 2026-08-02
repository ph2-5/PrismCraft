"use client";

/**
 * 故事创作页（/story/:storyId）
 *
 * 打开已有故事 → 进入三栏故事创作页（StoryPipelineShell 已有故事模式）：
 * - 由 StoryProvider 按 URL storyId 加载故事
 * - 跳过 ModeSelector，从「导入小说」阶段开始，后续流程与普通流水线一致
 * - 完成后回到工作台总览
 */

import { t } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { Skeleton } from "@/shared/presentation/Skeleton";
import { StoryProvider, useStoryContext } from "@/modules/storyboard";
import { StoryPipelineShell } from "@/modules/novel";
import { useNavigate } from "react-router-dom";

function StoryEditContent() {
  const navigate = useNavigate();
  const story = useStoryContext();
  const { currentStory, isStoryLoading } = story;

  if (isStoryLoading || !currentStory) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <StoryPipelineShell
      initialStory={currentStory}
      onComplete={() => navigate("/story")}
    />
  );
}

export default function StoryEditPage() {
  return (
    <PageErrorBoundary pageName={t("story.workbenchTitle")}>
      <StoryProvider>
        <StoryEditContent />
      </StoryProvider>
    </PageErrorBoundary>
  );
}
