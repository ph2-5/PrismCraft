/**
 * Q3-4 / Task 4.6.2 — 状态转换规则库测试
 *
 * 测试覆盖：
 *   - 6 种角色事件规则的 apply 行为
 *   - 6 种场景事件规则的 apply 行为
 *   - 2 种级联规则的 propagate 行为
 *   - 事件分类辅助函数
 *   - NO_OP 事件集合
 */

import { describe, it, expect } from "vitest";
import {
  CHARACTER_RULES,
  SCENE_RULES,
  CASCADE_RULES,
  NO_OP_EVENTS,
  isCharacterEvent,
  isSceneEvent,
  isNoOpEvent,
  isCompoundEvent,
  createNoOpTransition,
} from "../state-transition-rules";
import type {
  CharacterStateSnapshot,
  SceneStateSnapshot,
  PlotEvent,
  StoryTimelineLike,
} from "../snapshot-types";

// ─────────────────────────────────────────────────────────────
// 测试工厂函数
// ─────────────────────────────────────────────────────────────

function makeCharacterSnapshot(
  overrides: Partial<CharacterStateSnapshot> = {},
): CharacterStateSnapshot {
  return {
    nodeId: "node-1",
    characterId: "char-1",
    appearance: {
      variantId: "variant-default",
      outfit: "casual",
      expression: "neutral",
      pose: "standing",
      injuries: [],
      accessories: [],
    },
    innerState: {
      emotion: "neutral",
      motivation: "",
      secretRevealed: [],
      relationshipStatus: {},
    },
    abilityState: {
      abilitiesActive: [],
      abilitiesRevealed: [],
      powerLevel: 50,
    },
    stateSource: {
      baseVariantId: "variant-default",
      transitions: [],
      isModified: false,
    },
    ...overrides,
  };
}

function makeSceneSnapshot(
  overrides: Partial<SceneStateSnapshot> = {},
): SceneStateSnapshot {
  return {
    nodeId: "node-1",
    sceneId: "scene-1",
    environment: {
      variantId: "variant-day",
      timeOfDay: "day",
      weather: "clear",
      lighting: "natural",
      mood: "neutral",
      destructionLevel: 0,
      crowdLevel: "normal",
      atmosphereChanges: [],
    },
    entities: {
      charactersPresent: [],
      itemsPresent: [],
      environmentalObjects: [],
    },
    persistentChanges: {
      addedObjects: [],
      removedObjects: [],
      modifiedObjects: [],
    },
    ...overrides,
  };
}

function makeEvent(
  type: PlotEvent["type"],
  params: Record<string, unknown> = {},
  overrides: Partial<PlotEvent> = {},
): PlotEvent {
  return {
    id: "event-1",
    nodeId: "node-2",
    type,
    description: `${type} 事件`,
    parameters: params,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// 角色事件规则测试
// ─────────────────────────────────────────────────────────────

describe("state-transition-rules", () => {
  describe("CHARACTER_RULES", () => {
    describe("character_introduce", () => {
      it("应该切换 variantId 并重置 emotion 为 neutral", () => {
        const rule = CHARACTER_RULES.character_introduce!;
        const prev = makeCharacterSnapshot({
          appearance: { ...makeCharacterSnapshot().appearance, variantId: "old" },
          innerState: { ...makeCharacterSnapshot().innerState, emotion: "angry" },
        });
        const event = makeEvent("character_introduce", {
          characterId: "char-1",
          newVariantId: "intro-variant",
        });

        const result = rule.apply(prev, event);

        expect(result.appearance.variantId).toBe("intro-variant");
        expect(result.innerState.emotion).toBe("neutral");
        expect(result.stateSource.isModified).toBe(true);
      });

      it("应该保留未指定的字段", () => {
        const rule = CHARACTER_RULES.character_introduce!;
        const prev = makeCharacterSnapshot({
          appearance: { ...makeCharacterSnapshot().appearance, outfit: "armor" },
        });
        const event = makeEvent("character_introduce", { newVariantId: "v2" });

        const result = rule.apply(prev, event);

        expect(result.appearance.outfit).toBe("armor");
      });
    });

    describe("character_transform", () => {
      it("应该切换变体并记录 transition", () => {
        const rule = CHARACTER_RULES.character_transform!;
        const prev = makeCharacterSnapshot();
        const event = makeEvent("character_transform", {
          characterId: "char-1",
          previousVariantId: "variant-default",
          newVariantId: "battle-suit",
        });

        const result = rule.apply(prev, event);

        expect(result.appearance.variantId).toBe("battle-suit");
        expect(result.stateSource.isModified).toBe(true);
        expect(result.stateSource.transitions).toHaveLength(1);
        expect(result.stateSource.transitions[0]!.characterChanges[0]!.changeType).toBe("variant_change");
        expect(result.stateSource.transitions[0]!.characterChanges[0]!.fromState).toBe("variant-default");
        expect(result.stateSource.transitions[0]!.characterChanges[0]!.toState).toBe("battle-suit");
      });
    });

    describe("character_injury", () => {
      it("应该添加伤势记录", () => {
        const rule = CHARACTER_RULES.character_injury!;
        const prev = makeCharacterSnapshot();
        const event = makeEvent("character_injury", {
          characterId: "char-1",
          injuryType: "cut",
          injuryLocation: "right_arm",
          severity: "severe",
        });

        const result = rule.apply(prev, event);

        expect(result.appearance.injuries).toHaveLength(1);
        expect(result.appearance.injuries[0]!.type).toBe("cut");
        expect(result.appearance.injuries[0]!.location).toBe("right_arm");
        expect(result.appearance.injuries[0]!.severity).toBe("severe");
        expect(result.appearance.injuries[0]!.causeEventId).toBe("event-1");
      });

      it("severity 默认为 moderate", () => {
        const rule = CHARACTER_RULES.character_injury!;
        const prev = makeCharacterSnapshot();
        const event = makeEvent("character_injury", { injuryType: "bruise" });

        const result = rule.apply(prev, event);

        expect(result.appearance.injuries[0]!.severity).toBe("moderate");
      });
    });

    describe("character_emotion_change", () => {
      it("应该更新情绪并记录 transition", () => {
        const rule = CHARACTER_RULES.character_emotion_change!;
        const prev = makeCharacterSnapshot({
          innerState: { ...makeCharacterSnapshot().innerState, emotion: "happy" },
        });
        const event = makeEvent("character_emotion_change", {
          characterId: "char-1",
          emotion: "angry",
        });

        const result = rule.apply(prev, event);

        expect(result.innerState.emotion).toBe("angry");
        expect(result.stateSource.transitions[0]!.characterChanges[0]!.changeType).toBe("emotion_change");
        expect(result.stateSource.transitions[0]!.characterChanges[0]!.fromState).toBe("happy");
      });
    });

    describe("character_reveal_secret", () => {
      it("应该添加已揭示的秘密", () => {
        const rule = CHARACTER_RULES.character_reveal_secret!;
        const prev = makeCharacterSnapshot();
        const event = makeEvent("character_reveal_secret", {
          characterId: "char-1",
          secretType: "true_identity",
        });

        const result = rule.apply(prev, event);

        expect(result.innerState.secretRevealed).toContain("true_identity");
        expect(result.stateSource.isModified).toBe(true);
      });

      it("不应该重复添加已存在的秘密", () => {
        const rule = CHARACTER_RULES.character_reveal_secret!;
        const prev = makeCharacterSnapshot({
          innerState: {
            ...makeCharacterSnapshot().innerState,
            secretRevealed: ["true_identity"],
          },
        });
        const event = makeEvent("character_reveal_secret", { secretType: "true_identity" });

        const result = rule.apply(prev, event);

        expect(result.innerState.secretRevealed).toHaveLength(1);
      });
    });

    describe("character_relationship_change", () => {
      it("应该更新关系状态", () => {
        const rule = CHARACTER_RULES.character_relationship_change!;
        const prev = makeCharacterSnapshot();
        const event = makeEvent("character_relationship_change", {
          characterId: "char-1",
          relationshipId: "char-2",
          newRelationshipStatus: "enemy",
        });

        const result = rule.apply(prev, event);

        expect(result.innerState.relationshipStatus["char-2"]).toBe("enemy");
        expect(result.stateSource.transitions[0]!.characterChanges[0]!.changeType).toBe("relationship_change");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 场景事件规则测试
  // ─────────────────────────────────────────────────────────────

  describe("SCENE_RULES", () => {
    describe("scene_change", () => {
      it("应该切换场景变体", () => {
        const rule = SCENE_RULES.scene_change!;
        const prev = makeSceneSnapshot();
        const event = makeEvent("scene_change", { newVariantId: "night-variant" });

        const result = rule.apply(prev, event);

        expect(result.environment.variantId).toBe("night-variant");
      });
    });

    describe("scene_destruction", () => {
      it("应该累加破坏程度（+30）", () => {
        const rule = SCENE_RULES.scene_destruction!;
        const prev = makeSceneSnapshot({
          environment: { ...makeSceneSnapshot().environment, destructionLevel: 20, mood: "tense" },
        });
        const event = makeEvent("scene_destruction", { sceneId: "scene-1" });

        const result = rule.apply(prev, event);

        expect(result.environment.destructionLevel).toBe(50);
        expect(result.environment.mood).toBe("chaotic");
        expect(result.environment.atmosphereChanges).toHaveLength(1);
        expect(result.environment.atmosphereChanges[0]!.fromMood).toBe("tense");
        expect(result.environment.atmosphereChanges[0]!.toMood).toBe("chaotic");
      });

      it("破坏程度上限为 100", () => {
        const rule = SCENE_RULES.scene_destruction!;
        const prev = makeSceneSnapshot({
          environment: { ...makeSceneSnapshot().environment, destructionLevel: 80 },
        });
        const event = makeEvent("scene_destruction");

        const result = rule.apply(prev, event);

        expect(result.environment.destructionLevel).toBe(100);
      });

      it("应该记录 persistentChanges.modifiedObjects", () => {
        const rule = SCENE_RULES.scene_destruction!;
        const prev = makeSceneSnapshot();
        const event = makeEvent("scene_destruction");

        const result = rule.apply(prev, event);

        expect(result.persistentChanges.modifiedObjects).toHaveLength(1);
        expect(result.persistentChanges.modifiedObjects[0]!.object).toBe("environment");
      });
    });

    describe("scene_transform", () => {
      it("应该更新环境参数", () => {
        const rule = SCENE_RULES.scene_transform!;
        const prev = makeSceneSnapshot();
        const event = makeEvent("scene_transform", {
          timeOfDay: "night",
          weather: "rain",
          lighting: "dim",
          mood: "gloomy",
        });

        const result = rule.apply(prev, event);

        expect(result.environment.timeOfDay).toBe("night");
        expect(result.environment.weather).toBe("rain");
        expect(result.environment.lighting).toBe("dim");
        expect(result.environment.mood).toBe("gloomy");
      });

      it("mood 变化应记录 atmosphereChange", () => {
        const rule = SCENE_RULES.scene_transform!;
        const prev = makeSceneSnapshot({
          environment: { ...makeSceneSnapshot().environment, mood: "calm" },
        });
        const event = makeEvent("scene_transform", { mood: "tense" });

        const result = rule.apply(prev, event);

        expect(result.environment.atmosphereChanges).toHaveLength(1);
        expect(result.environment.atmosphereChanges[0]!.fromMood).toBe("calm");
        expect(result.environment.atmosphereChanges[0]!.toMood).toBe("tense");
      });
    });

    describe("item_introduce", () => {
      it("应该将道具添加到 itemsPresent", () => {
        const rule = SCENE_RULES.item_introduce!;
        const prev = makeSceneSnapshot();
        const event = makeEvent("item_introduce", { itemId: "sword-1" });

        const result = rule.apply(prev, event);

        expect(result.entities.itemsPresent).toContain("sword-1");
        expect(result.persistentChanges.addedObjects).toContain("sword-1");
      });

      it("不应该重复添加已存在的道具", () => {
        const rule = SCENE_RULES.item_introduce!;
        const prev = makeSceneSnapshot({
          entities: { ...makeSceneSnapshot().entities, itemsPresent: ["sword-1"] },
        });
        const event = makeEvent("item_introduce", { itemId: "sword-1" });

        const result = rule.apply(prev, event);

        expect(result.entities.itemsPresent).toHaveLength(1);
      });
    });

    describe("item_use", () => {
      it("不应该改变场景状态", () => {
        const rule = SCENE_RULES.item_use!;
        const prev = makeSceneSnapshot();
        const event = makeEvent("item_use", { itemId: "sword-1" });

        const result = rule.apply(prev, event);

        expect(result.entities.itemsPresent).toEqual(prev.entities.itemsPresent);
        expect(result.persistentChanges.addedObjects).toEqual([]);
      });
    });

    describe("item_destroy", () => {
      it("应该从 itemsPresent 移除道具", () => {
        const rule = SCENE_RULES.item_destroy!;
        const prev = makeSceneSnapshot({
          entities: {
            ...makeSceneSnapshot().entities,
            itemsPresent: ["sword-1", "shield-1"],
          },
        });
        const event = makeEvent("item_destroy", { itemId: "sword-1" });

        const result = rule.apply(prev, event);

        expect(result.entities.itemsPresent).toEqual(["shield-1"]);
        expect(result.persistentChanges.removedObjects).toContain("sword-1");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 级联规则测试
  // ─────────────────────────────────────────────────────────────

  describe("CASCADE_RULES", () => {
    const timeline: StoryTimelineLike = {
      id: "tl-1",
      nodes: [
        { id: "node-1", order: 1, plotEventType: "narration", plotEventDescription: "", plotEventParameters: {} },
        { id: "node-2", order: 2, plotEventType: "narration", plotEventDescription: "", plotEventParameters: {} },
        { id: "node-3", order: 3, plotEventType: "narration", plotEventDescription: "", plotEventParameters: {} },
      ],
      bindings: [
        { id: "b-1", type: "callback", sourceNodeId: "node-1", targetNodeId: "node-3" },
        { id: "b-2", type: "foreshadow", sourceNodeId: "node-1", targetNodeId: "node-2" },
      ],
    };

    describe("character_reveal_secret", () => {
      it("应该返回 callback 绑定的 targetNodeId", () => {
        const rule = CASCADE_RULES.character_reveal_secret!;
        const event = makeEvent(
          "character_reveal_secret",
          {},
          { nodeId: "node-1" },
        );

        const affected = rule.propagate(event, timeline);

        expect(affected).toEqual(["node-3"]);
      });

      it("无匹配绑定时返回空数组", () => {
        const rule = CASCADE_RULES.character_reveal_secret!;
        const event = makeEvent(
          "character_reveal_secret",
          {},
          { nodeId: "node-2" },
        );

        const affected = rule.propagate(event, timeline);

        expect(affected).toEqual([]);
      });
    });

    describe("scene_destruction", () => {
      it("应该返回使用同一 sceneId 的下游节点", () => {
        const rule = CASCADE_RULES.scene_destruction!;
        const timelineWithScenes: StoryTimelineLike = {
          id: "tl-1",
          nodes: [
            {
              id: "node-1",
              order: 1,
              plotEventType: "scene_destruction",
              plotEventDescription: "",
              plotEventParameters: { sceneId: "scene-1" },
              sceneInitialStates: [{ sceneId: "scene-1", variantId: "v1" }],
            },
            {
              id: "node-2",
              order: 2,
              plotEventType: "narration",
              plotEventDescription: "",
              plotEventParameters: {},
              sceneInitialStates: [{ sceneId: "scene-1", variantId: "v1" }],
            },
            {
              id: "node-3",
              order: 3,
              plotEventType: "narration",
              plotEventDescription: "",
              plotEventParameters: {},
              sceneInitialStates: [{ sceneId: "scene-2", variantId: "v2" }],
            },
          ],
          bindings: [],
        };
        const event = makeEvent(
          "scene_destruction",
          { sceneId: "scene-1" },
          { nodeId: "node-1" },
        );

        const affected = rule.propagate(event, timelineWithScenes);

        expect(affected).toEqual(["node-2"]);
      });

      it("无 sceneId 时返回空数组", () => {
        const rule = CASCADE_RULES.scene_destruction!;
        const event = makeEvent("scene_destruction", {}, { nodeId: "node-1" });

        const affected = rule.propagate(event, timeline);

        expect(affected).toEqual([]);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 事件分类辅助函数测试
  // ─────────────────────────────────────────────────────────────

  describe("事件分类辅助函数", () => {
    it("isCharacterEvent 正确识别角色事件", () => {
      expect(isCharacterEvent("character_introduce")).toBe(true);
      expect(isCharacterEvent("character_transform")).toBe(true);
      expect(isCharacterEvent("scene_change")).toBe(false);
      expect(isCharacterEvent("narration")).toBe(false);
    });

    it("isSceneEvent 正确识别场景事件", () => {
      expect(isSceneEvent("scene_change")).toBe(true);
      expect(isSceneEvent("scene_destruction")).toBe(true);
      expect(isSceneEvent("item_introduce")).toBe(true);
      expect(isSceneEvent("character_introduce")).toBe(false);
    });

    it("isNoOpEvent 正确识别无状态变化事件", () => {
      expect(isNoOpEvent("narration")).toBe(true);
      expect(isNoOpEvent("dialogue")).toBe(true);
      expect(isNoOpEvent("climax")).toBe(true);
      expect(isNoOpEvent("character_introduce")).toBe(false);
    });

    it("isCompoundEvent 正确识别复合事件", () => {
      expect(isCompoundEvent("compound")).toBe(true);
      expect(isCompoundEvent("narration")).toBe(false);
    });

    it("NO_OP_EVENTS 包含 9 种无状态变化事件", () => {
      expect(NO_OP_EVENTS.size).toBe(9);
      expect(NO_OP_EVENTS.has("world_rule_reveal")).toBe(true);
      expect(NO_OP_EVENTS.has("foreshadow")).toBe(true);
      expect(NO_OP_EVENTS.has("callback")).toBe(true);
      expect(NO_OP_EVENTS.has("climax")).toBe(true);
      expect(NO_OP_EVENTS.has("twist")).toBe(true);
      expect(NO_OP_EVENTS.has("resolution")).toBe(true);
      expect(NO_OP_EVENTS.has("narration")).toBe(true);
      expect(NO_OP_EVENTS.has("dialogue")).toBe(true);
      expect(NO_OP_EVENTS.has("action")).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // createNoOpTransition 测试
  // ─────────────────────────────────────────────────────────────

  describe("createNoOpTransition", () => {
    it("应该创建无变化的 transition 记录", () => {
      const event = makeEvent("narration", {}, { id: "evt-1" });
      const transition = createNoOpTransition("node-2", "node-1", event);

      expect(transition.nodeId).toBe("node-2");
      expect(transition.previousNodeId).toBe("node-1");
      expect(transition.trigger.eventId).toBe("evt-1");
      expect(transition.characterChanges).toEqual([]);
      expect(transition.sceneChanges).toEqual([]);
      expect(transition.narrativeDescription).toBe("narration 事件");
    });
  });
});
