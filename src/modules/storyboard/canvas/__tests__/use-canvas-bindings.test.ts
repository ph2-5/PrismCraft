import { describe, it, expect, vi } from "vitest";
import type { StoryBeat } from "@/domain/schemas";
import {
  deriveEdges,
  resolveResourceReferences,
  applyConnection,
  removeBindingEdges,
  moveBeatBefore,
  buildInitialNodes,
  reconcileNodes,
} from "../hooks/use-canvas-bindings";
import {
  beatNodeId,
  characterNodeId,
  sceneNodeId,
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

  it("keyframe 链引用时序列连线变为帧衔接样式（warning 虚线）", () => {
    const a = makeBeat("a");
    const b = makeBeat("b", {
      keyframe: { imageUrl: "k2", referencedPrevKeyframe: "a" },
    });
    const edges = deriveEdges([a, b]);
    const seqEdge = edges.find((e) => e.id === "seq-a-b");
    expect(seqEdge?.style?.strokeDasharray).toBe("6 4");
    expect(seqEdge?.style?.stroke).toBe("var(--warning)");
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
      { source: characterNodeId("c1"), target: beatNodeId("b1") },
      beats,
      update,
    );
    expect(update).toHaveBeenCalledWith("b1", { characterIds: ["c1"] });
  });

  it("重复连线不重复写入", () => {
    const beats = [makeBeat("b1", { characterIds: ["c1"] })];
    const update = vi.fn();
    applyConnection(
      { source: characterNodeId("c1"), target: beatNodeId("b1") },
      beats,
      update,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("场景节点连线到分镜 → 写入 sceneId", () => {
    const beats = [makeBeat("b1")];
    const update = vi.fn();
    applyConnection(
      { source: sceneNodeId("s1"), target: beatNodeId("b1") },
      beats,
      update,
    );
    expect(update).toHaveBeenCalledWith("b1", { sceneId: "s1" });
  });

  it("分镜 → 分镜连线 → 返回重排结果（不调用 update）", () => {
    const beats = [makeBeat("a"), makeBeat("b"), makeBeat("c")];
    const update = vi.fn();
    const reordered = applyConnection(
      { source: beatNodeId("c"), target: beatNodeId("a") },
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
    expect(charNode?.data.referencedBeatIds).toEqual(["b1"]);
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
