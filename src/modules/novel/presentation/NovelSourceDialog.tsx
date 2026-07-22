/**
 * NovelSourceDialog — 原文↔分镜对照视图（Q2-2）
 *
 * 在 Story 详情页点击"查看原始小说"时弹出，展示该 Story 关联的 novel_project
 * 的原文内容。Q2-2 增强：当传入 beats 时，切换为左右分栏对照模式：
 *   左侧：原文文本（高亮选中分镜的 sourceStartChar~sourceEndChar 片段）
 *   右侧：分镜列表（点击高亮原文，显示章节归属）
 *
 * 数据通过 props 注入（novelSource + beats），不直接调用 hooks，保持纯展示组件。
 * 依赖方向：仅依赖 @/domain/schemas/story + @/shared/* + lucide-react。
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { FileText, X, BookOpen, AlignLeft } from "lucide-react";
import { t } from "@/shared/constants";
import { Modal } from "@/shared/presentation/Modal";
import type { StoryBeat } from "@/domain/schemas/story";

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
  /** Q2-2: 分镜列表，用于原文↔分镜对照视图。无 beats 时回退为纯原文展示 */
  beats?: StoryBeat[];
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NovelSourceDialog({ open, onClose, novelSource, beats }: NovelSourceDialogProps) {
  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);

  const beatList = beats ?? [];
  const hasBeats = beatList.length > 0;

  const selectedBeat = useMemo(
    () => beatList.find((b) => b.id === selectedBeatId) ?? null,
    [beatList, selectedBeatId],
  );

  // 选中分镜时滚动原文到高亮位置
  useEffect(() => {
    if (selectedBeat && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedBeat]);

  // 对话框关闭时重置选中状态
  useEffect(() => {
    if (!open) setSelectedBeatId(null);
  }, [open]);

  const rawText = novelSource?.rawText ?? "";

  // 计算原文高亮三段切片
  const highlightSegments = useMemo(() => {
    const start = selectedBeat?.sourceStartChar;
    const end = selectedBeat?.sourceEndChar;
    if (start == null || end == null) return null;
    if (start < 0 || end > rawText.length || start >= end) return null;
    return {
      before: rawText.slice(0, start),
      highlight: rawText.slice(start, end),
      after: rawText.slice(end),
    };
  }, [selectedBeat, rawText]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t("novel.source.dialogTitle")}
      className="max-h-[85vh] flex flex-col w-[calc(100vw-2rem)]"
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
                {hasBeats ? t("novel.source.compare") : t("novel.source.dialogTitle")}
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

        {/* 内容区域：有分镜时左右分栏对照，无分镜时纯原文展示 */}
        {hasBeats ? (
          <div className="flex-1 min-h-0 flex">
            {/* 左侧：原文 */}
            <div className="w-1/2 flex flex-col border-r border-border min-h-0">
              <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-1.5">
                <AlignLeft size={12} className="text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t("novel.source.originalText")}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 min-h-0">
                {rawText ? (
                  <pre className="text-[12px] whitespace-pre-wrap break-words font-mono leading-relaxed text-foreground">
                    {highlightSegments ? (
                      <>
                        <span>{highlightSegments.before}</span>
                        <span
                          ref={highlightRef}
                          className="bg-[rgba(var(--primary-rgb),0.2)] rounded px-0.5 -mx-0.5 ring-1 ring-[rgba(var(--primary-rgb),0.4)]"
                        >
                          {highlightSegments.highlight}
                        </span>
                        <span>{highlightSegments.after}</span>
                      </>
                    ) : (
                      rawText
                    )}
                  </pre>
                ) : (
                  <p className="text-[12px] text-muted-foreground">{t("novel.source.empty")}</p>
                )}
              </div>
            </div>

            {/* 右侧：分镜列表 */}
            <div className="w-1/2 flex flex-col min-h-0">
              <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-1.5">
                <BookOpen size={12} className="text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t("novel.source.beatList")}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {t("novel.source.clickHint")}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 min-h-0 space-y-1">
                {beatList.map((beat) => {
                  const hasSource = beat.sourceStartChar != null && beat.sourceEndChar != null;
                  const isSelected = beat.id === selectedBeatId;
                  return (
                    <button
                      key={beat.id}
                      type="button"
                      disabled={!hasSource}
                      onClick={() => setSelectedBeatId(isSelected ? null : beat.id)}
                      className={`w-full text-left p-2 rounded text-[12px] transition-colors ${
                        isSelected
                          ? "bg-[rgba(var(--primary-rgb),0.15)] border border-[rgba(var(--primary-rgb),0.3)]"
                          : hasSource
                            ? "hover:bg-muted border border-transparent"
                            : "opacity-50 cursor-not-allowed border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-bold text-[var(--primary)] shrink-0">
                          {t("novel.source.beatLabel", { sequence: beat.sequence })}
                        </span>
                        {beat.chapterTitle && (
                          <span className="text-[9px] text-muted-foreground truncate">
                            {beat.chapterTitle}
                          </span>
                        )}
                        {!hasSource && (
                          <span className="text-[9px] text-muted-foreground ml-auto shrink-0">
                            {t("novel.source.noSourceLink")}
                          </span>
                        )}
                      </div>
                      <p
                        className="text-[11px] text-foreground overflow-hidden"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {beat.description || beat.title || beat.content || ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* 无分镜时：纯原文展示 */
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <pre className="text-[12px] whitespace-pre-wrap break-words font-mono leading-relaxed text-foreground">
              {rawText || t("novel.source.empty")}
            </pre>
          </div>
        )}

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
