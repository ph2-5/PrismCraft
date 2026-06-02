import { Button } from "@/shared/ui/button";
import { Sparkles, Video } from "lucide-react";
import { t } from "@/shared/constants";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { ModelSelector } from "@/modules/prompt";
import { VideoTaskManager } from "@/modules/video";
import { useStory } from "./StoryProvider";

type StoryValue = ReturnType<typeof useStory>;

interface VideoGeneratorToolbarProps {
  story: StoryValue;
  isGenerating: boolean;
  onGenerateVideo: () => void;
}

interface VideoGeneratorPanelProps {
  story: StoryValue;
  generatedVideo: string | null;
}

export function VideoGeneratorToolbar({ story, isGenerating, onGenerateVideo }: VideoGeneratorToolbarProps) {
  return (
    <>
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
      <Button
        size="sm"
        onClick={onGenerateVideo}
        disabled={isGenerating}
        className="gap-1.5 h-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
      >
        {isGenerating ? (
          <Sparkles className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Video className="w-3.5 h-3.5" />
        )}
        {isGenerating ? t("common.generating") : t("beat.generateVideo")}
      </Button>
    </>
  );
}

export function VideoGeneratorPanel({ story, generatedVideo }: VideoGeneratorPanelProps) {
  return (
    <>
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
    </>
  );
}
