/**
 * Q3-8 / Task 4.6.6 — 增强 Prompt 合成（时间线上下文注入）
 *
 * 将时间线状态快照 + 绑定注入 + 基础 Prompt 合成为增强 Prompt。
 *
 * 设计来源：docs/timeline-variant-design.md 第四章
 *   增强公式：Prompt = 时间线上下文 + 片段文本 + 角色状态快照 + 场景状态快照 + 绑定注入
 *
 * 输出示例（设计文档 4.2 节）：
 *   【时间线位置】第2章 · 第3段（PlotNode_6）
 *   【前情提要 - 自动注入】...
 *   【角色状态】角色"零"：战斗服（破损），右臂受伤...
 *   【场景状态】场景"新东京"：深夜暴雨，破坏程度30%...
 *   【剧情事件】零与影的最终对决...
 *   【合成 Prompt】<basePrompt>
 *
 * 与 binding-injector 的关系：
 *   prompt-enhancer 调用 injectBindings 获取绑定注入块，
 *   然后与状态快照、时间线位置等组合为最终 Prompt。
 *
 * 零依赖原则：仅导入本目录内相对模块。
 */

import type {
  StoryTimelineLike,
  PlotNodeLike,
  CharacterStateSnapshot,
  SceneStateSnapshot,
  TimelineBindingLike,
  PropagationResult,
} from "./snapshot-types";
import { injectBindings, type InjectionResult } from "./binding-injector";
import type { BindingForInjection } from "./binding-injector";
import { propagateStates } from "./state-propagation-engine";

// ─────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────

/**
 * 增强 Prompt 的各组成部分
 */
export interface PromptSections {
  /** 时间线位置文本（"【时间线位置】第X章 · 第Y段"） */
  timelinePosition: string;
  /** 绑定注入块（来自 injectBindings） */
  bindingInjection: string;
  /** 角色状态描述块（"【角色状态】..."） */
  characterStates: string;
  /** 场景状态描述块（"【场景状态】..."） */
  sceneStates: string;
  /** 剧情事件描述块（"【剧情事件】..."） */
  plotEvent: string;
}

/**
 * 增强 Prompt 结果
 */
export interface EnhancedPrompt {
  /** 目标节点 ID */
  nodeId: string;
  /** 原始 Prompt */
  basePrompt: string;
  /** 最终合成 Prompt（所有部分拼接） */
  finalPrompt: string;
  /** 各组成部分 */
  sections: PromptSections;
  /** 绑定注入结果（详细） */
  injectionResult: InjectionResult;
  /** 参与合成的角色快照 */
  characterSnapshots: CharacterStateSnapshot[];
  /** 参与合成的场景快照 */
  sceneSnapshots: SceneStateSnapshot[];
  /** 估算的总 token 数 */
  estimatedTokens: number;
}

// ─────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────

const HEADER_TIMELINE_POSITION = "【时间线位置】";
const HEADER_CHARACTER_STATES = "【角色状态】";
const HEADER_SCENE_STATES = "【场景状态】";
const HEADER_PLOT_EVENT = "【剧情事件】";
const HEADER_BASE_PROMPT = "【合成 Prompt】";

// ─────────────────────────────────────────────────────────────
// 核心 enhancePrompt 函数
// ─────────────────────────────────────────────────────────────

/**
 * 增强节点 Prompt
 *
 * 算法：
 *   1. 查找目标节点
 *   2. 获取节点的状态快照（从 propagationResult 或现场计算）
 *   3. 调用 injectBindings 获取绑定注入块
 *   4. 格式化时间线位置文本
 *   5. 格式化角色状态描述
 *   6. 格式化场景状态描述
 *   7. 格式化剧情事件描述
 *   8. 拼接所有部分 + basePrompt
 *
 * @param nodeId 目标节点 ID
 * @param timeline 时间线（nodes + bindings）
 * @param basePrompt 基础 Prompt（片段文本）
 * @param options 可选：propagationResult（预计算的推演结果）/ tokenBudget / downstreamNodeIds
 * @returns EnhancedPrompt
 */
export function enhancePrompt(
  nodeId: string,
  timeline: StoryTimelineLike,
  basePrompt: string,
  options?: {
    /** 预计算的推演结果（避免重复计算） */
    propagationResult?: PropagationResult;
    /** Token 预算（传给 injectBindings） */
    tokenBudget?: number;
    /** 下游节点 ID 列表（传给 injectBindings） */
    downstreamNodeIds?: string[];
  },
): EnhancedPrompt {
  // ── Step 1: 查找目标节点 ──
  const node = timeline.nodes.find((n) => n.id === nodeId);
  if (!node) {
    // 节点不存在，返回仅含 basePrompt 的结果
    return createEmptyEnhancedPrompt(nodeId, basePrompt);
  }

  // ── Step 2: 获取状态快照 ──
  // 若未提供预计算的 propagationResult，则现场调用 propagateStates 计算
  // （批量场景应由调用方预计算后传入 propagationResult 以复用结果）
  const propagationResult =
    options?.propagationResult ?? propagateStates(timeline);
  const snapshots = propagationResult.get(nodeId);
  const characterSnapshots = snapshots?.characterSnapshots ?? [];
  const sceneSnapshots = snapshots?.sceneSnapshots ?? [];

  // ── Step 3: 绑定注入 ──
  const injectionResult = injectBindings(
    nodeId,
    timeline.bindings as Array<TimelineBindingLike | BindingForInjection>,
    basePrompt,
    {
      tokenBudget: options?.tokenBudget,
      downstreamNodeIds: options?.downstreamNodeIds,
    },
  );

  // ── Step 4-7: 格式化各部分 ──
  const timelinePosition = formatTimelinePosition(node);
  const characterStates = formatCharacterStates(characterSnapshots);
  const sceneStates = formatSceneStates(sceneSnapshots);
  const plotEvent = formatPlotEvent(node);

  const sections: PromptSections = {
    timelinePosition,
    bindingInjection: injectionResult.injectionBlock,
    characterStates,
    sceneStates,
    plotEvent,
  };

  // ── Step 8: 拼接最终 Prompt ──
  const finalPrompt = assembleFinalPrompt(sections, basePrompt);

  // ── 估算 token 数 ──
  const estimatedTokens = estimateTokens(finalPrompt);

  return {
    nodeId,
    basePrompt,
    finalPrompt,
    sections,
    injectionResult,
    characterSnapshots,
    sceneSnapshots,
    estimatedTokens,
  };
}

// ─────────────────────────────────────────────────────────────
// 格式化辅助函数
// ─────────────────────────────────────────────────────────────

/**
 * 格式化时间线位置文本
 * 格式："【时间线位置】第X章 · 第Y段（PlotNode_N）"
 */
export function formatTimelinePosition(node: PlotNodeLike): string {
  const chapter = node.chapterIndex
    ? `第${node.chapterIndex}章`
    : "未知章节";
  const segment = `第${node.order + 1}段`;
  const chapterTitle = node.chapterTitle ? ` · ${node.chapterTitle}` : "";
  return `${HEADER_TIMELINE_POSITION}${chapter}${chapterTitle} · ${segment}（PlotNode ${node.order + 1}）`;
}

/**
 * 格式化角色状态描述
 * 格式：
 *   【角色状态】
 *   角色"零"（ID: char-zero）：
 *   - 外观：战斗服（破损），配饰：[银白短发]
 *   - 伤势：右臂受伤（severe）
 *   - 情绪：愤怒
 *   - 已揭示秘密：改造人身份
 */
export function formatCharacterStates(
  snapshots: CharacterStateSnapshot[],
): string {
  if (snapshots.length === 0) return "";

  const lines: string[] = [HEADER_CHARACTER_STATES];
  for (const snap of snapshots) {
    lines.push(`角色（ID: ${snap.characterId}）：`);
    // 外观
    const outfit = snap.appearance.outfit || "默认";
    const expression = snap.appearance.expression || "—";
    lines.push(`- 外观：${snap.appearance.variantId} · ${outfit} · 表情：${expression}`);
    // 伤势
    if (snap.appearance.injuries.length > 0) {
      const injuries = snap.appearance.injuries
        .map((i) => `${i.type}(${i.location}, ${i.severity})`)
        .join(", ");
      lines.push(`- 伤势：${injuries}`);
    }
    // 配饰
    if (snap.appearance.accessories.length > 0) {
      lines.push(`- 配饰：${snap.appearance.accessories.join(", ")}`);
    }
    // 情绪
    lines.push(`- 情绪：${snap.innerState.emotion}`);
    if (snap.innerState.motivation) {
      lines.push(`- 动机：${snap.innerState.motivation}`);
    }
    // 秘密
    if (snap.innerState.secretRevealed.length > 0) {
      lines.push(`- 已揭示秘密：${snap.innerState.secretRevealed.join(", ")}`);
    }
    // 关系
    const relationships = Object.entries(snap.innerState.relationshipStatus);
    if (relationships.length > 0) {
      lines.push(`- 关系：${relationships.map(([k, v]) => `${k}=${v}`).join(", ")}`);
    }
    // 能力
    if (snap.abilityState.abilitiesActive.length > 0) {
      lines.push(`- 激活能力：${snap.abilityState.abilitiesActive.join(", ")}`);
    }
    if (snap.abilityState.powerLevel > 0) {
      lines.push(`- 能力等级：${snap.abilityState.powerLevel}`);
    }
  }
  return lines.join("\n");
}

/**
 * 格式化场景状态描述
 * 格式：
 *   【场景状态】
 *   场景（ID: scene-subway）：
 *   - 环境：深夜暴雨，昏暗灯光
 *   - 破坏程度：40%
 *   - 氛围：紧张
 *   - 在场物品：断剑，匕首
 */
export function formatSceneStates(
  snapshots: SceneStateSnapshot[],
): string {
  if (snapshots.length === 0) return "";

  const lines: string[] = [HEADER_SCENE_STATES];
  for (const snap of snapshots) {
    lines.push(`场景（ID: ${snap.sceneId}）：`);
    // 环境
    lines.push(
      `- 环境：${snap.environment.variantId} · ${snap.environment.timeOfDay} · ${snap.environment.weather} · ${snap.environment.lighting}`,
    );
    // 破坏
    lines.push(`- 破坏程度：${snap.environment.destructionLevel}%`);
    // 氛围
    lines.push(`- 氛围：${snap.environment.mood}`);
    // 人群
    if (snap.environment.crowdLevel) {
      lines.push(`- 人群密度：${snap.environment.crowdLevel}`);
    }
    // 氛围变化
    if (snap.environment.atmosphereChanges.length > 0) {
      const changes = snap.environment.atmosphereChanges
        .map((c) => `${c.fromMood}→${c.toMood}`)
        .join(", ");
      lines.push(`- 氛围变化：${changes}`);
    }
    // 在场物品
    if (snap.entities.itemsPresent.length > 0) {
      lines.push(`- 在场物品：${snap.entities.itemsPresent.join(", ")}`);
    }
    // 在场角色
    if (snap.entities.charactersPresent.length > 0) {
      lines.push(`- 在场角色：${snap.entities.charactersPresent.join(", ")}`);
    }
    // 持续变化
    if (snap.persistentChanges.addedObjects.length > 0) {
      lines.push(`- 新增物体：${snap.persistentChanges.addedObjects.join(", ")}`);
    }
    if (snap.persistentChanges.removedObjects.length > 0) {
      lines.push(`- 移除物体：${snap.persistentChanges.removedObjects.join(", ")}`);
    }
  }
  return lines.join("\n");
}

/**
 * 格式化剧情事件描述
 * 格式："【剧情事件】<plotEventDescription>"
 */
export function formatPlotEvent(node: PlotNodeLike): string {
  if (!node.plotEventDescription) return "";
  return `${HEADER_PLOT_EVENT}\n[${node.plotEventType}] ${node.plotEventDescription}`;
}

// ─────────────────────────────────────────────────────────────
// 拼接最终 Prompt
// ─────────────────────────────────────────────────────────────

/**
 * 拼接所有部分为最终 Prompt
 *
 * 顺序（设计文档 4.2 节）：
 *   1. 时间线位置
 *   2. 绑定注入（前情提要）
 *   3. 角色状态
 *   4. 场景状态
 *   5. 剧情事件
 *   6. 合成 Prompt（basePrompt）
 *
 * 空部分会被跳过。
 */
export function assembleFinalPrompt(
  sections: PromptSections,
  basePrompt: string,
): string {
  const parts: string[] = [];
  if (sections.timelinePosition) parts.push(sections.timelinePosition);
  if (sections.bindingInjection) parts.push(sections.bindingInjection);
  if (sections.characterStates) parts.push(sections.characterStates);
  if (sections.sceneStates) parts.push(sections.sceneStates);
  if (sections.plotEvent) parts.push(sections.plotEvent);
  if (basePrompt) parts.push(`${HEADER_BASE_PROMPT}\n${basePrompt}`);
  return parts.join("\n\n");
}

// ─────────────────────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────────────────────

/**
 * 创建空的增强 Prompt（节点不存在时）
 */
function createEmptyEnhancedPrompt(
  nodeId: string,
  basePrompt: string,
): EnhancedPrompt {
  return {
    nodeId,
    basePrompt,
    finalPrompt: basePrompt,
    sections: {
      timelinePosition: "",
      bindingInjection: "",
      characterStates: "",
      sceneStates: "",
      plotEvent: "",
    },
    injectionResult: {
      nodeId,
      basePrompt,
      injectedPrompt: basePrompt,
      injectedBindings: [],
      skippedBindings: [],
      injectionBlock: "",
      tokenBudget: { total: 0, used: 0, remaining: 0 },
      hasCascadeEffect: false,
      cascadeAffectedNodeIds: [nodeId],
    },
    characterSnapshots: [],
    sceneSnapshots: [],
    estimatedTokens: estimateTokens(basePrompt),
  };
}

/**
 * 粗略估算 token 数（复用 binding-injector 的策略）
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) {
      tokens += 1;
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      tokens += 0.25;
    } else if (/\s/.test(ch)) {
      continue;
    } else {
      tokens += 0.3;
    }
  }
  return Math.ceil(tokens);
}

// ─────────────────────────────────────────────────────────────
// 批量增强函数
// ─────────────────────────────────────────────────────────────

/**
 * 批量增强多个节点的 Prompt
 *
 * @param nodeIds 节点 ID 列表
 * @param timeline 时间线
 * @param basePrompts nodeId → basePrompt 的映射
 * @param options 同 enhancePrompt
 * @returns nodeId → EnhancedPrompt 的映射
 */
export function batchEnhancePrompts(
  nodeIds: string[],
  timeline: StoryTimelineLike,
  basePrompts: Map<string, string>,
  options?: {
    propagationResult?: PropagationResult;
    tokenBudget?: number;
  },
): Map<string, EnhancedPrompt> {
  const result = new Map<string, EnhancedPrompt>();
  for (const nodeId of nodeIds) {
    const basePrompt = basePrompts.get(nodeId) ?? "";
    result.set(
      nodeId,
      enhancePrompt(nodeId, timeline, basePrompt, {
        propagationResult: options?.propagationResult,
        tokenBudget: options?.tokenBudget,
      }),
    );
  }
  return result;
}
