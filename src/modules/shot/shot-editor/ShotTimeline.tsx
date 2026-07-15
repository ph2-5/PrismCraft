import { memo, type ReactNode } from "react";
import { Plus, Film } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";

interface ShotTimelineProps {
  /** 时间轴内容（通常是分镜卡片列表） */
  children: ReactNode;
  /** 是否为空 */
  isEmpty?: boolean;
  /** 点击"添加分镜"按钮的回调 */
  onAddBeat?: () => void;
  /** 可选的右上角工具栏内容（如批量生成、预览按钮） */
  toolbar?: ReactNode;
}

/**
 * 底部时间轴容器。
 * 纯布局包装组件，固定高度，水平滚动。
 *
 * 结构：
 * ┌──────────────────────────────────────────┐
 * │ 时间轴标题  │  toolbar（批量生成/预览）  │
 * ├──────────────────────────────────────────┤
 * │ [分镜1] [分镜2] [分镜3] ... [+ 添加]      │ ← 水平滚动
 * └──────────────────────────────────────────┘
 */
export const ShotTimeline = memo(function ShotTimeline({
  children,
  isEmpty = false,
  onAddBeat,
  toolbar,
}: ShotTimelineProps) {
  return (
    <div className="timeline-panel">
      <div className="timeline-header">
        <span style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          <Film style={{ width: 12, height: 12 }} />
          {t("beat.timelineLabel")}
        </span>
        <div className="toolbar">
          {toolbar}
          {onAddBeat && (
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={onAddBeat}
            >
              <Plus style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} />
              {t("beat.timelineAddBeat")}
            </button>
          )}
        </div>
      </div>
      <div className="timeline-scroll">
        {isEmpty ? (
          <EmptyState compact icon={Film} title={t("beat.timelineEmpty")} />
        ) : (
          children
        )}
      </div>
    </div>
  );
});
