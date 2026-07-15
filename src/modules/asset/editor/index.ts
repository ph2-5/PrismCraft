/**
 * asset/editor 子域（Task 4.5 简单图片编辑）
 *
 * 公共 API：ImageEditorPanel 组件 + 服务层 Canvas 工具函数
 */

export { ImageEditorPanel, type ImageEditorPanelProps } from "./presentation/image-editor-panel";
export {
  type ColorAdjustments,
  type CropRect,
  type CropPreset,
  type Annotation,
  type AnnotationType,
  type TextAnnotation,
  type ArrowAnnotation,
  type RectAnnotation,
  DEFAULT_ADJUSTMENTS,
  CROP_PRESETS,
  applyColorAdjustments,
  rotateCanvas,
  cropCanvas,
  drawAnnotations,
  canvasToBlob,
  saveEditedImage,
  getEditorSaveDirectory,
} from "./services/image-editor";
