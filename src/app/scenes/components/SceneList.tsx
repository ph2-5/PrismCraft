import { memo } from "react";
import type { Scene } from "@/domain/schemas";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { SceneListItem } from "@/modules/scene";
import { BatchOperations } from "@/modules/asset";
import { Plus, ImageIcon } from "lucide-react";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants/messages";
import { sceneService } from "@/modules/scene";
import { useQueryClient } from "@tanstack/react-query";

interface SceneListProps {
  scenes: Scene[];
  scenesLoading: boolean;
  currentSceneId: string;
  isDirty: boolean;
  onSelectScene: (scene: Scene) => void;
  onDeleteScene: (sceneId: string) => void;
  onNewScene: () => void;
}

export const SceneList = memo(function SceneList({
  scenes,
  scenesLoading,
  currentSceneId: _currentSceneId,
  isDirty: _isDirty,
  onSelectScene,
  onDeleteScene,
  onNewScene,
}: SceneListProps) {
  const queryClient = useQueryClient();

  const handleDeleteScene = (e: React.MouseEvent) => {
    e.stopPropagation();
    const sceneId = (e.currentTarget.closest("[data-scene-id]") as HTMLElement)?.dataset.sceneId;
    if (sceneId) onDeleteScene(sceneId);
  };

  return (
    <div className="w-[280px] shrink-0 flex flex-col border border-border rounded-lg bg-card overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold">{t("scene.title")}</span>
            <span className="text-xs text-muted-foreground">
              {scenes.length}
            </span>
          </div>
          {scenes.length > 0 && (
            <BatchOperations
              type="scene"
              items={scenes}
              onComplete={(results) => {
                errorLogger.info("批量生成完成", results);
              }}
              onSave={async (itemId, imageUrl, _variantIndex) => {
                const item = scenes.find((s) => s.id === itemId);
                if (item) {
                  const updated = {
                    ...item,
                    scenePath: imageUrl,
                    generatedImage: imageUrl,
                  };
                  try {
                    const result = await sceneService.update(itemId, updated);
                    if (!result.ok) throw result.error;
                    queryClient.invalidateQueries({ queryKey: ["scenes"] });
                  } catch (e) {
                    errorLogger.warn(
                      "[Scenes] 批量保存失败",
                      e instanceof Error ? e.message : e,
                    );
                  }
                }
              }}
            />
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 h-7 text-xs"
          onClick={onNewScene}
        >
          <Plus className="w-3 h-3" />
          {t("scene.createNewScene")}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {scenesLoading ? (
          <LoadingState message={t("scene.loadingScenes")} />
        ) : scenes.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title={t("scene.noScenes")}
            description={t("scene.noScenesDesc")}
          />
        ) : (
          scenes.map((scene) => (
            <div key={scene.id} data-scene-id={scene.id}>
              <SceneListItem
                scene={scene}
                onClick={() => onSelectScene(scene)}
                onDelete={handleDeleteScene}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
});
