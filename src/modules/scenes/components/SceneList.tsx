import { memo } from "react";
import type { Scene } from "@/domain/schemas";
import { SceneListItem } from "@/modules/scene";
import { BatchOperations } from "@/modules/asset";
import { ImageIcon, Plus, ChevronDown } from "lucide-react";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants/messages";
import { EmptyState } from "@/shared/presentation/EmptyState";
import { sceneService } from "@/modules/scene";
import { useQueryClient } from "@tanstack/react-query";
import { usePagination } from "@/shared/hooks/use-pagination";

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
  const { visibleItems, hasMore, loadMore } = usePagination<Scene>(scenes, {
    pageSize: 20,
  });

  const handleDeleteScene = (e: React.MouseEvent) => {
    e.stopPropagation();
    const sceneId = (e.currentTarget.closest("[data-scene-id]") as HTMLElement)?.dataset.sceneId;
    if (sceneId) onDeleteScene(sceneId);
  };

  return (
    <div className="w-[300px] shrink-0 border-r border-border overflow-y-auto p-3 flex flex-col gap-1.5">
      {scenes.length > 0 && (
        <div className="flex items-center justify-end pb-1">
          <BatchOperations
            type="scene"
            items={scenes}
            onComplete={(results) => {
              errorLogger.info("Batch generation completed", results);
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
        </div>
      )}

      {scenesLoading ? (
        Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded skeleton-shimmer shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="h-3 w-3/4 skeleton-shimmer rounded" />
                <div className="h-2.5 w-1/2 skeleton-shimmer rounded" />
              </div>
            </div>
          </div>
        ))
      ) : scenes.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title={t("scene.noScenes")}
          description={t("scene.noScenesDesc")}
          action={
            <button
              onClick={onNewScene}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors bg-[rgba(var(--primary-rgb),0.1)] text-primary"
            >
              <Plus className="h-4 w-4" />
              {t("scene.createNewScene")}
            </button>
          }
        />
      ) : (
        <>
          {visibleItems.map((scene) => (
            <div key={scene.id} data-scene-id={scene.id}>
              <SceneListItem
                scene={scene}
                onClick={() => onSelectScene(scene)}
                onDelete={handleDeleteScene}
              />
            </div>
          ))}
          {hasMore && (
            <button
              onClick={loadMore}
              className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md transition-colors border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              {t("common.loadMore")}
            </button>
          )}
        </>
      )}
    </div>
  );
});
