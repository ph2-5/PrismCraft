import { type VideoTask } from "@/modules/video";
import { TaskResultPanel } from "./TaskResultPanel";

interface QuickGenerateHistoryProps {
  currentTask: VideoTask | null;
  effectiveVideoUrl: string | null;
  tasks: VideoTask[];
  activeTaskId: string | null;
  isGenerating: boolean;
  onDownload: (videoUrl: string | undefined, filename: string) => void;
  onSaveToAssets: (task: VideoTask) => void;
  onRetry: (task: VideoTask) => void;
  onClearCompleted: () => void;
  characterPosterImage?: string | null;
}

export function QuickGenerateHistory({
  currentTask,
  effectiveVideoUrl,
  tasks,
  activeTaskId,
  isGenerating,
  onDownload,
  onSaveToAssets,
  onRetry,
  onClearCompleted,
  characterPosterImage,
}: QuickGenerateHistoryProps) {
  return (
    <TaskResultPanel
      currentTask={currentTask}
      effectiveVideoUrl={effectiveVideoUrl}
      tasks={tasks}
      activeTaskId={activeTaskId}
      isGenerating={isGenerating}
      onDownload={onDownload}
      onSaveToAssets={onSaveToAssets}
      onRetry={onRetry}
      onClearCompleted={onClearCompleted}
      characterPosterImage={characterPosterImage}
    />
  );
}
