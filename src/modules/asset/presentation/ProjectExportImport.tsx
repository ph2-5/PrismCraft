"use client";

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
      success("导出成功", `工程已导出为 ${result.filename}`);
    } else {
      showError("导出失败", result.error || "未知错误");
    }
  };

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      showError("文件格式错误", "请选择 ZIP 格式的工程文件");
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
        showError("导入失败", result.error || "无法解析工程文件");
      }
    } catch (err) {
      showError("导入失败", err instanceof Error ? err.message : "无法解析工程文件");
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
      success("导入成功", "工程数据已导入");
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            工程打包
          </CardTitle>
          <CardDescription>
            导出或导入完整工程，包含所有角色、场景、故事和素材
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 导出选项 */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label>包含素材文件</Label>
              <p className="text-sm text-muted-foreground">
                导出时包含所有图片素材，文件会更大
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
                <span>正在导出...</span>
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
              {isExporting ? "导出中..." : "导出工程"}
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex-1"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isImporting ? "读取中..." : "导入工程"}
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
              确认导入工程
            </DialogTitle>
            <DialogDescription>
              请确认要导入的工程内容
            </DialogDescription>
          </DialogHeader>

          {importPreview && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="font-medium">角色: {importPreview.characters.length} 个</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="font-medium">场景: {importPreview.scenes.length} 个</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="font-medium">故事: {importPreview.stories.length} 个</span>
                </div>
                {importPreview.exportedAt && (
                  <div className="text-xs text-muted-foreground pt-2">
                    导出时间: {new Date(importPreview.exportedAt).toLocaleString()}
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 text-sm text-yellow-600">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <p>
                  导入将合并到现有数据中，相同 ID 的项目会被覆盖。
                  建议在导入前备份当前工程。
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmImport}>
              确认导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
