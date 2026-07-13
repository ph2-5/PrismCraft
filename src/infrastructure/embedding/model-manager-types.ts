/**
 * 本地 Embedding 模型管理器 — 类型与常量定义
 *
 * 从 model-manager.ts 拆分而来，包含：
 * - 模型目录/文件名常量
 * - ONNX 候选文件名、必需文件、可选文件列表
 * - 完整性校验阈值
 * - 模型元信息、注册表、状态等接口定义
 *
 * 这些定义被 model-manager.ts / model-manager-integrity.ts 共享。
 */

// ============= 路径与文件名常量 =============

/** 模型目录名（相对于 cacheDir） */
export const MODEL_DIR = "models/embedding";

/** registry.json 文件名 */
export const REGISTRY_FILE_NAME = "registry.json";

/** registry 格式版本 */
export const REGISTRY_VERSION = 1;

// ============= 文件名候选常量 =============

/**
 * 候选 ONNX 模型文件名（按优先级排序）
 *
 * M1：支持标准名 + 常见量化变体。detectLocalModel 会按顺序查找第一个存在的文件。
 */
export const ONNX_FILE_CANDIDATES = [
  "model.onnx",
  "model_quantized.onnx",
  "model_fp16.onnx",
  "model_int8.onnx",
  "model_fp32.onnx",
  "model_q4.onnx",
  "model_q8.onnx",
] as const;

/**
 * 必需的非 ONNX 文件
 *
 * 这些文件名固定（不支持变体），缺失则模型不可用。
 */
export const REQUIRED_NON_ONNX_FILES = ["tokenizer.json", "config.json"] as const;

/**
 * 可选的辅助文件
 *
 * 存在则一并删除（清理时）；不存在则忽略。
 */
export const OPTIONAL_FILES = [
  "tokenizer_config.json",
  "special_tokens_map.json",
  "vocab.txt",
  "vocab.json",
  "merges.txt",
  "config.json.bak",
] as const;

// ============= 完整性校验阈值 =============

/** ONNX 文件最小大小（1KB），小于此值视为损坏 */
export const MIN_ONNX_SIZE = 1024;

/** ONNX/protobuf 文件 magic byte（field 1, varint wire type） */
export const PROTOBUF_MAGIC_BYTE = 0x08;

// ============= 类型定义 =============

/** 模型元信息 */
export interface EmbeddingModelInfo {
  modelName: string;
  dimensions: number;
  maxTokens: number;
  language: string;
  description: string;
  /** 模型文件完整路径（实际选中的 .onnx 文件，可能是量化变体） */
  modelPath: string;
  /** 模型文件名（如 "model.onnx" / "model_quantized.onnx"） */
  modelFileName: string;
  /** tokenizer 文件完整路径 */
  tokenizerPath: string;
  /** 模型目录完整路径（根目录或子目录） */
  directory: string;
}

/** 注册表中单个模型条目 */
export interface LocalModelEntry {
  /** 模型唯一 id（从 modelName 派生：小写 + 非 [a-z0-9-] 替换为 -） */
  id: string;
  /** 显示名称（来自 config.json） */
  modelName: string;
  dimensions: number;
  maxTokens: number;
  language: string;
  description: string;
  /** 模型文件所在目录（根目录或子目录，绝对路径） */
  directory: string;
  /** ONNX 文件名（如 "model.onnx"） */
  modelFileName: string;
  /** ONNX 文件完整路径 */
  modelPath: string;
  /** tokenizer 文件完整路径 */
  tokenizerPath: string;
  /** 添加时间戳（Date.now()） */
  addedAt: number;
}

/** 多模型注册表 */
export interface ModelRegistry {
  version: number;
  /** 当前启用模型 id（同一时间只有一个 active；null 表示无 active） */
  activeModelId: string | null;
  models: LocalModelEntry[];
}

/** 模型检测状态 */
export interface ModelStatus {
  available: boolean;
  info: EmbeddingModelInfo | null;
  /** 缺失的必需文件（相对路径） */
  missingFiles: string[];
  /**
   * 完整性校验失败列表（M3）
   *
   * 文件存在但内容不合法时填充，例如 ["config.json (缺少 dimensions)"]
   */
  integrityErrors: string[];
  directory: string;
  /** M5：当前 active 模型 id（null 表示无 active） */
  activeModelId: string | null;
  /** M5：所有已安装模型列表 */
  installedModels: LocalModelEntry[];
}
