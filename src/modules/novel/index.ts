/**
 * Novel 模块入口 — 小说导入管道（Novel Import Pipeline）
 *
 * Phase 2A 一键成片管道的核心模块。三档渐进式复杂度：
 * - quick (3步)：项目初始化 → 内容导入 → 剧本化 → 生成
 * - standard (6步)：+ 角色管理 + 场景管理
 * - professional (8步)：+ 故事结构分析 + 节奏规划
 *
 * 当前状态（Task 2A.1 + 2A.2）：
 * - ✅ domain/types.ts — 15 个类型定义
 * - ✅ tools/ — 5 个 Novel Agent 工具
 * - ⏳ hooks/ — 管道状态管理（Task 2A.3-2A.5，待实施）
 * - ⏳ presentation/ — 管道 UI（Task 2A.6，待实施）
 * - ⏳ services/ — 故事结构分析 + 节奏规划（Task 2A.13/2A.14，待实施）
 *
 * 依赖方向：
 * - 仅依赖 @/domain/* + @/infrastructure/di + @/shared-logic/* + @/shared/*
 * - 不依赖其他 @/modules/*（match-entities 通过动态 import 调用 characterService/sceneService）
 */

// Domain 类型
export type {
  NovelSegment,
  ExtractedCharacter,
  ExtractedScene,
  ShotBreakdown,
  PipelineStage,
  PipelineConfig,
  Segment,
  CharacterVariant,
  CharacterInPipeline,
  SceneVariant,
  SceneInPipeline,
  SegmentPrompt,
  GenerationResult,
  PipelineState,
  NovelProject,
} from "./domain/types";

// Tools（5 个 Novel Agent 工具）
export {
  segmentNovelTextTool,
  extractCharactersFromTextTool,
  extractScenesFromTextTool,
  matchEntitiesTool,
  breakdownTextToShotsTool,
  novelTools,
} from "./tools";
