import { useNavigate } from "react-router-dom";
import { t } from "@/shared/constants";
import { useCharacters } from "@/modules/character";
import { useScenes } from "@/modules/scene";
import { useStories } from "@/modules/story";
import { useDownloadExport } from "@/modules/asset";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";

export function useHomePage() {
  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: scenes = [], isLoading: scenesLoading } = useScenes();
  const { data: stories = [], isLoading: storiesLoading } = useStories();
  const downloadExportMutation = useDownloadExport();
  const navigate = useNavigate();
  const dataLoading = charactersLoading || scenesLoading || storiesLoading;

  const { error: showError } = useToastHelpers();

  const exportAllData = async () => {
    try {
      await downloadExportMutation.mutateAsync();
    } catch (err) {
      errorLogger.error("导出失败:", err);
      showError(t("error.exportFailed"), t("error.exportProcessFailed"));
    }
  };

  return {
    characters,
    scenes,
    stories,
    dataLoading,
    downloadExportMutation,
    navigate,
    exportAllData,
  };
}
