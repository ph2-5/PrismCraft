/**
 * Novel Pipeline Domain Types (Task 2A.1)
 *
 * 小说导入管道的所有领域类型定义（10步流水线）。
 * 三档渐进式复杂度：quick (3步) / standard (6步) / professional (8步)。
 *
 * v5.1 增强：
 * - PipelineStage 新增 structure_analysis / pacing_planning（professional 模式必经）
 * - PipelineConfig 新增 aiAssistLevel（quick/standard/professional）
 *
 * v5.4 协同：
 * - 后续 Task 2A.23 一致性 QC 闭环将通过 PipelineState 引用 ShotBreakdown.qcReport 进行漂移检测
 *
 * 依赖方向（contract.json）：
 * - 仅依赖 @/domain/schemas/character（CharacterAppearance）
 * - 不依赖任何 infrastructure / modules / shared-logic
 */

import type { CharacterAppearance } from "@/domain/schemas/character";

// ============================================================================
// 1. 基础实体类型
// ============================================================================

/**
 * 小说分段（基础单元）。
 * 一段 ≈ 一个视频分镜单元，对应 PipelineState.segments[] 一项。
 */
export interface NovelSegment {
  id: string;
  title: string;
  summary: string;
  startChar: number;
  endChar: number;
  estimatedDuration: number;
  keyEvents: string[];
  text: string;
}

/**
 * 从小说文本中提取的角色（未持久化）。
 * 通过 match-entities 工具与现有 Character 库匹配后，status 流转为 matched/conflict。
 */
export interface ExtractedCharacter {
  tempId: string;
  name: string;
  gender: string;
  age?: number;
  description: string;
  appearance: CharacterAppearance;
  personality: string[];
  firstAppearance: string;
  matchedCharacterId?: string;
  matchConfidence?: number;
  status: "new" | "matched" | "conflict";
  confirmed: boolean;
}

/**
 * 从小说文本中提取的场景（未持久化）。
 * 通过 match-entities 工具与现有 Scene 库匹配后，status 流转为 matched/conflict。
 */
export interface ExtractedScene {
  tempId: string;
  name: string;
  type: string;
  description: string;
  atmosphere: string;
  timeOfDay: string;
  location: string;
  matchedSceneId?: string;
  matchConfidence?: number;
  status: "new" | "matched" | "conflict";
  confirmed: boolean;
}

/**
 * 分镜拆解（单片段 → 多分镜）。
 * v5.4: shotType / qcReport 字段为 Task 2A.23 一致性 QC 闭环预留（全部 optional）。
 */
export interface ShotBreakdown {
  id: string;
  sequence: number;
  description: string;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  action: string;
  characters: string[];
  sceneId?: string;
  estimatedDuration: number;
  prompt?: {
    en: string;
    zh: string;
  };
  status: "draft" | "edited" | "final";
  // === v5.4 Task 2A.23 一致性 QC 闭环预留字段（Task 2A.23 实施时追加，全部 optional） ===
  // shotStrategy?: "continuous_action" | "angle_switch" | "scene_transition";
  // qcReport?: QCReport;  ← 类型定义见 Task 2A.23 的 domain/qc-schema.ts
}

// ============================================================================
// 2. 管道状态机类型
// ============================================================================

/**
 * 管道阶段（单向流动：project_init → done）。
 *
 * v5.1 流转顺序：
 *   project_init → content_import → [structure_analysis] → [pacing_planning]
 *   → character_manage → scene_manage → review → storyboard → generation → done
 *
 * structure_analysis / pacing_planning 在 quick/standard 模式可跳过；
 * professional 模式必须经过（由 getStagesForMode 决定）。
 */
export type PipelineStage =
  | "project_init"        // 阶段 1: 项目初始化
  | "content_import"      // 阶段 2: 内容导入与分割
  | "structure_analysis"  // 阶段: 故事结构分析（v5.1 新增，Task 2A.13）
  | "pacing_planning"     // 阶段: 节奏规划（v5.1 新增，Task 2A.14）
  | "character_manage"    // 阶段 3: 角色管理
  | "scene_manage"        // 阶段 4: 场景管理
  | "review"              // 阶段 5: 检查与调优
  | "storyboard"          // 阶段 6: 剧本化（Prompt 合成）
  | "generation"          // 阶段 7: 生成
  | "done";

/**
 * 管道配置。
 * v5.1: 新增 aiAssistLevel 三档模式（Task 2A.16 渐进式复杂度）。
 */
export interface PipelineConfig {
  mode: "auto" | "semi";
  aiAssistLevel: "quick" | "standard" | "professional";  // v5.1 新增（Task 2A.16 三档模式）
  projectName: string;
  style: string;           // 风格标签（古装/现代/科幻/奇幻等）
  format: string;          // 小说/剧本/大纲/模板
  aiModel: string;         // 使用的 AI 模型
  targetLanguage?: "zh" | "en";
  autoCreateEntities: boolean;
  gates: {
    confirmSegments: boolean;
    confirmEntities: boolean;
    confirmShots: boolean;
    confirmPrompts: boolean;
  };
}

// ============================================================================
// 3. 管道辅助类型（PipelineState 引用）
// ============================================================================

/**
 * 管道中的片段（NovelSegment + 管道元数据）。
 * 当前定义为 NovelSegment 的扩展，后续 Task 可追加字段。
 */
export interface Segment extends NovelSegment {
  // 预留：shots?: ShotBreakdown[];（Task 2A.6 剧本化阶段填充）
  // 预留：staleness?: "fresh" | "stale" | "dirty";（Task 2A.17 过期标记）
}

/**
 * 角色变体（同角色在不同时间线/状态下的外观）。
 * v5.1: 用于角色化产出（Task 2A.14）与故事时间线变体系统（Phase 4.6）。
 */
export interface CharacterVariant {
  id: string;
  name: string;            // 变体名（如"少年"、"老年"、"战损"）
  promptFragment: string;  // 英文 prompt 片段
  referenceImagePath?: string;
  // 8 维参数向量（与 SceneVariant 一致）
  timeOfDay?: string;
  weather?: string;
  lighting?: string;
  mood?: string;
  crowdLevel?: string;
  cameraAngle?: string;
  season?: string;
  colorPalette?: string;
}

/**
 * 管道中的角色（ExtractedCharacter + 变体列表）。
 */
export interface CharacterInPipeline extends ExtractedCharacter {
  variants: CharacterVariant[];
  /** 角色重要性（v5.1: 多维权重计算） */
  importance?: "P0" | "P1" | "P2" | "P3";
}

/**
 * 场景变体（同场景在不同状态下的外观）。
 * v5.1: 8 维参数向量描述（timeOfDay/weather/lighting/mood/crowdLevel/cameraAngle/season/colorPalette）。
 */
export interface SceneVariant {
  id: string;
  name: string;
  promptFragment: string;
  referenceImagePath?: string;
  // 8 维参数向量
  timeOfDay?: string;
  weather?: string;
  lighting?: string;
  mood?: string;
  crowdLevel?: string;
  cameraAngle?: string;
  season?: string;
  colorPalette?: string;
}

/**
 * 管道中的场景（ExtractedScene + 变体列表）。
 */
export interface SceneInPipeline extends ExtractedScene {
  variants: SceneVariant[];
}

/**
 * 单片段合成 Prompt。
 * v5.1: 升级为分层式（核心层 + 增强层 + 风格层）。
 */
export interface SegmentPrompt {
  segmentId: string;
  en: string;
  zh: string;
  /** v5.1: 分层式 Prompt 合成（核心层 + 增强层 + 风格层） */
  layers?: {
    core: string;          // 核心层：片段描述 + 角色 promptFragment
    enhanced?: string;     // 增强层：场景变体 + 镜头语言
    style?: string;        // 风格层：项目风格 + 全局风格修饰
  };
}

/**
 * 单片段生成结果。
 */
export interface GenerationResult {
  segmentId: string;
  status: "pending" | "generating" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  /** v5.4: 关联的 StoryBeat ID（用于一致性 QC 闭环追踪） */
  storyBeatId?: string;
}

// ============================================================================
// 4. 管道状态 & 项目持久化
// ============================================================================

/**
 * 管道状态（持久化到 SQLite）。
 *
 * 不变量：
 * - stage 从 project_init → done 单向流动（不可回退，但子步骤可重做）
 * - step 在 stage 内从 1 递增，跨 stage 时重置为 1
 * - 上游 stage 产出变化时，必须通过 stalenessTracker 标记下游 stage 为 stale（Task 2A.17）
 */
export interface PipelineState {
  stage: PipelineStage;
  step: number;            // 当前子步骤 (1-10)
  config: PipelineConfig;
  rawText: string;
  segments: Segment[];     // 分割后的片段列表
  currentSegmentIndex: number;
  characters: CharacterInPipeline[];   // 角色（含变体）
  scenes: SceneInPipeline[];           // 场景（含变体）
  characterImportance: Record<string, "P0" | "P1" | "P2" | "P3">;
  prompts: SegmentPrompt[];            // 每个片段的合成 Prompt
  generationResults: GenerationResult[];
  storyId?: string;
  error?: string;
}

/**
 * 小说导入项目（持久化到 DB）。
 * 用户可同时进行多个导入项目，每个项目保存完整的 PipelineState。
 */
export interface NovelProject {
  id: string;
  title: string;
  rawText: string;
  state: PipelineState;
  createdAt: number;
  updatedAt: number;
}
