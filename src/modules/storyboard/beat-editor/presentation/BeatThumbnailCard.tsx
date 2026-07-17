import { memo, type CSSProperties } from "react";
import { Zap, Image as ImageIcon, User, MapPin, GripVertical } from "lucide-react";
import { t } from "@/shared/constants";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { getBeatCharacterIds } from "@/domain/utils";
import { SHOT_SIZE_OPTIONS } from "@/modules/shot";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";

interface BeatThumbnailCardProps {
  beat: StoryBeat;
  index: number;
  isSelected: boolean;
  characters: Character[];
  scenes: Scene[];
  isGenerating?: boolean;
  /** 视频生成进度（0-100），来自 VideoTask.progress */
  progress?: number;
  onClick: (beatId: string) => void;
  /** 可选：拖拽 ref 注入（来自 useSortable） */
  dragRef?: (el: HTMLElement | null) => void;
  /** 可选：拖拽样式 */
  dragStyle?: CSSProperties;
  /** 可选：拖拽属性（attributes + listeners），来自 dnd-kit useSortable */
  dragAttributes?: Record<string, unknown>;
  /** 可选：拖拽监听器，来自 dnd-kit useSortable */
  dragListeners?: Record<string, unknown>;
}

/**
 * 分镜缩略图卡片（用于底部时间轴）。
 *
 * 匹配 design-preview.html 中的 .timeline-card 结构：
 * - .tc-thumb（16:9 缩略图区域，含绑定标签）
 * - .tc-info（标题 + 时长/景别）
 *
 * 支持三种缩略图态：
 * 1. 生成中（Zap + progress-bar）
 * 2. 已有关键帧（img）
 * 3. 无图（ImageIcon 占位）
 */
export const BeatThumbnailCard = memo(function BeatThumbnailCard({
  beat,
  index,
  isSelected,
  characters,
  scenes,
  isGenerating = false,
  progress,
  onClick,
  dragRef,
  dragStyle,
  dragAttributes,
  dragListeners,
}: BeatThumbnailCardProps) {
  const keyframeImage = resolveMediaUrl(beat.localKeyframePath, beat.keyframe?.imageUrl);
  const charIds = getBeatCharacterIds(beat);
  const charNames = charIds
    .map((id: string) => characters.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const sceneName = beat.sceneId
    ? scenes.find((s) => s.id === beat.sceneId)?.name
    : null;

  const shotSize = beat.shotInstruction?.shotSize || beat.shotType;
  const shotLabel = shotSize
    ? (() => {
        const option = SHOT_SIZE_OPTIONS.find((o) => o.value === shotSize);
        return option ? t(option.labelKey) : String(shotSize);
      })()
    : "";

  const generationStatus = beat.generationStatus || beat.videoGen?.status;
  const isVideoGenerating =
    isGenerating || generationStatus === "generating" || generationStatus === "pending";

  // 进度数值：优先使用外部传入的 VideoTask.progress，回退到 67% 占位（无 task 数据时）
  const progressValue = typeof progress === "number" && progress > 0 ? progress : 67;

  // 拖拽手柄：当存在 dragListeners 时，将 listeners 收拢到专用 GripVertical 按钮上，
  // 避免整个卡片都成为拖拽目标，让点击选择与拖拽排序互不干扰（参考 SortableBeatList.tsx）
  const hasDrag = Boolean(dragListeners);

  return (
    <div
      ref={dragRef}
      className={`timeline-card ${isSelected ? "selected" : ""}`}
      onClick={() => onClick(beat.id)}
      style={{
        cursor: "pointer",
        position: "relative",
        ...dragStyle,
      }}
    >
      {/* 专用拖拽手柄（仅拖拽模式下显示，位于卡片左上角） */}
      {hasDrag && (
        <button
          type="button"
          aria-label={t("beat.dragToReorder")}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            zIndex: 2,
            padding: 2,
            background: "rgba(0,0,0,0.4)",
            border: "none",
            borderRadius: 4,
            color: "var(--fg)",
            cursor: "grab",
            touchAction: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 0,
          }}
          {...dragAttributes}
          {...dragListeners}
        >
          <GripVertical size={12} aria-hidden="true" />
        </button>
      )}
      <div className="tc-thumb">
        {isVideoGenerating ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4, width: "100%", height: "100%" }}>
            <Zap size={20} aria-hidden="true" />
            <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>{t("beat.generating")}</span>
            <div className="progress-bar" style={{ width: 60 }}>
              <div className="progress-fill" style={{ width: `${progressValue}%` }}></div>
            </div>
            {typeof progress === "number" && progress > 0 && (
              <span style={{ fontSize: 9, color: "var(--muted-fg)" }}>{Math.round(progress)}%</span>
            )}
          </div>
        ) : keyframeImage ? (
          <img
            src={keyframeImage}
            alt={beat.title || ""}
            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px 8px 0 0" }}
          />
        ) : (
          <ImageIcon size={24} style={{ opacity: 0.6 }} aria-hidden="true" />
        )}
        <div className="tc-bindings">
          {charNames.map((name: string, idx: number) => (
            <span key={`char-${idx}`} className="tc-bind-tag">
              <User style={{ width: 10, height: 10, display: "inline", verticalAlign: "middle", marginRight: 2 }} aria-hidden="true" />
              {name}
            </span>
          ))}
          {sceneName && (
            <span className="tc-bind-tag">
              <MapPin style={{ width: 10, height: 10, display: "inline", verticalAlign: "middle", marginRight: 2 }} aria-hidden="true" />
              {sceneName}
            </span>
          )}
        </div>
      </div>
      <div className="tc-info">
        <div className="tc-title">
          {index + 1} · {beat.title || t("beat.shotNumber", { number: index + 1 })}
        </div>
        <div className="tc-dur">
          {beat.duration ?? 0}s{shotLabel ? ` · ${shotLabel}` : ""}
        </div>
      </div>
    </div>
  );
});
