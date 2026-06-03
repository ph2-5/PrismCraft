import React from "react";
import { Button } from "@/shared/ui/button";
import { Upload, Package } from "lucide-react";
import { t } from "@/shared/constants";

interface AssetUploadSectionProps {
  onOpenImportDialog: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function AssetUploadSection({
  onOpenImportDialog,
  fileInputRef,
  onImport,
}: AssetUploadSectionProps) {
  return (
    <div className="flex justify-between items-center">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-5 h-5" />
          {t("asset.libraryTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("asset.libraryDesc")}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onOpenImportDialog}
        >
          <Upload className="w-4 h-4 mr-2" />
          {t("asset.importAsa")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".asa"
          className="hidden"
          onChange={onImport}
        />
      </div>
    </div>
  );
}
