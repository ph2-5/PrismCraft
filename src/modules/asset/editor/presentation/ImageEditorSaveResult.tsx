/**
 * 图片编辑器保存结果提示子组件
 *
 * 负责渲染保存成功/失败的 alert 提示，不包含业务逻辑。
 * 从 image-editor-panel 拆分而来（Task 4.5）。
 */

import { CheckCircle2, AlertCircle } from "lucide-react";
import { t } from "@/shared/constants";

export interface ImageEditorSaveResultProps {
  saveResult: { success: boolean; path?: string; error?: string } | null;
}

export function ImageEditorSaveResult({ saveResult }: ImageEditorSaveResultProps) {
  if (!saveResult) return null;
  return (
    <div className={`alert text-xs ${saveResult.success ? "alert-success" : "alert-error"}`}>
      {saveResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      <span>
        {saveResult.success
          ? t("asset.editor.savedAs", { path: saveResult.path ?? "" })
          : t("asset.editor.saveFailed", { error: saveResult.error ?? "" })}
      </span>
    </div>
  );
}
