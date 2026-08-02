import type { Node, Edge } from "@xyflow/react";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import type { BlockoutScene } from "@/domain/schemas/blockout-scene";

/** 资源节点类型（角色 / 场景） */
export type ResourceKind = "character" | "scene";

/** 分镜节点数据。单一事实源 = StoryBeat 字段；画布为派生视图。 */
export type BeatNodeData = {
  kind: "beat";
  beat: StoryBeat;
  index: number;
  isSelected: boolean;
  /** 资源节点选中时：被该资源引用的分镜高亮 */
  isHighlighted: boolean;
  /** 资源节点选中时：未被引用的分镜变暗 */
  isDimmed: boolean;
  characters: Character[];
  scenes: Scene[];
};

/** 资源节点数据（角色 / 场景）。引用清单从所有 beat 派生，无额外存储。 */
export type ResourceNodeData = {
  kind: ResourceKind;
  resource: Character | Scene;
  /** 引用该资源的 beat id 列表（引用反查） */
  referencedBeatIds: string[];
  isSelected: boolean;
  isDimmed: boolean;
};

/** 3D 导演台节点数据：有 blockout3D 的分镜在画布上的 3D 构图参考节点 */
export type BlockoutNodeData = {
  kind: "blockout";
  beatId: string;
  title: string;
  scene: BlockoutScene;
  isSelected: boolean;
};

export type CanvasNodeData = BeatNodeData | ResourceNodeData | BlockoutNodeData;

export type CanvasNode = Node<CanvasNodeData>;

/** 绑定连线的数据负载：记录资源 ↔ 分镜的绑定关系，用于断开连线时回写 beat 字段 */
export type BindingEdgeData =
  | { kind: "character"; resourceId: string; beatId: string }
  | { kind: "scene"; resourceId: string; beatId: string }
  | { kind: "frame"; resourceId: string; beatId: string };

export type CanvasEdge = Edge<BindingEdgeData>;
