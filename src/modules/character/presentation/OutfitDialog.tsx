import { X } from "lucide-react";
import type { CharacterOutfit } from "@/domain/schemas";
import { t } from "@/shared/constants";

interface OutfitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingOutfit: CharacterOutfit | null;
  outfitForm: Partial<CharacterOutfit>;
  setOutfitForm: (form: Partial<CharacterOutfit>) => void;
  customAccessory: string;
  setCustomAccessory: (value: string) => void;
  onAddOutfit: () => void;
  onAddAccessory: () => void;
  onRemoveAccessory: (acc: string) => void;
}

export function OutfitDialog({
  open,
  onOpenChange,
  editingOutfit,
  outfitForm,
  setOutfitForm,
  customAccessory,
  setCustomAccessory,
  onAddOutfit,
  onAddAccessory,
  onRemoveAccessory,
}: OutfitDialogProps) {
  return (
    open && (
      <div className="modal-overlay" onClick={() => onOpenChange(false)}>
        <div
          className="modal"
          style={{ maxWidth: "32rem" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {editingOutfit ? t("outfit.editTitle") : t("outfit.addTitle")}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
              {t("outfit.createVariant")}
            </div>
          </div>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="outfit-name">{t("outfit.nameLabel")}</label>
              <input
                className="input"
                id="outfit-name"
                data-testid="outfit-name-input"
                placeholder={t("outfit.namePlaceholder")}
                value={outfitForm.name || ""}
                onChange={(e) =>
                  setOutfitForm({ ...outfitForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="outfit-description">{t("outfit.descriptionLabel")}</label>
              <textarea
                className="textarea"
                id="outfit-description"
                placeholder={t("outfit.descriptionPlaceholder")}
                rows={2}
                value={outfitForm.description || ""}
                onChange={(e) =>
                  setOutfitForm({
                    ...outfitForm,
                    description: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="outfit-clothing">{t("outfit.clothingDetail")}</label>
              <textarea
                className="textarea"
                id="outfit-clothing"
                placeholder={t("outfit.clothingPlaceholder")}
                rows={3}
                value={outfitForm.clothing || ""}
                onChange={(e) =>
                  setOutfitForm({
                    ...outfitForm,
                    clothing: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <label>{t("outfit.accessories")}</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder={t("outfit.accessoryPlaceholder")}
                  value={customAccessory}
                  onChange={(e) => setCustomAccessory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAddAccessory();
                    }
                  }}
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={onAddAccessory}>
                  {t("common.add")}
                </button>
              </div>
              {outfitForm.accessories && outfitForm.accessories.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {outfitForm.accessories.map((acc) => (
                    <span
                      key={acc}
                      className="badge badge-info cursor-pointer px-3 py-1 gap-1"
                      onClick={() => onRemoveAccessory(acc)}
                    >
                      {acc}
                      <X className="w-3 h-3" />
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onAddOutfit}>
              {editingOutfit ? t("outfit.saveChanges") : t("outfit.addOutfitButton")}
            </button>
          </div>
        </div>
      </div>
    )
  );
}
