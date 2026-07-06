import { useState, useCallback } from "react";
import type { EditingItem } from "../AssetCardGrid";

export function useAssetDialogState() {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCollectionDialogOpen, setIsCollectionDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isNewCollectionDialogOpen, setIsNewCollectionDialogOpen] = useState(false);

  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [addToCollectionId, setAddToCollectionId] = useState("");
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isAddingToCollection, setIsAddingToCollection] = useState(false);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);

  const handleOpenImportDialog = useCallback(() => {
    setIsImportDialogOpen(true);
  }, []);

  const handleOpenCollectionDialog = useCallback(() => {
    setIsCollectionDialogOpen(true);
  }, []);

  const handleNewCollection = useCallback(() => {
    setIsNewCollectionDialogOpen(true);
  }, []);

  const handleEditingItemChange = useCallback((item: EditingItem | null) => {
    setEditingItem(item);
  }, []);

  return {
    // Dialog open states
    isEditDialogOpen,
    setIsEditDialogOpen,
    isCollectionDialogOpen,
    setIsCollectionDialogOpen,
    isImportDialogOpen,
    setIsImportDialogOpen,
    isNewCollectionDialogOpen,
    setIsNewCollectionDialogOpen,
    // Edit dialog
    editingItem,
    setEditingItem,
    handleEditingItemChange,
    // Collection form
    newCollectionName,
    setNewCollectionName,
    addToCollectionId,
    setAddToCollectionId,
    // Loading flags
    isBatchDeleting,
    setIsBatchDeleting,
    isAddingToCollection,
    setIsAddingToCollection,
    isSavingEdit,
    setIsSavingEdit,
    isCreatingCollection,
    setIsCreatingCollection,
    // Simple open handlers
    handleOpenImportDialog,
    handleOpenCollectionDialog,
    handleNewCollection,
  };
}
