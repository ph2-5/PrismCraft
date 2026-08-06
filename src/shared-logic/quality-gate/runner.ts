/**
 * quality-gate/runner.ts — 质检编排器（v0.2）
 *
 * 语义（评审修订）：
 * - 按 input.kind 路由到已注册 checker；
 * - 检查项无任何可用实现 → skipped（不参与 gate 判定），记录 standardsUsed: "skipped"；
 * - 同 kind 多实现 → 按 category 优先级选一档执行，verdict 以所选档为准（standardsUsed 记录档位）；
 * - 编排器自身异常 → 返回 warn 空报告，绝不 throw（R192）。
 */
import type {
  QualityCheckInput,
  QualityCheckerCategory,
  QualityCheckResult,
  QualityGateConfig,
  QualityCheckerDeps,
  QualityReport,
} from "./types";
import { getCheckersForKind } from "./registry";

/** 档位优先级（自定义模型 > VLM > embedding > 规则） */
const CATEGORY_PRIORITY: QualityCheckerCategory[] = ["custom", "vlm", "embedding", "rule"];

export interface QualityGateRunnerOptions {
  config?: QualityGateConfig;
  kinds?: QualityCheckInput["kind"][];
  skipCheckers?: string[];
}

export class QualityGateRunner {
  constructor(private readonly options: QualityGateRunnerOptions = {}) {}

  async run(input: QualityCheckInput, deps: QualityCheckerDeps = {}): Promise<QualityReport> {
    const startedAt = Date.now();
    const kinds = this.options.kinds ?? [input.kind];
    const items: QualityCheckResult[] = [];
    const standardsUsed: QualityReport["standardsUsed"] = {};

    try {
      for (const kind of kinds) {
        const candidates = getCheckersForKind(kind)
          .filter((c) => !this.options.skipCheckers?.includes(c.id))
          .sort((a, b) => CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category));

        if (candidates.length === 0) {
          standardsUsed[kind] = "skipped"; // 情形 A：无可用实现 → 跳过
          continue;
        }

        // 情形 B：能力降级但保持检查——取优先级最高的档执行
        const chosen = candidates[0]!;
        standardsUsed[kind] = chosen.category;
        try {
          const result = await chosen.run(input, deps);
          items.push(result);
        } catch (checkerError) {
          // 质检器自身抛错（违反 ok:false 约定）→ 按 skipped 处理，不中断
          standardsUsed[kind] = "skipped";
          deps.log?.(`[quality-gate] checker ${chosen.id} threw: ${String(checkerError)}`, "warn");
        }
      }
    } catch (runnerError) {
      // R192：编排器绝不 throw——返回 warn 空报告
      deps.log?.(`[quality-gate] runner error: ${String(runnerError)}`, "error");
      return {
        gate: "post-generation",
        providerId: input.provenance.providerId,
        modelId: input.provenance.modelId,
        passed: true,
        summary: "warn",
        items: [],
        standardsUsed: {},
        feedback: { accepted: null },
        durationMs: Date.now() - startedAt,
      };
    }

    const summary = this.aggregateSummary(items);
    return {
      gate: input.kind === "feature_anchor" ? "pre-planning" : "post-generation",
      providerId: input.provenance.providerId,
      modelId: input.provenance.modelId,
      passed: summary !== "fail",
      summary,
      items,
      standardsUsed,
      feedback: { accepted: null },
      durationMs: Date.now() - startedAt,
    };
  }

  /** 聚合：任一 fail 则 fail；有 warn 则 warn；否则 pass */
  private aggregateSummary(items: QualityCheckResult[]): "pass" | "warn" | "fail" {
    if (items.some((i) => i.ok && i.verdict === "fail")) return "fail";
    if (items.some((i) => i.ok && i.verdict === "warn")) return "warn";
    return "pass";
  }
}

/** 便捷工厂：默认配置的单例 runner */
export function createDefaultRunner(): QualityGateRunner {
  return new QualityGateRunner();
}
