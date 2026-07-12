import { memo } from "react";
import type { Scene } from "@/domain/schemas";
import { SceneListItem } from "@/modules/scene";
import { BatchOperations } from "@/modules/asset";
import { ImageIcon, Loader2, Plus } from "lucide-react";
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
    <div
      style={{
        width: 300,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        overflowY: "auto",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {scenes.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingBottom: 4,
          }}
        >
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "32px",
          }}
        >
          <Loader2
            className="animate-spin"
            size={24}
            style={{ color: "var(--muted-fg)" }}
          />
          <p
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "var(--muted-fg)",
            }}
          >
            {t("scene.loadingScenes")}
          </p>
        </div>
      ) : scenes.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "32px 16px",
            color: "var(--muted-fg)",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>
            <ImageIcon style={{ width: 32, height: 32 }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {t("scene.noScenes")}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {t("scene.noScenesDesc")}
          </div>
          <button
            onClick={onNewScene}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors mt-3"
            style={{
              background: "rgba(var(--primary-rgb), 0.1)",
              color: "var(--primary)",
            }}
          >
            <Plus className="h-4 w-4" />
            {t("scene.createScene")}
          </button>
        </div>
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
  );
});
