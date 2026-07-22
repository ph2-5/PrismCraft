/**
 * Q3-6 / Task 4.6.4 — TimelineBinding 注入层
 *
 * 实现 Prompt 合成时的"前情提要"自动注入。
 *
 * 设计来源：docs/timeline-variant-design.md
 *   - 第二章 2.7 节（行 362-405）：TimelineBinding 接口 + 10 种 BindingType
 *   - 第三章 3.1 节（行 414-436）：状态推演算法步骤 2e（绑定注入）
 *   - 第四章（行 677-747）：Prompt 合成增强，"【前情提要 - 自动注入】"格式
 *   - 第六章（行 909-913）：数据流注入层职责
 *
 * 核心概念：
 *   - BindingType：10 种绑定类型（伏笔/因果/角色弧/场景连续/情感/悬念/平行/回调/讽刺/手动）
 *   - 三个重要程度：critical（必须注入）/ important（建议注入）/ optional（可选）
 *   - injectionText：以"【前情提要】..."前缀的自由文本，注入到 target 节点 Prompt
 *   - cascadeEffect：binding 的级联效应，target 节点下游也受影响
 *   - autoInject / injectToNodes：控制自动注入行为
 *   - tokenBudget：限制注入块大小，防止上下文爆炸
 *
 * 与 state-propagation-engine 的关系：
 *   推演引擎输出节点状态快照，注入层读取快照 + 绑定，合成最终 Prompt。
 *   引擎关注"状态如何变化"，注入层关注"如何把变化反馈给 AI"。
 *
 * 零依赖原则：仅导入本目录内相对模块。
 */

import type { TimelineBindingLike, StoryTimelineLike } from "./snapshot-types";

// ─────────────────────────────────────────────────────────────
// BindingType — 10 种绑定类型
// 设计文档 docs/timeline-variant-design.md:364-384
// ─────────────────────────────────────────────────────────────

export type BindingType =
  | "foreshadow" // 伏笔：前置节点埋下线索
  | "cause_effect" // 因果：A 节点事件导致 B 节点结果
  | "character_arc" // 角色弧：角色成长轨迹的关键节点
  | "scene_continuity" // 场景连续：跨节点的场景状态延续
  | "emotional_buildup" // 情感铺垫：情绪递进的关键节点
  | "mystery_reveal" // 悬念揭示：谜底揭晓节点
  | "parallel" // 平行：多线叙事的平行对照
  | "callback" // 回调：对早期事件的呼应
  | "irony" // 讽刺：情境反转的戏剧效果
  | "user_manual"; // 用户手动添加的绑定

/**
 * 绑定重要程度
 * - critical：必须注入（伏笔揭示、关键因果），跳过会破坏剧情连贯性
 * - important：建议注入（角色弧、情感铺垫），跳过会降低质量但不破坏连贯
 * - optional：可选注入（平行、讽刺），仅在 token 预算充足时注入
 */
export type BindingImportance = "critical" | "important" | "optional";

/**
 * 绑定传播配置
 * 设计文档 docs/timeline-variant-design.md:393-400
 */
export interface BindingPropagation {
  /** 是否自动注入到 target 节点（false 则需用户手动确认） */
  autoInject: boolean;
  /** 显式指定注入到哪些节点（除 targetNodeId 外的额外节点） */
  injectToNodes: string[];
  /** 是否产生级联效应：true 则 target 节点的下游也受影响 */
  cascadeEffect: boolean;
}

/**
 * BindingForInjection — 注入层所需的完整绑定形状
 *
 * 兼容 TimelineBindingLike 的最小形状：
 *   若调用方仅提供 TimelineBindingLike，缺失字段将用默认值填充。
 *   - propagation.autoInject 默认 true（与 TimelineBindingLike.injectionText 存在即注入的语义一致）
 *   - propagation.injectToNodes 默认 []
 *   - propagation.cascadeEffect 默认 false（保守策略，避免无意中级联）
 */
export interface BindingForInjection {
  id: string;
  type: BindingType | string;
  sourceNodeId: string;
  targetNodeId: string;
  /** 注入文本（自由格式，建议以"【前情提要】"前缀） */
  injectionText: string;
  importance: BindingImportance;
  propagation: BindingPropagation;
  /** AI 检测出的绑定（true）或用户手动添加（false） */
  aiDetected?: boolean;
  /** 用户已确认该绑定（true 后才参与注入） */
  userConfirmed?: boolean;
}

// ─────────────────────────────────────────────────────────────
// 注入结果类型
// ─────────────────────────────────────────────────────────────

/**
 * 成功注入的绑定信息
 */
export interface InjectedBindingInfo {
  bindingId: string;
  type: string;
  sourceNodeId: string;
  importance: BindingImportance;
  injectionText: string;
  /** 该绑定占用的 token 估算数 */
  tokenCost: number;
}

/**
 * 跳过的绑定信息（附跳过原因）
 */
export interface SkippedBindingInfo {
  bindingId: string;
  type: string;
  reason: SkipReason;
  /** 详细原因描述 */
  detail: string;
}

/**
 * 跳过原因枚举
 */
export type SkipReason =
  | "target_mismatch" // targetNodeId !== nodeId 且不在 injectToNodes 中
  | "auto_inject_disabled" // propagation.autoInject === false
  | "not_confirmed" // userConfirmed === false（待用户确认）
  | "empty_injection_text" // injectionText 为空
  | "token_budget_exceeded" // 超出 token 预算
  | "duplicate"; // 重复绑定（同一 sourceNodeId 已注入）

/**
 * Token 预算信息
 */
export interface TokenBudget {
  /** 总预算 */
  total: number;
  /** 已使用 */
  used: number;
  /** 剩余 */
  remaining: number;
}

/**
 * 注入结果
 */
export interface InjectionResult {
  /** 目标节点 ID */
  nodeId: string;
  /** 原始 Prompt（未注入） */
  basePrompt: string;
  /** 注入后的最终 Prompt */
  injectedPrompt: string;
  /** 成功注入的绑定列表（按注入顺序） */
  injectedBindings: InjectedBindingInfo[];
  /** 跳过的绑定列表（附原因） */
  skippedBindings: SkippedBindingInfo[];
  /** 注入块文本（"【前情提要 - 自动注入】..."段落） */
  injectionBlock: string;
  /** Token 预算信息 */
  tokenBudget: TokenBudget;
  /** 是否存在级联效应 */
  hasCascadeEffect: boolean;
  /** 级联影响的下游节点 ID 列表（含 target 节点本身） */
  cascadeAffectedNodeIds: string[];
}

// ─────────────────────────────────────────────────────────────
// 常量与默认值
// ─────────────────────────────────────────────────────────────

/**
 * 默认 token 预算（约 1500 token，保留主 Prompt 空间）
 * 设计文档行 730：注入块不应超过总 token 的 30%
 */
const DEFAULT_TOKEN_BUDGET = 1500;

/**
 * 重要程度权重（用于排序）
 * 数字越大优先级越高
 */
const IMPORTANCE_WEIGHT: Record<BindingImportance, number> = {
  critical: 3,
  important: 2,
  optional: 1,
};

/**
 * 注入块标题
 */
const INJECTION_BLOCK_HEADER = "【前情提要 - 自动注入】";

/**
 * 将 TimelineBindingLike（最小形状）规范化为 BindingForInjection
 *
 * 兼容策略：
 *   - injectionText 缺失 → 空字符串（后续会被 skip）
 *   - importance 缺失 → "important"（中等优先级）
 *   - propagation 缺失 → 默认 { autoInject: true, injectToNodes: [], cascadeEffect: false }
 *   - userConfirmed 缺失 → true（默认已确认，与最小形状语义一致）
 *   - aiDetected 缺失 → false
 */
export function normalizeBinding(
  binding: TimelineBindingLike | BindingForInjection,
): BindingForInjection {
  // 已是完整形状
  if ("propagation" in binding && binding.propagation) {
    const b = binding as BindingForInjection;
    return {
      id: b.id,
      type: b.type,
      sourceNodeId: b.sourceNodeId,
      targetNodeId: b.targetNodeId,
      injectionText: b.injectionText ?? "",
      importance: b.importance ?? "important",
      propagation: {
        autoInject: b.propagation.autoInject,
        injectToNodes: b.propagation.injectToNodes,
        cascadeEffect: b.propagation.cascadeEffect,
      },
      aiDetected: b.aiDetected ?? false,
      userConfirmed: b.userConfirmed ?? true,
    };
  }

  // 最小形状（TimelineBindingLike）
  const b = binding as TimelineBindingLike;
  return {
    id: b.id,
    type: b.type,
    sourceNodeId: b.sourceNodeId,
    targetNodeId: b.targetNodeId,
    injectionText: b.injectionText ?? "",
    importance: b.importance ?? "important",
    propagation: {
      autoInject: true,
      injectToNodes: [],
      cascadeEffect: false,
    },
    aiDetected: false,
    userConfirmed: true,
  };
}

// ─────────────────────────────────────────────────────────────
// Token 估算
// ─────────────────────────────────────────────────────────────

/**
 * 粗略估算文本的 token 数
 *
 * 估算策略（保守，略微高估以避免超预算）：
 *   - 中文字符：1 字 ≈ 1 token
 *   - 英文：1 单词 ≈ 1.3 token（平均）
 *   - 标点/空白：按字符数 0.3 token
 *
 * 此估算用于预算控制，不需要精确匹配实际 tokenizer。
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) {
      // CJK 统一表意文字
      tokens += 1;
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      // 英文/数字字符：粗略 0.25 token/char（约 4 char = 1 token）
      tokens += 0.25;
    } else if (/\s/.test(ch)) {
      // 空白：忽略
      continue;
    } else {
      // 标点/符号：0.3 token
      tokens += 0.3;
    }
  }
  return Math.ceil(tokens);
}

// ─────────────────────────────────────────────────────────────
// 核心注入函数
// ─────────────────────────────────────────────────────────────

/**
 * 注入绑定到节点 Prompt
 *
 * 算法：
 *   1. 规范化所有 bindings 为 BindingForInjection
 *   2. 过滤：保留 targetNodeId === nodeId 或 injectToNodes 包含 nodeId 的绑定
 *   3. 过滤：autoInject === false 或 userConfirmed === false 的绑定跳过
 *   4. 过滤：injectionText 为空的绑定跳过
 *   5. 去重：同一 sourceNodeId 仅保留 importance 最高的
 *   6. 按 importance 排序（critical > important > optional）
 *   7. 按 token 预算依次注入，超预算的 optional/important 降级为 skipped
 *   8. 构造"【前情提要 - 自动注入】"块
 *   9. 拼接 basePrompt + injectionBlock
 *  10. 计算 cascadeEffect 影响的下游节点
 *
 * @param nodeId 目标节点 ID
 * @param bindings 所有绑定列表（引擎会从中筛选 targetNodeId === nodeId 的）
 * @param basePrompt 节点的基础 Prompt
 * @param options 可选配置：tokenBudget / downstreamNodeIds（用于级联计算）
 * @returns InjectionResult
 */
export function injectBindings(
  nodeId: string,
  bindings: Array<TimelineBindingLike | BindingForInjection>,
  basePrompt: string,
  options?: {
    tokenBudget?: number;
    /** 下游节点 ID 列表（按 order 升序），用于计算级联影响范围 */
    downstreamNodeIds?: string[];
  },
): InjectionResult {
  const totalBudget = options?.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  // ── Step 1: 规范化 ──
  const normalized = bindings.map(normalizeBinding);

  const injectedBindings: InjectedBindingInfo[] = [];
  const skippedBindings: SkippedBindingInfo[] = [];
  const seenSourceNodeIds = new Set<string>();

  // ── Step 2-5: 过滤 + 去重 ──
  // 先按 importance 排序，确保去重时保留最高优先级
  const sorted = [...normalized].sort((a, b) => {
    const wa = IMPORTANCE_WEIGHT[a.importance];
    const wb = IMPORTANCE_WEIGHT[b.importance];
    return wb - wa;
  });

  const candidates: BindingForInjection[] = [];
  for (const binding of sorted) {
    // 过滤：target 不匹配且不在 injectToNodes 中
    const isTarget = binding.targetNodeId === nodeId;
    const isInInjectTo = binding.propagation.injectToNodes.includes(nodeId);
    if (!isTarget && !isInInjectTo) {
      skippedBindings.push({
        bindingId: binding.id,
        type: binding.type,
        reason: "target_mismatch",
        detail: `绑定 target=${binding.targetNodeId} 与节点 ${nodeId} 不匹配`,
      });
      continue;
    }

    // 过滤：autoInject 关闭
    if (!binding.propagation.autoInject) {
      skippedBindings.push({
        bindingId: binding.id,
        type: binding.type,
        reason: "auto_inject_disabled",
        detail: "propagation.autoInject === false，需手动注入",
      });
      continue;
    }

    // 过滤：未确认
    if (binding.userConfirmed === false) {
      skippedBindings.push({
        bindingId: binding.id,
        type: binding.type,
        reason: "not_confirmed",
        detail: "用户尚未确认该绑定",
      });
      continue;
    }

    // 过滤：空文本
    if (!binding.injectionText || binding.injectionText.trim().length === 0) {
      skippedBindings.push({
        bindingId: binding.id,
        type: binding.type,
        reason: "empty_injection_text",
        detail: "injectionText 为空",
      });
      continue;
    }

    // 去重：同一 sourceNodeId 仅保留最高优先级（已排序，首个出现即最高）
    if (seenSourceNodeIds.has(binding.sourceNodeId)) {
      skippedBindings.push({
        bindingId: binding.id,
        type: binding.type,
        reason: "duplicate",
        detail: `sourceNodeId=${binding.sourceNodeId} 已有更高优先级绑定`,
      });
      continue;
    }
    seenSourceNodeIds.add(binding.sourceNodeId);
    candidates.push(binding);
  }

  // ── Step 6-7: 按 importance 排序 + token 预算控制 ──
  // candidates 已按 importance 降序（来自 sorted），直接遍历
  let usedTokens = 0;
  const headerTokens = estimateTokenCount(INJECTION_BLOCK_HEADER);

  for (const binding of candidates) {
    const bindingTokens = estimateTokenCount(binding.injectionText);

    // critical 始终注入（即使超预算）
    // important 超预算时跳过
    // optional 超预算时跳过
    if (binding.importance !== "critical") {
      if (usedTokens + bindingTokens > totalBudget - headerTokens) {
        skippedBindings.push({
          bindingId: binding.id,
          type: binding.type,
          reason: "token_budget_exceeded",
          detail: `占用 ${bindingTokens} token，已用 ${usedTokens}/${totalBudget}`,
        });
        continue;
      }
    }

    usedTokens += bindingTokens;
    injectedBindings.push({
      bindingId: binding.id,
      type: binding.type,
      sourceNodeId: binding.sourceNodeId,
      importance: binding.importance,
      injectionText: binding.injectionText,
      tokenCost: bindingTokens,
    });
  }

  // ── Step 8: 构造注入块 ──
  const injectionBlock = buildInjectionBlock(injectedBindings);

  // ── Step 9: 拼接最终 Prompt ──
  const injectedPrompt =
    injectionBlock.length > 0
      ? `${basePrompt}\n\n${injectionBlock}`
      : basePrompt;

  // ── Step 10: 计算级联影响 ──
  const cascadeAffectedNodeIds = computeCascadeAffectedNodeIds(
    nodeId,
    injectedBindings.map((b) => b.bindingId),
    normalized,
    options?.downstreamNodeIds ?? [],
  );

  const hasCascadeEffect = cascadeAffectedNodeIds.length > 1; // 含自身则 > 1

  return {
    nodeId,
    basePrompt,
    injectedPrompt,
    injectedBindings,
    skippedBindings,
    injectionBlock,
    tokenBudget: {
      total: totalBudget,
      used: usedTokens + headerTokens,
      remaining: Math.max(0, totalBudget - usedTokens - headerTokens),
    },
    hasCascadeEffect,
    cascadeAffectedNodeIds,
  };
}

// ─────────────────────────────────────────────────────────────
// 注入块构造
// ─────────────────────────────────────────────────────────────

/**
 * 构造"【前情提要 - 自动注入】"块
 *
 * 格式（设计文档行 705-720）：
 *   【前情提要 - 自动注入】
 *   - [critical] 伏笔揭示：...
 *   - [important] 角色弧：...
 *   - [optional] 平行对照：...
 *
 * 若 injectedBindings 为空，返回空字符串（不注入）。
 */
export function buildInjectionBlock(
  injectedBindings: InjectedBindingInfo[],
): string {
  if (injectedBindings.length === 0) return "";

  const lines: string[] = [INJECTION_BLOCK_HEADER];
  for (const b of injectedBindings) {
    lines.push(`- [${b.importance}] ${b.injectionText}`);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// 级联效应计算
// ─────────────────────────────────────────────────────────────

/**
 * 计算注入的级联影响节点
 *
 * 算法：
 *   1. 收集所有已注入且 cascadeEffect === true 的绑定的 targetNodeId
 *   2. 对每个 targetNodeId，将其自身 + 所有下游节点加入影响列表
 *   3. 返回去重后的节点 ID 列表（含当前 nodeId）
 *
 * @param nodeId 当前注入节点
 * @param injectedBindingIds 已注入的绑定 ID 列表
 * @param allBindings 所有规范化后的绑定（用于查找 cascadeEffect 标记）
 * @param downstreamNodeIds 当前节点的下游节点 ID 列表（按 order 升序）
 */
export function computeCascadeAffectedNodeIds(
  nodeId: string,
  injectedBindingIds: string[],
  allBindings: BindingForInjection[],
  downstreamNodeIds: string[],
): string[] {
  const affected = new Set<string>([nodeId]);

  // 查找已注入且开启级联的绑定
  const injectedSet = new Set(injectedBindingIds);
  const cascadeBindings = allBindings.filter(
    (b) => injectedSet.has(b.id) && b.propagation.cascadeEffect,
  );

  if (cascadeBindings.length === 0) {
    return [...affected];
  }

  // 每个级联绑定：target 节点 + 其下游
  for (const binding of cascadeBindings) {
    affected.add(binding.targetNodeId);
    // 若 target 就是当前节点，则下游即 downstreamNodeIds
    if (binding.targetNodeId === nodeId) {
      for (const dn of downstreamNodeIds) {
        affected.add(dn);
      }
    }
    // 若 target 是下游某节点，则该节点之后的所有下游都受影响
    // 此处简化处理：将 target 之后的所有 downstream 都加入
    const targetIndex = downstreamNodeIds.indexOf(binding.targetNodeId);
    if (targetIndex >= 0) {
      for (let i = targetIndex; i < downstreamNodeIds.length; i++) {
        affected.add(downstreamNodeIds[i]!);
      }
    }
  }

  return [...affected];
}

// ─────────────────────────────────────────────────────────────
// 查询辅助函数
// ─────────────────────────────────────────────────────────────

/**
 * 查询节点的可注入绑定（不实际注入，仅返回候选列表）
 *
 * 用于 UI 展示"该节点将注入哪些绑定"。
 */
export function getInjectableBindings(
  nodeId: string,
  bindings: Array<TimelineBindingLike | BindingForInjection>,
): BindingForInjection[] {
  const normalized = bindings.map(normalizeBinding);
  return normalized.filter((b) => {
    if (b.targetNodeId !== nodeId && !b.propagation.injectToNodes.includes(nodeId)) {
      return false;
    }
    if (!b.propagation.autoInject) return false;
    if (b.userConfirmed === false) return false;
    if (!b.injectionText || b.injectionText.trim().length === 0) return false;
    return true;
  });
}

/**
 * 查询节点所有绑定（含已跳过的）
 *
 * 用于 UI 展示"该节点关联的所有绑定"。
 */
export function getNodeBindings(
  nodeId: string,
  bindings: Array<TimelineBindingLike | BindingForInjection>,
): {
  inbound: BindingForInjection[]; // targetNodeId === nodeId（注入到此节点）
  outbound: BindingForInjection[]; // sourceNodeId === nodeId（从此节点发出）
} {
  const normalized = bindings.map(normalizeBinding);
  return {
    inbound: normalized.filter((b) => b.targetNodeId === nodeId),
    outbound: normalized.filter((b) => b.sourceNodeId === nodeId),
  };
}

/**
 * 从时间线节点列表中计算某节点的下游节点 ID（按 order 升序）
 */
export function getDownstreamNodeIds(
  nodeId: string,
  timeline: StoryTimelineLike,
): string[] {
  const sortedNodes = [...timeline.nodes].sort((a, b) => a.order - b.order);
  const targetIndex = sortedNodes.findIndex((n) => n.id === nodeId);
  if (targetIndex < 0) return [];
  return sortedNodes.slice(targetIndex + 1).map((n) => n.id);
}

/**
 * 从时间线提取所有绑定（规范化为 BindingForInjection）
 */
export function extractBindingsFromTimeline(
  timeline: StoryTimelineLike,
): BindingForInjection[] {
  return timeline.bindings.map(normalizeBinding);
}
