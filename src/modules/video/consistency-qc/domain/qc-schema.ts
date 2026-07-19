/**
 * Task 2A.23: QC Report 数据结构
 *
 * QCReport 是一致性 QC 闭环的核心输出：
 * - 视频生成完成后自动触发 QC
 * - 抽帧 → embedding → 与角色参考图比对 → 生成 QCReport
 * - 按 verdict 触发动作（重生成 / face-swap / 标记人工审核）
 * - 持久化于 StoryBeat.qcReport
 *
 * 纯类型 + 工厂函数 + 聚合计算 — 无外部依赖，可单元测试。
 */

/** QC 判定结果 */
export type Verdict = "pass" | "drift_warning" | "drift_critical";

/** QC 触发的动作 */
export type ActionTaken = "none" | "regenerated" | "face_swapped" | "manual_review";

/** 帧级相似度评分 */
export interface FrameScore {
  /** 帧索引（0-based） */
  frameIndex: number;
  /** 时间戳（秒） */
  timestamp: number;
  /** 余弦相似度 [0, 1]，1 = 完全一致 */
  cosineSimilarity: number;
  /** 是否检测到人脸/角色特征 */
  faceDetected: boolean;
}

/** QC 报告 */
export interface QCReport {
  /** 关联的 VideoTask ID */
  videoTaskId: string;
  /** 关联的角色 ID（可选，多角色场景下为主角色） */
  characterId?: string;
  /** 视频总帧数（信息字段，用于展示） */
  totalFrames: number;
  /** 实际抽帧数量 */
  sampledFrames: number;
  /** 帧级相似度评分列表 */
  frameScores: FrameScore[];
  /** 平均相似度 */
  averageScore: number;
  /** 最低相似度（漂移最严重的帧） */
  minScore: number;
  /** 判定结果 */
  verdict: Verdict;
  /** 已采取的动作 */
  actionTaken: ActionTaken;
  /** QC 执行时间 ISO 字符串 */
  createdAt: string;
  /** 使用的分镜策略（可选） */
  strategy?: string;
  /** 重试次数（regenerate/face-swap 累计） */
  retryCount?: number;
  /** 错误信息（QC 执行失败时填充） */
  error?: string;
}

/** 创建空 QCReport（用于初始化或错误场景） */
export function createEmptyQCReport(videoTaskId: string): QCReport {
  return {
    videoTaskId,
    totalFrames: 0,
    sampledFrames: 0,
    frameScores: [],
    averageScore: 0,
    minScore: 0,
    verdict: "pass",
    actionTaken: "none",
    createdAt: new Date().toISOString(),
  };
}

/** 计算帧级相似度的聚合统计（平均值、最小值） */
export function computeAggregates(frameScores: FrameScore[]): {
  averageScore: number;
  minScore: number;
} {
  if (frameScores.length === 0) {
    return { averageScore: 0, minScore: 0 };
  }
  const sum = frameScores.reduce((acc, fs) => acc + fs.cosineSimilarity, 0);
  const averageScore = sum / frameScores.length;
  const minScore = frameScores.reduce(
    (min, fs) => Math.min(min, fs.cosineSimilarity),
    frameScores[0]!.cosineSimilarity,
  );
  return { averageScore, minScore };
}

/**
 * 根据最低相似度和策略判定 verdict。
 *
 * - minScore >= warningThreshold → 'pass'
 * - minScore >= criticalThreshold → 'drift_warning'
 * - minScore < criticalThreshold → 'drift_critical'
 */
export function determineVerdict(
  minScore: number,
  policy: { warningThreshold: number; criticalThreshold: number },
): Verdict {
  if (minScore >= policy.warningThreshold) return "pass";
  if (minScore >= policy.criticalThreshold) return "drift_warning";
  return "drift_critical";
}

/**
 * 判断 verdict 是否需要触发 fallback 动作。
 * 仅 'drift_critical' 触发，'drift_warning' 仅记录不动作。
 */
export function shouldTriggerFallback(verdict: Verdict): boolean {
  return verdict === "drift_critical";
}

/**
 * 判断 QCReport 是否已完成（非错误状态）。
 */
export function isQCReportComplete(report: QCReport): boolean {
  return !report.error && report.sampledFrames > 0;
}
