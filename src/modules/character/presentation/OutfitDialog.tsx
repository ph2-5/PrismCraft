import { X } from "lucide-react";
import type { CharacterOutfit } from "@/domain/schemas";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Badge } from "@/shared/ui/badge";
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingOutfit ? t("outfit.editTitle") : t("outfit.addTitle")}</DialogTitle>
          <DialogDescription>{t("outfit.createVariant")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="outfit-name">{t("outfit.nameLabel")}</Label>
            <Input
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
            <Label htmlFor="outfit-description">{t("outfit.descriptionLabel")}</Label>
            <Textarea
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
            <Label htmlFor="outfit-clothing">{t("outfit.clothingDetail")}</Label>
            <Textarea
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
            <Label>{t("outfit.accessories")}</Label>
            <div className="flex gap-2">
              <Input
                placeholder={t("outfit.accessoryPlaceholder")}
                value={customAccessory}
                onChange={(e) => setCustomAccessory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAddAccessory();
                  }
                }}
                className="flex-1"
              />
              <Button onClick={onAddAccessory}>{t("common.add")}</Button>
            </div>
            {outfitForm.accessories && outfitForm.accessories.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {outfitForm.accessories.map((acc) => (
                  <Badge
                    key={acc}
                    className="cursor-pointer px-3 py-1 gap-1"
                    onClick={() => onRemoveAccessory(acc)}
                  >
                    {acc}
                    <X className="w-3 h-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={onAddOutfit}>
            {editingOutfit ? t("outfit.saveChanges") : t("outfit.addOutfitButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
