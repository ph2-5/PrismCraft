/**
 * Novel Module — Domain Types
 *
 * 故事创作流水线的所有领域类型定义。
 * 零依赖原则：本文件只导入 @/domain/schemas 的纯类型，不导入 modules 或 infrastructure。
 *
 * 对应 Task: 2A.1
 * 设计文档: docs/story-pipeline-design.md
 */

import type { CharacterAppearance } from "@/domain/schemas/character";

// ============================================================
// Segment（文本片段）
// ============================================================

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

// ============================================================
// ExtractedCharacter / ExtractedScene（提取的角色/场景）
// ============================================================

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

// ============================================================
// ShotBreakdown（分镜拆解）
// ============================================================

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
}

// ============================================================
// PipelineStage / PipelineConfig / PipelineState（流水线状态机）
// ============================================================

/**
 * 流水线阶段。
 *
 * v5.1 更新：加入 structure_analysis（Task 2A.13）和 pacing_planning（Task 2A.14）。
 * 在 quick/standard 模式可跳过这两个阶段，professional 模式必须经过。
 */
export type PipelineStage =
  | "project_init"        // Phase 1: 项目初始化
  | "content_import"      // Phase 2: 内容导入与分割
  | "structure_analysis"  // Phase 2.5: 故事结构分析（v5.1 新增，Task 2A.13）
  | "pacing_planning"     // Phase 2.6: 节奏规划（v5.1 新增，Task 2A.14）
  | "character_manage"    // Phase 3: 角色管理
  | "scene_manage"        // Phase 4: 场景管理
  | "review"              // Phase 5: 检查与调优
  | "storyboard"          // Phase 6: 剧本化（Prompt 合成）
  | "generation"          // Phase 7: 生成
  | "done";

/**
 * AI 辅助程度三档模式（v5.1 新增，Task 2A.16）。
 *
 * - quick: 快速模式，3 步走通（导入 → 角色 → 生成）
 * - standard: 标准模式，7 Phase 完整可见（跳过 structure + pacing）
 * - professional: 专业模式，完整 10 步
 */
export type AIAssistLevel = "quick" | "standard" | "professional";

export interface PipelineConfig {
  mode: "auto" | "semi";
  aiAssistLevel: AIAssistLevel;
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

export interface PipelineState {
  stage: PipelineStage;
  step: number;            // 当前子步骤 (1-10)
  config: PipelineConfig;
  rawText: string;
  segments: NovelSegment[];     // 分割后的片段列表
  currentSegmentIndex: number;
  characters: ExtractedCharacter[];   // 角色（含变体）
  scenes: ExtractedScene[];           // 场景（含变体）
  characterImportance: Record<string, "P0" | "P1" | "P2" | "P3">;
  prompts: SegmentPrompt[];            // 每个片段的合成 Prompt
  generationResults: GenerationResult[];
  storyId?: string;
  error?: string;
}

// ============================================================
// NovelProject（持久化到 DB 的项目）
// ============================================================

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

// ============================================================
// 辅助类型（Prompt / Generation）
// ============================================================

export interface SegmentPrompt {
  segmentId: string;
  zh: string;
  en: string;
  status: "draft" | "edited" | "final";
}

export interface GenerationResult {
  segmentId: string;
  imageUrl?: string;
  videoUrl?: string;
  status: "pending" | "generating" | "completed" | "failed";
  error?: string;
}
