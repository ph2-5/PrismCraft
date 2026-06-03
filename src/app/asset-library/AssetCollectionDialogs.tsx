import type { RefObject } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
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
      <Dialog
        open={isCollectionDialogOpen}
        onOpenChange={setIsCollectionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("asset.addToCollectionTitle")}</DialogTitle>
            <DialogDescription>
              {t("asset.addToCollectionDesc", { count: selectedIdsCount })}
            </DialogDescription>
          </DialogHeader>
          <Select
            value={addToCollectionId}
            onValueChange={(v) => {
              if (v) setAddToCollectionId(v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("asset.selectCollection")} />
            </SelectTrigger>
            <SelectContent>
              {collections.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {col.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {collections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("asset.noCollectionCreate")}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsCollectionDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={onAddToCollection}
              disabled={!addToCollectionId || isAddingToCollection}
            >
              {isAddingToCollection ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1" />}
              {isAddingToCollection ? t("asset.adding") : t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isNewCollectionDialogOpen}
        onOpenChange={setIsNewCollectionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("asset.newCollection")}</DialogTitle>
            <DialogDescription>{t("asset.newCollectionDesc")}</DialogDescription>
          </DialogHeader>
          <Input
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder={t("asset.collectionNamePlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreateCollection();
            }}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsNewCollectionDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button disabled={isCreatingCollection} onClick={onCreateCollection}>
              {isCreatingCollection ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {isCreatingCollection ? t("asset.creating") : t("asset.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("asset.importAsaPackage")}</DialogTitle>
            <DialogDescription>
              {t("asset.importAsaDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("asset.importMode")}</label>
              <Select
                value={importMode}
                onValueChange={(v) => {
                  if (v) setImportMode(v as ImportMode);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">{t("asset.skipDuplicate")}</SelectItem>
                  <SelectItem value="replace">{t("asset.overwriteSameId")}</SelectItem>
                  <SelectItem value="merge">{t("asset.mergeToCollection")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              {t("asset.selectAsaFile")}
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsImportDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
