/**
 * 跨分镜一致性自动修复服务（Cross-Shot Auto Fix Service）
 *
 * 职责：
 * - 调用 checkCrossShotConsistency 检测漂移
 * - 分析漂移原因：featureTags 漂移 vs referenceImageUrl 漂移
 * - 可自动修复：featureTags 漂移但 referenceImageUrl 一致 → 同步多数派 featureTags
 * - 不可自动修复：referenceImageUrl 漂移 → 提示用户手动确认
 * - 修复后重新运行一致性检查，确认漂移已消除
 *
 * 架构：
 *   调用方（UI / Agent 工具）
 *     → autoFixCrossShotConsistency（本文件）
 *       → checkCrossShotConsistency（cross-shot-consistency-service.ts）
 *       → 修改 beats 副本中的 featureAnchoring.characterAnchors/propAnchors
 *       → 再次 checkCrossShotConsistency 验证
 *
 * 设计要点：
 * - 纯函数：输入 beats + elements，返回修复后的 beats（不修改原数组）
 * - 修复策略保守：仅当 referenceImageUrl 完全一致时才自动修复 featureTags
 * - 多数派选择：当 featureTags 存在多个版本时，选择出现次数最多的作为基准
 * - 并列时选第一个（稳定排序）
 */

import type { StoryBeat } from "@/domain/schemas";
import {
  checkCrossShotConsistency,
  type CrossShotConsistencyInput,
  type CrossShotConsistencyResult,
} from "./cross-shot-consistency-service";

// ============= 类型定义 =============

export type DriftKind = "featureTags" | "referenceImageUrl" | "both";

export interface DriftAnalysis {
  elementId: string;
  elementName: string;
  kind: DriftKind;
  /** 是否可自动修复（featureTags 漂移但 referenceImageUrl 一致 → true） */
  autoFixable: boolean;
  /** 多数派 featureTags（可自动修复时有值） */
  canonicalFeatureTags?: string[];
  /** 多数派 referenceImageUrl（仅记录用，不自动修复） */
  canonicalReferenceImageUrl?: string;
  /** 漂移的快照列表 */
  beatSnapshots: Array<{
    beatId: string;
    featureTags: string[];
    referenceImageUrl: string;
  }>;
}

export interface AppliedFix {
  elementId: string;
  elementName: string;
  beatIds: string[];
  /** 修复前 featureTags */
  beforeFeatureTags: string[];
  /** 修复后 featureTags */
  afterFeatureTags: string[];
  kind: "featureTags";
}

export interface ManualConfirmFix {
  elementId: string;
  elementName: string;
  beatIds: string[];
  kind: "referenceImageUrl" | "both";
  /** 各分镜的 referenceImageUrl 列表，供用户选择 */
  candidateReferenceImageUrls: string[];
  reason: string;
}

export interface AutoFixResult {
  /** 修复后的 beats（已应用可自动修复的变更） */
  fixedBeats: StoryBeat[];
  /** 已应用的自动修复列表 */
  appliedFixes: AppliedFix[];
  /** 需要用户手动确认的修复列表 */
  manualConfirmFixes: ManualConfirmFix[];
  /** 修复后的一致性检查结果 */
  postFixConsistency: CrossShotConsistencyResult;
  /** 是否所有漂移都已处理（无剩余自动可修复项） */
  allResolved: boolean;
  /** 漂移分析（每个漂移元素的分析结果） */
  driftAnalyses: DriftAnalysis[];
}

// ============= 内部辅助函数 =============

interface AnchorSnapshot {
  beatId: string;
  featureTags: string[];
  referenceImageUrl: string;
  /** 锚点在 characterAnchors 或 propAnchors 数组中的索引（用于回写修复） */
  anchorType: "character" | "prop";
  anchorIndex: number;
}

/** 收集某元素在所有分镜中的锚点快照 */
function collectDetailedSnapshots(
  beats: StoryBeat[],
  elementId: string,
): AnchorSnapshot[] {
  const snapshots: AnchorSnapshot[] = [];

  for (const beat of beats) {
    if (!beat.featureAnchoring?.enabled) continue;

    const characterAnchors = beat.featureAnchoring.characterAnchors ?? [];
    const propAnchors = beat.featureAnchoring.propAnchors ?? [];

    // 在 characterAnchors 中查找
    const charIdx = characterAnchors.findIndex((a) => a.elementId === elementId);
    if (charIdx >= 0) {
      const anchor = characterAnchors[charIdx]!;
      snapshots.push({
        beatId: beat.id,
        featureTags: anchor.featureTags ?? [],
        referenceImageUrl: anchor.referenceImageUrl ?? "",
        anchorType: "character",
        anchorIndex: charIdx,
      });
      continue;
    }

    // 在 propAnchors 中查找
    const propIdx = propAnchors.findIndex((a) => a.elementId === elementId);
    if (propIdx >= 0) {
      const anchor = propAnchors[propIdx]!;
      snapshots.push({
        beatId: beat.id,
        featureTags: anchor.featureTags ?? [],
        referenceImageUrl: anchor.referenceImageUrl ?? "",
        anchorType: "prop",
        anchorIndex: propIdx,
      });
    }
  }

  return snapshots;
}

/** 标签集合的规范化键（排序后拼接，用于比较） */
function tagsKey(tags: string[]): string {
  return [...tags].sort().join(",");
}

/** URL 集合的规范化键（trim 后比较） */
function urlKey(url: string): string {
  return url.trim();
}

/**
 * 选择多数派 featureTags
 *
 * 规则：
 * 1. 按 tagsKey 分组计数
 * 2. 选出现次数最多的
 * 3. 并列时选第一个出现的（保证稳定）
 */
function selectCanonicalFeatureTags(
  snapshots: AnchorSnapshot[],
): string[] | undefined {
  if (snapshots.length === 0) return undefined;

  const groups = new Map<string, { count: number; firstIndex: number; tags: string[] }>();

  snapshots.forEach((snap, index) => {
    const key = tagsKey(snap.featureTags);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { count: 1, firstIndex: index, tags: [...snap.featureTags] });
    }
  });

  let best: { count: number; firstIndex: number; tags: string[] } | undefined;
  for (const group of groups.values()) {
    if (!best) {
      best = group;
    } else if (
      group.count > best.count ||
      (group.count === best.count && group.firstIndex < best.firstIndex)
    ) {
      best = group;
    }
  }

  return best?.tags;
}

/**
 * 选择多数派 referenceImageUrl
 *
 * 仅用于分析，不用于自动修复（referenceImageUrl 漂移需用户确认）。
 */
function selectCanonicalReferenceImageUrl(
  snapshots: AnchorSnapshot[],
): string | undefined {
  if (snapshots.length === 0) return undefined;

  const counts = new Map<string, { count: number; firstIndex: number; url: string }>();

  snapshots.forEach((snap, index) => {
    const key = urlKey(snap.referenceImageUrl);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { count: 1, firstIndex: index, url: snap.referenceImageUrl });
    }
  });

  let best: { count: number; firstIndex: number; url: string } | undefined;
  for (const entry of counts.values()) {
    if (!best) {
      best = entry;
    } else if (
      entry.count > best.count ||
      (entry.count === best.count && entry.firstIndex < best.firstIndex)
    ) {
      best = entry;
    }
  }

  return best?.url;
}

/** 判断所有快照的 referenceImageUrl 是否完全一致 */
function isReferenceUrlConsistent(snapshots: AnchorSnapshot[]): boolean {
  if (snapshots.length <= 1) return true;
  const first = urlKey(snapshots[0]!.referenceImageUrl);
  return snapshots.every((s) => urlKey(s.referenceImageUrl) === first);
}

/** 判断所有快照的 featureTags 是否完全一致 */
function isFeatureTagsConsistent(snapshots: AnchorSnapshot[]): boolean {
  if (snapshots.length <= 1) return true;
  const first = tagsKey(snapshots[0]!.featureTags);
  return snapshots.every((s) => tagsKey(s.featureTags) === first);
}

/** 分析单个元素的漂移 */
function analyzeElementDrift(
  elementId: string,
  elementName: string,
  beats: StoryBeat[],
): DriftAnalysis | null {
  const snapshots = collectDetailedSnapshots(beats, elementId);
  if (snapshots.length < 2) return null;

  const tagsConsistent = isFeatureTagsConsistent(snapshots);
  const urlConsistent = isReferenceUrlConsistent(snapshots);

  // 无漂移
  if (tagsConsistent && urlConsistent) return null;

  let kind: DriftKind;
  if (!tagsConsistent && !urlConsistent) {
    kind = "both";
  } else if (!tagsConsistent) {
    kind = "featureTags";
  } else {
    kind = "referenceImageUrl";
  }

  // 可自动修复：featureTags 漂移但 referenceImageUrl 一致
  const autoFixable = !tagsConsistent && urlConsistent;

  return {
    elementId,
    elementName,
    kind,
    autoFixable,
    canonicalFeatureTags: selectCanonicalFeatureTags(snapshots),
    canonicalReferenceImageUrl: selectCanonicalReferenceImageUrl(snapshots),
    beatSnapshots: snapshots.map((s) => ({
      beatId: s.beatId,
      featureTags: s.featureTags,
      referenceImageUrl: s.referenceImageUrl,
    })),
  };
}

/** 深拷贝 beats（修复时操作副本，不修改原数组） */
function cloneBeats(beats: StoryBeat[]): StoryBeat[] {
  return beats.map((beat) => ({
    ...beat,
    featureAnchoring: beat.featureAnchoring
      ? {
          ...beat.featureAnchoring,
          characterAnchors: beat.featureAnchoring.characterAnchors.map((a) => ({
            ...a,
            featureTags: [...a.featureTags],
          })),
          propAnchors: beat.featureAnchoring.propAnchors?.map((a) => ({
            ...a,
            featureTags: [...a.featureTags],
          })),
        }
      : undefined,
  }));
}

/** 应用单个元素的 featureTags 修复到 beats 副本 */
function applyFeatureTagsFix(
  beats: StoryBeat[],
  elementId: string,
  canonicalTags: string[],
): { beatIds: string[]; beforeTags: string[] } {
  const beatIds: string[] = [];
  const beforeTagsSet = new Set<string>();
  // 提前计算多数派 tagsKey，避免在循环内重复计算
  const canonicalKey = tagsKey(canonicalTags);

  for (const beat of beats) {
    if (!beat.featureAnchoring?.enabled) continue;

    const characterAnchors = beat.featureAnchoring.characterAnchors ?? [];
    const propAnchors = beat.featureAnchoring.propAnchors ?? [];

    // 修复角色锚点：通过早 continue 展平嵌套
    for (const anchor of characterAnchors) {
      if (anchor.elementId !== elementId) continue;
      const beforeKey = tagsKey(anchor.featureTags);
      if (beforeKey === canonicalKey) continue;
      beforeTagsSet.add(beforeKey);
      anchor.featureTags = [...canonicalTags];
      if (!beatIds.includes(beat.id)) beatIds.push(beat.id);
    }

    // 修复道具锚点：同样使用早 continue 展平嵌套
    for (const anchor of propAnchors) {
      if (anchor.elementId !== elementId) continue;
      const beforeKey = tagsKey(anchor.featureTags);
      if (beforeKey === canonicalKey) continue;
      beforeTagsSet.add(beforeKey);
      anchor.featureTags = [...canonicalTags];
      if (!beatIds.includes(beat.id)) beatIds.push(beat.id);
    }
  }

  return {
    beatIds,
    beforeTags: [...beforeTagsSet],
  };
}

/** 收集某元素的候选 referenceImageUrl（去重） */
function collectCandidateUrls(beats: StoryBeat[], elementId: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const beat of beats) {
    if (!beat.featureAnchoring?.enabled) continue;
    const allAnchors = [
      ...(beat.featureAnchoring.characterAnchors ?? []),
      ...(beat.featureAnchoring.propAnchors ?? []),
    ];
    for (const anchor of allAnchors) {
      if (anchor.elementId === elementId) {
        const url = anchor.referenceImageUrl ?? "";
        const key = urlKey(url);
        if (!seen.has(key)) {
          seen.add(key);
          urls.push(url);
        }
      }
    }
  }

  return urls;
}

// ============= 公共 API =============

/**
 * 跨分镜一致性自动修复
 *
 * @param input 与 checkCrossShotConsistency 相同的输入
 * @returns 修复结果（含修复后 beats、已应用修复、需手动确认修复、修复后检查结果）
 *
 * @example
 * ```ts
 * const result = autoFixCrossShotConsistency({ beats, elements });
 * if (result.appliedFixes.length > 0) {
 *   console.log(`自动修复了 ${result.appliedFixes.length} 个元素`);
 *   // 使用 result.fixedBeats 替换原 beats
 * }
 * if (result.manualConfirmFixes.length > 0) {
 *   // 弹窗提示用户确认 referenceImageUrl 漂移
 * }
 * ```
 */
export function autoFixCrossShotConsistency(
  input: CrossShotConsistencyInput,
): AutoFixResult {
  const { beats, elements } = input;

  // Step 1: 首次一致性检查
  const initialResult = checkCrossShotConsistency(input);

  // 无漂移 → 直接返回
  if (initialResult.passed && initialResult.elementDriftReports.length === 0) {
    return {
      fixedBeats: beats,
      appliedFixes: [],
      manualConfirmFixes: [],
      postFixConsistency: initialResult,
      allResolved: true,
      driftAnalyses: [],
    };
  }

  // Step 2: 分析每个漂移元素
  const elementMap = new Map(elements.map((el) => [el.id, el]));
  const driftAnalyses: DriftAnalysis[] = [];

  for (const report of initialResult.elementDriftReports) {
    if (report.driftScore === 0) continue;
    const elementName = elementMap.get(report.elementId)?.name ?? report.elementId;
    const analysis = analyzeElementDrift(report.elementId, elementName, beats);
    if (analysis) {
      driftAnalyses.push(analysis);
    }
  }

  // Step 3: 克隆 beats 并应用可自动修复的 featureTags 漂移
  const fixedBeats = cloneBeats(beats);
  const appliedFixes: AppliedFix[] = [];
  const manualConfirmFixes: ManualConfirmFix[] = [];

  for (const analysis of driftAnalyses) {
    if (analysis.autoFixable && analysis.canonicalFeatureTags) {
      const { beatIds, beforeTags } = applyFeatureTagsFix(
        fixedBeats,
        analysis.elementId,
        analysis.canonicalFeatureTags,
      );

      if (beatIds.length > 0) {
        appliedFixes.push({
          elementId: analysis.elementId,
          elementName: analysis.elementName,
          beatIds,
          beforeFeatureTags: beforeTags,
          afterFeatureTags: [...analysis.canonicalFeatureTags],
          kind: "featureTags",
        });
      }
    } else {
      // 不可自动修复：referenceImageUrl 漂移或 both
      const candidateUrls = collectCandidateUrls(beats, analysis.elementId);
      const reason =
        analysis.kind === "both"
          ? `元素"${analysis.elementName}"的 featureTags 和 referenceImageUrl 在不同分镜中均不一致，需用户确认基准版本`
          : `元素"${analysis.elementName}"的 referenceImageUrl 在不同分镜中不一致，可能是用户有意更换参考图，需确认`;

      manualConfirmFixes.push({
        elementId: analysis.elementId,
        elementName: analysis.elementName,
        beatIds: analysis.beatSnapshots.map((s) => s.beatId),
        kind: analysis.kind === "both" ? "both" : "referenceImageUrl",
        candidateReferenceImageUrls: candidateUrls,
        reason,
      });
    }
  }

  // Step 4: 修复后重新运行一致性检查
  const postFixConsistency = checkCrossShotConsistency({
    beats: fixedBeats,
    elements,
  });

  // Step 5: 判断是否全部解决（无剩余可自动修复项）
  // 注意：manualConfirmFixes 中的项不算"已解决"，但仍算"已处理"
  const allResolved =
    postFixConsistency.passed && manualConfirmFixes.length === 0;

  return {
    fixedBeats,
    appliedFixes,
    manualConfirmFixes,
    postFixConsistency,
    allResolved,
    driftAnalyses,
  };
}

/**
 * 应用用户手动确认的 referenceImageUrl 修复
 *
 * 当用户从候选 URL 中选择一个作为基准后，调用此函数应用到所有分镜。
 *
 * @param beats 原 beats 数组
 * @param elementId 元素 ID
 * @param selectedReferenceImageUrl 用户选择的基准 URL
 * @returns 修复后的 beats 副本
 */
export function applyManualReferenceUrlFix(
  beats: StoryBeat[],
  elementId: string,
  selectedReferenceImageUrl: string,
): StoryBeat[] {
  const fixedBeats = cloneBeats(beats);

  for (const beat of fixedBeats) {
    if (!beat.featureAnchoring?.enabled) continue;

    const characterAnchors = beat.featureAnchoring.characterAnchors ?? [];
    const propAnchors = beat.featureAnchoring.propAnchors ?? [];

    for (const anchor of characterAnchors) {
      if (anchor.elementId === elementId) {
        anchor.referenceImageUrl = selectedReferenceImageUrl;
      }
    }
    for (const anchor of propAnchors) {
      if (anchor.elementId === elementId) {
        anchor.referenceImageUrl = selectedReferenceImageUrl;
      }
    }
  }

  return fixedBeats;
}
