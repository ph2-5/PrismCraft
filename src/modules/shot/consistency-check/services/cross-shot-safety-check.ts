/**
 * 跨分镜 IP 安全改写一致性检查（Task 4.12 新增）
 *
 * 职责：
 * - 扫描所有分镜的 prompt 字段
 * - 检测同一 IP 关键词在不同分镜的改写结果是否一致
 * - 不一致时（如第 1 分镜"钢铁侠"改写为"机械战甲"，第 3 分镜改写为"科技英雄"）
 *   → 警告并统一到首次出现的改写版本
 *
 * 与 cross-shot-auto-fix.ts 的关系：
 * - cross-shot-auto-fix 关注 featureTags/referenceImageUrl 漂移
 * - cross-shot-safety-check 关注 IP 改写结果漂移（prompt 字段）
 * - 两者可组合使用：先 cross-shot-safety-check 统一 IP 改写，
 *   再 cross-shot-auto-fix 修复 featureTags 漂移
 *
 * 设计要点：
 * - 纯函数：输入 beats，返回检查结果和统一后的 beats（不修改原数组）
 * - 一致性策略：所有分镜的同一 IP 关键词必须改写为相同的替换词
 * - 不一致时统一到"首次出现的改写版本"（稳定且可预测）
 */

import type { StoryBeat } from "@/domain/schemas";
import { rewriteIp, type IpRewriteChange } from "@/shared-logic/prompt/safety/ip-rewriter";

// ============= 类型定义 =============

/** 单个分镜的 IP 改写结果快照 */
export interface BeatIpRewriteSnapshot {
  beatId: string;
  /** 该分镜 prompt 中检测到的 IP 改写记录 */
  changes: IpRewriteChange[];
  /** 改写后的 prompt */
  rewrittenPrompt: string;
}

/** IP 改写一致性冲突（同一关键词在不同分镜改写不一致） */
export interface IpRewriteConflict {
  /** 触发冲突的原始关键词 */
  originalKeyword: string;
  /** 各分镜中的不同改写版本 */
  variants: Array<{
    rewritten: string;
    beatIds: string[];
  }>;
  /** 统一目标（首次出现的改写版本） */
  canonicalRewritten: string;
  /** 需要更新 prompt 的分镜列表 */
  beatIdsToFix: string[];
}

/** 跨分镜 IP 安全改写检查结果 */
export interface CrossShotSafetyCheckResult {
  /** 所有分镜的 IP 改写快照 */
  snapshots: BeatIpRewriteSnapshot[];
  /** 检测到的冲突列表（同一 IP 改写不一致） */
  conflicts: IpRewriteConflict[];
  /** 是否通过一致性检查（无冲突 = true） */
  passed: boolean;
  /** 冲突数量 */
  conflictCount: number;
}

/** 统一修复后的结果 */
export interface CrossShotSafetyFixResult {
  /** 修复后的 beats（IP 改写已统一） */
  fixedBeats: StoryBeat[];
  /** 已应用的统一修复数量 */
  appliedFixCount: number;
  /** 修复详情（每个冲突的修复记录） */
  fixes: Array<{
    conflict: IpRewriteConflict;
    /** 修复前的 prompt 片段（按 beatId） */
    beforeByBeat: Record<string, string>;
    /** 修复后的 prompt 片段（按 beatId） */
    afterByBeat: Record<string, string>;
  }>;
  /** 修复后再次运行检查的结果 */
  postFixCheck: CrossShotSafetyCheckResult;
}

// ============= 内部辅助函数 =============

/**
 * 获取分镜的主要 prompt 文本。
 *
 * 优先级：
 * 1. beat.imageGenerationPrompt（LLM 生成的初始关键帧 prompt，最权威）
 * 2. beat.description（分镜描述，降级）
 *
 * 不使用 shotInstruction（无 prompt 字段，只有 shotSize/cameraMovement/cameraAngle）。
 */
function getBeatPrompt(beat: StoryBeat): string {
  if (beat.imageGenerationPrompt && beat.imageGenerationPrompt.trim().length > 0) {
    return beat.imageGenerationPrompt;
  }
  return beat.description ?? "";
}

/**
 * 深拷贝 beats（修复时操作副本，不修改原数组）。
 */
function cloneBeatsForPromptFix(beats: StoryBeat[]): StoryBeat[] {
  return beats.map((beat) => ({ ...beat }));
}

/**
 * 为每个分镜生成 IP 改写快照。
 */
function generateSnapshots(beats: StoryBeat[]): BeatIpRewriteSnapshot[] {
  return beats.map((beat) => {
    const prompt = getBeatPrompt(beat);
    const result = rewriteIp(prompt);
    return {
      beatId: beat.id,
      changes: result.changes,
      rewrittenPrompt: result.rewritten,
    };
  });
}

/**
 * 检测跨分镜的 IP 改写冲突。
 *
 * 算法：
 * 1. 收集所有分镜的 IP 改写记录
 * 2. 按 originalKeyword 分组
 * 3. 同一 originalKeyword 的改写版本不一致 → 冲突
 *
 * 注意：仅当同一 originalKeyword 在 2+ 个分镜中出现且改写版本不同时才算冲突。
 */
function detectConflicts(snapshots: BeatIpRewriteSnapshot[]): IpRewriteConflict[] {
  // 按 originalKeyword 分组：记录每个关键词在各分镜中的改写版本
  const keywordMap = new Map<
    string, // originalKeyword
    Array<{ beatId: string; rewritten: string }>
  >();

  for (const snap of snapshots) {
    for (const change of snap.changes) {
      const existing = keywordMap.get(change.original);
      if (existing) {
        existing.push({ beatId: snap.beatId, rewritten: change.rewritten });
      } else {
        keywordMap.set(change.original, [
          { beatId: snap.beatId, rewritten: change.rewritten },
        ]);
      }
    }
  }

  const conflicts: IpRewriteConflict[] = [];

  for (const [originalKeyword, occurrences] of keywordMap.entries()) {
    if (occurrences.length < 2) continue; // 仅在 1 个分镜出现，无冲突

    // 按 rewritten 版本分组
    const variantMap = new Map<string, string[]>();
    for (const occ of occurrences) {
      const existing = variantMap.get(occ.rewritten);
      if (existing) {
        existing.push(occ.beatId);
      } else {
        variantMap.set(occ.rewritten, [occ.beatId]);
      }
    }

    // 仅当存在 2+ 不同改写版本时才视为冲突
    if (variantMap.size < 2) continue;

    const variants = [...variantMap.entries()].map(([rewritten, beatIds]) => ({
      rewritten,
      beatIds,
    }));

    // 首次出现的改写版本作为 canonical
    const canonicalRewritten = occurrences[0]!.rewritten;

    // 需要修复的分镜：改写版本不等于 canonical 的
    const beatIdsToFix = occurrences
      .filter((o) => o.rewritten !== canonicalRewritten)
      .map((o) => o.beatId);

    conflicts.push({
      originalKeyword,
      variants,
      canonicalRewritten,
      beatIdsToFix,
    });
  }

  return conflicts;
}

// ============= 公共 API =============

/**
 * 检查所有分镜 prompt 中的 IP 改写一致性。
 *
 * @param beats 所有分镜
 * @returns 检查结果（含快照、冲突、是否通过）
 *
 * @example
 * ```ts
 * const result = checkCrossShotIpConsistency(beats);
 * if (!result.passed) {
 *   console.log(`检测到 ${result.conflictCount} 个 IP 改写冲突`);
 *   for (const conflict of result.conflicts) {
 *     console.log(`  "${conflict.originalKeyword}" 在不同分镜中改写不一致`);
 *   }
 * }
 * ```
 */
export function checkCrossShotIpConsistency(
  beats: StoryBeat[],
): CrossShotSafetyCheckResult {
  const snapshots = generateSnapshots(beats);
  const conflicts = detectConflicts(snapshots);

  return {
    snapshots,
    conflicts,
    passed: conflicts.length === 0,
    conflictCount: conflicts.length,
  };
}

/**
 * 统一所有分镜的 IP 改写结果。
 *
 * 对于每个冲突，将所有分镜的该 IP 关键词改写版本统一到 canonicalRewritten。
 *
 * @param beats 原始分镜数组
 * @returns 修复结果（含修复后 beats、修复数量、修复详情、修复后检查结果）
 *
 * @example
 * ```ts
 * const checkResult = checkCrossShotIpConsistency(beats);
 * if (!checkResult.passed) {
 *   const fixResult = fixCrossShotIpConsistency(beats);
 *   // 使用 fixResult.fixedBeats 替换原 beats
 * }
 * ```
 */
export function fixCrossShotIpConsistency(
  beats: StoryBeat[],
): CrossShotSafetyFixResult {
  const initialCheck = checkCrossShotIpConsistency(beats);

  // 无冲突 → 直接返回
  if (initialCheck.passed) {
    return {
      fixedBeats: beats,
      appliedFixCount: 0,
      fixes: [],
      postFixCheck: initialCheck,
    };
  }

  const fixedBeats = cloneBeatsForPromptFix(beats);
  const fixes: CrossShotSafetyFixResult["fixes"] = [];

  for (const conflict of initialCheck.conflicts) {
    // 构建"非 canonical 改写版本 → canonical"的替换映射
    // 例如：canonical="机械战甲超级英雄"，其他版本=["科技英雄"]
    // 需要将所有非 canonical 版本替换为 canonical
    const nonCanonicalVariants = conflict.variants.filter(
      (v) => v.rewritten !== conflict.canonicalRewritten,
    );

    const beforeByBeat: Record<string, string> = {};
    const afterByBeat: Record<string, string> = {};

    for (const beat of fixedBeats) {
      if (!conflict.beatIdsToFix.includes(beat.id)) continue;

      const prompt = getBeatPrompt(beat);
      let updatedPrompt = prompt;

      // 将每个非 canonical 改写版本替换为 canonical
      for (const variant of nonCanonicalVariants) {
        if (updatedPrompt.includes(variant.rewritten)) {
          updatedPrompt = updatedPrompt
            .split(variant.rewritten)
            .join(conflict.canonicalRewritten);
        }
      }

      if (updatedPrompt !== prompt) {
        beforeByBeat[beat.id] = prompt;
        afterByBeat[beat.id] = updatedPrompt;

        // 写回 beat（优先 imageGenerationPrompt，其次 description）
        if (beat.imageGenerationPrompt && beat.imageGenerationPrompt.trim().length > 0) {
          beat.imageGenerationPrompt = updatedPrompt;
        } else {
          beat.description = updatedPrompt;
        }
      }
    }

    fixes.push({
      conflict,
      beforeByBeat,
      afterByBeat,
    });
  }

  // 修复后再次检查
  const postFixCheck = checkCrossShotIpConsistency(fixedBeats);

  return {
    fixedBeats,
    appliedFixCount: fixes.length,
    fixes,
    postFixCheck,
  };
}
