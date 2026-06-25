import { useState, useRef, useEffect } from "react";
import { useProjectExport, type ProjectData } from "@/modules/asset";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { Download, Upload, Package, FileArchive, AlertCircle, CheckCircle } from "lucide-react";
import { t } from "@/shared/constants";
import { Modal } from "@/shared/presentation/Modal";

interface ProjectExportImportProps {
  onImport?: (data: ProjectData) => void;
}

export function ProjectExportImport({ onImport }: ProjectExportImportProps) {
  const { exportProject, importProject, isExporting, progress } = useProjectExport();
  const { success, error: showError } = useToastHelpers();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ProjectData | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [includeAssets, setIncludeAssets] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingBlobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      for (const url of pendingBlobUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  // 处理导出
  const handleExport = async () => {
    const result = await exportProject({ includeAssets });
    if (result.success) {
      success(t("success.exported"), t("asset.projectExportedAs", { filename: result.filename ?? "" }));
    } else {
      showError(t("error.exportFailed"), result.error || t("error.unknown"));
    }
  };

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      showError(t("error.invalidFileFormat"), t("error.selectZipFile"));
      return;
    }

    if (isImporting) return;
    setIsImporting(true);
    try {
      const result = await importProject(file);

      if (result.success && result.data) {
        setImportPreview(result.data);
        if (result.blobUrls) {
          pendingBlobUrlsRef.current = result.blobUrls;
        }
        setImportDialogOpen(true);
      } else {
        if (result.blobUrls) {
          for (const url of result.blobUrls) {
            URL.revokeObjectURL(url);
          }
        }
        showError(t("error.importFailed"), result.error || t("asset.cannotParseProject"));
      }
    } catch (err) {
      showError(t("error.importFailed"), mapUserFacingError(err));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 确认导入
  const handleConfirmImport = () => {
    if (importPreview && onImport) {
      onImport(importPreview);
      setImportDialogOpen(false);
      setImportPreview(null);
      success(t("success.imported"), t("asset.projectImported"));
    }
  };

  return (
    <>
      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 }}>
            <Package size={18} />
            {t("asset.projectPackTitle")}
          </div>
          <p style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 4 }}>
            {t("asset.projectPackDesc")}
          </p>
        </div>

        {/* 导出选项 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          <div>
            <label style={{ fontSize: 13, fontWeight: 500 }}>{t("asset.includeAssets")}</label>
            <p style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>
              {t("asset.includeAssetsDesc")}
            </p>
          </div>
          <button
            type="button"
            className={`toggle ${includeAssets ? "on" : ""}`}
            onClick={() => setIncludeAssets(!includeAssets)}
            aria-label={t("asset.includeAssets")}
          />
        </div>

        {/* 导出进度 */}
        {isExporting && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>{t("asset.exportingProgress")}</span>
              <span>{progress}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleExport}
            disabled={isExporting}
            style={{ flex: 1 }}
          >
            <Download size={14} style={{ marginRight: 4 }} />
            {isExporting ? t("common.exporting") : t("asset.exportProject")}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            style={{ flex: 1 }}
          >
            <Upload size={14} style={{ marginRight: 4 }} />
            {isImporting ? t("asset.readingFile") : t("asset.importProject")}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
      </div>

      {/* 导入预览对话框 */}
      <Modal
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        ariaLabel={t("asset.confirmImportProject")}
        style={{ minWidth: 420 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
          <FileArchive size={18} />
          {t("asset.confirmImportProject")}
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-fg)", marginBottom: 16 }}>
          {t("asset.confirmImportDesc")}
        </p>

        {importPreview && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}>
            <div
              style={{
                padding: 16,
                background: "rgba(var(--primary-rgb, 99, 102, 241), 0.1)",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle size={14} style={{ color: "var(--success)" }} />
                <span style={{ fontWeight: 500, fontSize: 13 }}>{t("asset.characterCount", { count: importPreview.characters.length })}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle size={14} style={{ color: "var(--success)" }} />
                <span style={{ fontWeight: 500, fontSize: 13 }}>{t("asset.sceneCount", { count: importPreview.scenes.length })}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle size={14} style={{ color: "var(--success)" }} />
                <span style={{ fontWeight: 500, fontSize: 13 }}>{t("asset.storyCount", { count: importPreview.stories.length })}</span>
              </div>
              {importPreview.exportedAt && (
                <div style={{ fontSize: 11, color: "var(--muted-fg)", paddingTop: 8 }}>
                  {t("asset.exportTime", { time: new Date(importPreview.exportedAt).toLocaleString() })}
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--warning)" }}>
              <AlertCircle size={14} style={{ marginTop: 2 }} />
              <p>{t("asset.importMergeWarning")}</p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setImportDialogOpen(false)}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleConfirmImport}
          >
            {t("asset.confirmImport")}
          </button>
        </div>
      </Modal>
    </>
  );
}
