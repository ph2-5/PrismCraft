import { useState, useRef, useEffect } from "react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Progress } from "@/shared/ui/progress";
import { Switch } from "@/shared/ui/switch";
import { Label } from "@/shared/ui/label";
import { useProjectExport, type ProjectData } from "@/modules/asset";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { Download, Upload, Package, FileArchive, AlertCircle, CheckCircle } from "lucide-react";
import { t } from "@/shared/constants";

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
      showError(t("error.importFailed"), err instanceof Error ? err.message : t("asset.cannotParseProject"));
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            {t("asset.projectPackTitle")}
          </CardTitle>
          <CardDescription>
            {t("asset.projectPackDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 导出选项 */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label>{t("asset.includeAssets")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("asset.includeAssetsDesc")}
              </p>
            </div>
            <Switch
              checked={includeAssets}
              onCheckedChange={setIncludeAssets}
            />
          </div>

          {/* 导出进度 */}
          {isExporting && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t("asset.exportingProgress")}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="flex-1"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? t("common.exporting") : t("asset.exportProject")}
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex-1"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isImporting ? t("asset.readingFile") : t("asset.importProject")}
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            className="hidden"
          />
        </CardContent>
      </Card>

      {/* 导入预览对话框 */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileArchive className="w-5 h-5" />
              {t("asset.confirmImportProject")}
            </DialogTitle>
            <DialogDescription>
              {t("asset.confirmImportDesc")}
            </DialogDescription>
          </DialogHeader>

          {importPreview && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="font-medium">{t("asset.characterCount", { count: importPreview.characters.length })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="font-medium">{t("asset.sceneCount", { count: importPreview.scenes.length })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="font-medium">{t("asset.storyCount", { count: importPreview.stories.length })}</span>
                </div>
                {importPreview.exportedAt && (
                  <div className="text-xs text-muted-foreground pt-2">
                    {t("asset.exportTime", { time: new Date(importPreview.exportedAt).toLocaleString() })}
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 text-sm text-yellow-600">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <p>
                  {t("asset.importMergeWarning")}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmImport}>
              {t("asset.confirmImport")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
