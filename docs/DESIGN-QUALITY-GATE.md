# 模型无关质检层（Quality Gate Layer）架构设计

> 状态：**设计草案 v0.2**（评审修订版，重建于 2026-08-06 对象库事故后）
> 依据：`tasks/prismcraft-quality-gate-design.md` 任务书

---

## 1. 分层归属决策

### 推荐：`src/shared-logic/quality-gate/`（零依赖纯逻辑层）

| 候选位置 | 推荐度 | 理由 |
|---|---|---|
| **`shared-logic/quality-gate/`** | ★★★★★ 推荐 | 见下方论证 |
| `modules/shot/` 子域扩展 | ★★★ | 会被 workflow-executor 与 shot 双向引用 → 模块间依赖违规（lint:arch）；模块层无法被主进程复用 |
| `modules/video/consistency-qc/` 扩展 | ★★ | 该模块是"视频任务级 QC 面板/执行层"，职责是展示与触发，不是编排抽象 |

**论证**：
1. **复用面**：质检编排需同时服务于 `modules/shot`、`modules/workflow`、主进程（SaaS 化）。`shared-logic` 零依赖、双向复用是唯一满足的位置——与 `director-rules.ts` 同构。
2. **依赖方向**：`shared-logic` 只允许相对导入 → 质检层保持"纯函数 + 依赖注入"（I/O 由调用方注入，同 `visual-consistency-check.ts` 的 `apiGateway` 参数模式）。
3. **与 consistency-qc 的关系**：`modules/video/consistency-qc/` = 执行/展示层（ONNX/VLM/QC 面板）——保留不动；`shared-logic/quality-gate/` = 编排/注册层——新增；衔接：把 `runQualityCheck` **包装成一个 QualityChecker** 接入，不重复实现。

## 2. 核心接口草案（v0.2）

```ts
// shared-logic/quality-gate/types.ts —— 纯类型，零依赖，仅相对导入

export type QualityCheckerInputKind =
  | "character_consistency" | "scene_consistency" | "continuity" | "artifact" | "feature_anchor";

export type QualityCheckerCategory = "rule" | "embedding" | "vlm" | "custom";

export interface QualityCheckInput {
  kind: QualityCheckerInputKind;
  generated: { imageUrl?: string; videoUrl?: string };
  references: Array<{ imageUrl: string; role: "character" | "scene" | "prop" }>;
  featureAnchors?: Record<string, unknown>;
  provenance: { providerId: string; modelId: string };
}

export type QualityCheckResult =
  | { ok: true; checkerId: string; category: QualityCheckerCategory;
      verdict: "pass" | "warn" | "fail"; score: number; evidence: string;
      payload?: Record<string, unknown> }
  | { ok: false; checkerId: string; category: QualityCheckerCategory; error: string };

export interface QualityCheckerDeps {
  analyzeImage?: (url: string, prompt: string) => Promise<{ ok: boolean; text?: string; error?: string }>;
  getFaceEmbedding?: (url: string) => Promise<{ ok: boolean; embedding?: number[]; error?: string }>;
  log?: (msg: string, level?: "info" | "warn" | "error") => void;
}

export interface QualityChecker {
  id: string;
  category: QualityCheckerCategory;
  supports: QualityCheckerInputKind[];
  run(input: QualityCheckInput, deps: QualityCheckerDeps): Promise<QualityCheckResult>;
}

export interface UserFeedbackSlot { accepted: boolean | null; reason?: string; timestamp?: number; }

/** v0.2：含 standardsUsed——记录每个检查项实际执行的档位标准 */
export interface QualityReport {
  gate: "post-generation" | "pre-planning";
  providerId: string; modelId: string;
  passed: boolean;
  summary: "pass" | "warn" | "fail";
  items: QualityCheckResult[];
  standardsUsed: Record<string, QualityCheckerCategory | "skipped">;
  feedback: UserFeedbackSlot;
  durationMs?: number;
}
```

## 3. 质检器注册机制（与 executor 注册表同构）

```ts
const checkerRegistry = new Map<string, QualityCheckerFactory>();
export function registerQualityChecker(id: string, factory: QualityCheckerFactory): void;
export function getQualityChecker(id: string): QualityChecker | undefined;
export function getAllCheckers(): QualityChecker[];
export function getCheckersForKind(kind: QualityCheckerInputKind): QualityChecker[];

export const BUILTIN_CHECKERS = [
  ruleCharacterConsistency, ruleSceneConsistency, ruleArtifactScan,
  // P2: embeddingFaceConsistency（包装 ONNX）、vlmVisualConsistency（包装 checkVisualConsistency）
];
```

- 内置注册 `registerBuiltinCheckers()`（启动时一次）；
- 外部质检器（自研模型）走 **code-plugin**（复用 plugin-worker 沙箱），经适配器注册进 QualityGateRegistry——provider（生成）与 checker（质检）两套注册并行。

## 4. 双时机接入点

### 4.1 生成后（Post-generation）——API 演进策略（v0.2）
- **新增** `checkWithQualityGate(input): Promise<Result<QualityReport>>`（全量信息：多 checker 明细 + standardsUsed + feedback）；
- **旧 API** `checkVisualConsistency`（Result 版）标记 `@deprecated`，内部调新 API 映射回旧结构，仅供存量调用方过渡；
- **清理计划**：P2 迁移全部调用方（workflow-executor:332、use-frame-pair-generator:99、use-beat-detail-actions:154）后移除旧 API；
- **不维护中间映射态**（避免两套结构同步维护的漂移）。

### 4.2 生成前（Pre-planning，P3.5 方向）
`run(input, { mode: "pre-planning" })`：只用零 I/O 的 rule 类质检器（特征锚定配置 + 参考图质量 + 跨镜规则），生成前给出风险预判。接入点：`shot-contract-builder`。

## 5. 阈值与反馈闭环

- `resolveThresholds(providerId, modelId, config)`：perModel > perProvider > default（不同模型质量基线不同，硬编码单一阈值必然误伤）；
- `QualityReport.feedback` 预留确认/否决结构；落库走 `quality_feedback` 表（本期只留数据接口，不训练，保留导出路径供未来微调）。

## 6. 失败语义（v0.2 修订）

### 6.0 降级链语义修正
降级链各档**检查的不是同一件事**（custom 分数与 rule 判定不是同一分布）。分两种情形：
- **情形 A**：检查项无任何可用实现 → **跳过**（`verdict: skipped`），不参与 gate 判定；
- **情形 B**：检查项有多档实现可选 → **能力降级但保持检查**——按优先级（custom > vlm > embedding > rule）选一档，verdict 以所选档为准；
- **关键原则**：不跨语义强制替换（rule 不能冒充 custom）；`standardsUsed` 让消费方明确"本次 fail 基于哪档标准"。

### 6.1 失败场景表
| 场景 | 语义 |
|---|---|
| 质检器 `ok:false` | 按情形 A 跳过（不中断、不串档）；全部不可用则 warn 空结果放行 |
| verdict = warn | 软提醒：流程继续 + 记录 + UI 黄标 |
| verdict = fail | 硬阻断：任务标记"需确认"，UI 弹确认（放行写入 feedback） |
| VLM/ONNX 未配置 | 对应项 skipped，报告标注 |
| 编排器自身异常 | 返回 warn 空报告 + errorLogger，**绝不 throw**（R192） |

## 7. 测试策略（Vitest）

- 纯逻辑（编排/注册/降级/阈值）：`shared-logic/quality-gate/__tests__/`；
- rule checker 阈值边界（warn/fail 临界值）；
- 集成（mock deps）：注入 fake analyzeImage/getFaceEmbedding 验证降级与报告聚合；
- 模块衔接：checkVisualConsistency 升级后签名/行为不回归；
- 新守卫：**R192 quality-gate-no-throw / R193 downgrade-chain / R194 threshold-resolution**。

## 8. 改造工作量估算（v0.2 修订：原 3-5 周偏乐观）

| 阶段 | 内容 | 工作量 |
|---|---|---|
| **P0** | types/registry/runner + 3 rule checker + 测试 | **2 周** |
| **P1** | checkWithQualityGate + 旧 API deprecated + workflow 节点切换 + 阈值 + feedback 落库 | **2-3 周** |
| **P2** | VLM/embedding checker + code-plugin 适配器（单独排期） | **2-3 周** |
| **合计** | | **6-8 周** |

> 修订说明：按项目历史（全量回归 7 分钟+ + e2e），3-5 周低估了回归与适配成本。

**与既有路线衔接**：`OPTIMIZATION-PLAN.md` 待补充"模型无关质检层"章节（v0.2 起随设计一起排入待办）。
