import { memo, useState, useCallback, type KeyboardEvent } from "react";
import { Clapperboard } from "lucide-react";
import { t } from "@/shared/constants";

interface StoryboardBottomInputBarProps {
  /** 当前选中的模型 ID（用于显示 model-chip） */
  modelId?: string;
  /** 点击"AI 生成分镜"按钮时调用 */
  onGenerate?: (prompt: string) => void;
  /** 是否正在生成中（禁用按钮） */
  isGenerating?: boolean;
}

/**
 * 故事板页面底部 AI 输入栏。
 *
 * 匹配 design-preview.html 中的 #bottom-bar-storyboard 结构：
 * - 外层 card（border-top 分隔，无圆角）
 * - 内层圆角 12px 容器（card2 背景）
 * - input 输入框 + model-chip + "AI 生成分镜"按钮
 *
 * 交互：
 * - Enter 触发生成
 * - Shift+Enter 换行
 */
export const StoryboardBottomInputBar = memo(function StoryboardBottomInputBar({
  modelId,
  onGenerate,
  isGenerating = false,
}: StoryboardBottomInputBarProps) {
  const [prompt, setPrompt] = useState("");

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const trimmed = prompt.trim();
        if (trimmed && !isGenerating) {
          onGenerate?.(trimmed);
          setPrompt("");
        }
      }
    },
    [prompt, isGenerating, onGenerate],
  );

  const handleClickGenerate = useCallback(() => {
    const trimmed = prompt.trim();
    if (trimmed && !isGenerating) {
      onGenerate?.(trimmed);
      setPrompt("");
    }
  }, [prompt, isGenerating, onGenerate]);

  return (
    <div
      className="card"
      style={{
        margin: 0,
        borderRadius: 0,
        borderTop: "1px solid var(--border)",
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
      }}
      role="region"
      aria-label={t("story.aiGenerateShot")}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--card2)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "6px 10px",
        }}
      >
        <input
          style={{
            flex: 1,
            background: "none",
            border: "none",
            color: "var(--fg)",
            fontSize: 14,
            padding: 8,
            fontFamily: "inherit",
            outline: "none",
          }}
          placeholder={t("story.aiInputPlaceholder")}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          aria-label={t("story.aiInputPlaceholder")}
        />
        <div className="toolbar" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {modelId && (
            <button className="model-chip" type="button" aria-label={modelId}>
              <span className="model-chip-dot img"></span> {modelId}
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={handleClickGenerate}
            disabled={!prompt.trim() || isGenerating}
            aria-label={t("story.aiGenerateShot")}
          >
            <Clapperboard style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} aria-hidden="true" />
            <span style={{ marginLeft: 4 }}>{t("story.aiGenerateShot")}</span>
          </button>
        </div>
      </div>
    </div>
  );
});
