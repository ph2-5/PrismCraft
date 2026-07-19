import { useState } from "react";
import {
  ArrowLeft,
  Download,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { t } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { PageLoader } from "@/shared/presentation/PageLoader";
import { Tabs } from "@/shared/presentation/Tabs";
import type { StoryBeat, Story } from "@/domain/schemas";
import type { VideoTask } from "@/modules/video";
import { QCDashboardPanel } from "@/modules/video/consistency-qc";
import { useStory } from "@/modules/storyboard/StoryProvider";
import { useBeatDetail } from "./use-beat-detail";
import { useBeatDetailActions } from "./use-beat-detail-actions";
import { BeatVideoPreview } from "./BeatVideoPreview";
import { BeatVideoTab } from "./BeatVideoTab";
import { BeatDetailsTab } from "./BeatDetailsTab";
import { BeatTechTab } from "./BeatTechTab";

interface BeatDetailPageProps {
  story: Story;
  beat: StoryBeat;
  task?: VideoTask;
}

function BeatDetailContent({ story, beat, task, setBeat, onUpdateBeat }: BeatDetailPageProps & {
  setBeat: (beat: StoryBeat | null) => void;
  onUpdateBeat?: (id: string, updates: Partial<StoryBeat>) => void;
}) {
  const [activeTab, setActiveTab] = useState("details");

  const {
    guardedPush,
    success,
    videoUrl,
    isRefreshingUrl,
    elementNames,
    selectedVideoModel,
    setSelectedVideoModel,
    modelParams,
    handleModelParamsChange,
    handleCopyPrompt,
    handleDownloadVideo,
    handleCopyVideoUrl,
    handleRefreshVideoUrl,
    getStatusColor,
    getStatusLabel,
    handleRegenerate,
    isRegenerating,
  } = useBeatDetailActions({ story, beat, task, setBeat, onUpdateBeat });

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => guardedPush("/storyboard")}
                aria-label={t("aria.goBack")}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
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
              <span
                className={`badge ${getStatusColor(
                  beat.videoGen?.status || task?.status,
                )}`}
              >
                {getStatusLabel(beat.videoGen?.status || task?.status)}
              </span>
              {(videoUrl || beat.videoGen?.videoUrl || task?.videoUrl) && (
                <>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm gap-2"
                    onClick={handleDownloadVideo}
                  >
                    <Download className="w-4 h-4" />
                    {t("beat.download")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm gap-2"
                    onClick={handleCopyVideoUrl}
                  >
                    <Link2 className="w-4 h-4" />
                    {t("beat.copyUrl")}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <BeatVideoPreview
              beat={beat}
              task={task}
              videoUrl={videoUrl}
              guardedPush={guardedPush}
            />
          </div>

          <div className="space-y-4">
            <div>
              <Tabs
                tabs={[
                  { id: "video", label: t("beat.tabVideo") },
                  { id: "details", label: t("beat.tabDetails") },
                  { id: "tech", label: t("beat.tabTech") },
                  { id: "qc", label: t("beat.tabQC") },
                ]}
                activeTab={activeTab}
                onChange={setActiveTab}
              />

              {activeTab === "video" && (
                <div className="space-y-4">
                  <BeatVideoTab
                    beat={beat}
                    task={task}
                    videoUrl={videoUrl}
                    isRefreshingUrl={isRefreshingUrl}
                    handleCopyVideoUrl={handleCopyVideoUrl}
                    handleRefreshVideoUrl={handleRefreshVideoUrl}
                    success={success}
                    getStatusColor={getStatusColor}
                    getStatusLabel={getStatusLabel}
                    onRegenerate={handleRegenerate}
                    isRegenerating={isRegenerating}
                  />
                </div>
              )}

              {activeTab === "details" && (
                <div className="space-y-4">
                  <BeatDetailsTab
                    beat={beat}
                    elementNames={elementNames}
                  />
                </div>
              )}

              {activeTab === "tech" && (
                <div className="space-y-4">
                  <BeatTechTab
                    beat={beat}
                    task={task}
                    selectedVideoModel={selectedVideoModel}
                    setSelectedVideoModel={setSelectedVideoModel}
                    modelParams={modelParams}
                    handleModelParamsChange={handleModelParamsChange}
                    handleCopyPrompt={handleCopyPrompt}
                  />
                </div>
              )}

              {activeTab === "qc" && (
                <div className="space-y-4">
                  <QCDashboardPanel report={beat.qcReport} />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function BeatDetailClient() {
  const { story, beat, setBeat, task, loading } = useBeatDetail();
  const { updateBeat } = useStory();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <PageLoader size="md" label={t("common.loading")} />
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
      <BeatDetailContent story={story} beat={beat} task={task} setBeat={setBeat} onUpdateBeat={updateBeat} />
    </PageErrorBoundary>
  );
}
