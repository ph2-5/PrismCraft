import { useState, useEffect } from "react";
import { t } from "@/shared/constants";
import {
  useCharacters,
} from "@/modules/character";
import {
  useScenes,
} from "@/modules/scene";
import {
  useStories,
} from "@/modules/story";
import {
  useDownloadExport,
} from "@/modules/asset";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { checkConfigStatus } from "@/shared/api-config";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { ProjectList } from "./ProjectList";
import { QuickActions } from "./QuickActions";

interface ApiStatus {
  text?: { provider: string; configured: boolean };
  image?: { provider: string; configured: boolean };
  video?: { provider: string; configured: boolean };
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col space-y-6 animate-pulse">
      <div className="h-24 bg-muted rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="h-64 bg-muted rounded-lg" />
    </div>
  );
}

export default function Home() {
  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: scenes = [], isLoading: scenesLoading } = useScenes();
  const { data: stories = [], isLoading: storiesLoading } = useStories();
  const downloadExportMutation = useDownloadExport();
  const [apiStatus, setApiStatus] = useState<ApiStatus>({});
  const dataLoading = charactersLoading || scenesLoading || storiesLoading;

  useEffect(() => {
    let cancelled = false;
    const checkApiStatus = async () => {
      try {
        const status = await checkConfigStatus();
        if (!cancelled && status) {
          const mapped: ApiStatus = {};
          if (status.text?.configured) mapped.text = { provider: status.text.provider, configured: true };
          if (status.image?.configured) mapped.image = { provider: status.image.provider, configured: true };
          if (status.video?.configured) mapped.video = { provider: status.video.provider, configured: true };
          setApiStatus(mapped);
        }
      } catch (error) {
        errorLogger.debug("[App] 检查 API 状态失败:", error instanceof Error ? error.message : error);
      }
    };
    checkApiStatus();
    return () => { cancelled = true; };
  }, []);

  const { error: showError } = useToastHelpers();

  const exportAllData = async () => {
    try {
      await downloadExportMutation.mutateAsync();
    } catch (err) {
      errorLogger.error("导出失败:", err);
      showError(t("error.exportFailed"), t("error.exportProcessFailed"));
    }
  };

  return (
    <PageErrorBoundary pageName={t("page.home")}>
    {dataLoading ? (
      <HomeSkeleton />
    ) : (
    <div className="flex flex-col">
      <QuickActions
        characters={characters}
        scenes={scenes}
        stories={stories}
        dataLoading={dataLoading}
        apiStatus={apiStatus}
        onExportAllData={exportAllData}
        isExportPending={downloadExportMutation.isPending}
      />
      <ProjectList />
    </div>
    )}
    </PageErrorBoundary>
  );
}
