/**
 * Task 2A.18 — 连续性账本面板
 *
 * 展示 ContinuityLedger，列出所有 ContinuityViolation。
 *
 * - 顶部：标题 + 描述 + 统计卡片（总 shot 数、违规数、error/warning 数）
 * - 中部：违规卡片列表（涉及分镜、冲突值、修复建议、应用按钮）
 * - 空状态：无违规时显示"连续性良好"
 *
 * 此组件为纯展示组件，所有状态由父组件通过 props 传入。
 * 应用修复 / 标记剧情原因通过回调上抛，由父组件处理 ShotContract 更新。
 */

import { useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type {
  ContinuityCategory,
  ContinuityLedger,
  ContinuityViolation,
  ViolationSeverity,
} from "../domain/continuity-ledger";

// ============================================================================
// 类型与常量
// ============================================================================

export interface ContinuityLedgerPanelProps {
  /** 连续性账本数据 */
  ledger: ContinuityLedger | null;
  /** 是否正在重新检查 */
  isChecking?: boolean;
  /** 重新检查回调 */
  onRecheck?: () => void;
  /** 应用修复建议回调 */
  onApplyFix?: (violation: ContinuityViolation) => void;
  /** 标记剧情原因回调 */
  onMarkReason?: (violation: ContinuityViolation) => void;
  /** 是否禁用操作（如正在生成中） */
  disabled?: boolean;
}

/** severity → i18n 键 */
const SEVERITY_LABEL_KEY: Record<ViolationSeverity, string> = {
  error: "novel.continuity.severity.error",
  warning: "novel.continuity.severity.warning",
};

/** category → i18n 键 */
const CATEGORY_LABEL_KEY: Record<ContinuityCategory, string> = {
  character: "novel.continuity.category.character",
  scene: "novel.continuity.category.scene",
  prop: "novel.continuity.category.prop",
  time: "novel.continuity.category.time",
  weather: "novel.continuity.category.weather",
};

/** severity → 图标颜色 class */
const SEVERITY_ICON_CLASS: Record<ViolationSeverity, string> = {
  error: "text-destructive",
  warning: "text-amber-500",
};

/** severity → 边框颜色 class */
const SEVERITY_BORDER_CLASS: Record<ViolationSeverity, string> = {
  error: "border-l-destructive",
  warning: "border-l-amber-500",
};

// ============================================================================
// 子组件：统计卡片
// ============================================================================

interface StatCardProps {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  iconClass?: string;
}

function StatCard({ label, value, icon: Icon, iconClass }: StatCardProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2">
      <Icon size={14} className={iconClass ?? "text-muted-foreground"} />
      <div className="flex flex-col">
        <span className="text-[10px] text-muted-foreground leading-none">
          {label}
        </span>
        <span className="text-[14px] font-bold leading-tight">{value}</span>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件：违规卡片
// ============================================================================

interface ViolationCardProps {
  violation: ContinuityViolation;
  disabled?: boolean;
  onApplyFix?: (violation: ContinuityViolation) => void;
  onMarkReason?: (violation: ContinuityViolation) => void;
}

function ViolationCard({
  violation,
  disabled,
  onApplyFix,
  onMarkReason,
}: ViolationCardProps) {
  return (
    <div
      className={[
        "rounded-md border border-border border-l-2 bg-card/30 px-3 py-2.5",
        SEVERITY_BORDER_CLASS[violation.severity],
      ].join(" ")}
    >
      {/* 头部：key + category + severity */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {violation.severity === "error" ? (
            <AlertCircle size={12} className={SEVERITY_ICON_CLASS[violation.severity]} />
          ) : (
            <AlertTriangle size={12} className={SEVERITY_ICON_CLASS[violation.severity]} />
          )}
          <span className="text-[12px] font-semibold truncate" title={violation.key}>
            {violation.key}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
            {t(CATEGORY_LABEL_KEY[violation.category])}
          </span>
          <span
            className={[
              "text-[10px] px-1.5 py-0.5 rounded font-medium",
              violation.severity === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-amber-500/10 text-amber-600",
            ].join(" ")}
          >
            {t(SEVERITY_LABEL_KEY[violation.severity])}
          </span>
        </div>
      </div>

      {/* 冲突值列表 */}
      <div className="mb-2">
        <div className="text-[10px] text-muted-foreground mb-1">
          {t("novel.continuity.conflictingValues")}：
        </div>
        <div className="flex flex-wrap gap-1.5">
          {violation.conflictingValues.map((cv) => (
            <span
              key={cv.shotId}
              className="text-[11px] px-1.5 py-0.5 rounded border border-border bg-background flex items-center gap-1"
            >
              <span className="font-mono text-muted-foreground">{cv.shotId}</span>
              <span className="text-foreground">{cv.value}</span>
              {cv.isExplicit && (
                <span className="text-[9px] text-primary">★</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* 修复建议 */}
      {violation.suggestedFix && (
        <div className="mb-2 rounded bg-primary/5 border border-primary/20 px-2 py-1.5">
          <div className="flex items-center gap-1 mb-0.5">
            <Sparkles size={10} className="text-primary" />
            <span className="text-[10px] text-primary font-medium">
              {t("novel.continuity.suggestedFix")}
            </span>
          </div>
          <p className="text-[11px] text-foreground leading-relaxed">
            {violation.suggestedFix}
          </p>
        </div>
      )}

      {/* 剧情原因（已标记时显示） */}
      {violation.reason && (
        <div className="mb-2 text-[11px] text-muted-foreground italic">
          {t("novel.continuity.reasonLabel")}：{violation.reason}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {violation.suggestedFix && onApplyFix && (
          <button
            type="button"
            onClick={() => onApplyFix(violation)}
            disabled={disabled}
            className="btn btn-primary text-[11px] px-2 py-0.5 flex items-center gap-1"
          >
            <CheckCircle2 size={10} />
            {t("novel.continuity.applyFix")}
          </button>
        )}
        {onMarkReason && !violation.reason && (
          <button
            type="button"
            onClick={() => onMarkReason(violation)}
            disabled={disabled}
            className="btn btn-ghost text-[11px] px-2 py-0.5"
          >
            {t("novel.continuity.markReason")}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function ContinuityLedgerPanel({
  ledger,
  isChecking = false,
  onRecheck,
  onApplyFix,
  onMarkReason,
  disabled = false,
}: ContinuityLedgerPanelProps) {
  // 按严重性分组：error 在前，warning 在后
  const sortedViolations = useMemo(() => {
    if (!ledger) return [];
    return [...ledger.violations].sort((a, b) => {
      // error 优先
      if (a.severity !== b.severity) {
        return a.severity === "error" ? -1 : 1;
      }
      // 同 severity 内按 key 排序
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
  }, [ledger]);

  // 空状态：未检查或无数据
  if (!ledger) {
    return (
      <div className="h-full flex flex-col">
        <PanelHeader
          isChecking={isChecking}
          onRecheck={onRecheck}
          disabled={disabled}
        />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={ClipboardList}
            title={t("novel.continuity.emptyTitle")}
            description={t("novel.continuity.emptyHint")}
            compact
          />
        </div>
      </div>
    );
  }

  // 无违规：显示"连续性良好"
  if (ledger.violations.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <PanelHeader
          isChecking={isChecking}
          onRecheck={onRecheck}
          disabled={disabled}
          stats={
            <>
              <StatCard
                label={t("novel.continuity.totalShots")}
                value={ledger.totalShots}
                icon={ClipboardList}
              />
              <StatCard
                label={t("novel.continuity.totalViolations")}
                value={0}
                icon={CheckCircle2}
                iconClass="text-emerald-500"
              />
            </>
          }
        />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={CheckCircle2}
            title={t("novel.continuity.allGood")}
            description={t("novel.continuity.allGoodHint")}
            compact
          />
        </div>
      </div>
    );
  }

  // 有违规：显示违规列表
  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        isChecking={isChecking}
        onRecheck={onRecheck}
        disabled={disabled}
        stats={
          <>
            <StatCard
              label={t("novel.continuity.totalShots")}
              value={ledger.totalShots}
              icon={ClipboardList}
            />
            <StatCard
              label={t("novel.continuity.errorCount")}
              value={ledger.errorCount}
              icon={AlertCircle}
              iconClass="text-destructive"
            />
            <StatCard
              label={t("novel.continuity.warningCount")}
              value={ledger.warningCount}
              icon={AlertTriangle}
              iconClass="text-amber-500"
            />
          </>
        }
      />

      {/* 违规列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {sortedViolations.map((violation) => (
          <ViolationCard
            key={violation.id}
            violation={violation}
            disabled={disabled}
            onApplyFix={onApplyFix}
            onMarkReason={onMarkReason}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 子组件：面板头部
// ============================================================================

interface PanelHeaderProps {
  isChecking: boolean;
  onRecheck?: () => void;
  disabled?: boolean;
  stats?: React.ReactNode;
}

function PanelHeader({ isChecking, onRecheck, disabled, stats }: PanelHeaderProps) {
  return (
    <div className="border-b border-border bg-card/30 px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <ClipboardList size={14} className="text-primary flex-shrink-0" />
          <h3 className="text-[13px] font-semibold truncate">
            {t("novel.continuity.title")}
          </h3>
        </div>
        {onRecheck && (
          <button
            type="button"
            onClick={onRecheck}
            disabled={disabled || isChecking}
            className="btn btn-ghost text-[11px] px-2 py-0.5 flex items-center gap-1"
            aria-label={t("novel.continuity.checkAgain")}
          >
            <RefreshCw size={10} className={isChecking ? "animate-spin" : ""} />
            {t("novel.continuity.checkAgain")}
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">
        {t("novel.continuity.subtitle")}
      </p>
      {stats && (
        <div className="flex items-center gap-1.5 flex-wrap">{stats}</div>
      )}
    </div>
  );
}
