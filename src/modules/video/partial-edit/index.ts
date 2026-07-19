/**
 * Task 2A.22: partial-edit 模块公共 API
 *
 * 局部重绘编辑 — 在已生成视频上做局部重绘，保持 mask 外像素不变
 *
 * 设计要点：
 * - 不改 provider.generateVideo() — 隔离新功能
 * - taskSubtype='partial_redraw' 与普通视频生成隔离
 * - 原视频 Asset 不修改，重绘结果作为新 Asset 保存
 *
 * 公共 API：
 *   PartialEditPanel    — 主面板组件（视频 + 工具栏）
 *   startPartialEditTask — 启动局部重绘任务
 *   encodeMask          — MaskConfig → base64 PNG
 *   buildPartialEditPrompt — 局部重绘 prompt 模板
 *
 * 详见 MODULE.md
 */

// ─── Domain 层（类型 + 工厂函数 + 校验） ────────────────────────────────────

export type {
  RectangleShape,
  PolygonShape,
  BrushShape,
  MaskShape,
  MaskConfig,
  MaskBounds,
} from "./domain/mask-types";

export {
  createEmptyMaskConfig,
  isValidMaskShape,
  isValidMaskConfig,
  computeMaskBounds,
  createRectangle,
  createPolygon,
  createBrush,
  addShape,
  popShape,
  clearShapes,
  toggleInverse,
} from "./domain/mask-types";

export type {
  PartialEditRequest,
  PartialEditResult,
  PartialEditValidationError,
  FaceSwapRequest,
  FaceSwapValidationError,
} from "./domain/edit-schema";

export {
  createPartialEditRequest,
  validatePartialEditRequest,
  isValidPartialEditRequest,
  validateFaceSwapRequest,
  isValidFaceSwapRequest,
} from "./domain/edit-schema";

// ─── Services 层 ────────────────────────────────────────────────────────────

export type {
  MaskEncodeError,
  MaskEncodeSuccess,
  MaskEncodeOptions,
} from "./services/mask-encoder";

export {
  encodeMask,
  encodeMaskSync,
  estimateBase64Size,
  isMaskSizeValid,
} from "./services/mask-encoder";

export type {
  PromptStrictness,
  PromptBuilderOptions,
} from "./services/prompt-builder";

export {
  buildPartialEditPrompt,
  buildSimplePrompt,
  detectLanguage,
  isEmptyPrompt,
  isPromptTooLong,
  truncatePrompt,
  containsSensitiveContent,
  estimateTokenCount,
} from "./services/prompt-builder";

export type {
  PartialEditServiceError,
  PartialEditServiceResult,
} from "./services/partial-edit-service";

export {
  startPartialEditTask,
  startFaceSwapTask,
  savePartialEditAsset,
  listPartialEditHistory,
} from "./services/partial-edit-service";

// ─── Presentation 层 ────────────────────────────────────────────────────────

export { PartialEditPanel } from "./presentation/PartialEditPanel";
export type { PartialEditPanelProps } from "./presentation/PartialEditPanel";

export { VideoMaskCanvas } from "./presentation/VideoMaskCanvas";
export type { VideoMaskCanvasProps } from "./presentation/VideoMaskCanvas";

export { MaskToolbar } from "./presentation/MaskToolbar";
export type { MaskToolbarProps, MaskTool } from "./presentation/MaskToolbar";

export { EditPromptInput } from "./presentation/EditPromptInput";
export type { EditPromptInputProps } from "./presentation/EditPromptInput";

export { EditHistoryList } from "./presentation/EditHistoryList";
export type { EditHistoryListProps } from "./presentation/EditHistoryList";

// ─── Hook ────────────────────────────────────────────────────────────────────

export { usePartialEdit } from "./presentation/use-partial-edit";
export type { UsePartialEditResult } from "./presentation/use-partial-edit";
