import type { AssetTab, EditingItem } from "./AssetCardGrid";
import { useAssetBatchHandlers } from "./useAssetBatchHandlers";
import { useAssetCollectionHandlers } from "./useAssetCollectionHandlers";
import { useAssetDeleteHandlers } from "./useAssetDeleteHandlers";
import { useAssetEditHandlers } from "./useAssetEditHandlers";

interface UseAssetLibraryActionsParams {
  // 选择上下文
  selection: {
    activeTab: AssetTab;
    selectedIds: Set<string>;
    clearSelection: () => void;
    setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  };
  // 数据同步
  setSecondaryData: (data: { storyboards: import("@/domain/schemas").StoryboardAsset[]; collections: import("@/domain/schemas").Collection[]; collectionAssets: import("@/domain/schemas").CollectionAsset[] }) => void;
  // 弹窗开关集合
  dialogControls: {
    setIsCollectionDialogOpen: (v: boolean) => void;
    setIsImportDialogOpen: (v: boolean) => void;
    setIsNewCollectionDialogOpen: (v: boolean) => void;
    setIsEditDialogOpen: (v: boolean) => void;
    setIsAddingToCollection: (v: boolean) => void;
  };
  // loading 开关集合
  loadingControls: {
    setIsBatchDeleting: (v: boolean) => void;
    setIsSavingEdit: (v: boolean) => void;
    setIsCreatingCollection: (v: boolean) => void;
    isBatchDeleting: boolean;
  };
  // 编辑弹窗上下文
  editDialog: {
    editingItem: EditingItem | null;
    setEditingItem: (item: EditingItem | null) => void;
  };
  // 收藏集表单上下文
  collectionForm: {
    addToCollectionId: string;
    newCollectionName: string;
    setNewCollectionName: (v: string) => void;
  };
}

export function useAssetLibraryActions({
  selection,
  setSecondaryData,
  dialogControls,
  loadingControls,
  editDialog,
  collectionForm,
}: UseAssetLibraryActionsParams) {
  const batchHandlers = useAssetBatchHandlers({
    selection,
    setSecondaryData,
    dialogControls: {
      setIsCollectionDialogOpen: dialogControls.setIsCollectionDialogOpen,
      setIsImportDialogOpen: dialogControls.setIsImportDialogOpen,
      setIsAddingToCollection: dialogControls.setIsAddingToCollection,
    },
    loadingControls: {
      setIsBatchDeleting: loadingControls.setIsBatchDeleting,
      isBatchDeleting: loadingControls.isBatchDeleting,
    },
    collectionForm: {
      addToCollectionId: collectionForm.addToCollectionId,
    },
  });

  const collectionHandlers = useAssetCollectionHandlers({
    dialogControls: {
      setIsNewCollectionDialogOpen: dialogControls.setIsNewCollectionDialogOpen,
    },
    loadingControls: {
      setIsCreatingCollection: loadingControls.setIsCreatingCollection,
    },
    collectionForm: {
      newCollectionName: collectionForm.newCollectionName,
      setNewCollectionName: collectionForm.setNewCollectionName,
    },
    loadSecondaryData: batchHandlers.loadSecondaryData,
  });

  const deleteHandlers = useAssetDeleteHandlers({
    loadSecondaryData: batchHandlers.loadSecondaryData,
  });

  const editHandlers = useAssetEditHandlers({
    editDialog,
    dialogControls: {
      setIsEditDialogOpen: dialogControls.setIsEditDialogOpen,
    },
    loadingControls: {
      setIsSavingEdit: loadingControls.setIsSavingEdit,
    },
    loadSecondaryData: batchHandlers.loadSecondaryData,
  });

  return {
    loadSecondaryData: batchHandlers.loadSecondaryData,
    handleBatchDelete: batchHandlers.handleBatchDelete,
    handleBatchExport: batchHandlers.handleBatchExport,
    handleAddToCollection: batchHandlers.handleAddToCollection,
    handleImport: batchHandlers.handleImport,
    handleCreateCollection: collectionHandlers.handleCreateCollection,
    handleDeleteCollection: collectionHandlers.handleDeleteCollection,
    handleExportCollection: collectionHandlers.handleExportCollection,
    handleDeleteCharacter: deleteHandlers.handleDeleteCharacter,
    handleDeleteScene: deleteHandlers.handleDeleteScene,
    handleDeleteStoryboard: deleteHandlers.handleDeleteStoryboard,
    handleEditItem: editHandlers.handleEditItem,
    handleSaveEdit: editHandlers.handleSaveEdit,
  };
}
