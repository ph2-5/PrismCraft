import {
  BookOpen,
  Film,
  Check,
  Trash2,
  Save,
  Loader2,
} from "lucide-react";
import { SaveStatusIndicator, type SaveStatus } from "@/shared/presentation/SaveStatusIndicator";
import { t } from "@/shared/constants/messages";
import type { ReferencedBeat } from "./SceneEditorParts";

export function SceneReferencedBeatsCard({
  beats,
}: {
  beats: ReferencedBeat[];
}) {
  return (
    <div className="card !p-3.5">
      <div className="section-label mb-2">
        <BookOpen className="inline-block" size={14} /> {t("scene.referencedShots")}
      </div>
      {beats.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          {t("scene.noReferences")}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {beats.map((beat) => {
            const isCompleted =
              beat.generationStatus === "completed" || Boolean(beat.imageUrl);
            return (
              <div
                key={`${beat.storyId}-${beat.sequence}`}
                className="element-card !items-center !p-2 cursor-pointer"
              >
                <span className="text-lg inline-flex items-center"><Film size={18} /></span>
                <span className="text-xs font-medium">
                  {t("scene.shotNumber", { n: beat.sequence })}
                  {beat.title ? ` · ${beat.title}` : ""}
                </span>
                <span
                  className={isCompleted ? "badge badge-success !text-[9px] ml-auto" : "badge badge-info !text-[9px] ml-auto"}
                >
                  {isCompleted ? <Check size={10} /> : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SceneActionFooterProps {
  isDirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null | undefined;
  canSave: boolean;
  onSave: () => void;
  onDelete: () => void;
  deleteDisabled: boolean;
}

export function SceneActionFooter({
  isDirty,
  saveStatus,
  saveError,
  canSave,
  onSave,
  onDelete,
  deleteDisabled,
}: SceneActionFooterProps) {
  return (
    <div
      className="sticky bottom-0 left-0 right-0 flex gap-2 items-center py-2.5 mt-2 bg-background border-t border-border z-10"
    >
      <SaveStatusIndicator
        status={isDirty ? "unsaved" : saveStatus}
        errorMessage={saveError ?? undefined}
      />
      <button
        type="button"
        className="btn btn-ghost btn-xs !gap-1 !text-destructive"
        onClick={onDelete}
        disabled={deleteDisabled}
        aria-label={t("scene.deleteScene")}
      >
        <Trash2 size={12} /> {t("scene.deleteScene")}
      </button>
      <button
        type="button"
        data-testid="scene-save-button"
        className="btn btn-primary btn-sm flex-1 justify-center !gap-1"
        onClick={onSave}
        disabled={saveStatus === "saving" || !canSave}
        title={saveStatus !== "saving" && !canSave ? t("hint.saveScene") : undefined}
      >
        {saveStatus === "saving" ? (
          <Loader2 className="animate-spin" size={14} />
        ) : (
          <Save size={14} />
        )}
        {saveStatus === "saving" ? t("scene.saving") : t("common.save")}
      </button>
    </div>
  );
}
