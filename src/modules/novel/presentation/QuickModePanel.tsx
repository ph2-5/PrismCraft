/**
 * Task 2A.16 — 快速模式简化 UI
 *
 * 为 quick 模式设计的单页面 UI：
 * - 左侧：大文本框（粘贴故事）
 * - 右侧：预览区（显示分镜列表 / 生成中状态 / 完成提示）
 * - 顶部：[⚡ 快速生成] 按钮 + 进度条
 *
 * 流程：粘贴 → 点击生成 → AI 全自动处理（分割/提取/分镜/Prompt）→ 显示分镜列表
 *
 * 隐藏：片段导航、上下文面板、Phase 指示器、手动编辑功能
 *
 * 依赖方向：仅依赖 @/shared/constants（i18n）+ 同模块 domain/types（ShotBreakdown）
 */

import { useMemo, useState } from "react";
import { Loader2, Zap, FileText, Film, CheckCircle2, AlertCircle } from "lucide-react";
import { t } from "@/shared/constants";
import type { ShotBreakdown } from "../domain/types";

export interface QuickModePanelProps {
  /** 当前故事文本（受控） */
  rawText: string;
  /** 文本变化回调 */
  onTextChange: (text: string) => void;
  /** 点击"快速生成"按钮回调 */
  onGenerate: () => void;
  /** 是否正在生成中 */
  isProcessing: boolean;
  /** 生成的分镜列表（生成完成后显示） */
  shots: ShotBreakdown[];
  /** 生成阶段进度提示（由父组件传入，如"正在分割段落..."/"正在提取角色..."） */
  progressHint?: string;
}

type GenerationStatus = "idle" | "processing" | "success" | "error";

/**
 * QuickModePanel 内部状态 hook：集中管理 status 计算 + handleGenerate。
 *
 * 提取到模块级以减少 QuickModePanel 函数体行数（max-lines-per-function 警告）。
 */
interface UseQuickModePanelStateOptions {
  rawText: string;
  onGenerate: () => void;
  isProcessing: boolean;
  shots: ShotBreakdown[];
}

interface UseQuickModePanelStateResult {
  status: GenerationStatus;
  canGenerate: boolean;
  handleGenerate: () => void;
}

function useQuickModePanelState({
  rawText, onGenerate, isProcessing, shots,
}: UseQuickModePanelStateOptions): UseQuickModePanelStateResult {
  const [hasError, setHasError] = useState(false);

  const status: GenerationStatus = useMemo(() => {
    if (isProcessing) return "processing";
    if (hasError) return "error";
    if (shots.length > 0) return "success";
    return "idle";
  }, [isProcessing, hasError, shots.length]);

  const canGenerate = rawText.trim().length > 0 && !isProcessing;

  const handleGenerate = () => {
    setHasError(false);
    try {
      onGenerate();
    } catch {
      setHasError(true);
    }
  };

  return { status, canGenerate, handleGenerate };
}

export function QuickModePanel({
  rawText,
  onTextChange,
  onGenerate,
  isProcessing,
  shots,
  progressHint,
}: QuickModePanelProps) {
  const { status, canGenerate, handleGenerate } = useQuickModePanelState({
    rawText, onGenerate, isProcessing, shots,
  });

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* 顶部：标题 + 快速生成按钮 + 进度条 */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-amber-500" />
          <h3 className="text-[13px] font-semibold">{t("novel.quickMode.title")}</h3>
          <span className="text-[10px] text-muted-foreground">
            {t("novel.quickMode.subtitle")}
          </span>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="btn btn-primary text-[12px] px-4 py-1.5 flex items-center gap-1.5"
        >
          {isProcessing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Zap size={12} />
          )}
          {t("novel.quickMode.generate")}
        </button>
      </div>

      {/* 进度条（处理中时显示） */}
      {isProcessing && (
        <div className="space-y-1.5">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "60%" }} />
          </div>
          <div className="text-[10px] text-muted-foreground text-center">
            {progressHint ?? t("novel.quickMode.progressDefault")}
          </div>
        </div>
      )}

      {/* 主体：左侧文本框 + 右侧预览 */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0">
        {/* 左侧：大文本框 */}
        <div className="card p-3 flex flex-col min-h-0">
          <div className="flex items-center gap-1.5 mb-2">
            <FileText size={11} className="text-primary" />
            <span className="text-[11px] font-medium">
              {t("novel.quickMode.textArea")}
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto font-mono">
              {rawText.length} {t("novel.quickMode.chars")}
            </span>
          </div>
          <textarea
            value={rawText}
            onChange={(e) => onTextChange(e.target.value)}
            disabled={isProcessing}
            placeholder={t("novel.quickMode.placeholder")}
            className="flex-1 input text-[12px] p-2 resize-none leading-relaxed"
            style={{ minHeight: "300px" }}
          />
        </div>

        {/* 右侧：预览区 */}
        <div className="card p-3 flex flex-col min-h-0">
          <div className="flex items-center gap-1.5 mb-2">
            <Film size={11} className="text-primary" />
            <span className="text-[11px] font-medium">
              {t("novel.quickMode.preview")}
            </span>
            {status === "success" && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {t("novel.quickMode.shotCount", { n: shots.length })}
              </span>
            )}
          </div>

          {/* 预览内容（根据 status 切换） */}
          <div className="flex-1 overflow-y-auto">
            {status === "idle" && (
              <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground text-center p-4">
                {t("novel.quickMode.idleHint")}
              </div>
            )}

            {status === "processing" && (
              <div className="h-full flex flex-col items-center justify-center gap-2 p-4">
                <Loader2 size={24} className="animate-spin text-primary" />
                <div className="text-[11px] text-muted-foreground">
                  {progressHint ?? t("novel.quickMode.progressDefault")}
                </div>
              </div>
            )}

            {status === "error" && (
              <div className="h-full flex flex-col items-center justify-center gap-2 p-4">
                <AlertCircle size={24} className="text-destructive" />
                <div className="text-[11px] text-muted-foreground text-center">
                  {t("novel.quickMode.errorHint")}
                </div>
              </div>
            )}

            {status === "success" && (
              <div className="space-y-1.5">
                {shots.map((shot) => (
                  <div key={shot.id} className="border border-border rounded p-2 hover:bg-muted/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        #{shot.sequence}
                      </span>
                      <span className="text-[9px] badge badge-info px-1 py-0">
                        {shot.shotType}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed line-clamp-3">
                      {shot.description}
                    </p>
                    {shot.characters.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {shot.characters.map((c) => (
                          <span key={c} className="text-[9px] text-muted-foreground">
                            @{c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-1 text-[10px] text-emerald-600 mt-2 pt-2 border-t border-border">
                  <CheckCircle2 size={10} />
                  {t("novel.quickMode.completed")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
