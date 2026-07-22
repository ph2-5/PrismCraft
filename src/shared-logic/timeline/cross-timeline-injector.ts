/**
 * Q3-9 / Task 4.6.7 — 跨时间线绑定注入（纯逻辑，零依赖）
 *
 * 实现跨时间线的绑定注入算法。当目标节点位于不同时间线时，
 * 将源时间线中的绑定信息注入到目标节点的 Prompt 中。
 *
 * 设计来源：docs/timeline-variant-design.md 第三章 3.4
 *
 * 与 binding-injector 的关系：
 *   binding-injector 处理同一时间线内的绑定注入；
 *   cross-timeline-injector 处理跨时间线的绑定注入。
 *   两者可组合使用：先注入同时间线绑定，再注入跨时间线绑定。
 *
 * 零依赖原则：仅导入本目录内相对模块。所有类型内联定义。
 */

// ─────────────────────────────────────────────────────────────
// 内联类型定义（零依赖）
// ─────────────────────────────────────────────────────────────

/**
 * 跨时间线绑定的类型（跨时间线场景常见类型）
 */
export type CrossTimelineBindingType =
  | "foreshadow"
  | "callback"
  | "parallel"
  | "cause_effect"
  | "mystery_reveal"
  | "user_manual";

/**
 * 时间线关系类型
 */
export type TimelineRelationshipType =
  | "prequel"
  | "sequel"
  | "parallel"
  | "flashback"
  | "flashforward"
  | "alternate";

/**
 * 跨时间线绑定（最小形状，shared-logic 层零依赖）
 *
 * 与 modules/timeline/domain/multi-timeline-types.ts 的 CrossTimelineBinding
 * 结构兼容，但此处独立定义以避免跨层依赖。
 */
export interface CrossTimelineBindingLike {
  id: string;
  type: CrossTimelineBindingType;
  sourceTimelineId: string;
  sourceNodeId: string;
  targetTimelineId: string;
  targetNodeId: string;
  injectionText: string;
  importance: "critical" | "important" | "optional";
  /** 关系描述（可选，用于增强注入文本） */
  relationshipDescription?: string;
  /** 是否自动注入（默认 true） */
  autoInject?: boolean;
  /** 是否有级联效应 */
  cascadeEffect?: boolean;
  /** AI 自动检测 */
  aiDetected?: boolean;
  /** 用户确认 */
  userConfirmed?: boolean;
}

/**
 * 时间线关系（最小形状）
 */
export interface TimelineRelationshipLike {
  fromTimelineId: string;
  toTimelineId: string;
  type: TimelineRelationshipType;
  description: string;
}

/**
 * 多时间线视图（最小形状，注入算法所需）
 */
export interface MultiTimelineLike {
  /** 时间线 ID 列表（用于验证绑定端点） */
  timelineIds: string[];
  /** 时间线之间的关系 */
  relationships: TimelineRelationshipLike[];
  /** 跨时间线绑定 */
  crossTimelineBindings: CrossTimelineBindingLike[];
}

/**
 * 跨时间线注入结果
 */
export interface CrossTimelineInjectionResult {
  nodeId: string;
  timelineId: string;
  basePrompt: string;
  injectedPrompt: string;
  injectedBindings: CrossTimelineBindingLike[];
  skippedBindings: Array<{
    binding: CrossTimelineBindingLike;
    reason: CrossTimelineSkipReason;
  }>;
  injectionBlock: string;
}

/**
 * 跳过原因
 */
export type CrossTimelineSkipReason =
  | "timeline_mismatch" // 目标时间线不匹配
  | "node_mismatch" // 目标节点不匹配
  | "auto_inject_disabled" // 自动注入被禁用
  | "not_confirmed" // 未用户确认（且非 critical）
  | "empty_injection_text" // 注入文本为空
  | "duplicate" // 重复绑定（同源同目标）
  | "invalid_timeline_ref"; // 引用了不存在的时间线

// ─────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────

const HEADER_CROSS_TIMELINE = "【跨时间线前情提要 - 自动注入】";

const RELATIONSHIP_LABELS: Record<TimelineRelationshipType, string> = {
  prequel: "前传",
  sequel: "后传",
  parallel: "并行",
  flashback: "回忆",
  flashforward: "闪前",
  alternate: "替代线",
};

const BINDING_TYPE_LABELS: Record<CrossTimelineBindingType, string> = {
  foreshadow: "伏笔",
  callback: "呼应",
  parallel: "并行对照",
  cause_effect: "因果链",
  mystery_reveal: "谜团揭示",
  user_manual: "自定义",
};

const IMPORTANCE_ORDER: Record<string, number> = {
  critical: 0,
  important: 1,
  optional: 2,
};

// ─────────────────────────────────────────────────────────────
// 核心注入函数
// ─────────────────────────────────────────────────────────────

/**
 * 跨时间线绑定注入算法
 *
 * 算法步骤：
 *   1. 规范化所有绑定（填充默认值）
 *   2. 过滤：目标时间线 = 当前时间线
 *   3. 过滤：目标节点 = 当前节点
 *   4. 过滤：autoInject !== false（除非 critical）
 *   5. 过滤：userConfirmed 或 critical（非 critical 必须用户确认）
 *   6. 过滤：injectionText 非空
 *   7. 过滤：时间线引用有效（timelineIds 校验）
 *   8. 去重：同 sourceTimelineId+sourceNodeId 保留最高 importance
 *   9. 排序：critical → important → optional
 *   10. 构造注入块
 *
 * @param nodeId 目标节点 ID
 * @param timelineId 目标时间线 ID
 * @param multiView 多时间线视图
 * @param basePrompt 基础 Prompt
 * @returns 注入结果
 */
export function injectCrossTimelineBindings(
  nodeId: string,
  timelineId: string,
  multiView: MultiTimelineLike,
  basePrompt: string,
): CrossTimelineInjectionResult {
  const allBindings = multiView.crossTimelineBindings;
  const validTimelineIds = new Set(multiView.timelineIds);

  // ── Step 1: 规范化 ──
  const normalized = allBindings.map(normalizeCrossTimelineBinding);

  // ── Step 2-7: 过滤 ──
  const injectedBindings: CrossTimelineBindingLike[] = [];
  const skippedBindings: Array<{
    binding: CrossTimelineBindingLike;
    reason: CrossTimelineSkipReason;
  }> = [];

  // 去重用：sourceTimelineId+sourceNodeId → 已选中的 binding
  const seenSourceKeys = new Map<string, CrossTimelineBindingLike>();

  for (const binding of normalized) {
    // Step 2: 目标时间线
    if (binding.targetTimelineId !== timelineId) {
      skippedBindings.push({ binding, reason: "timeline_mismatch" });
      continue;
    }
    // Step 3: 目标节点
    if (binding.targetNodeId !== nodeId) {
      skippedBindings.push({ binding, reason: "node_mismatch" });
      continue;
    }
    // Step 4: autoInject（critical 跳过此检查）
    if (binding.importance !== "critical" && binding.autoInject === false) {
      skippedBindings.push({ binding, reason: "auto_inject_disabled" });
      continue;
    }
    // Step 5: 用户确认（critical 跳过此检查）
    if (binding.importance !== "critical" && !binding.userConfirmed) {
      skippedBindings.push({ binding, reason: "not_confirmed" });
      continue;
    }
    // Step 6: 注入文本非空
    if (!binding.injectionText || binding.injectionText.trim() === "") {
      skippedBindings.push({ binding, reason: "empty_injection_text" });
      continue;
    }
    // Step 7: 时间线引用有效
    if (
      !validTimelineIds.has(binding.sourceTimelineId) ||
      !validTimelineIds.has(binding.targetTimelineId)
    ) {
      skippedBindings.push({ binding, reason: "invalid_timeline_ref" });
      continue;
    }

    // Step 8: 去重（同源保留最高 importance）
    const sourceKey = `${binding.sourceTimelineId}::${binding.sourceNodeId}`;
    const existing = seenSourceKeys.get(sourceKey);
    if (existing) {
      const existingPriority =
        IMPORTANCE_ORDER[existing.importance] ?? Number.MAX_SAFE_INTEGER;
      const newPriority =
        IMPORTANCE_ORDER[binding.importance] ?? Number.MAX_SAFE_INTEGER;
      if (newPriority < existingPriority) {
        // 新的优先级更高，替换
        const idx = injectedBindings.findIndex((b) => b.id === existing.id);
        if (idx >= 0) {
          injectedBindings[idx] = binding;
          seenSourceKeys.set(sourceKey, binding);
          skippedBindings.push({ binding: existing, reason: "duplicate" });
        }
      } else {
        skippedBindings.push({ binding, reason: "duplicate" });
      }
      continue;
    }

    injectedBindings.push(binding);
    seenSourceKeys.set(sourceKey, binding);
  }

  // ── Step 9: 排序 ──
  injectedBindings.sort((a, b) => {
    const pa = IMPORTANCE_ORDER[a.importance] ?? Number.MAX_SAFE_INTEGER;
    const pb = IMPORTANCE_ORDER[b.importance] ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    // 同 importance 按 type 字母序
    return a.type.localeCompare(b.type);
  });

  // ── Step 10: 构造注入块 ──
  const injectionBlock = buildCrossTimelineInjectionBlock(
    injectedBindings,
    multiView.relationships,
  );

  // ── 拼接最终 Prompt ──
  const injectedPrompt = injectionBlock
    ? `${injectionBlock}\n\n${basePrompt}`
    : basePrompt;

  return {
    nodeId,
    timelineId,
    basePrompt,
    injectedPrompt,
    injectedBindings,
    skippedBindings,
    injectionBlock,
  };
}

// ─────────────────────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────────────────────

/**
 * 规范化跨时间线绑定（填充默认值）
 */
export function normalizeCrossTimelineBinding(
  binding: CrossTimelineBindingLike,
): CrossTimelineBindingLike {
  return {
    ...binding,
    autoInject: binding.autoInject ?? true,
    cascadeEffect: binding.cascadeEffect ?? false,
    aiDetected: binding.aiDetected ?? false,
    userConfirmed: binding.userConfirmed ?? false,
  };
}

/**
 * 构造跨时间线注入块
 *
 * 格式：
 *   【跨时间线前情提要 - 自动注入】
 *   [伏笔] 来自"回忆线"：柯布与梅尔的往事
 *   关系：回忆 → 主线
 *   ---
 *   [呼应] 来自"支线A"：零的改造人身份揭示
 *   关系：支线 → 主线
 */
export function buildCrossTimelineInjectionBlock(
  bindings: CrossTimelineBindingLike[],
  relationships: TimelineRelationshipLike[],
): string {
  if (bindings.length === 0) return "";

  const lines: string[] = [HEADER_CROSS_TIMELINE];
  for (const binding of bindings) {
    const typeLabel = BINDING_TYPE_LABELS[binding.type] ?? binding.type;
    const importanceLabel = binding.importance;
    const rel = findRelationship(
      relationships,
      binding.sourceTimelineId,
      binding.targetTimelineId,
    );
    const relLabel = rel
      ? `${RELATIONSHIP_LABELS[rel.type] ?? rel.type}：${rel.description}`
      : `${binding.sourceTimelineId} → ${binding.targetTimelineId}`;

    lines.push(
      `[${typeLabel}]（${importanceLabel}）来自 "${binding.sourceTimelineId}"：`,
    );
    lines.push(`关系：${relLabel}`);
    if (binding.relationshipDescription) {
      lines.push(`描述：${binding.relationshipDescription}`);
    }
    lines.push(`内容：${binding.injectionText}`);
    lines.push("---");
  }
  // 移除最后一个 "---"
  if (lines[lines.length - 1] === "---") {
    lines.pop();
  }
  return lines.join("\n");
}

/**
 * 查找两个时间线之间的关系
 */
export function findRelationship(
  relationships: TimelineRelationshipLike[],
  fromTimelineId: string,
  toTimelineId: string,
): TimelineRelationshipLike | undefined {
  return relationships.find(
    (r) => r.fromTimelineId === fromTimelineId && r.toTimelineId === toTimelineId,
  );
}

/**
 * 获取指定时间线节点的所有跨时间线绑定（作为目标）
 */
export function getInboundCrossTimelineBindings(
  nodeId: string,
  timelineId: string,
  multiView: MultiTimelineLike,
): CrossTimelineBindingLike[] {
  return multiView.crossTimelineBindings.filter(
    (b) => b.targetTimelineId === timelineId && b.targetNodeId === nodeId,
  );
}

/**
 * 获取指定时间线节点的所有跨时间线绑定（作为源）
 */
export function getOutboundCrossTimelineBindings(
  nodeId: string,
  timelineId: string,
  multiView: MultiTimelineLike,
): CrossTimelineBindingLike[] {
  return multiView.crossTimelineBindings.filter(
    (b) => b.sourceTimelineId === timelineId && b.sourceNodeId === nodeId,
  );
}

/**
 * 获取两个时间线之间的所有跨时间线绑定
 */
export function getBindingsBetweenTimelines(
  fromTimelineId: string,
  toTimelineId: string,
  multiView: MultiTimelineLike,
): CrossTimelineBindingLike[] {
  return multiView.crossTimelineBindings.filter(
    (b) =>
      b.sourceTimelineId === fromTimelineId &&
      b.targetTimelineId === toTimelineId,
  );
}

/**
 * 获取与指定时间线相关的所有关系
 */
export function getTimelineRelationships(
  timelineId: string,
  multiView: MultiTimelineLike,
): TimelineRelationshipLike[] {
  return multiView.relationships.filter(
    (r) => r.fromTimelineId === timelineId || r.toTimelineId === timelineId,
  );
}

// ─────────────────────────────────────────────────────────────
// 时间线层级计算（用于 UI 嵌套展示）
// ─────────────────────────────────────────────────────────────

/**
 * 时间线层级信息（最小形状，shared-logic 层）
 */
export interface TimelineLayerInfoLike {
  timelineId: string;
  depth: number;
  parentTimelineId?: string;
  childTimelineIds: string[];
}

/**
 * 计算时间线的层级结构
 *
 * 根据 parentTimelineId 关系计算每个时间线的深度。
 * 主线（无 parent）深度为 0，其子时间线深度为 1，以此类推。
 *
 * @param timelines 时间线列表（含 id 和 parentTimelineId）
 * @returns timelineId → TimelineLayerInfoLike 的映射
 */
export function computeTimelineLayers(
  timelines: Array<{
    id: string;
    parentTimelineId?: string;
  }>,
): Map<string, TimelineLayerInfoLike> {
  const result = new Map<string, TimelineLayerInfoLike>();
  const childMap = new Map<string, string[]>();

  // 构建父子关系映射
  for (const t of timelines) {
    const parentId = t.parentTimelineId;
    if (parentId) {
      const children = childMap.get(parentId) ?? [];
      children.push(t.id);
      childMap.set(parentId, children);
    }
  }

  // BFS 计算深度
  const roots = timelines.filter((t) => !t.parentTimelineId);
  const queue: Array<{ id: string; depth: number; parent?: string }> = roots.map(
    (t) => ({ id: t.id, depth: 0 }),
  );

  while (queue.length > 0) {
    const { id, depth, parent } = queue.shift()!;
    const children = childMap.get(id) ?? [];
    result.set(id, {
      timelineId: id,
      depth,
      parentTimelineId: parent,
      childTimelineIds: children,
    });
    for (const childId of children) {
      queue.push({ id: childId, depth: depth + 1, parent: id });
    }
  }

  // 处理孤立时间线（有 parentTimelineId 但 parent 不在列表中）
  for (const t of timelines) {
    if (!result.has(t.id)) {
      result.set(t.id, {
        timelineId: t.id,
        depth: 0,
        parentTimelineId: t.parentTimelineId,
        childTimelineIds: childMap.get(t.id) ?? [],
      });
    }
  }

  return result;
}
