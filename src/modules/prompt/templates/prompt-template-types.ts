/**
 * 提示词模板类型定义（提示词模板库）
 *
 * 设计目的：
 * - 提供用户可编辑的提示词模板系统，替代硬编码的提示词
 * - 支持变量插槽 {{character.name}}、{{scene.mood}} 等
 * - 按 category/style/target 分类，便于检索
 * - 内置高质量预设模板 + 用户自定义模板
 *
 * 与现有 template-tools.ts 的区别：
 * - template-tools.ts 管理的是「项目数据模板」（角色/场景/分镜预设组合）
 * - 本模块管理的是「提示词模板」（生成图片/视频时使用的 prompt 文本模板）
 */

/** 提示词模板类别 */
export type PromptTemplateCategory =
  | "character" // 角色生成
  | "scene" // 场景生成
  | "video" // 视频生成
  | "story" // 故事/分镜
  | "negative" // 负面提示词
  | "style" // 风格修饰
  | "custom"; // 用户自定义

/** 提示词目标类型（应用场景） */
export type PromptTemplateTarget =
  | "image" // 图片生成
  | "video" // 视频生成
  | "both"; // 通用

/** 提示词模板变量定义 */
export interface PromptTemplateVariable {
  /** 变量名（如 "character.name"） */
  name: string;
  /** 变量描述（用于 UI 提示） */
  description: string;
  /** 是否必填 */
  required?: boolean;
  /** 默认值（可选） */
  defaultValue?: string;
}

/** 提示词模板 */
export interface PromptTemplate {
  /** 唯一 ID（内置模板以 "builtin_" 前缀，用户模板以 "user_" 前缀） */
  id: string;
  /** 模板名称（显示用） */
  name: string;
  /** 模板描述 */
  description: string;
  /** 类别 */
  category: PromptTemplateCategory;
  /** 目标类型 */
  target: PromptTemplateTarget;
  /** 适用风格标签（如 ["anime", "cyberpunk"]） */
  styleTags?: string[];
  /** 适用模型标签（如 ["kling", "runway"]，空表示通用） */
  modelTags?: string[];
  /** 模板内容（含 {{变量名}} 插槽） */
  content: string;
  /** 负面提示词（可选，category=negative 时此字段为主内容） */
  negativePrompt?: string;
  /** 变量定义列表 */
  variables?: PromptTemplateVariable[];
  /** 是否内置（true=不可删除，false=用户自定义） */
  builtin: boolean;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 来源（如 "PromptHero"、"Civitai"、"用户自定义"） */
  source?: string;
  /** 评分（0-100，内置模板可有评分） */
  rating?: number;
}

/** 创建模板时的输入（省略 id/createdAt/updatedAt/builtin） */
export type CreatePromptTemplateInput = Omit<
  PromptTemplate,
  "id" | "createdAt" | "updatedAt" | "builtin"
> & { id?: string };

/** 模板存储数据结构 */
export interface PromptTemplateStoreData {
  version: 1;
  templates: PromptTemplate[];
}

/** 模板应用结果 */
export interface ApplyTemplateResult {
  /** 应用后的最终提示词（变量已替换） */
  prompt: string;
  /** 应用后的负面提示词（如有） */
  negativePrompt?: string;
  /** 未替换的变量列表（用户未提供值的必填变量） */
  missingVariables: string[];
}

/** 模板分类标签（用于 UI 展示） */
export const CATEGORY_LABELS: Record<PromptTemplateCategory, string> = {
  character: "角色生成",
  scene: "场景生成",
  video: "视频生成",
  story: "故事分镜",
  negative: "负面提示词",
  style: "风格修饰",
  custom: "自定义",
};

/** 目标类型标签 */
export const TARGET_LABELS: Record<PromptTemplateTarget, string> = {
  image: "图片",
  video: "视频",
  both: "通用",
};
