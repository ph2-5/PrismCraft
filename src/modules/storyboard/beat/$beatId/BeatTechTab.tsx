import { Copy } from "lucide-react";
import { t } from "@/shared/constants";
import {
  ModelParameterPanel,
  type ModelParameterValues,
} from "@/shared/presentation/ModelParameterPanel";
import type { StoryBeat, ModelSelection } from "@/domain/schemas";
import type { VideoTask } from "@/modules/video";
import { ModelSelector } from "@/modules/prompt";

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

interface BeatTechTabProps {
  beat: StoryBeat;
  task?: VideoTask;
  selectedVideoModel: ModelSelection | null;
  setSelectedVideoModel: (value: ModelSelection | null) => void;
  modelParams: ModelParameterValues;
  handleModelParamsChange: (partial: Partial<ModelParameterValues>) => void;
  handleCopyPrompt: () => void;
}

export function BeatTechTab({
  beat,
  task,
  selectedVideoModel,
  setSelectedVideoModel,
  modelParams,
  handleModelParamsChange,
  handleCopyPrompt,
}: BeatTechTabProps) {
  return (
    <>
      <div className="card">
        <div className="pb-3">
          <div className="text-sm text-foreground font-semibold">
            {t("beat.genParams")}
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground">{t("beat.prompt")}</Label>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={handleCopyPrompt}
              >
                <Copy className="w-3 h-3 mr-1" />
                {t("story.copyButton")}
              </button>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border border-border max-h-40 overflow-y-auto">
              <code className="text-xs text-muted-foreground whitespace-pre-wrap">
                {beat.videoGen?.prompt ||
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
        </div>
      </div>

      <div className="card">
        <div className="pb-3">
          <div className="text-sm text-foreground font-semibold">
            {t("modelParam.modelParams")}
          </div>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t("quickGenerate.videoModel")}</Label>
            <ModelSelector
              capability="video"
              value={selectedVideoModel}
              onChange={setSelectedVideoModel}
            />
          </div>
          <ModelParameterPanel
            modelId={selectedVideoModel?.modelId}
            values={modelParams}
            onValuesChange={handleModelParamsChange}
          />
        </div>
      </div>

      <div className="card">
        <div className="pb-3">
          <div className="text-sm text-foreground font-semibold">
            {t("beat.genHistory")}
          </div>
        </div>
        <div className="space-y-2">
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
        </div>
      </div>
    </>
  );
}
