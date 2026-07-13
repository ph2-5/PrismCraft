import { useId, type RefObject } from "react";
import { ArrowRight, Loader2, Upload } from "lucide-react";
import type { Collection, ImportMode } from "@/domain/schemas";
import { t } from "@/shared/constants";
import { Modal } from "@/shared/presentation/Modal";

interface AddToCollectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  selectedIdsCount: number;
  addToCollectionId: string;
  setAddToCollectionId: (id: string) => void;
  isAddingToCollection: boolean;
  onAddToCollection: () => void;
}

export function AddToCollectionDialog({
  isOpen,
  onClose,
  collections,
  selectedIdsCount,
  addToCollectionId,
  setAddToCollectionId,
  isAddingToCollection,
  onAddToCollection,
}: AddToCollectionDialogProps) {
  return (
    <Modal open={isOpen} onClose={onClose} ariaLabel={t("asset.addToCollectionTitle")}>
      <h2 className="text-lg font-semibold mb-1">{t("asset.addToCollectionTitle")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("asset.addToCollectionDesc", { count: selectedIdsCount })}
      </p>
      <select
        className="select"
        aria-label={t("asset.selectCollection")}
        value={addToCollectionId}
        onChange={(e) => {
          if (e.target.value) setAddToCollectionId(e.target.value);
        }}
      >
        <option value="">{t("asset.selectCollection")}</option>
        {collections.map((col) => (
          <option key={col.id} value={col.id}>
            {col.name}
          </option>
        ))}
      </select>
      {collections.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("asset.noCollectionCreate")}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onAddToCollection}
          disabled={!addToCollectionId || isAddingToCollection}
        >
          {isAddingToCollection ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1" />}
          {isAddingToCollection ? t("asset.adding") : t("common.add")}
        </button>
      </div>
    </Modal>
  );
}

interface NewCollectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  newCollectionName: string;
  setNewCollectionName: (name: string) => void;
  isCreatingCollection: boolean;
  onCreateCollection: () => void;
}

export function NewCollectionDialog({
  isOpen,
  onClose,
  newCollectionName,
  setNewCollectionName,
  isCreatingCollection,
  onCreateCollection,
}: NewCollectionDialogProps) {
  return (
    <Modal open={isOpen} onClose={onClose} ariaLabel={t("asset.newCollection")}>
      <h2 className="text-lg font-semibold mb-1">{t("asset.newCollection")}</h2>
      <p className="text-sm text-muted-foreground mb-4">{t("asset.newCollectionDesc")}</p>
      <input
        className="input !text-xs !py-1.5 !px-2.5"
        data-testid="asset-collection-name-input"
        aria-label={t("asset.collectionNamePlaceholder")}
        value={newCollectionName}
        onChange={(e) => setNewCollectionName(e.target.value)}
        placeholder={t("asset.collectionNamePlaceholder")}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCreateCollection();
        }}
      />
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={isCreatingCollection}
          onClick={onCreateCollection}
        >
          {isCreatingCollection ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
          {isCreatingCollection ? t("asset.creating") : t("asset.create")}
        </button>
      </div>
    </Modal>
  );
}

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  importMode: ImportMode;
  setImportMode: (mode: ImportMode) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}

export function ImportDialog({
  isOpen,
  onClose,
  importMode,
  setImportMode,
  fileInputRef,
}: ImportDialogProps) {
  const importModeId = useId();
  return (
    <Modal open={isOpen} onClose={onClose} ariaLabel={t("asset.importAsaPackage")}>
      <h2 className="text-lg font-semibold mb-1">{t("asset.importAsaPackage")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("asset.importAsaDesc")}
      </p>
      <div className="space-y-4">
        <div>
          <label htmlFor={importModeId} className="text-sm font-medium">{t("asset.importMode")}</label>
          <select
            id={importModeId}
            className="select"
            value={importMode}
            onChange={(e) => {
              if (e.target.value) setImportMode(e.target.value as ImportMode);
            }}
          >
            <option value="skip">{t("asset.skipDuplicate")}</option>
            <option value="replace">{t("asset.overwriteSameId")}</option>
            <option value="merge">{t("asset.mergeToCollection")}</option>
          </select>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm w-full justify-center"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-4 h-4 mr-2" />
          {t("asset.selectAsaFile")}
        </button>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          {t("common.cancel")}
        </button>
      </div>
    </Modal>
  );
}
