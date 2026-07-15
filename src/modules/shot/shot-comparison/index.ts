/**
 * shot-comparison 子域（Task 4.4 分镜对比视图）
 *
 * 公共 API：ShotCompareView + ComparePanel 组件 + 类型 + diff 工具
 */

export { ShotCompareView, type ShotCompareViewProps } from "./ShotCompareView";
export { ComparePanel, type ComparePanelProps } from "./ComparePanel";
export { diffText, countDifferences } from "./prompt-diff";
export type {
  ShotVersion,
  ShotVersionType,
  ShotVersionParameters,
  DiffLine,
} from "./types";
