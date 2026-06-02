import { useState } from "react";
import type { Character, CharacterOutfit } from "@/domain/schemas";
import { synthesizeOutfit, batchSynthesizeOutfits } from "@/shared/outfit";
import { getErrorMessage } from "@/shared/error-handler";
import { errorLogger } from "@/shared/error-logger";
import { AppError } from "@/domain/types/result";
import { t } from "@/shared/constants";

interface UseOutfitManagementProps {
  currentCharacter: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  addAssetToLibrary: (
    url: string,
    type: "image" | "video",
    name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => void;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}

export function useOutfitManagement({
  currentCharacter,
  setCurrentCharacter,
  setIsGenerating,
  addAssetToLibrary,
  success,
  showError,
}: UseOutfitManagementProps) {
  const [showOutfitDialog, setShowOutfitDialog] = useState(false);
  const [editingOutfit, setEditingOutfit] = useState<CharacterOutfit | null>(null);
  const [outfitForm, setOutfitForm] = useState<Partial<CharacterOutfit>>({
    name: "", description: "", clothing: "", accessories: [],
  });
  const [customAccessory, setCustomAccessory] = useState("");

  const handleAddOutfit = () => {
    if (!outfitForm.name || !outfitForm.clothing) {
      showError(t("outfit.fillInfo"), t("outfit.nameAndDescRequired"));
      return;
    }
    const newOutfit: CharacterOutfit = {
      id: editingOutfit?.id || `outfit_${crypto.randomUUID()}`,
      name: outfitForm.name || "",
      description: outfitForm.description || "",
      clothing: outfitForm.clothing || "",
      accessories: outfitForm.accessories || [],
      isDefault: editingOutfit?.isDefault || false,
      createdAt: editingOutfit?.createdAt || new Date().toISOString(),
    };
    setCurrentCharacter((prev) => {
      const existingOutfits = prev.outfits || [];
      const updatedOutfits = editingOutfit
        ? existingOutfits.map((o) => (o.id === editingOutfit.id ? newOutfit : o))
        : [...existingOutfits, newOutfit];
      return { ...prev, outfits: updatedOutfits };
    });
    setShowOutfitDialog(false);
    setEditingOutfit(null);
    setOutfitForm({ name: "", description: "", clothing: "", accessories: [] });
    setCustomAccessory("");
    success(t("success.saved"), editingOutfit ? t("success.outfitUpdated") : "新服装已添加");
  };

  const handleDeleteOutfit = (outfitId: string) => {
    setCurrentCharacter((prev) => ({
      ...prev,
      outfits: (prev.outfits || []).filter((o) => o.id !== outfitId),
    }));
    success(t("success.deleted"), t("success.outfitDeleted"));
  };

  const handleSetDefaultOutfit = (outfitId: string) => {
    setCurrentCharacter((prev) => ({
      ...prev,
      outfits: (prev.outfits || []).map((o) => ({ ...o, isDefault: o.id === outfitId })),
      appearance: {
        ...prev.appearance,
        clothing: prev.outfits?.find((o) => o.id === outfitId)?.clothing || prev.appearance.clothing,
      },
    }));
    success(t("success.applied"), t("outfit.defaultUpdated"));
  };

  const handleEditOutfit = (outfit: CharacterOutfit) => {
    setEditingOutfit(outfit);
    setOutfitForm({ name: outfit.name, description: outfit.description, clothing: outfit.clothing, accessories: outfit.accessories || [] });
    setShowOutfitDialog(true);
  };

  const handleGenerateOutfitImage = async (outfit: CharacterOutfit) => {
    if (!currentCharacter.id) { showError(t("error.saveFailed"), t("error.operationFailed")); return; }
    setIsGenerating(true);
    try {
      const characterImage = currentCharacter.generatedImage || currentCharacter.refImagePath;
      if (!characterImage) { showError(t("outfit.missingCharacterImage"), t("outfit.generateOrUploadFirst")); return; }
      const result = await synthesizeOutfit({
        characterImageUrl: characterImage,
        outfitDescription: outfit.clothing,
        characterName: currentCharacter.name,
        style: currentCharacter.style,
        preserveFeatures: [
          "面部特征", "发型", "体型",
          currentCharacter.appearance.hairColor ? `${currentCharacter.appearance.hairColor}发色` : "",
          currentCharacter.appearance.eyeColor ? `${currentCharacter.appearance.eyeColor}眼睛` : "",
        ].filter(Boolean),
      });
      if (result.success && result.data) {
        const uploadedImageUrl = result.data.imageUrl;
        setCurrentCharacter((prev) => ({
          ...prev,
          outfits: (prev.outfits || []).map((o) => (o.id === outfit.id ? { ...o, imageUrl: uploadedImageUrl } : o)),
        }));
        addAssetToLibrary(uploadedImageUrl, "image", `${currentCharacter.name || "角色"}-${outfit.name}`, {
          type: "character", id: currentCharacter.id, name: currentCharacter.name || "未命名角色",
        });
        success(t("outfit.aiDressSuccess"), t("outfit.outfitSynthesized", { name: outfit.name }));
      } else {
        showError(t("outfit.synthesizeFailed"), result.error || t("image.checkApiConfig"));
      }
    } catch (err) {
      errorLogger.error("AI换装失败", err);
      showError(t("outfit.synthesizeFailed"), getErrorMessage(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBatchSynthesizeOutfits = async () => {
    if (!currentCharacter.id) { showError(t("outfit.saveCharacterFirst"), t("outfit.saveBeforeBatch")); return; }
    const characterImage = currentCharacter.generatedImage || currentCharacter.refImagePath;
    if (!characterImage) { showError(t("outfit.missingCharacterImage"), t("outfit.generateOrUploadFirst")); return; }
    const outfitsToSynthesize = currentCharacter.outfits?.filter((o) => !o.imageUrl);
    if (!outfitsToSynthesize || outfitsToSynthesize.length === 0) { showError(t("outfit.noOutfitToSynthesize"), t("outfit.allOutfitsHaveImage")); return; }

    setIsGenerating(true);
    try {
      const results = await batchSynthesizeOutfits(
        characterImage,
        outfitsToSynthesize.map((o) => ({ outfitId: o.id, outfitName: o.name, outfitDescription: o.clothing })),
        {
          characterName: currentCharacter.name,
          style: currentCharacter.style,
          preserveFeatures: [
            "面部特征", "发型", "体型",
            currentCharacter.appearance.hairColor ? `${currentCharacter.appearance.hairColor}发色` : "",
            currentCharacter.appearance.eyeColor ? `${currentCharacter.appearance.eyeColor}眼睛` : "",
          ].filter(Boolean),
          onProgress: (completed: number, total: number) => { errorLogger.info(new AppError("SYNTHESIZE_PROGRESS", `合成进度: ${completed}/${total}`), "OutfitManagement"); },
        },
      );
      setCurrentCharacter((prev) => {
        const updatedOutfits = (prev.outfits || []).map((outfit) => {
          const r = results.find((rr) => rr.outfitId === outfit.id);
          return r && r.success ? { ...outfit, imageUrl: r.imageUrl } : outfit;
        });
        return { ...prev, outfits: updatedOutfits };
      });
      const successCount = results.filter((rr) => rr.success).length;
      const failCount = results.length - successCount;
      if (successCount > 0) { success(t("outfit.batchComplete"), t("outfit.batchResult", { success: successCount, fail: failCount })); }
      else { showError(t("outfit.batchFailed"), t("outfit.allSynthesizeFailed")); }
    } catch (err) {
      errorLogger.error("批量合成失败", err);
      showError(t("outfit.batchFailed"), getErrorMessage(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const addAccessory = () => {
    if (customAccessory && !outfitForm.accessories?.includes(customAccessory)) {
      setOutfitForm((prev) => ({ ...prev, accessories: [...(prev.accessories || []), customAccessory] }));
    }
    setCustomAccessory("");
  };

  const removeAccessory = (accessory: string) => {
    setOutfitForm((prev) => ({ ...prev, accessories: (prev.accessories || []).filter((a) => a !== accessory) }));
  };

  return {
    showOutfitDialog, setShowOutfitDialog, editingOutfit, setEditingOutfit,
    outfitForm, setOutfitForm, customAccessory, setCustomAccessory,
    handleAddOutfit, handleDeleteOutfit, handleSetDefaultOutfit, handleEditOutfit,
    handleGenerateOutfitImage, handleBatchSynthesizeOutfits, addAccessory, removeAccessory,
  };
}
