import { memo, useState } from "react";
import { Sparkles, Stethoscope, Send } from "lucide-react";
import { t } from "@/shared/constants";

interface AgentBarProps {
  onAsk: (question: string) => void;
}

/**
 * 底部固定 AI 助手栏：
 * - 快捷按钮"分析失败原因"和"一键诊断"
 * - 输入框允许用户输入自定义问题
 * - 点击发送或回车触发 onAsk
 *
 * 注意：本组件不直接嵌入完整 Agent 面板；点击快捷按钮只触发 onAsk 回调，
 * 由父组件决定是展开 Agent 面板还是直接执行诊断。
 */
export const AgentBar = memo(function AgentBar({ onAsk }: AgentBarProps) {
  const [input, setInput] = useState("");

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAsk(trimmed);
    setInput("");
  };

  return (
    <div className="card !p-3 sticky bottom-0">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium">{t("task.agentBarTitle")}</span>
      </div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button
          type="button"
          className="btn btn-outline btn-xs"
          onClick={() => onAsk(t("task.agentAnalyzeFailures"))}
        >
          <Stethoscope className="h-3 w-3" />
          {t("task.agentAnalyzeFailures")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-xs"
          onClick={() => onAsk(t("task.agentOneClickDiagnose"))}
        >
          <Sparkles className="h-3 w-3" />
          {t("task.agentOneClickDiagnose")}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          className="input !text-xs flex-1"
          placeholder={t("task.agentAskPlaceholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm shrink-0"
          onClick={() => send(input)}
          disabled={!input.trim()}
        >
          <Send className="h-3.5 w-3.5" />
          {t("task.agentSend")}
        </button>
      </div>
    </div>
  );
});
