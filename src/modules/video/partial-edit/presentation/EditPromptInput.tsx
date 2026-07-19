/**
 * Task 2A.22: EditPromptInput — 重绘指令输入框
 *
 * 用户输入重绘指令（如"把背景的树换成霓虹灯广告牌"）。
 * 支持回车提交、字符计数、禁用状态。
 */

import { useEffect, useRef } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { t } from "@/shared/constants";

export interface EditPromptInputProps {
  /** 当前值 */
  value: string;
  /** 修改值 */
  onChange: (value: string) => void;
  /** 提交（生成重绘） */
  onSubmit: () => void;
  /** 是否禁用（生成中） */
  disabled?: boolean;
  /** 最大字符数（默认 2000） */
  maxLength?: number;
  /** 是否正在生成 */
  isGenerating?: boolean;
}

export function EditPromptInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  maxLength = 2000,
  isGenerating = false,
}: EditPromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整 textarea 高度
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd + Enter 提交
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!disabled && !isGenerating && value.trim().length > 0) {
        onSubmit();
      }
    }
  };

  const isDisabled = disabled || isGenerating;
  const canSubmit = !isDisabled && value.trim().length > 0;
  const charCount = value.length;
  const isOverLimit = charCount > maxLength;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("video.partialEditPromptPlaceholder")}
            disabled={isDisabled}
            maxLength={maxLength + 100} // 允许略超以便用户看到截断提示
            rows={2}
            className="w-full px-3 py-2 rounded-lg border resize-none text-sm"
            style={{
              background: "var(--background)",
              borderColor: isOverLimit ? "var(--destructive)" : "var(--border)",
              color: "var(--foreground)",
              minHeight: 60,
              maxHeight: 120,
            }}
            aria-label={t("video.partialEditPromptPlaceholder")}
          />
          {/* 字符计数 */}
          <div
            className="absolute bottom-1 right-2 text-xs font-mono"
            style={{
              color: isOverLimit ? "var(--destructive)" : "var(--muted-fg)",
              pointerEvents: "none",
            }}
          >
            {charCount}/{maxLength}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary gap-2"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-label={t("video.partialEditSubmit")}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{t("video.partialEditGenerating")}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span className="text-sm">{t("video.partialEditSubmit")}</span>
            </>
          )}
        </button>
      </div>

      {/* 提示 */}
      <div className="text-xs" style={{ color: "var(--muted-fg)" }}>
        {isOverLimit
          ? t("video.partialEditPromptEmpty")
          : "Ctrl/⌘ + Enter 快速提交"}
      </div>
    </div>
  );
}
