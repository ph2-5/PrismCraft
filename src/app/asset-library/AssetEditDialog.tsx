import { useId } from "react";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { t } from "@/shared/constants";
import { Modal } from "@/shared/presentation/Modal";
import type { EditingItem } from "./asset-library-shared";

interface AssetEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: EditingItem | null;
  isSavingEdit: boolean;
  onSave: () => void;
  onEditingItemChange: (item: EditingItem) => void;
}

export function AssetEditDialog({
  open,
  onOpenChange,
  editingItem,
  isSavingEdit,
  onSave,
  onEditingItemChange,
}: AssetEditDialogProps) {
  const nameId = useId();
  const descId = useId();
  const tagsId = useId();
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      ariaLabel={
        editingItem?._type === "character"
          ? t("asset.editCharacter")
          : editingItem?._type === "scene"
            ? t("asset.editScene")
            : t("asset.editStoryboard")
      }
      style={{ maxWidth: "42rem" }}
    >
      <h2 className="text-lg font-semibold mb-4">
        {editingItem?._type === "character"
          ? t("asset.editCharacter")
          : editingItem?._type === "scene"
            ? t("asset.editScene")
            : t("asset.editStoryboard")}
      </h2>
            {editingItem && (
              <div className="space-y-4">
                {(() => {
                  const imageUrl = editingItem._type === "character"
                    ? (editingItem.generatedImage || editingItem.avatarPath)
                    : editingItem._type === "scene"
                      ? (editingItem.generatedImage || editingItem.scenePath)
                      : editingItem.previewPath;
                  return imageUrl ? (
                    <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                      <img
                        src={resolveImageUrl(imageUrl)}
                        alt={t("asset.preview")}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : null;
                })()}
                <div>
                  <label htmlFor={nameId} className="text-sm font-medium">{t("asset.name")}</label>
                  <input
                    id={nameId}
                    className="input"
                    style={{ fontSize: 12, padding: "6px 10px" }}
                    value={editingItem._type === "storyboard" ? "" : (editingItem.name || "")}
                    onChange={(e) =>
                      onEditingItemChange({ ...editingItem, name: e.target.value } as EditingItem)
                    }
                  />
                </div>
                <div>
                  <label htmlFor={descId} className="text-sm font-medium">{t("asset.description")}</label>
                  <textarea
                    id={descId}
                    className="textarea"
                    style={{ fontSize: 12 }}
                    value={editingItem._type === "storyboard" ? (editingItem.script || "") : (editingItem.description || "")}
                    onChange={(e) => {
                      if (editingItem._type === "storyboard") {
                        onEditingItemChange({
                          ...editingItem,
                          script: e.target.value,
                        } as EditingItem);
                      } else {
                        onEditingItemChange({
                          ...editingItem,
                          description: e.target.value,
                        } as EditingItem);
                      }
                    }}
                    rows={3}
                  />
                </div>
                <div>
                  <label htmlFor={tagsId} className="text-sm font-medium">
                    {t("asset.tagsCommaSeparated")}
                  </label>
                  <input
                    id={tagsId}
                    className="input"
                    style={{ fontSize: 12, padding: "6px 10px" }}
                    value={editingItem._type === "storyboard" ? "" : (editingItem.tags || []).join(", ")}
                    onChange={(e) =>
                      onEditingItemChange({
                        ...editingItem,
                        tags: e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      } as EditingItem)
                    }
                    placeholder={t("asset.tagsPlaceholder")}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onOpenChange(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={isSavingEdit}
                onClick={onSave}
              >
                {isSavingEdit ? t("common.saving") : t("common.save")}
              </button>
            </div>
    </Modal>
  );
}
