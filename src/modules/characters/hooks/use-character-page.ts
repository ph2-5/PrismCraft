import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";
import { useCharacters } from "@/modules/character";
import { useStories, storyService } from "@/modules/storyboard";
import { useMediaAssets, useCreateMediaAsset } from "@/modules/asset";
import { characterService } from "@/modules/character";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { t } from "@/shared/constants/messages";
import { useGlobalKeyboardActions } from "@/shared/hooks/use-global-keyboard-actions";
import { useDebouncedState } from "@/shared/hooks/use-debounced-state";
import {
  defaultCharacter,
  useCharacterImage,
  useCharacterCRUD,
  useOutfitManagement,
} from "@/modules/character";
import { confirm } from "@/shared/utils/confirm";
import type { Character } from "@/domain/schemas";

/**
 * 角色页面所有业务逻辑的 hook。
 * page.tsx 只负责 UI 渲染，所有状态、事件处理、数据变换都在这里。
 */
export function useCharacterPage() {
  const { markDirty, markClean, isDirty } = useDirtyState();
  const queryClient = useQueryClient();
  const createMediaAssetMutation = useCreateMediaAsset();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: stories = [] } = useStories();
  const { data: assets = [], isLoading: _assetsLoading } = useMediaAssets();
  const [showAssetSelector, setShowAssetSelector] = useState(false);
  const [currentCharacter, setCurrentCharacterRaw] = useState<Character>(defaultCharacter);

  const setCurrentCharacter = useCallback(
    (update: Character | ((prev: Character) => Character), shouldMarkDirty = false) => {
      setCurrentCharacterRaw(update);
      if (shouldMarkDirty) markDirty("characters");
    },
    [markDirty],
  );

  const currentCharacterRef = useRef(currentCharacter);
  useEffect(() => { currentCharacterRef.current = currentCharacter; }, [currentCharacter]);

  const [customTrait, setCustomTrait] = useState("");
  const [, setCustomStyle] = useState("");
  const { success, error: showError } = useToastHelpers();

  // ── 搜索与创建状态（UI 状态但由 hook 管理） ──
  const { value: search, setValue: setSearch, debouncedValue: debouncedSearch } = useDebouncedState("", 200);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // ── 素材库添加 ──
  const addAssetToLibrary = async (
    url: string,
    type: "image" | "video",
    name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => {
    await createMediaAssetMutation.mutateAsync({
      name, type, url, description: "", tags: [], boundTo,
    });
  };

  // ── 图像生成 ──
  const imageHook = useCharacterImage({
    currentCharacter, currentCharacterRef, setCurrentCharacter,
    addAssetToLibrary, success, showError,
  });

  // ── CRUD ──
  const crudHook = useCharacterCRUD({
    currentCharacter, setCurrentCharacter, generatedImage: imageHook.generatedImage,
    setCustomTrait, setCustomStyle, setGeneratedImage: imageHook.setGeneratedImage,
    addAssetToLibrary, generatePrompt: imageHook.generatePrompt, success, showError,
    stories, markDirty, markClean,
    onUpdateStoriesAfterDelete: async (characterId, storiesList) => {
      const updatedStories = storiesList.map((story) => {
        const updatedBeats = (story.beats || []).map((beat) => {
          const updated = { ...beat };
          if (updated.characterIds?.includes(characterId)) {
            updated.characterIds = updated.characterIds.filter((cid) => cid !== characterId);
          }
          return updated;
        });
        const updatedCharacters = (story.characters || []).filter((cid) => cid !== characterId);
        return { ...story, characters: updatedCharacters, beats: updatedBeats };
      });
      const failedStories: string[] = [];
      const affectedStories = updatedStories.filter((updatedStory) => {
        const original = storiesList.find((s) => s.id === updatedStory.id);
        return (
          original?.characters?.includes(characterId) ||
          original?.beats?.some((b) => b.characterIds?.includes(characterId))
        );
      });
      const results = await Promise.allSettled(
        affectedStories.map((updatedStory) => storyService.update(updatedStory.id, updatedStory)),
      );
      results.forEach((result, i) => {
        if (result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok)) {
          failedStories.push(affectedStories[i]!.title || affectedStories[i]!.id.slice(0, 8));
        }
      });
      if (failedStories.length > 0) {
        showError(t("story.partialRefFailed"), t("story.partialRefFailedDetail", { items: failedStories.join("、") }));
      }
    },
  });

  // ── 造型变体 ──
  const outfitHook = useOutfitManagement({
    currentCharacter, setCurrentCharacter, setIsGenerating: imageHook.setIsGenerating,
    addAssetToLibrary, success, showError,
  });

  // ── 保存快捷键 ──
  const handleSaveRef = useRef(crudHook.handleSave);
  useEffect(() => { handleSaveRef.current = crudHook.handleSave; }, [crudHook.handleSave]);
  useGlobalKeyboardActions({ onSave: () => handleSaveRef.current() });

  // ── 选择角色 ──
  const handleSelectCharacter = useCallback(
    async (char: Character) => {
      if (currentCharacter.id && char.id !== currentCharacter.id && isDirty("characters")) {
        if (!(await confirm(t("character.unsavedSwitchConfirm"), t("character.unsavedChanges")))) return;
      }
      setCurrentCharacter(char);
      setIsCreatingNew(false);
      imageHook.setGeneratedImage(resolveImageUrl(char.avatarPath || char.generatedImage || char.refImagePath) || null);
    },
    [currentCharacter.id, isDirty, setCurrentCharacter, imageHook.setGeneratedImage],
  );

  // ── 删除角色（列表项） ──
  const handleDeleteCharacter = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const charId = (e.currentTarget.closest("[data-char-id]") as HTMLElement)?.dataset.charId;
      if (charId) crudHook.handleDelete(charId);
    },
    [crudHook.handleDelete],
  );

  // ── 创建新角色 ──
  const handleCreateNew = useCallback(async () => {
    if (currentCharacter.id && isDirty("characters")) {
      if (!(await confirm(t("character.unsavedSwitchConfirm"), t("character.unsavedChanges")))) return;
    }
    setCurrentCharacter(defaultCharacter);
    setCustomTrait("");
    setCustomStyle("");
    setIsCreatingNew(true);
  }, [currentCharacter.id, isDirty, setCurrentCharacter, setCustomTrait, setCustomStyle]);

  // ── 添加造型 ──
  const handleAddOutfitClick = useCallback(() => {
    outfitHook.setEditingOutfit(null);
    outfitHook.setOutfitForm({ name: "", description: "", clothing: "", accessories: [] });
    outfitHook.setShowOutfitDialog(true);
  }, [outfitHook.setEditingOutfit, outfitHook.setOutfitForm, outfitHook.setShowOutfitDialog]);

  // ── 高亮跳转 ──
  // 只在 highlightId 本身变化时触发，避免 characters 数组引用变化（react-query invalidate）覆盖未保存编辑
  const lastHighlightIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightId || characters.length === 0) return;
    if (lastHighlightIdRef.current === highlightId) return;
    lastHighlightIdRef.current = highlightId;
    // 守卫：如果当前正在编辑且当前 character 不是要高亮的 character，不覆盖
    if (isDirty("characters") && currentCharacter.id !== highlightId) return;
    const found = characters.find((c) => c.id === highlightId);
    if (found) {
      setCurrentCharacterRaw(found);
      imageHook.setGeneratedImage(found.generatedImage || found.refImagePath || null);
    }
  }, [highlightId, characters, imageHook.setGeneratedImage, isDirty, currentCharacter.id, setCurrentCharacterRaw]);

  // ── 素材库选择回调 ──
  const handleAssetSelect = useCallback(
    async (asset: { url: string }) => {
      imageHook.setGeneratedImage(asset.url);
      if (currentCharacter.id) {
        try {
          const result = await characterService.update(currentCharacter.id, {
            ...currentCharacter, refImagePath: asset.url, generatedImage: asset.url,
          });
          if (!result.ok) throw result.error;
          queryClient.invalidateQueries({ queryKey: ["characters"] });
        } catch (err) {
          showError(t("error.saveFailed"), mapUserFacingError(err));
        }
      }
      setShowAssetSelector(false);
      success(t("success.applied"), t("success.imageSelectedFromLibrary"));
    },
    [currentCharacter, imageHook.setGeneratedImage, queryClient, showError, success],
  );

  // ── 引用当前角色的分镜 ──
  const referencedBeats = useMemo(() => {
    if (!currentCharacter.id) return [];
    const beats: { id: string; title: string; status?: string }[] = [];
    for (const story of stories) {
      for (const beat of story.beats || []) {
        if (beat.characterIds?.includes(currentCharacter.id)) {
          beats.push({
            id: beat.id,
            title: `${t("scene.shotNumber", { n: beat.sequence ?? beat.order ?? 0 })} · ${beat.title || beat.description?.slice(0, 20) || t("story.unnamed")}`,
            status: beat.generationStatus === "completed" ? "✓" : beat.generationStatus === "generating" ? "" : undefined,
          });
        }
      }
    }
    return beats;
  }, [stories, currentCharacter.id]);

  // ── 过滤后的角色列表（使用防抖搜索值） ──
  const filteredCharacters = useMemo(() => {
    if (!debouncedSearch.trim()) return characters;
    const q = debouncedSearch.toLowerCase();
    return characters.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.style.toLowerCase().includes(q),
    );
  }, [characters, debouncedSearch]);

  // ── 是否显示编辑器 ──
  const showEditor = Boolean(currentCharacter.id) || isCreatingNew;

  return {
    // 数据
    characters, charactersLoading, assets,
    currentCharacter, setCurrentCharacter,
    customTrait, setCustomTrait,

    // 图像
    isGenerating: imageHook.isGenerating,
    generatedImage: imageHook.generatedImage,
    setGeneratedImage: imageHook.setGeneratedImage,
    isUploading: imageHook.isUploading,
    isAnalyzing: imageHook.isAnalyzing,
    useDetailedPrompt: imageHook.useDetailedPrompt,
    setUseDetailedPrompt: imageHook.setUseDetailedPrompt,
    imageSize: imageHook.imageSize,
    setImageSize: imageHook.setImageSize,
    fileInputRef: imageHook.fileInputRef,
    analyzeFileInputRef: imageHook.analyzeFileInputRef,
    selectedImageModel: imageHook.selectedImageModel,
    setSelectedImageModel: imageHook.setSelectedImageModel,
    generatePrompt: imageHook.generatePrompt,
    generateImage: imageHook.generateImage,
    saveImageToCharacter: imageHook.saveImageToCharacter,
    handleFileUpload: imageHook.handleFileUpload,
    handleAnalyzeFileUpload: imageHook.handleAnalyzeFileUpload,

    // CRUD
    deleteDialogOpen: crudHook.deleteDialogOpen,
    setDeleteDialogOpen: crudHook.setDeleteDialogOpen,
    characterToDelete: crudHook.characterToDelete,
    referenceCheck: crudHook.referenceCheck,
    handleSave: crudHook.handleSave,
    saveStatus: crudHook.saveStatus,
    saveError: crudHook.saveError,
    performDelete: crudHook.performDelete,
    isDeleting: crudHook.isDeleting,
    addTrait: crudHook.addTrait,
    removeTrait: crudHook.removeTrait,

    // 造型
    showOutfitDialog: outfitHook.showOutfitDialog,
    setShowOutfitDialog: outfitHook.setShowOutfitDialog,
    editingOutfit: outfitHook.editingOutfit,
    setEditingOutfit: outfitHook.setEditingOutfit,
    outfitForm: outfitHook.outfitForm,
    setOutfitForm: outfitHook.setOutfitForm,
    customAccessory: outfitHook.customAccessory,
    setCustomAccessory: outfitHook.setCustomAccessory,
    handleAddOutfit: outfitHook.handleAddOutfit,
    handleDeleteOutfit: outfitHook.handleDeleteOutfit,
    handleSetDefaultOutfit: outfitHook.handleSetDefaultOutfit,
    handleEditOutfit: outfitHook.handleEditOutfit,
    handleGenerateOutfitImage: outfitHook.handleGenerateOutfitImage,
    addAccessory: outfitHook.addAccessory,
    removeAccessory: outfitHook.removeAccessory,

    // 事件
    handleSelectCharacter, handleDeleteCharacter, handleCreateNew,
    handleAddOutfitClick, handleAssetSelect,

    // 弹窗
    showAssetSelector, setShowAssetSelector,

    // 计算
    isDirty: isDirty("characters"),

    // UI 状态与派生数据
    search, setSearch,
    isCreatingNew,
    referencedBeats,
    filteredCharacters,
    showEditor,
  };
}
