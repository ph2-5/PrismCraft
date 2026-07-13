import type { RefObject } from "react";
import type { Collection, ImportMode } from "@/domain/schemas";
import {
  AddToCollectionDialog,
  NewCollectionDialog,
  ImportDialog,
} from "./AssetCollectionDialogsParts";

interface AssetCollectionDialogsProps {
  isCollectionDialogOpen: boolean;
  setIsCollectionDialogOpen: (open: boolean) => void;
  isNewCollectionDialogOpen: boolean;
  setIsNewCollectionDialogOpen: (open: boolean) => void;
  isImportDialogOpen: boolean;
  setIsImportDialogOpen: (open: boolean) => void;
  collections: Collection[];
  selectedIdsCount: number;
  addToCollectionId: string;
  setAddToCollectionId: (id: string) => void;
  isAddingToCollection: boolean;
  onAddToCollection: () => void;
  newCollectionName: string;
  setNewCollectionName: (name: string) => void;
  isCreatingCollection: boolean;
  onCreateCollection: () => void;
  importMode: ImportMode;
  setImportMode: (mode: ImportMode) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}

export function AssetCollectionDialogs({
  isCollectionDialogOpen,
  setIsCollectionDialogOpen,
  isNewCollectionDialogOpen,
  setIsNewCollectionDialogOpen,
  isImportDialogOpen,
  setIsImportDialogOpen,
  collections,
  selectedIdsCount,
  addToCollectionId,
  setAddToCollectionId,
  isAddingToCollection,
  onAddToCollection,
  newCollectionName,
  setNewCollectionName,
  isCreatingCollection,
  onCreateCollection,
  importMode,
  setImportMode,
  fileInputRef,
}: AssetCollectionDialogsProps) {
  return (
    <>
      <AddToCollectionDialog
        isOpen={isCollectionDialogOpen}
        onClose={() => setIsCollectionDialogOpen(false)}
        collections={collections}
        selectedIdsCount={selectedIdsCount}
        addToCollectionId={addToCollectionId}
        setAddToCollectionId={setAddToCollectionId}
        isAddingToCollection={isAddingToCollection}
        onAddToCollection={onAddToCollection}
      />
      <NewCollectionDialog
        isOpen={isNewCollectionDialogOpen}
        onClose={() => setIsNewCollectionDialogOpen(false)}
        newCollectionName={newCollectionName}
        setNewCollectionName={setNewCollectionName}
        isCreatingCollection={isCreatingCollection}
        onCreateCollection={onCreateCollection}
      />
      <ImportDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        importMode={importMode}
        setImportMode={setImportMode}
        fileInputRef={fileInputRef}
      />
    </>
  );
}
