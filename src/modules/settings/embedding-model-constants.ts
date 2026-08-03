/**
 * Embedding 模型面板的共享常量、工具函数与类型
 *
 * 拆分自 EmbeddingModelPanelParts.tsx（P2.1 拆分超长组件文件）。
 *
 * 包含：
 * - 共享常量：RECOMMENDED_MODELS / REQUIRED_NON_ONNX_FILES / isAcceptedFile
 * - 共享类型：UploadProgressInfo / PrewarmProgressInfo
 */

import { ACCEPTED_ONNX_FILES } from "@/shared/embedding";

// ── 共享常量 ──

/**
 * 推荐模型预设（与 scripts/download-embedding-model.mjs 中的 MODEL_PRESETS 保持一致）。
 *
 * 用于在 UI 中展示下载引导，让用户知道有哪些可用模型以及如何下载。
 * 字段含义：
 * - repoId：HuggingFace 仓库 ID（下载命令和页面链接用）
 * - modelName：显示名
 * - language：语言
 * - dimensions：向量维度
 * - size：量化版大致体积（仅供参考）
 * - description：简短描述
 */
export const RECOMMENDED_MODELS = [
  {
    repoId: "Xenova/all-MiniLM-L6-v2",
    modelName: "all-MiniLM-L6-v2",
    language: "en",
    dimensions: 384,
    size: "~33MB",
    description: "轻量英文模型，体积小速度快（推荐）",
  },
  {
    repoId: "Xenova/bge-small-zh-v1.5",
    modelName: "bge-small-zh-v1.5",
    language: "zh",
    dimensions: 512,
    size: "~50MB",
    description: "轻量中文模型，适合中文记忆检索",
  },
  {
    repoId: "Xenova/multilingual-e5-small",
    modelName: "multilingual-e5-small",
    language: "multilingual",
    dimensions: 384,
    size: "~120MB",
    description: "多语言模型，支持中英混合场景",
  },
  {
    repoId: "Xenova/gte-small",
    modelName: "gte-small",
    language: "en",
    dimensions: 384,
    size: "~33MB",
    description: "英文模型，检索效果略优于 MiniLM",
  },
] as const;

/**
 * 必需的非 ONNX 文件（文件名固定，不支持变体）
 *
 * 注意：ONNX 候选文件名从 ACCEPTED_ONNX_FILES 动态引用，不在此处硬编码。
 */
export const REQUIRED_NON_ONNX_FILES = ["tokenizer.json", "config.json"] as const;

/**
 * 判断文件名是否为可接受的上传目标
 *
 * ONNX 候选任意一个 + 必需非 ONNX 文件
 */
export function isAcceptedFile(fileName: string): boolean {
  if (REQUIRED_NON_ONNX_FILES.includes(fileName as (typeof REQUIRED_NON_ONNX_FILES)[number])) {
    return true;
  }
  return (ACCEPTED_ONNX_FILES as readonly string[]).includes(fileName);
}

// ── 共享类型 ──

/** 上传进度信息 */
export interface UploadProgressInfo {
  current: number;
  total: number;
  fileName: string;
}

/** 预热进度信息 */
export interface PrewarmProgressInfo {
  current: number;
  total: number;
  message?: string;
}
