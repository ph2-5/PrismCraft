import { cn } from "@/shared/utils/utils";
import { RefreshCw } from "lucide-react";
import { t } from "@/shared/constants";

/**
 * ErrorState — 错误状态组件（Task 4.9 子项 12）。
 *
 * 网络错误/API 失败时显示带 SVG 插画的重试卡片，而非纯文字错误。
 * 插画使用内联 SVG，无新依赖。
 *
 * API 镜像 EmptyState，支持 compact/hint/children/action。
 * severity 决定插画类型与默认文案。
 */
type ErrorSeverity = "network" | "server" | "generic";

interface ErrorStateProps {
  /** 错误严重度，决定插画与默认文案。默认 "generic"。 */
  severity?: ErrorSeverity;
  /** 自定义标题（覆盖 severity 默认标题）。 */
  title?: string;
  /** 自定义描述（覆盖 severity 默认描述）。 */
  description?: string;
  /** 次级提示（如错误码、技术细节），比 description 更弱化。 */
  hint?: string;
  /** 重试回调。传入则显示「重试」按钮。 */
  onRetry?: () => void;
  /** 自定义 action（覆盖默认重试按钮）。 */
  action?: React.ReactNode;
  /** 紧凑模式 — 用于窄栏、面板内嵌场景。 */
  compact?: boolean;
  className?: string;
  /** 自定义内容 slot，渲染在 description/hint 之后、action 之前。 */
  children?: React.ReactNode;
}

/** 网络错误插画：断开的连接节点。 */
function NetworkIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      role="img"
      aria-hidden="true"
    >
      {/* 左侧节点 */}
      <circle cx="30" cy="60" r="8" fill="currentColor" opacity="0.8" />
      {/* 右侧节点 */}
      <circle cx="90" cy="60" r="8" fill="currentColor" opacity="0.4" />
      {/* 断开的连接线 — 左半段 */}
      <path
        d="M38 60 L54 60"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* 断开的连接线 — 右半段（虚线表示断裂） */}
      <path
        d="M66 60 L82 60"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="3 5"
        opacity="0.3"
      />
      {/* 断裂处的小闪电/火花 */}
      <path
        d="M60 50 L57 60 L63 60 L60 70"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      {/* 底部地面线 */}
      <path
        d="M20 90 Q60 86 100 90"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.15"
      />
    </svg>
  );
}

/** 服务器错误插画：云 + 感叹号。 */
function ServerIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      role="img"
      aria-hidden="true"
    >
      {/* 云轮廓 */}
      <path
        d="M30 72 Q18 72 18 60 Q18 50 28 48 Q28 36 42 36 Q48 28 58 30 Q70 28 74 40 Q88 40 88 52 Q98 52 98 62 Q98 72 88 72 Z"
        fill="currentColor"
        opacity="0.12"
      />
      <path
        d="M30 72 Q18 72 18 60 Q18 50 28 48 Q28 36 42 36 Q48 28 58 30 Q70 28 74 40 Q88 40 88 52 Q98 52 98 62 Q98 72 88 72 Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        opacity="0.5"
      />
      {/* 感叹号 — 竖线 */}
      <path
        d="M58 50 L58 60"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.8"
      />
      {/* 感叹号 — 点 */}
      <circle cx="58" cy="66" r="2" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

/** 通用错误插画：圆圈 + 感叹号（装饰性，比 lucide AlertCircle 更大）。 */
function GenericIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      role="img"
      aria-hidden="true"
    >
      {/* 外圈装饰 — 虚线 */}
      <circle
        cx="60"
        cy="60"
        r="42"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="4 6"
        opacity="0.2"
      />
      {/* 主圆圈 */}
      <circle
        cx="60"
        cy="60"
        r="32"
        fill="currentColor"
        opacity="0.1"
      />
      <circle
        cx="60"
        cy="60"
        r="32"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.5"
      />
      {/* 感叹号 — 竖线 */}
      <path
        d="M60 46 L60 64"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.8"
      />
      {/* 感叹号 — 点 */}
      <circle cx="60" cy="72" r="2.2" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

const ILLUSTRATIONS: Record<ErrorSeverity, React.ComponentType<{ className?: string }>> = {
  network: NetworkIllustration,
  server: ServerIllustration,
  generic: GenericIllustration,
};

const DEFAULT_TEXT: Record<ErrorSeverity, { title: string; description: string }> = {
  network: {
    title: t("error.loadFailed"),
    description: t("error.networkError"),
  },
  server: {
    title: t("error.loadFailed"),
    description: t("error.serverError"),
  },
  generic: {
    title: t("error.loadFailed"),
    description: t("error.operationFailed"),
  },
};

export function ErrorState({
  severity = "generic",
  title,
  description,
  hint,
  onRetry,
  action,
  compact = false,
  className,
  children,
}: ErrorStateProps) {
  const Illustration = ILLUSTRATIONS[severity];
  const defaultText = DEFAULT_TEXT[severity];
  const finalTitle = title ?? defaultText.title;
  const finalDesc = description ?? defaultText.description;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6 px-3" : "py-12 px-4",
        className,
      )}
    >
      <Illustration
        className={cn(
          "text-destructive mb-4",
          compact ? "w-12 h-12 mb-3" : "w-20 h-20",
        )}
      />
      <h3
        className={cn(
          "font-medium text-foreground",
          compact ? "text-sm mb-0.5" : "text-lg mb-1",
        )}
      >
        {finalTitle}
      </h3>
      {finalDesc && (
        <p
          className={cn(
            "text-muted-foreground max-w-sm",
            compact ? "text-xs mb-2" : "text-sm mb-4",
          )}
        >
          {finalDesc}
        </p>
      )}
      {hint && (
        <p
          className={cn(
            "text-muted-foreground/70 max-w-sm break-words",
            compact ? "text-[11px] mb-2" : "text-xs mb-4",
          )}
        >
          {hint}
        </p>
      )}
      {children}
      {action ? (
        action
      ) : onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md bg-[rgba(var(--destructive-rgb),0.1)] text-destructive transition-colors hover:bg-[rgba(var(--destructive-rgb),0.2)]",
            compact ? "text-xs px-3 py-1.5" : "text-sm px-4 py-2",
          )}
        >
          <RefreshCw className={compact ? "h-3 w-3" : "h-4 w-4"} />
          {t("common.retry")}
        </button>
      ) : null}
    </div>
  );
}
