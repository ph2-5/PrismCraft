/**
 * quality-gate/types.ts — 模型无关质检层核心类型（v0.2）
 *
 * 设计约束：本文件属 shared-logic，零外部依赖（仅相对导入），
 * 所有 I/O 通过 QualityCheckerDeps 注入，保持纯逻辑可测。
 */

/** 质检输入类型（kind 单独导出供 registry 路由） */
export type QualityCheckerInputKind =
  | "character_consistency"
  | "scene_consistency"
  | "continuity"
  | "artifact"
  | "feature_anchor";

/** 质检器类别：决定降级链与口径 */
export type QualityCheckerCategory =
  | "rule" // 规则引擎（确定性，零 I/O）
  | "embedding" // embedding 相似度（ONNX 本地推理）
  | "vlm" // 视觉大模型比对（远程）
  | "custom"; // 自研模型/企业私有质检器

/** 质检输入：模型无关（不绑定任何 provider） */
export interface QualityCheckInput {
  kind: QualityCheckerInputKind;
  /** 生成产物（首帧/中间帧/成品视频帧） */
  generated: { imageUrl?: string; videoUrl?: string };
  /** 参考素材 */
  references: Array<{ imageUrl: string; role: "character" | "scene" | "prop" }>;
  /** 特征锚定配置（结构化属性） */
  featureAnchors?: Record<string, unknown>;
  /** 生成上下文（provider/model，用于查阈值） */
  provenance: { providerId: string; modelId: string };
}

/** 单质检器输出（Result 风格判别联合） */
export type QualityCheckResult =
  | {
      ok: true;
      checkerId: string;
      category: QualityCheckerCategory;
      verdict: "pass" | "warn" | "fail";
      score: number;
      evidence: string;
      payload?: Record<string, unknown>;
    }
  | { ok: false; checkerId: string; category: QualityCheckerCategory; error: string };

/** 质检器依赖注入（保持纯逻辑零依赖的钥匙） */
export interface QualityCheckerDeps {
  analyzeImage?: (url: string, prompt: string) => Promise<{ ok: boolean; text?: string; error?: string }>;
  getFaceEmbedding?: (url: string) => Promise<{ ok: boolean; embedding?: number[]; error?: string }>;
  log?: (msg: string, level?: "info" | "warn" | "error") => void;
}

/** 质检器：单一职责单元 */
export interface QualityChecker {
  id: string;
  category: QualityCheckerCategory;
  /** 支持的检查项（供编排按 kind 路由） */
  supports: QualityCheckerInputKind[];
  run(input: QualityCheckInput, deps: QualityCheckerDeps): Promise<QualityCheckResult>;
}

/** 用户反馈槽（本期只留结构，不训练） */
export interface UserFeedbackSlot {
  accepted: boolean | null;
  reason?: string;
  timestamp?: number;
}

/**
 * 质检报告（v0.2：含 standardsUsed）
 * standardsUsed 记录每个检查项实际执行的档位标准（"custom"|"vlm"|"embedding"|"rule"|"skipped"），
 * 明确"本次判定用的是哪档标准"——降级不改变检查语义，但口径必须可追溯。
 */
export interface QualityReport {
  gate: "post-generation" | "pre-planning";
  providerId: string;
  modelId: string;
  passed: boolean;
  summary: "pass" | "warn" | "fail";
  items: QualityCheckResult[];
  standardsUsed: Record<string, QualityCheckerCategory | "skipped">;
  feedback: UserFeedbackSlot;
  durationMs?: number;
}

/** 编排器配置 */
export interface QualityGateConfig {
  default: { warnThreshold: number; failThreshold: number };
  perProvider?: Record<string, QualityThresholds>;
  perModel?: Record<string, QualityThresholds>;
}

export interface QualityThresholds {
  warnThreshold: number;
  failThreshold: number;
}
