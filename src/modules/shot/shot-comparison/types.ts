/**
 * 分镜对比视图类型定义（Task 4.4）
 *
 * ShotVersion 表示同一分镜的一个生成版本（视频或关键帧）
 */

/** 版本类型 */
export type ShotVersionType = "video" | "keyframe";

/** 版本生成参数 */
export interface ShotVersionParameters {
  /** 模型名称 */
  model?: string;
  /** 时长（秒） */
  duration?: number;
  /** 分辨率（如 1080p） */
  resolution?: string;
  /** 风格 */
  style?: string;
  /** Provider ID */
  providerId?: string;
  /** Provider 模型 ID */
  providerModelId?: string;
}

/** 分镜的一个生成版本 */
export interface ShotVersion {
  /** 版本唯一标识 */
  versionId: string;
  /** 关联的视频任务 ID */
  taskId: string;
  /** 版本类型：视频 / 关键帧 */
  type: ShotVersionType;
  /** 资源 URL（videoUrl 或 keyframe imageUrl） */
  url: string;
  /** 生成时使用的提示词 */
  prompt: string;
  /** 生成参数 */
  parameters: ShotVersionParameters;
  /** 创建时间（ISO 字符串） */
  createdAt: string;
  /** 是否已归档（非正式版本） */
  isArchived?: boolean;
  /** 版本标签（用户自定义或自动生成如 v1/v2） */
  label?: string;
}

/** Diff 行类型 */
export interface DiffLine {
  /** 行内容 */
  text: string;
  /** 差异类型：相同/仅左侧/仅右侧 */
  type: "same" | "left" | "right";
  /** 行号（左侧） */
  leftLine?: number;
  /** 行号（右侧） */
  rightLine?: number;
}
