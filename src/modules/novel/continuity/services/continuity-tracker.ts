/**
 * Task 2A.18 — 连续性追踪器
 *
 * 从 shots/characters/scenes/contracts 提取 ContinuityEntry，
 * 并检测跨 shot 的属性冲突生成 ContinuityViolation。
 *
 * 检测规则（参考 seedance-2.0 references/shot-list-continuity.md）：
 * - 角色服装：同一角色在连续分镜中服装应一致（除非有换装说明）
 * - 角色发色：同一角色在连续分镜中发色应一致
 * - 场景时间：同一场景在连续分镜中时间应一致
 * - 场景氛围：同一场景在连续分镜中氛围应一致
 * - 道具位置：从 ShotContract.continuityNotes 解析（v5.3 增强预留）
 *
 * 依赖方向：
 * - 依赖同模块 domain/types（ShotBreakdown/CharacterInPipeline/SceneInPipeline）
 * - 依赖同模块 structure/domain/shot-contract（ShotContract 类型）
 * - 依赖同子域 domain/continuity-ledger
 */

import type {
  CharacterInPipeline,
  SceneInPipeline,
  ShotBreakdown,
} from "../../domain/types";
import type { ShotContract } from "../../structure/domain/shot-contract";
import type {
  ContinuityCategory,
  ContinuityEntry,
  ContinuityLedger,
  ContinuityViolation,
} from "../domain/continuity-ledger";
import { DEFAULT_SEVERITY } from "../domain/continuity-ledger";

/**
 * ContinuityTracker 输入。
 *
 * shots 是必填，characters/scenes 用于查找 appearance/timeOfDay，
 * contracts 可选（用于解析 continuityNotes 提取 prop 类 entry）。
 */
export interface ContinuityTrackerInput {
  /** 所有分镜（按 sequence 排序由调用方保证） */
  shots: ShotBreakdown[];
  /** 所有角色（用于查找 appearance） */
  characters: CharacterInPipeline[];
  /** 所有场景（用于查找 timeOfDay/atmosphere） */
  scenes: SceneInPipeline[];
  /** 镜头契约（可选，用于解析 continuityNotes） */
  contracts?: ShotContract[];
}

/**
 * 连续性追踪器。
 *
 * 设计为无状态类（pure functions），便于测试和并发调用。
 * extractEntries / detectViolations / buildLedger 均不修改输入数据。
 */
export class ContinuityTracker {
  /**
   * 从输入数据提取所有 ContinuityEntry。
   *
   * 提取策略：
   * 1. 角色 appearance.clothing → category=character, key="${name}.服装"
   * 2. 角色 appearance.hairColor → category=character, key="${name}.发色"
   * 3. 场景 timeOfDay → category=scene, key="${sceneName}.时间"
   * 4. 场景 atmosphere → category=scene, key="${sceneName}.氛围"
   * 5. ShotContract.continuityNotes → 解析 prop 类 entry（v5.3 增强预留）
   *
   * @param input 输入数据
   * @returns ContinuityEntry 数组（每个 shot 可能多个 entry）
   */
  extractEntries(input: ContinuityTrackerInput): ContinuityEntry[] {
    const entries: ContinuityEntry[] = [];
    const { shots, characters, scenes } = input;

    // 构建查找表
    const characterMap = new Map(
      characters.filter((c) => c.name).map((c) => [c.name, c]),
    );
    const sceneMap = new Map(scenes.map((s) => [s.tempId, s]));

    for (const shot of shots) {
      // 1. 角色 appearance
      for (const charName of shot.characters) {
        const char = characterMap.get(charName);
        if (!char?.appearance) continue;

        if (char.appearance.clothing) {
          entries.push({
            shotId: shot.id,
            category: "character",
            key: `${charName}.服装`,
            value: char.appearance.clothing,
            isExplicit: false, // 从 appearance 推断
          });
        }

        if (char.appearance.hairColor) {
          entries.push({
            shotId: shot.id,
            category: "character",
            key: `${charName}.发色`,
            value: char.appearance.hairColor,
            isExplicit: false,
          });
        }
      }

      // 2. 场景 timeOfDay（time 类，error 级）/ atmosphere（scene 类，warning 级）
      if (shot.sceneId) {
        const scene = sceneMap.get(shot.sceneId);
        if (scene) {
          if (scene.timeOfDay) {
            entries.push({
              shotId: shot.id,
              category: "time",
              key: `${scene.name}.时间`,
              value: scene.timeOfDay,
              isExplicit: false,
            });
          }

          if (scene.atmosphere) {
            entries.push({
              shotId: shot.id,
              category: "scene",
              key: `${scene.name}.氛围`,
              value: scene.atmosphere,
              isExplicit: false,
            });
          }
        }
      }

      // 3. ShotContract.continuityNotes 解析（v5.3 增强预留）
      // 实际实现需要 AI 解析自然语言注释提取结构化 entry，此处暂跳过
    }

    return entries;
  }

  /**
   * 检测所有违规。
   *
   * 算法：按 key 分组 entries，同一 key 出现多个不同 value → 违规。
   *
   * @param input 输入数据
   * @returns ContinuityViolation 数组（按 key 字母序排序）
   */
  detectViolations(input: ContinuityTrackerInput): ContinuityViolation[] {
    const entries = this.extractEntries(input);
    const { shots } = input;

    // shot 序号查找表（用于排序 conflictingValues）
    const shotSequence = new Map(shots.map((s) => [s.id, s.sequence]));

    // 按 key 分组
    const keyGroups = new Map<string, ContinuityEntry[]>();
    for (const entry of entries) {
      const group = keyGroups.get(entry.key) ?? [];
      group.push(entry);
      keyGroups.set(entry.key, group);
    }

    const violations: ContinuityViolation[] = [];
    let violationIdx = 0;

    for (const [key, group] of keyGroups.entries()) {
      // 按 shot sequence 排序
      const sorted = [...group].sort((a, b) => {
        const seqA = shotSequence.get(a.shotId) ?? 0;
        const seqB = shotSequence.get(b.shotId) ?? 0;
        return seqA - seqB;
      });

      // 收集不同的 value
      const uniqueValues = new Set(sorted.map((e) => e.value));

      // 多个不同 value → 违规
      if (uniqueValues.size > 1) {
        const category = sorted[0]!.category;
        const conflictingValues = sorted.map((e) => ({
          shotId: e.shotId,
          value: e.value,
          isExplicit: e.isExplicit,
        }));
        const shotIds = sorted.map((e) => e.shotId);

        violations.push({
          id: `cv-${violationIdx++}`,
          shotIds,
          category,
          key,
          conflictingValues,
          severity: DEFAULT_SEVERITY[category],
        });
      }
    }

    // 按 key 字符串序排序，使输出稳定（与测试断言一致）
    return violations.sort((a, b) =>
      a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
    );
  }

  /**
   * 构建完整账本（entries + violations + 统计）。
   *
   * @param input 输入数据
   * @returns ContinuityLedger 完整账本
   */
  buildLedger(input: ContinuityTrackerInput): ContinuityLedger {
    const entries = this.extractEntries(input);
    const violations = this.detectViolations(input);

    const errorCount = violations.filter((v) => v.severity === "error").length;
    const warningCount = violations.filter(
      (v) => v.severity === "warning",
    ).length;

    return {
      entries,
      violations,
      generatedAt: Date.now(),
      totalShots: input.shots.length,
      totalEntries: entries.length,
      totalViolations: violations.length,
      errorCount,
      warningCount,
    };
  }

  /**
   * 按 category 过滤违规（UI 用于按类别分组显示）。
   */
  filterViolationsByCategory(
    violations: ContinuityViolation[],
    category: ContinuityCategory,
  ): ContinuityViolation[] {
    return violations.filter((v) => v.category === category);
  }
}

/**
 * 单例实例。
 *
 * ContinuityTracker 是无状态的，单例仅为减少重复实例化开销。
 */
export const continuityTracker = new ContinuityTracker();
