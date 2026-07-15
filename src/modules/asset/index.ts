export { mediaAssetService } from "./media-assets";
export { characterService, sceneService, storyboardAssetService, collectionService } from "./asset-library";
export { assetExportService } from "./asset-library/asa-export-service";
export type { MergeStrategy } from "./import-export";
export {
  useMediaAssets,
  useCreateMediaAsset,
  useDeleteMediaAsset,
  useExportData,
  useDownloadExport,
  useImportData,
  useImportFromFile,
  useProjectExport,
} from "./hooks";
export type { ProjectData, ExportResult } from "./hooks";
export { BatchOperations, ProjectExportImport } from "./presentation";

// Task 4.11: 生成资产统一管理（generation_assets 表）
export {
  listAssetsByType,
  listAssetsByProject,
  listAssetsByBeat,
  getAsset,
  createAsset,
  updateAsset,
  deleteAsset,
  deleteUnreferencedAssets,
  getReferenceInfo,
  useGenerationAssets,
  AssetGallery,
} from "./generation-assets";
export type { UseGenerationAssetsResult } from "./generation-assets";
