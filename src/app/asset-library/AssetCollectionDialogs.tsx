import type { RefObject } from "react";
import { ArrowRight, Loader2, Upload } from "lucide-react";
import type { Collection, ImportMode } from "@/domain/schemas";
import { t } from "@/shared/constants";

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
      {isCollectionDialogOpen && (
        <div className="modal-overlay" onClick={() => setIsCollectionDialogOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">{t("asset.addToCollectionTitle")}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {t("asset.addToCollectionDesc", { count: selectedIdsCount })}
            </p>
            <select
              className="select"
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
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setIsCollectionDialogOpen(false)}
              >
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
          </div>
        </div>
      )}

      {isNewCollectionDialogOpen && (
        <div className="modal-overlay" onClick={() => setIsNewCollectionDialogOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">{t("asset.newCollection")}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t("asset.newCollectionDesc")}</p>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px" }}
              data-testid="asset-collection-name-input"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder={t("asset.collectionNamePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreateCollection();
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setIsNewCollectionDialogOpen(false)}
              >
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
          </div>
        </div>
      )}

      {isImportDialogOpen && (
        <div className="modal-overlay" onClick={() => setIsImportDialogOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">{t("asset.importAsaPackage")}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {t("asset.importAsaDesc")}
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">{t("asset.importMode")}</label>
                <select
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
                className="btn btn-primary btn-sm"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                {t("asset.selectAsaFile")}
              </button>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setIsImportDialogOpen(false)}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
