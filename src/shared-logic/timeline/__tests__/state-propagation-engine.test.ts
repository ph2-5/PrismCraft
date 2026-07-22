/**
 * Q3-4 / Task 4.6.2 — 状态推演引擎测试
 *
 * 测试覆盖：
 *   - propagateStates 主算法
 *     - 空时间线 / 单节点 / 多节点
 *     - 首节点初始化（角色 + 场景）
 *     - 常规事件应用规则
 *     - compound 事件递归处理
 *     - NO_OP 事件透传前一节点状态
 *     - 节点按 order 排序（输入乱序）
 *     - characterId / sceneId 匹配检查
 *   - computeCascadeEffects 级联传播
 *   - getNodeSnapshots / getAllSnapshots 查询辅助
 */

import { describe, it, expect } from "vitest";
import {
  propagateStates,
  computeCascadeEffects,
  getNodeSnapshots,
  getAllSnapshots,
} from "../state-propagation-engine";
import type {
  StoryTimelineLike,
  PlotNodeLike,
  PlotEventType,
  PlotEventParameters,
  CharacterInitialState,
  SceneInitialState,
  NodeSnapshots,
  PlotEvent,
} from "../snapshot-types";

// ─────────────────────────────────────────────────────────────
// 测试工厂函数
// ─────────────────────────────────────────────────────────────

function makeCharacterInitial(
  overrides: Partial<CharacterInitialState> = {},
): CharacterInitialState {
  return {
    characterId: "char-1",
    variantId: "variant-default",
    outfit: "casual",
    expression: "neutral",
    pose: "standing",
    emotion: "neutral",
    powerLevel: 50,
    ...overrides,
  };
}

function makeSceneInitial(
  overrides: Partial<SceneInitialState> = {},
): SceneInitialState {
  return {
    sceneId: "scene-1",
    variantId: "variant-day",
    timeOfDay: "day",
    weather: "clear",
    lighting: "natural",
    mood: "neutral",
    crowdLevel: "normal",
    ...overrides,
  };
}

function makeNode(
  id: string,
  order: number,
  eventType: PlotEventType = "narration",
  params: PlotEventParameters = {},
  overrides: Partial<PlotNodeLike> = {},
): PlotNodeLike {
  return {
    id,
    order,
    plotEventType: eventType,
    plotEventDescription: `${eventType} 事件 @ ${id}`,
    plotEventParameters: params,
    ...overrides,
  };
}

function makeTimeline(
  nodes: PlotNodeLike[],
  bindings: StoryTimelineLike["bindings"] = [],
): StoryTimelineLike {
  return {
    id: "tl-test",
    nodes,
    bindings,
  };
}

// ─────────────────────────────────────────────────────────────
// propagateStates 主算法测试
// ─────────────────────────────────────────────────────────────

describe("state-propagation-engine", () => {
  describe("propagateStates — 边界场景", () => {
    it("空时间线应返回空 Map", () => {
      const timeline = makeTimeline([]);
      const result = propagateStates(timeline);
      expect(result.size).toBe(0);
    });

    it("单节点时间线应仅初始化首节点", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [makeCharacterInitial()],
          sceneInitialStates: [makeSceneInitial()],
        }),
      ]);

      const result = propagateStates(timeline);

      expect(result.size).toBe(1);
      const snapshots = result.get("node-1");
      expect(snapshots).toBeDefined();
      expect(snapshots!.nodeId).toBe("node-1");
      expect(snapshots!.characterSnapshots).toHaveLength(1);
      expect(snapshots!.sceneSnapshots).toHaveLength(1);
      expect(snapshots!.transitions).toEqual([]);
    });

    it("首节点无 initial states 时应返回空快照数组", () => {
      const timeline = makeTimeline([makeNode("node-1", 1)]);

      const result = propagateStates(timeline);

      const snapshots = result.get("node-1");
      expect(snapshots!.characterSnapshots).toEqual([]);
      expect(snapshots!.sceneSnapshots).toEqual([]);
    });
  });

  describe("propagateStates — 首节点初始化", () => {
    it("应该使用 characterInitialStates 初始化角色快照", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [
            makeCharacterInitial({
              characterId: "char-a",
              variantId: "v-a",
              outfit: "armor",
              expression: "serious",
              pose: "fighting",
              emotion: "angry",
              powerLevel: 80,
              accessories: ["sword"],
            }),
            makeCharacterInitial({
              characterId: "char-b",
              variantId: "v-b",
            }),
          ],
        }),
      ]);

      const result = propagateStates(timeline);
      const snapshots = result.get("node-1")!;
      const charA = snapshots.characterSnapshots.find((s) => s.characterId === "char-a")!;

      expect(charA.appearance.variantId).toBe("v-a");
      expect(charA.appearance.outfit).toBe("armor");
      expect(charA.appearance.expression).toBe("serious");
      expect(charA.appearance.pose).toBe("fighting");
      expect(charA.appearance.injuries).toEqual([]);
      expect(charA.appearance.accessories).toEqual(["sword"]);
      expect(charA.innerState.emotion).toBe("angry");
      expect(charA.innerState.secretRevealed).toEqual([]);
      expect(charA.innerState.relationshipStatus).toEqual({});
      expect(charA.abilityState.powerLevel).toBe(80);
      expect(charA.stateSource.baseVariantId).toBe("v-a");
      expect(charA.stateSource.isModified).toBe(false);
      expect(charA.stateSource.transitions).toEqual([]);
      expect(charA.nodeId).toBe("node-1");
    });

    it("应该使用 sceneInitialStates 初始化场景快照", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          sceneInitialStates: [
            makeSceneInitial({
              sceneId: "scene-a",
              variantId: "v-a",
              timeOfDay: "night",
              weather: "rain",
              lighting: "dim",
              mood: "tense",
              crowdLevel: "sparse",
            }),
          ],
        }),
      ]);

      const result = propagateStates(timeline);
      const snapshots = result.get("node-1")!;
      const scene = snapshots.sceneSnapshots[0]!;

      expect(scene.sceneId).toBe("scene-a");
      expect(scene.environment.variantId).toBe("v-a");
      expect(scene.environment.timeOfDay).toBe("night");
      expect(scene.environment.weather).toBe("rain");
      expect(scene.environment.lighting).toBe("dim");
      expect(scene.environment.mood).toBe("tense");
      expect(scene.environment.destructionLevel).toBe(0);
      expect(scene.environment.crowdLevel).toBe("sparse");
      expect(scene.environment.atmosphereChanges).toEqual([]);
      expect(scene.persistentChanges.addedObjects).toEqual([]);
      expect(scene.persistentChanges.removedObjects).toEqual([]);
      expect(scene.persistentChanges.modifiedObjects).toEqual([]);
      expect(scene.nodeId).toBe("node-1");
    });

    it("characterInitialStates 默认值应正确填充", () => {
      // 使用最小 initial state（仅必填字段），测试引擎的默认值填充
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [
            { characterId: "char-1", variantId: "v-1" },
          ],
        }),
      ]);

      const result = propagateStates(timeline);
      const charSnap = result.get("node-1")!.characterSnapshots[0]!;

      // 未指定字段应使用引擎默认值
      expect(charSnap.appearance.outfit).toBe("");
      expect(charSnap.appearance.expression).toBe("neutral");
      expect(charSnap.appearance.pose).toBe("standing");
      expect(charSnap.innerState.emotion).toBe("neutral");
      expect(charSnap.innerState.motivation).toBe("");
      expect(charSnap.abilityState.abilitiesActive).toEqual([]);
      expect(charSnap.abilityState.abilitiesRevealed).toEqual([]);
      expect(charSnap.abilityState.powerLevel).toBe(0);
    });
  });

  describe("propagateStates — 常规事件推演", () => {
    it("character_transform 事件应切换变体并透传到下一节点", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [
            makeCharacterInitial({ characterId: "char-1", variantId: "v-default" }),
          ],
        }),
        makeNode("node-2", 2, "character_transform", {
          characterId: "char-1",
          previousVariantId: "v-default",
          newVariantId: "v-battle",
        }),
      ]);

      const result = propagateStates(timeline);

      const node1Char = result.get("node-1")!.characterSnapshots[0]!;
      const node2Char = result.get("node-2")!.characterSnapshots[0]!;

      expect(node1Char.appearance.variantId).toBe("v-default");
      expect(node2Char.appearance.variantId).toBe("v-battle");
      expect(node2Char.nodeId).toBe("node-2");
      expect(node2Char.stateSource.isModified).toBe(true);
      expect(node2Char.stateSource.transitions).toHaveLength(1);
    });

    it("scene_destruction 事件应累加破坏程度", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          sceneInitialStates: [makeSceneInitial({ sceneId: "scene-1" })],
        }),
        makeNode("node-2", 2, "scene_destruction", {
          sceneId: "scene-1",
        }),
        makeNode("node-3", 3, "scene_destruction", {
          sceneId: "scene-1",
        }),
      ]);

      const result = propagateStates(timeline);

      const scene1 = result.get("node-1")!.sceneSnapshots[0]!;
      const scene2 = result.get("node-2")!.sceneSnapshots[0]!;
      const scene3 = result.get("node-3")!.sceneSnapshots[0]!;

      expect(scene1.environment.destructionLevel).toBe(0);
      expect(scene2.environment.destructionLevel).toBe(30);
      expect(scene3.environment.destructionLevel).toBe(60);
      expect(scene3.nodeId).toBe("node-3");
    });

    it("characterId 不匹配的快照不应被修改", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [
            makeCharacterInitial({ characterId: "char-1", variantId: "v-1" }),
            makeCharacterInitial({ characterId: "char-2", variantId: "v-2" }),
          ],
        }),
        makeNode("node-2", 2, "character_transform", {
          characterId: "char-1",
          previousVariantId: "v-1",
          newVariantId: "v-battle",
        }),
      ]);

      const result = propagateStates(timeline);
      const node2Chars = result.get("node-2")!.characterSnapshots;

      const char1 = node2Chars.find((s) => s.characterId === "char-1")!;
      const char2 = node2Chars.find((s) => s.characterId === "char-2")!;

      expect(char1.appearance.variantId).toBe("v-battle");
      expect(char1.stateSource.isModified).toBe(true);
      // char-2 不应被修改
      expect(char2.appearance.variantId).toBe("v-2");
      expect(char2.stateSource.isModified).toBe(false);
    });

    it("sceneId 不匹配的场景快照不应被修改", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          sceneInitialStates: [
            makeSceneInitial({ sceneId: "scene-1", variantId: "v-1" }),
            makeSceneInitial({ sceneId: "scene-2", variantId: "v-2" }),
          ],
        }),
        makeNode("node-2", 2, "scene_destruction", {
          sceneId: "scene-1",
        }),
      ]);

      const result = propagateStates(timeline);
      const node2Scenes = result.get("node-2")!.sceneSnapshots;

      const scene1 = node2Scenes.find((s) => s.sceneId === "scene-1")!;
      const scene2 = node2Scenes.find((s) => s.sceneId === "scene-2")!;

      expect(scene1.environment.destructionLevel).toBe(30);
      expect(scene2.environment.destructionLevel).toBe(0);
    });

    it("item 事件应应用到所有场景快照（无 sceneId 限制）", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          sceneInitialStates: [
            makeSceneInitial({ sceneId: "scene-1" }),
            makeSceneInitial({ sceneId: "scene-2" }),
          ],
        }),
        makeNode("node-2", 2, "item_introduce", {
          itemId: "sword-1",
        }),
      ]);

      const result = propagateStates(timeline);
      const node2Scenes = result.get("node-2")!.sceneSnapshots;

      // 两个场景都应包含 sword-1（item 事件无 sceneId 限制）
      expect(node2Scenes[0]!.entities.itemsPresent).toContain("sword-1");
      expect(node2Scenes[1]!.entities.itemsPresent).toContain("sword-1");
    });
  });

  describe("propagateStates — NO_OP 事件透传", () => {
    it("narration 事件应透传前一节点状态", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [
            makeCharacterInitial({ characterId: "char-1", variantId: "v-1" }),
          ],
          sceneInitialStates: [makeSceneInitial()],
        }),
        makeNode("node-2", 2, "character_transform", {
          characterId: "char-1",
          previousVariantId: "v-1",
          newVariantId: "v-battle",
        }),
        makeNode("node-3", 3, "narration"),
      ]);

      const result = propagateStates(timeline);

      const node3Char = result.get("node-3")!.characterSnapshots[0]!;

      // node-3 应透传 node-2 的状态
      expect(node3Char.appearance.variantId).toBe("v-battle");
      expect(node3Char.nodeId).toBe("node-3");
      // transitions 应记录透传事件
      const node3Snapshots = result.get("node-3")!;
      expect(node3Snapshots.transitions).toHaveLength(1);
      expect(node3Snapshots.transitions[0]!.previousNodeId).toBe("node-2");
    });

    it("所有 9 种 NO_OP 事件都应透传状态", () => {
      const noOpTypes: PlotEventType[] = [
        "world_rule_reveal",
        "foreshadow",
        "callback",
        "climax",
        "twist",
        "resolution",
        "narration",
        "dialogue",
        "action",
      ];

      for (const type of noOpTypes) {
        const timeline = makeTimeline([
          makeNode("node-1", 1, "narration", {}, {
            characterInitialStates: [
              makeCharacterInitial({ characterId: "char-1", variantId: "v-init" }),
            ],
          }),
          makeNode("node-2", 2, type),
        ]);

        const result = propagateStates(timeline);
        const node2Char = result.get("node-2")!.characterSnapshots[0]!;

        expect(node2Char.appearance.variantId).toBe("v-init");
        expect(node2Char.nodeId).toBe("node-2");
      }
    });
  });

  describe("propagateStates — compound 事件", () => {
    it("compound 事件应递归处理 subEvents", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [
            makeCharacterInitial({ characterId: "char-1", variantId: "v-default" }),
          ],
          sceneInitialStates: [makeSceneInitial({ sceneId: "scene-1" })],
        }),
        makeNode("node-2", 2, "compound", {
          subEvents: [
            {
              id: "sub-1",
              nodeId: "node-2",
              type: "character_transform",
              description: "变身",
              parameters: {
                characterId: "char-1",
                previousVariantId: "v-default",
                newVariantId: "v-battle",
              },
            },
            {
              id: "sub-2",
              nodeId: "node-2",
              type: "scene_destruction",
              description: "破坏",
              parameters: { sceneId: "scene-1" },
            },
          ],
        }),
      ]);

      const result = propagateStates(timeline);
      const node2 = result.get("node-2")!;

      // 角色应被 sub-1 转换
      const char = node2.characterSnapshots[0]!;
      expect(char.appearance.variantId).toBe("v-battle");

      // 场景应被 sub-2 破坏
      const scene = node2.sceneSnapshots[0]!;
      expect(scene.environment.destructionLevel).toBe(30);

      // compound 事件应记录一条 transition
      expect(node2.transitions).toHaveLength(1);
      expect(node2.transitions[0]!.visualDescription).toContain("复合事件");
    });

    it("compound 事件无 subEvents 时应透传前一节点状态", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [
            makeCharacterInitial({ characterId: "char-1", variantId: "v-init" }),
          ],
        }),
        makeNode("node-2", 2, "compound", { subEvents: [] }),
      ]);

      const result = propagateStates(timeline);
      const node2Char = result.get("node-2")!.characterSnapshots[0]!;

      expect(node2Char.appearance.variantId).toBe("v-init");
    });

    it("compound 事件应支持嵌套 compound", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [
            makeCharacterInitial({ characterId: "char-1", variantId: "v-default" }),
          ],
        }),
        makeNode("node-2", 2, "compound", {
          subEvents: [
            {
              id: "outer-sub",
              nodeId: "node-2",
              type: "compound",
              description: "嵌套复合",
              parameters: {
                subEvents: [
                  {
                    id: "inner-sub",
                    nodeId: "node-2",
                    type: "character_transform",
                    description: "变身",
                    parameters: {
                      characterId: "char-1",
                      previousVariantId: "v-default",
                      newVariantId: "v-nested",
                    },
                  },
                ],
              },
            },
          ],
        }),
      ]);

      const result = propagateStates(timeline);
      const node2Char = result.get("node-2")!.characterSnapshots[0]!;

      // 嵌套 compound 中的 character_transform 应生效
      expect(node2Char.appearance.variantId).toBe("v-nested");
    });
  });

  describe("propagateStates — 节点排序", () => {
    it("应该按 order 排序节点（输入乱序）", () => {
      const timeline = makeTimeline([
        makeNode("node-3", 3, "narration", {}, {
          characterInitialStates: [makeCharacterInitial({ variantId: "v-3" })],
        }),
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [makeCharacterInitial({ variantId: "v-1" })],
        }),
        makeNode("node-2", 2, "narration", {}, {
          characterInitialStates: [makeCharacterInitial({ variantId: "v-2" })],
        }),
      ]);

      const result = propagateStates(timeline);

      // 每个节点都应该初始化为自己的 initial state（因为是 narration 透传）
      // 但 node-2 应该透传 node-1 的状态，node-3 应该透传 node-2 的状态
      const node1Char = result.get("node-1")!.characterSnapshots[0]!;
      const node2Char = result.get("node-2")!.characterSnapshots[0]!;
      const node3Char = result.get("node-3")!.characterSnapshots[0]!;

      expect(node1Char.appearance.variantId).toBe("v-1");
      // node-2 是 narration，应透传 node-1 的状态
      expect(node2Char.appearance.variantId).toBe("v-1");
      // node-3 是 narration，应透传 node-2 的状态
      expect(node3Char.appearance.variantId).toBe("v-1");
    });
  });

  describe("propagateStates — 完整流程集成", () => {
    it("多节点多事件应正确推演状态", () => {
      const timeline = makeTimeline([
        // 节点1：初始化
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [
            makeCharacterInitial({ characterId: "char-1", variantId: "v-casual" }),
          ],
          sceneInitialStates: [
            makeSceneInitial({ sceneId: "scene-1", variantId: "v-day" }),
          ],
        }),
        // 节点2：角色变身
        makeNode("node-2", 2, "character_transform", {
          characterId: "char-1",
          previousVariantId: "v-casual",
          newVariantId: "v-battle",
        }),
        // 节点3：场景破坏
        makeNode("node-3", 3, "scene_destruction", { sceneId: "scene-1" }),
        // 节点4：narration 透传
        makeNode("node-4", 4, "narration"),
        // 节点5：角色受伤
        makeNode("node-5", 5, "character_injury", {
          characterId: "char-1",
          injuryType: "cut",
          injuryLocation: "arm",
          severity: "severe",
        }),
      ]);

      const result = propagateStates(timeline);

      // 节点1：初始状态
      const n1 = result.get("node-1")!;
      expect(n1.characterSnapshots[0]!.appearance.variantId).toBe("v-casual");
      expect(n1.sceneSnapshots[0]!.environment.destructionLevel).toBe(0);

      // 节点2：变身
      const n2 = result.get("node-2")!;
      expect(n2.characterSnapshots[0]!.appearance.variantId).toBe("v-battle");

      // 节点3：破坏
      const n3 = result.get("node-3")!;
      expect(n3.sceneSnapshots[0]!.environment.destructionLevel).toBe(30);
      // 角色状态应透传
      expect(n3.characterSnapshots[0]!.appearance.variantId).toBe("v-battle");

      // 节点4：narration 透传
      const n4 = result.get("node-4")!;
      expect(n4.characterSnapshots[0]!.appearance.variantId).toBe("v-battle");
      expect(n4.sceneSnapshots[0]!.environment.destructionLevel).toBe(30);

      // 节点5：受伤
      const n5 = result.get("node-5")!;
      expect(n5.characterSnapshots[0]!.appearance.injuries).toHaveLength(1);
      expect(n5.characterSnapshots[0]!.appearance.injuries[0]!.type).toBe("cut");
      // 场景状态应透传
      expect(n5.sceneSnapshots[0]!.environment.destructionLevel).toBe(30);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // computeCascadeEffects 测试
  // ─────────────────────────────────────────────────────────────

  describe("computeCascadeEffects", () => {
    it("character_reveal_secret 应返回 callback 绑定的下游节点", () => {
      const timeline = makeTimeline(
        [
          makeNode("node-1", 1),
          makeNode("node-2", 2),
          makeNode("node-3", 3),
        ],
        [
          { id: "b-1", type: "callback", sourceNodeId: "node-1", targetNodeId: "node-3" },
        ],
      );

      const event: PlotEvent = {
        id: "evt-1",
        nodeId: "node-1",
        type: "character_reveal_secret",
        description: "揭示秘密",
        parameters: {},
      };

      const affected = computeCascadeEffects(event, timeline);

      expect(affected).toEqual(["node-3"]);
    });

    it("无对应规则的事件类型应返回空数组", () => {
      const timeline = makeTimeline([makeNode("node-1", 1)]);
      const event: PlotEvent = {
        id: "evt-1",
        nodeId: "node-1",
        type: "narration",
        description: "叙述",
        parameters: {},
      };

      const affected = computeCascadeEffects(event, timeline);

      expect(affected).toEqual([]);
    });

    it("scene_destruction 应返回同场景的下游节点", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "scene_destruction", { sceneId: "scene-1" }, {
          sceneInitialStates: [makeSceneInitial({ sceneId: "scene-1" })],
        }),
        makeNode("node-2", 2, "narration", {}, {
          sceneInitialStates: [makeSceneInitial({ sceneId: "scene-1" })],
        }),
        makeNode("node-3", 3, "narration", {}, {
          sceneInitialStates: [makeSceneInitial({ sceneId: "scene-2" })],
        }),
      ]);

      const event: PlotEvent = {
        id: "evt-1",
        nodeId: "node-1",
        type: "scene_destruction",
        description: "破坏",
        parameters: { sceneId: "scene-1" },
      };

      const affected = computeCascadeEffects(event, timeline);

      expect(affected).toEqual(["node-2"]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getNodeSnapshots 测试
  // ─────────────────────────────────────────────────────────────

  describe("getNodeSnapshots", () => {
    it("应返回指定节点的快照", () => {
      const timeline = makeTimeline([
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [makeCharacterInitial()],
        }),
      ]);
      const result = propagateStates(timeline);

      const snapshots = getNodeSnapshots(result, "node-1");

      expect(snapshots).toBeDefined();
      expect(snapshots!.nodeId).toBe("node-1");
    });

    it("不存在的 nodeId 应返回 undefined", () => {
      const timeline = makeTimeline([makeNode("node-1", 1)]);
      const result = propagateStates(timeline);

      const snapshots = getNodeSnapshots(result, "non-existent");

      expect(snapshots).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getAllSnapshots 测试
  // ─────────────────────────────────────────────────────────────

  describe("getAllSnapshots", () => {
    it("应按 order 排序返回所有快照", () => {
      const timeline = makeTimeline([
        makeNode("node-3", 3, "narration", {}, {
          characterInitialStates: [makeCharacterInitial()],
        }),
        makeNode("node-1", 1, "narration", {}, {
          characterInitialStates: [makeCharacterInitial()],
        }),
        makeNode("node-2", 2, "narration", {}, {
          characterInitialStates: [makeCharacterInitial()],
        }),
      ]);
      const result = propagateStates(timeline);

      const all = getAllSnapshots(result, timeline);

      expect(all).toHaveLength(3);
      expect(all[0]!.nodeId).toBe("node-1");
      expect(all[1]!.nodeId).toBe("node-2");
      expect(all[2]!.nodeId).toBe("node-3");
    });

    it("空时间线应返回空数组", () => {
      const timeline = makeTimeline([]);
      const result = propagateStates(timeline);

      const all = getAllSnapshots(result, timeline);

      expect(all).toEqual([]);
    });

    it("应过滤掉 undefined（缺失快照）", () => {
      const result: Map<string, NodeSnapshots> = new Map();
      // 故意只放入 node-1，但 timeline 中有 node-2（模拟数据不一致）
      result.set("node-1", {
        nodeId: "node-1",
        characterSnapshots: [],
        sceneSnapshots: [],
        transitions: [],
      });

      const timelineWithMissing = makeTimeline([
        makeNode("node-1", 1),
        makeNode("node-2", 2),
      ]);

      const all = getAllSnapshots(result, timelineWithMissing);

      // node-2 缺失快照应被过滤
      expect(all).toHaveLength(1);
      expect(all[0]!.nodeId).toBe("node-1");
    });
  });
});
