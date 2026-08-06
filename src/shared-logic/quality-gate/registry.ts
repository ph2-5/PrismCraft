/**
 * quality-gate/registry.ts — 质检器注册表（v0.2）
 *
 * 与 workflow-executor 的 registerNodeExecutor 同构：
 * Map 注册 + 工厂懒实例化 + 内置质检器内联注册。
 */
import type { QualityChecker, QualityCheckerInputKind } from "./types";

export type QualityCheckerFactory = () => QualityChecker;

const checkerRegistry = new Map<string, QualityCheckerFactory>();

export function registerQualityChecker(id: string, factory: QualityCheckerFactory): void {
  checkerRegistry.set(id, factory);
}

export function getQualityChecker(id: string): QualityChecker | undefined {
  const factory = checkerRegistry.get(id);
  return factory ? factory() : undefined;
}

export function getAllCheckers(): QualityChecker[] {
  return Array.from(checkerRegistry.values()).map((factory) => factory());
}

/** 按支持能力过滤（供编排按 kind 路由） */
export function getCheckersForKind(kind: QualityCheckerInputKind): QualityChecker[] {
  return getAllCheckers().filter((checker) => checker.supports.includes(kind));
}

/** 内置质检器（v0.2：3 个 rule 类），启动时调用一次 */
export function registerBuiltinCheckers(): void {
  registerQualityChecker("rule.character-consistency", () => createRuleCharacterConsistency());
  registerQualityChecker("rule.scene-consistency", () => createRuleSceneConsistency());
  registerQualityChecker("rule.artifact-scan", () => createRuleArtifactScan());
  // vlm/embedding 类（P2 接入，包装 consistency-qc / face-embedding）
}

function createRuleCharacterConsistency(): QualityChecker {
  return {
    id: "rule.character-consistency",
    category: "rule",
    supports: ["character_consistency", "feature_anchor"],
    async run(input) {
      const anchors = input.featureAnchors ?? {};
      const refs = input.references.filter((r) => r.role === "character");
      let score = 1;
      const issues: string[] = [];
      if (refs.length === 0) {
        score -= 0.4;
        issues.push("无角色参考图");
      }
      if (Object.keys(anchors).length === 0) {
        score -= 0.2;
        issues.push("无特征锚定配置");
      }
      score = Math.max(0, Math.min(1, score));
      return {
        ok: true,
        checkerId: this.id,
        category: "rule",
        verdict: classifyLocal(score),
        score,
        evidence: issues.length > 0 ? issues.join("；") : "角色引用与特征锚定完整",
      };
    },
  };
}

function createRuleSceneConsistency(): QualityChecker {
  return {
    id: "rule.scene-consistency",
    category: "rule",
    supports: ["scene_consistency"],
    async run(input) {
      const sceneRefs = input.references.filter((r) => r.role === "scene");
      let score = 1;
      if (sceneRefs.length === 0) score -= 0.3;
      if (!input.generated.imageUrl && !input.generated.videoUrl) score -= 0.3;
      score = Math.max(0, Math.min(1, score));
      return {
        ok: true,
        checkerId: this.id,
        category: "rule",
        verdict: classifyLocal(score),
        score,
        evidence: sceneRefs.length > 0 ? "场景引用存在" : "无场景引用（低风险场景）",
      };
    },
  };
}

function createRuleArtifactScan(): QualityChecker {
  return {
    id: "rule.artifact-scan",
    category: "rule",
    supports: ["artifact"],
    async run(input) {
      let score = 1;
      const issues: string[] = [];
      if (!input.generated.imageUrl && !input.generated.videoUrl) {
        score -= 0.5;
        issues.push("无生成产物");
      }
      if (input.provenance.modelId === "") {
        score -= 0.1;
        issues.push("modelId 缺失");
      }
      score = Math.max(0, Math.min(1, score));
      return {
        ok: true,
        checkerId: this.id,
        category: "rule",
        verdict: classifyLocal(score),
        score,
        evidence: issues.length > 0 ? issues.join("；") : "无确定性穿帮项",
      };
    },
  };
}

/** 本地判定（rule 类暂用默认阈值；P1 接入 resolveThresholds 做 per-provider 覆盖） */
function classifyLocal(score: number): "pass" | "warn" | "fail" {
  if (score >= 0.6) return "pass";
  if (score >= 0.45) return "warn";
  return "fail";
}
