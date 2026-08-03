import { describe, it, expect, vi } from "vitest";
import type { StoryBeat } from "@/domain/schemas";
import { createEmptyScene } from "@/modules/blockout-3d";
import {
  deriveEdges,
  resolveResourceReferences,
  applyConnection,
  removeBindingEdges,
  moveBeatBefore,
  buildInitialNodes,
  reconcileNodes,
  computeUnboundResourceIds,
  FRAME_SOURCE_HANDLE,
  FRAME_TARGET_HANDLE,
} from "../hooks/use-canvas-bindings";
import {
  beatNodeId,
  blockoutNodeId,
  characterNodeId,
  sceneNodeId,
  computeAutoLayout,
  MAX_RESOURCE_STACK,
  BLOCKOUT_ROW_Y,
} from "../layout/auto-layout";

function makeBeat(id: string, overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id,
    sequence: 1,
    order: 0,
    description: "",
    characterIds: [],
    elementIds: [],
    ...overrides,
  };
}

function makeChar(id: string, name = id) {
  return {
    id,
    name,
    description: "",
    gender: "",
    style: "anime",
    personality: [],
    appearance: {
      hairColor: "",
      hairStyle: "",
      eyeColor: "",
      height: "",
      build: "",
      clothing: "",
    },
    prompt: "",
  };
}

function makeScene(id: string, name = id) {
  return {
    id,
    name,
    description: "",
    type: "indoor",
    timeOfDay: "",
    weather: "",
    mood: "",
    lighting: "",
    elements: [],
    colors: [],
    prompt: "",
  };
}

describe("deriveEdges", () => {
  it("为相邻分镜派生序列连线", () => {
    const a = makeBeat("a");
    const b = makeBeat("b");
    const c = makeBeat("c");
    const edges = deriveEdges([a, b, c]);

    const seqIds = edges.filter((e) => e.id.startsWith("seq-")).map((e) => e.id);
    expect(seqIds).toEqual(["seq-a-b", "seq-b-c"]);
    // 序列连线不可删除（防止误删顺序）
    expect(edges.find((e) => e.id === "seq-a-b")?.deletable).toBe(false);
  });

  it("从 characterIds/sceneId 派生绑定连线", () => {
    const beat = makeBeat("b1", {
      characterIds: ["c1", "c2"],
      sceneId: "s1",
    });
    const edges = deriveEdges([beat]);

    const charEdges = edges.filter((e) => e.id.startsWith("char-"));
    expect(charEdges).toHaveLength(2);
    expect(charEdges.map((e) => e.id).sort()).toEqual(["char-c1-b1", "char-c2-b1"]);
    expect(charEdges[0]?.data).toEqual({ kind: "character", resourceId: "c1", beatId: "b1" });

    const sceneEdges = edges.filter((e) => e.id.startsWith("scene-"));
    expect(sceneEdges).toHaveLength(1);
    expect(sceneEdges[0]?.data).toEqual({ kind: "scene", resourceId: "s1", beatId: "b1" });
  });

  it("keyframe 链引用时派生独立帧衔接边（warning 虚线，专用手柄）", () => {
    const a = makeBeat("a");
    const b = makeBeat("b", {
      keyframe: { imageUrl: "k2", referencedPrevKeyframe: "a" },
    });
    const edges = deriveEdges([a, b]);

    const frameEdge = edges.find((e) => e.id === "frame-a-b");
    expect(frameEdge).toBeDefined();
    expect(frameEdge?.data).toEqual({ kind: "frame", resourceId: "a", beatId: "b" });
    expect(frameEdge?.sourceHandle).toBe(FRAME_SOURCE_HANDLE);
    expect(frameEdge?.targetHandle).toBe(FRAME_TARGET_HANDLE);
    expect(frameEdge?.style?.strokeDasharray).toBe("6 4");
    expect(frameEdge?.style?.stroke).toBe("var(--warning)");

    // 序列连线保持原样，帧衔接样式不再合流到 seq 边
    const seqEdge = edges.find((e) => e.id === "seq-a-b");
    expect(seqEdge?.style?.strokeDasharray).toBeUndefined();
    expect(seqEdge?.style?.stroke).toBe("var(--border)");
  });
});

describe("resolveResourceReferences", () => {
  it("反查角色与场景被哪些分镜引用", () => {
    const beats = [
      makeBeat("b1", { characterIds: ["c1"], sceneId: "s1" }),
      makeBeat("b2", { characterIds: ["c2"], sceneId: "s1" }),
      makeBeat("b3", { characterIds: [] }),
    ];
    expect(resolveResourceReferences(beats, "character", "c1")).toEqual(["b1"]);
    expect(resolveResourceReferences(beats, "character", "c2")).toEqual(["b2"]);
    expect(resolveResourceReferences(beats, "scene", "s1")).toEqual(["b1", "b2"]);
    expect(resolveResourceReferences(beats, "character", "nope")).toEqual([]);
  });
});

describe("applyConnection（画布 → 表单）", () => {
  it("角色节点连线到分镜 → 写入 characterIds", () => {
    const beats = [makeBeat("b1")];
    const update = vi.fn();
    applyConnection(
      { source: characterNodeId("c1"), target: beatNodeId("b1"), sourceHandle: null, targetHandle: null },
      beats,
      update,
    );
    expect(update).toHaveBeenCalledWith("b1", { characterIds: ["c1"] });
  });

  it("重复连线不重复写入", () => {
    const beats = [makeBeat("b1", { characterIds: ["c1"] })];
    const update = vi.fn();
    applyConnection(
      { source: characterNodeId("c1"), target: beatNodeId("b1"), sourceHandle: null, targetHandle: null },
      beats,
      update,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("场景节点连线到分镜 → 写入 sceneId", () => {
    const beats = [makeBeat("b1")];
    const update = vi.fn();
    applyConnection(
      { source: sceneNodeId("s1"), target: beatNodeId("b1"), sourceHandle: null, targetHandle: null },
      beats,
      update,
    );
    expect(update).toHaveBeenCalledWith("b1", { sceneId: "s1" });
  });

  it("分镜 → 分镜连线 → 返回重排结果（不调用 update）", () => {
    const beats = [makeBeat("a"), makeBeat("b"), makeBeat("c")];
    const update = vi.fn();
    const reordered = applyConnection(
      { source: beatNodeId("c"), target: beatNodeId("a"), sourceHandle: null, targetHandle: null },
      beats,
      update,
    );
    expect(update).not.toHaveBeenCalled();
    expect(reordered?.map((b) => b.id)).toEqual(["c", "a", "b"]);
    expect(reordered?.[0]?.order).toBe(0);
  });
});

describe("removeBindingEdges（断开连线 → 表单）", () => {
  it("断开角色绑定 → 从 characterIds 移除", () => {
    const beats = [makeBeat("b1", { characterIds: ["c1", "c2"] })];
    const update = vi.fn();
    removeBindingEdges(
      [
        {
          id: "char-c1-b1",
          source: characterNodeId("c1"),
          target: beatNodeId("b1"),
          data: { kind: "character", resourceId: "c1", beatId: "b1" },
        },
      ],
      beats,
      update,
    );
    expect(update).toHaveBeenCalledWith("b1", { characterIds: ["c2"] });
  });

  it("断开场景绑定 → 清空 sceneId", () => {
    const beats = [makeBeat("b1", { sceneId: "s1" })];
    const update = vi.fn();
    removeBindingEdges(
      [
        {
          id: "scene-s1-b1",
          source: sceneNodeId("s1"),
          target: beatNodeId("b1"),
          data: { kind: "scene", resourceId: "s1", beatId: "b1" },
        },
      ],
      beats,
      update,
    );
    expect(update).toHaveBeenCalledWith("b1", { sceneId: undefined });
  });

  it("忽略无绑定数据的连线（序列/帧连线）", () => {
    const beats = [makeBeat("b1")];
    const update = vi.fn();
    removeBindingEdges(
      [{ id: "seq-a-b", source: "beat-a", target: "beat-b" }],
      beats,
      update,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe("moveBeatBefore", () => {
  it("将分镜移动到目标之前并刷新 order/sequence", () => {
    const beats = [makeBeat("a"), makeBeat("b"), makeBeat("c")];
    const next = moveBeatBefore(beats, "c", "a");
    expect(next?.map((b) => b.id)).toEqual(["c", "a", "b"]);
    expect(next?.map((b) => b.sequence)).toEqual([0, 1, 2]);
  });

  it("相同分镜或未找到时返回 null", () => {
    expect(moveBeatBefore([makeBeat("a")], "a", "a")).toBeNull();
    expect(moveBeatBefore([makeBeat("a")], "nope", "a")).toBeNull();
  });
});

describe("节点构建 / 调和", () => {
  const beats = [makeBeat("b1", { characterIds: ["c1"] })];
  const characters = [makeChar("c1")];
  const scenes = [makeScene("s1")];

  it("buildInitialNodes 为分镜/角色/场景生成节点", () => {
    const nodes = buildInitialNodes({ beats, characters, scenes, positions: new Map(), selectedBeatId: null, selectedResourceId: null });
    expect(nodes.map((n) => n.type)).toEqual(["beat", "character", "scene"]);
    expect(nodes.find((n) => n.type === "character")?.id).toBe(characterNodeId("c1"));
    // 引用反查数据注入节点 data
    const charNode = nodes.find((n) => n.type === "character");
    expect(charNode?.data.kind === "character" ? charNode.data.referencedBeatIds : undefined).toEqual(["b1"]);
  });

  it("reconcileNodes 保留既有节点位置、补齐新增、移除已删除", () => {
    const initial = buildInitialNodes({ beats, characters, scenes, positions: new Map(), selectedBeatId: null, selectedResourceId: null });
    // 用户拖动过 beat 节点
    const dragged = initial.map((n) =>
      n.id === beatNodeId("b1") ? { ...n, position: { x: 999, y: 88 } } : n,
    );

    const nextBeats = [makeBeat("b2"), ...beats]; // b1 保留 + 新增 b2
    const next = reconcileNodes(dragged, {
      beats: nextBeats,
      characters,
      scenes,
      positions: new Map([[beatNodeId("b2"), { x: 50, y: 60 }]]),
      selectedBeatId: null,
      selectedResourceId: null,
    });

    const beatNodes = next.filter((n) => n.type === "beat");
    expect(beatNodes.map((n) => n.id)).toEqual([beatNodeId("b2"), beatNodeId("b1")]);
    // 既有节点位置保留
    expect(next.find((n) => n.id === beatNodeId("b1"))?.position).toEqual({ x: 999, y: 88 });
    // 新节点使用 positions
    expect(next.find((n) => n.id === beatNodeId("b2"))?.position).toEqual({ x: 50, y: 60 });
  });

  it("删除分镜后节点被移除", () => {
    const initial = buildInitialNodes({ beats, characters, scenes, positions: new Map(), selectedBeatId: null, selectedResourceId: null });
    const next = reconcileNodes(initial, {
      beats: [],
      characters,
      scenes,
      positions: new Map(),
      selectedBeatId: null,
      selectedResourceId: null,
    });
    expect(next.some((n) => n.type === "beat")).toBe(false);
  });

  it("hiddenResourceIds 隐藏指定角色/场景节点（添加角色/场景面板）", () => {
    const hidden = new Set(["c1"]);
    const built = buildInitialNodes({
      beats,
      characters,
      scenes,
      positions: new Map(),
      selectedBeatId: null,
      selectedResourceId: null,
      hiddenResourceIds: hidden,
    });
    expect(built.some((n) => n.id === characterNodeId("c1"))).toBe(false);
    expect(built.some((n) => n.id === sceneNodeId("s1"))).toBe(true);

    const reconciled = reconcileNodes(built, {
      beats,
      characters,
      scenes,
      positions: new Map(),
      selectedBeatId: null,
      selectedResourceId: null,
      hiddenResourceIds: new Set(["s1"]),
    });
    expect(reconciled.some((n) => n.id === sceneNodeId("s1"))).toBe(false);
    expect(reconciled.some((n) => n.id === characterNodeId("c1"))).toBe(true);
  });

  it("reconcileNodes 数据未变化时复用旧节点引用（性能：避免全量重渲染）", () => {
    const input = { beats, characters, scenes, positions: new Map(), selectedBeatId: null, selectedResourceId: null };
    const initial = buildInitialNodes(input);
    const reconciled = reconcileNodes(initial, input);
    // 无任何变化：所有节点引用应完全一致
    expect(reconciled).toHaveLength(initial.length);
    reconciled.forEach((node, i) => {
      expect(node).toBe(initial[i]);
    });
    // 仅选中态变化：只有受影响节点换引用，其余保留
    const withSelection = reconcileNodes(initial, {
      ...input,
      selectedBeatId: "b1",
    });
    const beat1 = withSelection.find((n) => n.id === beatNodeId("b1"));
    expect(beat1?.data.isSelected).toBe(true);
    const sceneNode = withSelection.find((n) => n.id === sceneNodeId("s1"));
    expect(sceneNode).toBe(initial.find((n) => n.id === sceneNodeId("s1")));
  });
});

describe("computeAutoLayout（大量资源不堆叠）", () => {
  it("多个角色绑定同一分镜时不重叠（同列最多 MAX_RESOURCE_STACK 个，超出向右延伸）", () => {
    const beats = [makeBeat("b1", { characterIds: ["c1", "c2", "c3", "c4", "c5"] })];
    const chars = ["c1", "c2", "c3", "c4", "c5"].map((id) => makeChar(id));
    const positions = computeAutoLayout(beats, chars, []);

    const xs = chars.map((c) => positions.get(characterNodeId(c.id))!.x);
    const ys = chars.map((c) => positions.get(characterNodeId(c.id))!.y);
    // 同一锚点列最多 MAX_RESOURCE_STACK 个：全部 x 不允许相同
    expect(new Set(xs).size).toBeGreaterThanOrEqual(Math.ceil(chars.length / MAX_RESOURCE_STACK));
    // 相同 x 的节点 y 必须不同（不重叠）
    for (const x of new Set(xs)) {
      const sameX = ys.filter((_, i) => xs[i] === x);
      expect(new Set(sameX).size).toBe(sameX.length);
    }
  });

  it("未绑定资源锚定到最后一个分镜之后", () => {
    const beats = [makeBeat("b1"), makeBeat("b2")];
    const chars = [makeChar("unbound")];
    const positions = computeAutoLayout(beats, chars, []);
    const beat2X = positions.get(beatNodeId("b2"))!.x;
    const unboundX = positions.get(characterNodeId("unbound"))!.x;
    expect(unboundX).toBeGreaterThan(beat2X);
  });

  it("角色行与场景行 y 不重叠", () => {
    const positions = computeAutoLayout([makeBeat("b1")], [makeChar("c1")], [makeScene("s1")]);
    const charY = positions.get(characterNodeId("c1"))!.y;
    const sceneY = positions.get(sceneNodeId("s1"))!.y;
    expect(sceneY).toBeGreaterThan(charY);
  });
});

describe("Blockout3DNode（3D 导演台节点）", () => {
  const scene = createEmptyScene("b3d-1", "3D 构图");

  it("deriveEdges 为有 blockout3D 的分镜派生参考边（不可断开）", () => {
    const a = makeBeat("a", { blockout3D: scene });
    const b = makeBeat("b");
    const edges = deriveEdges([a, b]);
    const refEdge = edges.find((e) => e.id === "b3d-a");
    expect(refEdge).toBeDefined();
    expect(refEdge?.source).toBe(beatNodeId("a"));
    expect(refEdge?.target).toBe(blockoutNodeId("a"));
    expect(refEdge?.deletable).toBe(false);
  });

  it("buildInitialNodes 为有 blockout3D 的分镜生成 3D 节点", () => {
    const beats = [makeBeat("a", { blockout3D: scene })];
    const nodes = buildInitialNodes({
      beats,
      characters: [],
      scenes: [],
      positions: new Map(),
      selectedBeatId: null,
      selectedResourceId: null,
    });
    const node = nodes.find((n) => n.type === "blockout");
    expect(node).toBeDefined();
    expect(node?.id).toBe(blockoutNodeId("a"));
    expect(node?.data.kind).toBe("blockout");
  });

  it("移除 blockout3D 后 3D 节点被移除", () => {
    const initial = buildInitialNodes({
      beats: [makeBeat("a", { blockout3D: scene })],
      characters: [],
      scenes: [],
      positions: new Map(),
      selectedBeatId: null,
      selectedResourceId: null,
    });
    const next = reconcileNodes(initial, {
      beats: [makeBeat("a")],
      characters: [],
      scenes: [],
      positions: new Map(),
      selectedBeatId: null,
      selectedResourceId: null,
    });
    expect(next.some((n) => n.type === "blockout")).toBe(false);
  });

  it("computeAutoLayout 将 3D 节点锚定到对应分镜列（BLOCKOUT_ROW_Y 行）", () => {
    const beats = [makeBeat("a", { blockout3D: scene }), makeBeat("b")];
    const positions = computeAutoLayout(beats, [], []);
    const pos = positions.get(blockoutNodeId("a"));
    expect(pos?.x).toBe(0);
    expect(pos?.y).toBe(BLOCKOUT_ROW_Y);
  });
});

describe("computeUnboundResourceIds（默认只显示已绑定策略）", () => {
  it("返回未被任何分镜引用的角色/场景 id", () => {
    const beats = [makeBeat("b1", { characterIds: ["c1"], sceneId: "s1" })];
    const characters = [makeChar("c1"), makeChar("c2")];
    const scenes = [makeScene("s1"), makeScene("s2")];
    const unbound = computeUnboundResourceIds(beats, characters, scenes);
    expect(unbound).toEqual(["c2", "s2"]);
  });

  it("无分镜时全部视为未绑定", () => {
    const unbound = computeUnboundResourceIds([], [makeChar("c1")], [makeScene("s1")]);
    expect(unbound).toEqual(["c1", "s1"]);
  });
});
