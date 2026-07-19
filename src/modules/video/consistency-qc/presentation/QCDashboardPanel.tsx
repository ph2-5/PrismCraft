/**
 * Task 2A.23: QCDashboardPanel — 一致性 QC 仪表盘
 *
 * 展示 StoryBeat.qcReport：
 *   - verdict / actionTaken 徽章
 *   - 平均分 / 最低分 / 抽帧数 / 重试次数
 *   - 帧级相似度曲线（SVG 折线图，通过/超差帧颜色区分）
 *   - 错误信息（若 QC 失败）
 *
 * 样式遵循 design-preview.html：inline style + CSS variables + className="card"
 *
 * 调用方：BeatDetailClient 或 StoryboardShell 在 beat 详情页展示。
 */
import { useMemo } from "react";
import { t } from "@/shared/constants";
import type { QCReport, Verdict, ActionTaken } from "../domain/qc-schema";
import { DEFAULT_DRIFT_POLICY } from "../domain/drift-policy";

interface QCDashboardPanelProps {
  /** 当前的 QCReport（undefined 时显示空状态） */
  report?: QCReport;
  /** 漂移策略（用于阈值展示，默认 DEFAULT_DRIFT_POLICY） */
  warningThreshold?: number;
  criticalThreshold?: number;
  /** 手动触发重新 QC 的回调（可选） */
  onRerunQC?: () => void;
  /** 是否正在重新 QC */
  rerunning?: boolean;
}

/** verdict → 颜色 + 标签 */
function getVerdictStyle(verdict: Verdict): {
  color: string;
  bg: string;
  border: string;
  label: string;
} {
  switch (verdict) {
    case "pass":
      return {
        color: "#34d399",
        bg: "rgba(16,185,129,0.12)",
        border: "rgba(16,185,129,0.2)",
        label: t("video.qcVerdictPass"),
      };
    case "drift_warning":
      return {
        color: "#fbbf24",
        bg: "rgba(245,158,11,0.12)",
        border: "rgba(245,158,11,0.2)",
        label: t("video.qcVerdictWarning"),
      };
    case "drift_critical":
      return {
        color: "#f87171",
        bg: "rgba(239,68,68,0.12)",
        border: "rgba(239,68,68,0.2)",
        label: t("video.qcVerdictCritical"),
      };
  }
}

/** actionTaken → 国际化标签 */
function getActionLabel(action: ActionTaken): string {
  switch (action) {
    case "none":
      return t("video.qcActionNone");
    case "regenerated":
      return t("video.qcActionRegenerated");
    case "face_swapped":
      return t("video.qcActionFaceSwapped");
    case "manual_review":
      return t("video.qcActionManualReview");
  }
}

/** 帧级相似度曲线（SVG 折线图） */
function FrameSimilarityChart({
  report,
  warningThreshold,
  criticalThreshold,
}: {
  report: QCReport;
  warningThreshold: number;
  criticalThreshold: number;
}) {
  const { frameScores } = report;
  const width = 520;
  const height = 160;
  const padding = { top: 16, right: 16, bottom: 24, left: 32 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = useMemo(() => {
    if (frameScores.length === 0) return [] as Array<{ x: number; y: number; score: number; frameIndex: number }>;
    const maxFrameIndex = Math.max(...frameScores.map((f) => f.frameIndex), 1);
    return frameScores.map((f) => ({
      x: padding.left + (f.frameIndex / maxFrameIndex) * chartWidth,
      y: padding.top + (1 - f.cosineSimilarity) * chartHeight,
      score: f.cosineSimilarity,
      frameIndex: f.frameIndex,
    }));
  }, [frameScores, chartWidth, chartHeight, padding.left, padding.top]);

  // 阈值水平线 Y 坐标
  const warningY = padding.top + (1 - warningThreshold) * chartHeight;
  const criticalY = padding.top + (1 - criticalThreshold) * chartHeight;

  // 折线 path
  const linePath = points.length > 0
    ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
    : "";

  if (frameScores.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--muted-fg)", fontSize: 12 }}>
        {t("video.qcNoFrames")}
      </div>
    );
  }

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {/* 背景网格 */}
      <rect x={padding.left} y={padding.top} width={chartWidth} height={chartHeight} fill="var(--card2)" rx="4" />

      {/* 阈值线 — warning */}
      <line
        x1={padding.left}
        y1={warningY}
        x2={padding.left + chartWidth}
        y2={warningY}
        stroke="rgba(245,158,11,0.4)"
        strokeWidth={1}
        strokeDasharray="4 2"
      />
      <text x={padding.left + chartWidth + 4} y={warningY + 3} fontSize={9} fill="#fbbf24">
        {t("video.qcThresholdWarning")} {warningThreshold.toFixed(2)}
      </text>

      {/* 阈值线 — critical */}
      <line
        x1={padding.left}
        y1={criticalY}
        x2={padding.left + chartWidth}
        y2={criticalY}
        stroke="rgba(239,68,68,0.4)"
        strokeWidth={1}
        strokeDasharray="4 2"
      />
      <text x={padding.left + chartWidth + 4} y={criticalY + 3} fontSize={9} fill="#f87171">
        {t("video.qcThresholdCritical")} {criticalThreshold.toFixed(2)}
      </text>

      {/* Y 轴刻度 */}
      <text x={padding.left - 6} y={padding.top + 4} fontSize={9} fill="var(--muted-fg)" textAnchor="end">1.0</text>
      <text x={padding.left - 6} y={padding.top + chartHeight + 3} fontSize={9} fill="var(--muted-fg)" textAnchor="end">0.0</text>

      {/* 折线 */}
      {linePath && <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth={1.5} />}

      {/* 帧点（按 score 染色） */}
      {points.map((p) => {
        const color = p.score >= warningThreshold
          ? "#10b981"
          : p.score >= criticalThreshold
            ? "#f59e0b"
            : "#ef4444";
        return (
          <circle
            key={p.frameIndex}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={color}
            stroke="var(--bg)"
            strokeWidth={1}
          >
            <title>
              {t("video.qcFrame")} #{p.frameIndex}: {p.score.toFixed(3)}
            </title>
          </circle>
        );
      })}

      {/* X 轴标签 */}
      <text
        x={padding.left + chartWidth / 2}
        y={height - 6}
        fontSize={10}
        fill="var(--muted-fg)"
        textAnchor="middle"
      >
        {t("video.qcFrameIndex")}
      </text>
    </svg>
  );
}

/** 分镜策略徽章 */
function ShotStrategyBadge({ strategy }: { strategy?: string }) {
  if (!strategy) return null;
  return (
    <span
      className="badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 500,
        background: "rgba(99,102,241,0.12)",
        color: "#a5b4fc",
        border: "1px solid rgba(99,102,241,0.2)",
      }}
    >
      {t("video.qcStrategyLabel")}: {strategy}
    </span>
  );
}

/** 漂移告警卡片（drift_critical 时展示） */
function DriftAlertCard({ report }: { report: QCReport }) {
  if (report.verdict !== "drift_critical") return null;
  return (
    <div
      style={{
        marginTop: 8,
        padding: 12,
        borderRadius: 8,
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.2)",
        fontSize: 12,
        color: "#fca5a5",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {t("video.qcDriftAlertTitle")}
      </div>
      <div>
        {t("video.qcDriftAlertDetail", {
          minScore: report.minScore.toFixed(3),
          retryCount: report.retryCount ?? 0,
        })}
      </div>
      {report.actionTaken === "manual_review" && (
        <div style={{ marginTop: 6, color: "#f87171", fontWeight: 500 }}>
          {t("video.qcManualReviewHint")}
        </div>
      )}
    </div>
  );
}

/** 主面板 */
export function QCDashboardPanel({
  report,
  warningThreshold = DEFAULT_DRIFT_POLICY.warningThreshold,
  criticalThreshold = DEFAULT_DRIFT_POLICY.criticalThreshold,
  onRerunQC,
  rerunning,
}: QCDashboardPanelProps) {
  if (!report) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--fg)" }}>
          {t("video.qcPanelTitle")}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-fg)", padding: "12px 0" }}>
          {t("video.qcNoReport")}
        </div>
      </div>
    );
  }

  const verdictStyle = getVerdictStyle(report.verdict);

  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 标题行 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
          {t("video.qcPanelTitle")}
        </div>
        {onRerunQC && (
          <button
            type="button"
            className="btn-outline"
            onClick={onRerunQC}
            disabled={rerunning}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              borderRadius: 6,
              cursor: rerunning ? "not-allowed" : "pointer",
              opacity: rerunning ? 0.6 : 1,
            }}
          >
            {rerunning ? t("video.qcRerunning") : t("video.qcRerunCheck")}
          </button>
        )}
      </div>

      {/* Verdict + Action 徽章 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            color: verdictStyle.color,
            background: verdictStyle.bg,
            border: `1px solid ${verdictStyle.border}`,
          }}
        >
          {verdictStyle.label}
        </span>
        {report.actionTaken !== "none" && (
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 500,
              color: "var(--muted-fg)",
              background: "var(--card2)",
              border: "1px solid var(--border)",
            }}
          >
            {t("video.qcActionTakenLabel")}: {getActionLabel(report.actionTaken)}
          </span>
        )}
        <ShotStrategyBadge strategy={report.strategy} />
      </div>

      {/* 统计指标 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        <MetricBox label={t("video.qcAverageScore")} value={report.averageScore.toFixed(3)} />
        <MetricBox label={t("video.qcMinScore")} value={report.minScore.toFixed(3)} />
        <MetricBox label={t("video.qcSampledFrames")} value={`${report.sampledFrames}/${report.totalFrames}`} />
        <MetricBox label={t("video.qcRetryCount")} value={String(report.retryCount ?? 0)} />
      </div>

      {/* 帧级相似度曲线 */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", marginBottom: 4 }}>
          {t("video.qcFrameChartTitle")}
        </div>
        <FrameSimilarityChart
          report={report}
          warningThreshold={warningThreshold}
          criticalThreshold={criticalThreshold}
        />
      </div>

      {/* 错误信息 */}
      {report.error && (
        <div
          style={{
            padding: 8,
            borderRadius: 6,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            fontSize: 11,
            color: "#fca5a5",
          }}
        >
          {report.error}
        </div>
      )}

      {/* 漂移告警卡片 */}
      <DriftAlertCard report={report} />
    </div>
  );
}

/** 指标小方块 */
function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--card2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 10px",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--muted-fg)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{value}</div>
    </div>
  );
}
