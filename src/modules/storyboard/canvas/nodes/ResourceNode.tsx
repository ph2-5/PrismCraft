import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MapPin, User } from "lucide-react";
import { t } from "@/shared/constants";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import type { Character, Scene } from "@/domain/schemas";
import type { CanvasNode, ResourceNodeData } from "../types";

/**
 * 资源节点（角色 / 场景）。
 *
 * 展示：缩略图 + 名称 + 被引用分镜数。
 * 交互：单击 → 高亮所有引用它的分镜并在右侧显示引用清单；
 * 从右侧 source handle 拖出连线到分镜节点 = 绑定（写入 beat.characterIds / sceneId）。
 */
export const ResourceNode = memo(function ResourceNode(
  props: NodeProps<CanvasNode>,
) {
  const data = props.data as ResourceNodeData;
  const { kind, resource, referencedBeatIds, isSelected, isDimmed } = data;
  const isCharacter = kind === "character";

  const image = isCharacter
    ? resolveMediaUrl(
        (resource as Character).avatarPath ??
          (resource as Character).thumbnailPath,
        (resource as Character).generatedImage ??
          (resource as Character).refImagePath,
      )
    : resolveMediaUrl(
        (resource as Scene).scenePath ??
          (resource as Scene).thumbnailPath ??
          (resource as Scene).refImagePath,
        (resource as Scene).imageUrl,
      );

  const Icon = isCharacter ? User : MapPin;

  return (
    <div
      className={`card ${isSelected ? "canvas-resource-selected" : ""}`}
      role="button"
      tabIndex={0}
      style={{
        width: 190,
        padding: 10,
        cursor: "pointer",
        borderColor: isSelected ? "var(--primary)" : undefined,
        opacity: isDimmed ? 0.35 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: isCharacter ? "var(--info)" : "var(--success)", width: 8, height: 8 }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {image ? (
          <img
            src={image}
            alt={resource.name}
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: "var(--muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "var(--muted-fg)",
            }}
          >
            <Icon size={18} aria-hidden="true" />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {resource.name}
          </div>
          {isCharacter ? (
            (resource as Character).description ? (
              <div
                style={{
                  fontSize: 10,
                  color: "var(--muted-fg)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {(resource as Character).description.slice(0, 20)}
              </div>
            ) : null
          ) : (resource as Scene).description ? (
            <div
              style={{
                fontSize: 10,
                color: "var(--muted-fg)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {(resource as Scene).description.slice(0, 20)}
            </div>
          ) : null}
          <div
            style={{
              fontSize: 10,
              marginTop: 2,
              color: referencedBeatIds.length > 0 ? "var(--primary)" : "var(--muted-fg)",
              fontWeight: referencedBeatIds.length > 0 ? 600 : 400,
            }}
          >
            {t("storyboard.canvas.referencedBy", { count: referencedBeatIds.length })}
          </div>
        </div>
      </div>
    </div>
  );
});
