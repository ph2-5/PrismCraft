import { lazy, Suspense, memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Boxes } from "lucide-react";
import { t } from "@/shared/constants";
import type { BlockoutNodeData, CanvasNode } from "../types";

/**
 * 3D 导演台节点：有 blockout3D 的分镜在画布上的 3D 构图参考节点。
 *
 * - lazy 加载 Blockout3DCanvas（Three.js 不进首屏 bundle）
 * - 静态白模预览（禁用轨道控制，避免与画布拖拽冲突）
 * - 点击节点 → 打开对应分镜的 3D 编辑器
 */
const Blockout3DCanvas = lazy(() =>
  import("@/modules/blockout-3d").then((m) => ({ default: m.Blockout3DCanvas })),
);

export const Blockout3DNode = memo(function Blockout3DNode(
  props: NodeProps<CanvasNode>,
) {
  const data = props.data as BlockoutNodeData;
  const { title, scene, isSelected } = data;

  return (
    <div
      className={`card ${isSelected ? "canvas-beat-selected" : ""}`}
      style={{
        width: 232,
        padding: 10,
        cursor: "pointer",
        borderColor: isSelected ? "var(--primary)" : undefined,
        boxShadow: isSelected
          ? "0 0 0 2px var(--primary), 0 4px 16px rgba(0,0,0,0.18)"
          : undefined,
        transition: "box-shadow 0.15s ease",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "var(--primary)", width: 8, height: 8 }}
      />

      {/* 头部：3D 徽标 + 分镜标题 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span
          className="badge"
          style={{
            fontSize: 10,
            padding: "2px 6px",
            color: "var(--warning)",
            border: "1px solid var(--warning)",
            flexShrink: 0,
          }}
        >
          <Box style={{ width: 10, height: 10, display: "inline", verticalAlign: "middle", marginRight: 2 }} aria-hidden="true" />
          {t("storyboard.canvas.blockoutNode")}
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
          {title || t("beat.shotNumber", { number: 1 })}
        </span>
      </div>

      {/* 3D 白模预览（lazy） */}
      <div
        style={{
          width: "100%",
          height: 120,
          borderRadius: 8,
          overflow: "hidden",
          background: "linear-gradient(180deg, #1a1d24 0%, #111318 100%)",
        }}
      >
        <Suspense
          fallback={
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                fontSize: 11,
                color: "var(--muted-fg)",
              }}
            >
              <Boxes size={14} aria-hidden="true" />
              {t("storyboard.canvas.blockoutLoading")}
            </div>
          }
        >
          <Blockout3DCanvas
            scene={scene}
            enableOrbitControls={false}
            width="100%"
            height="100%"
          />
        </Suspense>
      </div>

      {/* 概要 */}
      <div style={{ marginTop: 6, fontSize: 10, color: "var(--muted-fg)" }}>
        {scene.characters.length} 人偶 · {scene.props.length} 道具
        {scene.cameraPath && scene.cameraPath.length > 0
          ? ` · ${scene.cameraPath.length} 相机关键点`
          : ""}
      </div>
    </div>
  );
});
