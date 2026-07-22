/**
 * NovelSourceDialog — 原始小说回溯对话框
 *
 * 在 Story 详情页点击"查看原始小说"时弹出，展示该 Story 关联的 novel_project
 * 的标题、导入时间和原文内容。仅当 Story 由小说导入管道创建时可用。
 *
 * 数据通过 props 注入（novelSource），不直接调用 hooks，保持纯展示组件。
 * 依赖方向：仅依赖 @/shared/* + lucide-react（与 NovelProjectList 一致）。
 */

import { FileText, X } from "lucide-react";
import { t } from "@/shared/constants";
import { Modal } from "@/shared/presentation/Modal";

/** 对话框展示的原始小说信息（与 StoryWithNovelSource.novelSource 形状一致） */
export interface NovelSourceDialogData {
  id: string;
  title: string;
  rawText: string;
  createdAt: number;
  updatedAt: number;
}

export interface NovelSourceDialogProps {
  open: boolean;
  onClose: () => void;
  /** 原始小说数据；null 表示无关联（对话框不应被打开） */
  novelSource: NovelSourceDialogData | null;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NovelSourceDialog({ open, onClose, novelSource }: NovelSourceDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t("novel.source.dialogTitle")}
      className="max-h-[80vh] flex flex-col w-[calc(100vw-2rem)]"
    >
      <div className="card w-full flex-1 min-h-0 flex flex-col !p-0">
        {/* 头部 */}
        <div className="flex items-start justify-between gap-2 p-4 border-b border-border shrink-0">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[rgba(var(--primary-rgb),0.1)] flex items-center justify-center shrink-0">
              <FileText size={15} className="text-[var(--primary)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-bold leading-tight">
                {t("novel.source.dialogTitle")}
              </h2>
              <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
                {novelSource?.title || t("novel.projectList.untitledProject")}
              </p>
              {novelSource && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t("novel.source.importedAt", { time: formatDateTime(novelSource.createdAt) })}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("novel.projectList.close")}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 -m-1 rounded"
          >
            <X size={15} />
          </button>
        </div>

        {/* 原文内容（可滚动） */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <pre className="text-[12px] whitespace-pre-wrap break-words font-mono leading-relaxed text-foreground">
            {novelSource?.rawText || t("novel.source.empty")}
          </pre>
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end p-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline text-[12px] px-3 py-1.5"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
