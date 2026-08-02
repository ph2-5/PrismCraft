import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Check, Clock, Image as ImageIcon, MapPin, User } from "lucide-react";
import { t } from "@/shared/constants";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { getBeatCharacterIds } from "@/domain/utils";
import { SHOT_SIZE_OPTIONS } from "@/modules/shot";
import type { CanvasNode, BeatNodeData } from "../types";

/**
 * 分镜节点卡片（无限画布上的"镜头"）。
 *
 * 展示：序号 + 标题 + 生成状态徽标 + 首帧缩略图 + 景别/时长 + 角色/场景标签。
 * 交互：单击选中（打开右侧详细编辑）；从右侧 source handle 拖出连线到另一个分镜 = 重排顺序。
 */
export const BeatNode = memo(function BeatNode(
  props: NodeProps<CanvasNode>,
) {
  const data = props.data as BeatNodeData;
  const { beat, index, isSelected, isHighlighted, isDimmed, characters, scenes } =
    data;

  const keyframeImage = resolveMediaUrl(
    beat.localKeyframePath,
    beat.keyframe?.imageUrl,
  );
  const charIds = getBeatCharacterIds(beat);
  const charNames = charIds
    .map((id) => characters.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const sceneName = beat.sceneId
    ? scenes.find((s) => s.id === beat.sceneId)?.name
    : null;

  const shotSize = beat.shotInstruction?.shotSize;
  const shotLabel = shotSize
    ? (() => {
        const option = SHOT_SIZE_OPTIONS.find((o) => o.value === shotSize);
        return option ? t(option.labelKey) : String(shotSize);
      })()
    : "";

  const hasVideo = !!beat.videoGen?.videoUrl;
  const hasFramePair = !!beat.framePair?.firstFrameUrl;
  const hasKeyframe = !!beat.keyframe?.imageUrl;
  const statusIcon = hasVideo || hasFramePair || hasKeyframe
    ? <Check style={{ width: 11, height: 11, display: "inline", verticalAlign: "middle" }} aria-hidden="true" />
    : <Clock style={{ width: 11, height: 11, display: "inline", verticalAlign: "middle" }} aria-hidden="true" />;

  return (
    <div
      className={`card ${isSelected ? "canvas-beat-selected" : ""}`}
      style={{
        width: 232,
        padding: 10,
        cursor: "grab",
        borderColor: isSelected ? "var(--primary)" : undefined,
        opacity: isDimmed ? 0.35 : 1,
        boxShadow: isHighlighted
          ? "0 0 0 2px var(--primary), 0 4px 16px rgba(0,0,0,0.18)"
          : undefined,
        transition: "opacity 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "var(--muted-fg)", width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "var(--primary)", width: 8, height: 8 }}
      />
      {/* 帧衔接手柄：本镜尾帧 → 下一镜首帧（连线写入 referencedPrevKeyframe） */}
      <Handle
        id="frame-source"
        type="source"
        position={Position.Bottom}
        style={{
          background: "var(--warning)",
          width: 8,
          height: 8,
          left: "auto",
          right: 14,
        }}
      />
      <Handle
        id="frame-target"
        type="target"
        position={Position.Bottom}
        style={{
          background: "var(--warning)",
          width: 8,
          height: 8,
          left: 14,
        }}
      />

      {/* 头部：序号 + 标题 + 状态 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span
          className="badge badge-info"
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {beat.title || t("beat.shotNumber", { number: index + 1 })}
        </span>
        <span className={hasVideo || hasFramePair || hasKeyframe ? "badge badge-success" : "badge"} style={{ fontSize: 10, padding: "2px 5px", flexShrink: 0 }}>
          {statusIcon}
        </span>
      </div>

      {/* 缩略图 */}
      <div
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 8,
          background: "var(--card2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          marginBottom: 6,
        }}
      >
        {keyframeImage ? (
          <img
            src={keyframeImage}
            alt={beat.title || ""}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <ImageIcon size={22} style={{ opacity: 0.5 }} aria-hidden="true" />
        )}
      </div>

      {/* 底部：景别/时长 + 绑定标签 */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 4,
            background: "var(--muted)",
            color: "var(--muted-fg)",
          }}
        >
          {shotLabel ? `${shotLabel}·` : ""}{beat.duration ?? 0}s
        </span>
        {charNames.slice(0, 3).map((name) => (
          <span
            key={name}
            className="badge badge-info"
            style={{ fontSize: 10, padding: "2px 6px" }}
          >
            <User style={{ width: 10, height: 10, display: "inline", verticalAlign: "middle", marginRight: 2 }} aria-hidden="true" />
            {name}
          </span>
        ))}
        {sceneName && (
          <span
            className="badge badge-success"
            style={{ fontSize: 10, padding: "2px 6px" }}
          >
            <MapPin style={{ width: 10, height: 10, display: "inline", verticalAlign: "middle", marginRight: 2 }} aria-hidden="true" />
            {sceneName}
          </span>
        )}
        {beat.blockout3D && (
          <span
            className="badge"
            style={{
              fontSize: 10,
              padding: "2px 6px",
              color: "var(--primary)",
              border: "1px solid var(--primary)",
            }}
            title={`3D: ${beat.blockout3D.name}`}
          >
            <Box style={{ width: 10, height: 10, display: "inline", verticalAlign: "middle", marginRight: 2 }} aria-hidden="true" />
            3D
          </span>
        )}
      </div>
    </div>
  );
});
