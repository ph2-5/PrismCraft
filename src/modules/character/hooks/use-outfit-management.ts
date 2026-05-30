"use client";

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
      showError("请填写完整信息", "服装名称和描述不能为空");
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
    success("保存成功", editingOutfit ? "服装已更新" : "新服装已添加");
  };

  const handleDeleteOutfit = (outfitId: string) => {
    setCurrentCharacter((prev) => ({
      ...prev,
      outfits: (prev.outfits || []).filter((o) => o.id !== outfitId),
    }));
    success("删除成功", "服装已删除");
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
    success("设置成功", "默认服装已更新");
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
      if (!characterImage) { showError("缺少角色图像", "请先生成或上传角色图像"); return; }
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
        setCurrentCharacter((prev) => ({
          ...prev,
          outfits: (prev.outfits || []).map((o) => (o.id === outfit.id ? { ...o, imageUrl: result.data!.imageUrl } : o)),
        }));
        addAssetToLibrary(result.data.imageUrl, "image", `${currentCharacter.name || "角色"}-${outfit.name}`, {
          type: "character", id: currentCharacter.id, name: currentCharacter.name || "未命名角色",
        });
        success("AI换装成功", `${outfit.name}的服装图像已合成`);
      } else {
        showError("合成失败", result.error || "请检查 API 配置后重试");
      }
    } catch (err) {
      errorLogger.error("AI换装失败", err);
      showError("合成失败", getErrorMessage(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBatchSynthesizeOutfits = async () => {
    if (!currentCharacter.id) { showError("请先保存角色", "保存角色后才能批量合成"); return; }
    const characterImage = currentCharacter.generatedImage || currentCharacter.refImagePath;
    if (!characterImage) { showError("缺少角色图像", "请先生成或上传角色图像"); return; }
    const outfitsToSynthesize = currentCharacter.outfits?.filter((o) => !o.imageUrl);
    if (!outfitsToSynthesize || outfitsToSynthesize.length === 0) { showError("没有需要合成的服装", "所有服装已有图像"); return; }

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
      if (successCount > 0) { success("批量合成完成", `成功: ${successCount}个, 失败: ${failCount}个`); }
      else { showError("批量合成失败", "所有服装合成都失败了，请检查API配置"); }
    } catch (err) {
      errorLogger.error("批量合成失败", err);
      showError("批量合成失败", getErrorMessage(err));
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
