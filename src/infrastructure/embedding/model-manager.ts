/**
 * 本地 Embedding 模型管理器（M5 多模型管理）
 *
 * 职责：
 * - 管理 <cacheDir>/models/embedding/ 下的多模型注册表（registry.json）
 * - 检测当前 active 模型状态（含完整性校验）
 * - 安装 / 删除 / 切换 / 列出 模型
 * - 提供向后兼容的单模型 API（detectLocalModel / deleteLocalModel）
 *
 * 目录结构（软迁移）：
 * <cacheDir>/models/embedding/
 *   ├── registry.json              ← 多模型注册表（M5 新增）
 *   ├── model.onnx                 ← 旧模型文件（兼容，根目录）
 *   ├── tokenizer.json
 *   ├── config.json
 *   ├── <modelId-1>/               ← 新模型子目录（M5 新安装）
 *   │   ├── model.onnx
 *   │   ├── tokenizer.json
 *   │   └── config.json
 *   └── <modelId-2>/
 *       └── ...
 *
 * 软迁移策略：首次 detectLocalModel 发现根目录有完整模型文件但无 registry.json 时，
 * 不移动文件，只创建 registry.json，把根目录模型注册为 active 模型
 * （directory 字段记录为根目录）。后续新安装的模型放到子目录。
 *
 * 完整性校验（M3，保留）：
 * - ONNX 文件：检查前 8 字节是否为 ONNX/protobuf 格式（0x08 开头或大小 > 1KB）
 * - tokenizer.json：必须是合法 JSON 且包含 model.model_type 或 vocab 字段
 * - config.json：必须包含 modelName（string）和 dimensions（正整数）
 */

import { getCacheDirectory, fileExists, readFile, writeFile, deleteFile } from "@/shared/file-http";
import { errorLogger } from "@/shared/error-logger";

/** 模型目录名（相对于 cacheDir） */
const MODEL_DIR = "models/embedding";

/** registry.json 文件名 */
const REGISTRY_FILE_NAME = "registry.json";

/** registry 格式版本 */
const REGISTRY_VERSION = 1;

/**
 * 候选 ONNX 模型文件名（按优先级排序）
 *
 * M1：支持标准名 + 常见量化变体。detectLocalModel 会按顺序查找第一个存在的文件。
 */
const ONNX_FILE_CANDIDATES = [
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
const REQUIRED_NON_ONNX_FILES = ["tokenizer.json", "config.json"] as const;

/**
 * 可选的辅助文件
 *
 * 存在则一并删除（清理时）；不存在则忽略。
 */
const OPTIONAL_FILES = [
  "tokenizer_config.json",
  "special_tokens_map.json",
  "vocab.txt",
  "vocab.json",
  "merges.txt",
  "config.json.bak",
] as const;

/** ONNX 文件最小大小（1KB），小于此值视为损坏 */
const MIN_ONNX_SIZE = 1024;

/** ONNX/protobuf 文件 magic byte（field 1, varint wire type） */
const PROTOBUF_MAGIC_BYTE = 0x08;

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

// ============= active 模型变更回调（供 provider 注册） =============

/**
 * active 模型变更回调（模块级单例）
 *
 * local-embedding-provider 启动时注册此回调，以便在切换/删除 active 模型时
 * 清空 pipeline 缓存，下次调用重新加载新模型。
 */
let _onActiveModelChange: ((newId: string | null) => void) | null = null;

/**
 * 注册 active 模型变更回调（仅 local-embedding-provider 使用）
 *
 * 传入 null 可注销回调。
 */
export function _setActiveModelChangeCallback(
  cb: ((newId: string | null) => void) | null,
): void {
  _onActiveModelChange = cb;
}

/** 触发 active 模型变更回调 */
function notifyActiveModelChange(newId: string | null): void {
  try {
    _onActiveModelChange?.(newId);
  } catch (e) {
    errorLogger.warn("[model-manager] active 模型变更回调异常:", e instanceof Error ? e.message : e);
  }
}

/**
 * 获取模型目录的完整路径（embedding 根目录）
 */
export async function getModelDirectory(): Promise<string> {
  const result = await getCacheDirectory();
  if (!result.success || !result.path) {
    throw new Error("Failed to get cache directory");
  }
  // 规范化路径分隔符
  const cacheDir = result.path.replace(/\\/g, "/");
  return `${cacheDir}/${MODEL_DIR}`;
}

/** 获取 registry.json 完整路径 */
async function getRegistryPath(): Promise<string> {
  const dir = await getModelDirectory();
  return `${dir}/${REGISTRY_FILE_NAME}`;
}

// ============= 内部辅助：文件查找 =============

/**
 * 在候选 ONNX 文件名中查找第一个存在的文件
 *
 * M1：按 ONNX_FILE_CANDIDATES 顺序尝试，找到即返回。
 * 支持用户拖入量化变体（model_quantized.onnx 等）。
 *
 * @returns { path, fileName } 或 null（无任何 ONNX 文件）
 */
async function findOnnxFile(
  dir: string,
): Promise<{ path: string; fileName: string } | null> {
  for (const fileName of ONNX_FILE_CANDIDATES) {
    const filePath = `${dir}/${fileName}`;
    if (await fileExists(filePath)) {
      return { path: filePath, fileName };
    }
  }
  return null;
}

// ============= 内部辅助：完整性校验（M3，保留） =============

/**
 * 校验 ONNX 文件完整性
 *
 * ONNX 文件是 protobuf 序列化格式：
 * - 第一个字节通常是 0x08（field 1, varint wire type）
 * - 或文件大小 > 1KB（保守阈值，避免空文件/损坏文件）
 *
 * @returns 错误消息（null 表示通过）
 */
async function verifyOnnxIntegrity(filePath: string): Promise<string | null> {
  const result = await readFile(filePath);
  if (!result?.success || !result.data) {
    return "无法读取 ONNX 文件";
  }

  const bytes = new Uint8Array(result.data);
  if (bytes.length < MIN_ONNX_SIZE) {
    return `ONNX 文件过小（${bytes.length} 字节，期望 ≥ ${MIN_ONNX_SIZE}）`;
  }

  // protobuf magic byte 检查（0x08 = field 1, wire type 0/varint）
  // 部分 ONNX 文件可能以其他 field 开头，故只对明显非 protobuf 的文件报错
  if (bytes[0] !== PROTOBUF_MAGIC_BYTE && bytes[0] !== 0x0a && bytes[0] !== 0x12) {
    // 0x0a = field 1, wire type 2/length-delimited
    // 0x12 = field 2, wire type 2/length-delimited
    return `ONNX magic byte 异常（0x${bytes[0]!.toString(16).padStart(2, "0")}）`;
  }

  return null;
}

/**
 * 校验 tokenizer.json 完整性
 *
 * 必须是合法 JSON，且包含以下任一关键字段：
 * - model.model_type（如 "bert"、"mpnet"）
 * - vocab 或 model.vocab（词表）
 *
 * @returns 错误消息（null 表示通过）
 */
async function verifyTokenizerIntegrity(filePath: string): Promise<string | null> {
  const result = await readFile(filePath);
  if (!result?.success || !result.data) {
    return "无法读取 tokenizer.json";
  }

  let parsed: unknown;
  try {
    const text = new TextDecoder().decode(result.data);
    parsed = JSON.parse(text);
  } catch (e) {
    return `tokenizer.json 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`;
  }

  if (!parsed || typeof parsed !== "object") {
    return "tokenizer.json 顶层不是对象";
  }

  const obj = parsed as Record<string, unknown>;
  const hasModelType =
    obj.model && typeof obj.model === "object" && "model_type" in (obj.model as object);
  const hasVocab = "vocab" in obj || (obj.model && "vocab" in (obj.model as object));

  if (!hasModelType && !hasVocab) {
    return "tokenizer.json 缺少 model.model_type 或 vocab 字段";
  }

  return null;
}

/**
 * 校验 config.json 完整性
 *
 * 必须包含：
 * - modelName: 非空字符串
 * - dimensions: 正整数
 *
 * @returns 错误消息（null 表示通过）；同时返回解析后的配置
 */
async function verifyConfigIntegrity(
  filePath: string,
): Promise<{ error: string | null; config: Record<string, unknown> | null }> {
  const result = await readFile(filePath);
  if (!result?.success || !result.data) {
    return { error: "无法读取 config.json", config: null };
  }

  let parsed: unknown;
  try {
    const text = new TextDecoder().decode(result.data);
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      error: `config.json 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`,
      config: null,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { error: "config.json 顶层不是对象", config: null };
  }

  const config = parsed as Record<string, unknown>;

  if (typeof config.modelName !== "string" || !config.modelName.trim()) {
    return { error: "config.json 缺少 modelName（非空字符串）", config: null };
  }

  const dims = Number(config.dimensions);
  if (!Number.isFinite(dims) || dims <= 0 || !Number.isInteger(dims)) {
    return { error: "config.json dimensions 必须是正整数", config: null };
  }

  return { error: null, config };
}

// ============= 内部辅助：registry 读写 =============

/** 空注册表（初始状态） */
function emptyRegistry(): ModelRegistry {
  return { version: REGISTRY_VERSION, activeModelId: null, models: [] };
}

/**
 * 读取 registry.json
 *
 * @returns 解析后的注册表；不存在或格式非法时返回 null
 */
async function readRegistry(): Promise<ModelRegistry | null> {
  try {
    const registryPath = await getRegistryPath();
    const result = await readFile(registryPath);
    if (!result?.success || !result.data) {
      return null;
    }

    let parsed: unknown;
    try {
      const text = new TextDecoder().decode(result.data);
      parsed = JSON.parse(text);
    } catch (e) {
      errorLogger.warn("[model-manager] registry.json 解析失败:", e instanceof Error ? e.message : e);
      return null;
    }

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const obj = parsed as Record<string, unknown>;
    if (obj.version !== REGISTRY_VERSION) {
      errorLogger.warn(`[model-manager] registry.json 版本不匹配（期望 ${REGISTRY_VERSION}，实际 ${String(obj.version)}）`);
      return null;
    }

    const activeModelId =
      typeof obj.activeModelId === "string" ? obj.activeModelId : null;
    const models = Array.isArray(obj.models) ? (obj.models as LocalModelEntry[]) : [];

    return { version: REGISTRY_VERSION, activeModelId, models };
  } catch (e) {
    errorLogger.warn("[model-manager] 读取 registry.json 失败:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * 写入 registry.json
 */
async function writeRegistry(registry: ModelRegistry): Promise<boolean> {
  try {
    const registryPath = await getRegistryPath();
    const text = JSON.stringify(registry, null, 2);
    const result = await writeFile(registryPath, text);
    return result.success;
  } catch (e) {
    errorLogger.warn("[model-manager] 写入 registry.json 失败:", e instanceof Error ? e.message : e);
    return false;
  }
}

// ============= 内部辅助：模型 id 派生 =============

/**
 * 从 modelName 派生模型 id
 *
 * 规则：小写 + 非 [a-z0-9-] 替换为 -，合并连续 -，去除首尾 -
 *
 * 例如："all-MiniLM-L6-v2" → "all-minilm-l6-v2"
 *      "BGE Small zh" → "bge-small-zh"
 *
 * 导出供 UI 在安装前生成 modelId（与 registry 内部派生保持一致）。
 */
export function deriveModelId(modelName: string): string {
  return modelName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ============= 内部辅助：从目录构建模型条目 =============

/**
 * 校验指定目录下的模型文件并构建 LocalModelEntry
 *
 * 用于软迁移（根目录，自动派生 id）和安装（子目录，使用传入 id）。
 *
 * @param dir 模型文件所在目录
 * @param addedAt 添加时间戳
 * @param id 模型 id；未提供则从 config.json 的 modelName 派生
 * @returns { entry, error } —— entry 非空表示成功
 */
async function buildEntryFromDirectory(
  dir: string,
  addedAt: number,
  id?: string,
): Promise<{ entry: LocalModelEntry | null; error: string | null }> {
  // 1. 查找 ONNX 文件
  const onnxFile = await findOnnxFile(dir);
  if (!onnxFile) {
    return { entry: null, error: "缺少 ONNX 模型文件" };
  }

  // 2. 校验 ONNX 完整性
  const onnxError = await verifyOnnxIntegrity(onnxFile.path);
  if (onnxError) {
    return { entry: null, error: `${onnxFile.fileName}: ${onnxError}` };
  }

  // 3. 校验 tokenizer.json
  const tokenizerPath = `${dir}/tokenizer.json`;
  if (!(await fileExists(tokenizerPath))) {
    return { entry: null, error: "缺少 tokenizer.json" };
  }
  const tokenizerError = await verifyTokenizerIntegrity(tokenizerPath);
  if (tokenizerError) {
    return { entry: null, error: `tokenizer.json: ${tokenizerError}` };
  }

  // 4. 校验 config.json 并读取配置
  const configPath = `${dir}/config.json`;
  if (!(await fileExists(configPath))) {
    return { entry: null, error: "缺少 config.json" };
  }
  const { error: configError, config } = await verifyConfigIntegrity(configPath);
  if (configError || !config) {
    return { entry: null, error: `config.json: ${configError ?? "未知错误"}` };
  }

  const modelName = String(config.modelName);
  const dimensions = Number(config.dimensions);
  const maxTokens = Number(config.maxTokens) || 256;
  const language = String(config.language || "en");
  const description = String(config.description || "");
  const finalId = id ?? deriveModelId(modelName);

  const entry: LocalModelEntry = {
    id: finalId,
    modelName,
    dimensions,
    maxTokens,
    language,
    description,
    directory: dir,
    modelFileName: onnxFile.fileName,
    modelPath: onnxFile.path,
    tokenizerPath,
    addedAt,
  };

  return { entry, error: null };
}

// ============= 内部辅助：软迁移 =============

/**
 * 确保注册表存在（软迁移）
 *
 * - 若 registry.json 已存在，直接返回解析结果
 * - 若不存在，扫描根目录是否包含完整模型文件
 *   - 若包含且校验通过：创建 registry，把根目录模型注册为 active，写入磁盘
 *   - 若不包含或校验失败：返回空 registry（不写入磁盘）
 *
 * @returns 当前有效的注册表（可能为空）
 */
async function ensureRegistry(): Promise<ModelRegistry> {
  // 1. 已存在则直接返回
  const existing = await readRegistry();
  if (existing) {
    return existing;
  }

  // 2. 软迁移：扫描根目录
  try {
    const rootDir = await getModelDirectory();

    // 检查必需文件是否齐全
    const onnxFile = await findOnnxFile(rootDir);
    if (!onnxFile) {
      return emptyRegistry();
    }
    const hasTokenizer = await fileExists(`${rootDir}/tokenizer.json`);
    const hasConfig = await fileExists(`${rootDir}/config.json`);
    if (!hasTokenizer || !hasConfig) {
      return emptyRegistry();
    }

    // 构建条目（含完整性校验）
    const { entry, error } = await buildEntryFromDirectory(rootDir, Date.now());
    if (!entry || error) {
      errorLogger.warn("[model-manager] 软迁移：根目录模型校验失败:", error ?? "未知错误");
      return emptyRegistry();
    }

    // 创建并写入 registry
    const registry: ModelRegistry = {
      version: REGISTRY_VERSION,
      activeModelId: entry.id,
      models: [entry],
    };
    await writeRegistry(registry);
    return registry;
  } catch (e) {
    errorLogger.warn("[model-manager] ensureRegistry 异常:", e instanceof Error ? e.message : e);
    return emptyRegistry();
  }
}

// ============= 公共 API：多模型管理 =============

/**
 * 列出所有已注册模型
 *
 * 读 registry.json；不存在时返回空数组（不触发软迁移写入）。
 */
export async function listLocalModels(): Promise<LocalModelEntry[]> {
  const registry = await ensureRegistry();
  return registry.models;
}

/**
 * 获取当前 active 模型 id
 *
 * @returns active 模型 id；无 active 或无注册表时返回 null
 */
export async function getActiveModelId(): Promise<string | null> {
  const registry = await ensureRegistry();
  return registry.activeModelId;
}

/**
 * 获取当前 active 模型条目
 *
 * @returns active 模型条目；无 active 或条目不存在时返回 null
 */
export async function getActiveModelEntry(): Promise<LocalModelEntry | null> {
  const registry = await ensureRegistry();
  if (!registry.activeModelId) {
    return null;
  }
  return registry.models.find((m) => m.id === registry.activeModelId) ?? null;
}

/**
 * 设置 active 模型
 *
 * 同时触发 provider 缓存清空回调，下次调用重新加载新模型。
 */
export async function setActiveModel(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const registry = await ensureRegistry();
    const exists = registry.models.some((m) => m.id === id);
    if (!exists) {
      return { success: false, error: `模型 id "${id}" 不存在` };
    }

    // 无变化则直接成功（不触发回调）
    if (registry.activeModelId === id) {
      return { success: true };
    }

    registry.activeModelId = id;
    const ok = await writeRegistry(registry);
    if (!ok) {
      return { success: false, error: "写入 registry.json 失败" };
    }

    // 通知 provider 清空缓存
    notifyActiveModelChange(id);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 删除指定模型（文件 + registry 条目）
 *
 * 如果删除的是 active 模型，自动切换到第一个可用模型或 null，
 * 并触发 provider 缓存清空回调。
 *
 * @returns success=true 表示删除完成
 */
export async function removeModel(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const registry = await ensureRegistry();
    const entry = registry.models.find((m) => m.id === id);
    if (!entry) {
      return { success: false, error: `模型 id "${id}" 不存在` };
    }

    const errors: string[] = [];
    const dir = entry.directory;

    // 1. 删除所有 ONNX 候选文件（覆盖量化变体）
    for (const fileName of ONNX_FILE_CANDIDATES) {
      const filePath = `${dir}/${fileName}`;
      if (await fileExists(filePath)) {
        try {
          await deleteFile(filePath);
        } catch (e) {
          errors.push(`${fileName}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // 2. 删除必需的非 ONNX 文件
    for (const fileName of REQUIRED_NON_ONNX_FILES) {
      const filePath = `${dir}/${fileName}`;
      if (await fileExists(filePath)) {
        try {
          await deleteFile(filePath);
        } catch (e) {
          errors.push(`${fileName}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // 3. 删除可选辅助文件
    for (const fileName of OPTIONAL_FILES) {
      const filePath = `${dir}/${fileName}`;
      if (await fileExists(filePath)) {
        try {
          await deleteFile(filePath);
        } catch (e) {
          errors.push(`${fileName}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // 4. 从 registry 移除条目
    registry.models = registry.models.filter((m) => m.id !== id);

    // 5. 若删除的是 active 模型，切换到第一个可用模型或 null
    let activeChanged = false;
    if (registry.activeModelId === id) {
      const nextActive = registry.models[0]?.id ?? null;
      registry.activeModelId = nextActive;
      activeChanged = true;
    }

    // 6. 写入 registry
    const ok = await writeRegistry(registry);
    if (!ok) {
      return { success: false, error: "写入 registry.json 失败" };
    }

    // 7. 若 active 变化，通知 provider
    if (activeChanged) {
      notifyActiveModelChange(registry.activeModelId);
    }

    if (errors.length > 0) {
      errorLogger.warn("[model-manager] 部分模型文件删除失败:", errors);
      return {
        success: false,
        error: `部分文件删除失败：${errors.join("; ")}`,
      };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 安装新模型到子目录
 *
 * 流程：
 * 1. 从 files 中解析 config.json 获取 modelName → 派生 modelId
 * 2. 校验 modelId 未重复
 * 3. 创建子目录 <modelId>/，写入所有文件
 * 4. 完整性校验
 * 5. 注册到 registry；若是第一个模型则设为 active
 *
 * @param modelId 调用方指定的 modelId（若与 registry 已有条目重复则失败）
 * @param files 文件数组（name 为纯文件名，data 为二进制内容）
 */
export async function installModelFromFiles(
  modelId: string,
  files: Array<{ name: string; data: ArrayBuffer }>,
): Promise<{ success: boolean; entry?: LocalModelEntry; error?: string }> {
  try {
    // 1. 必须包含 config.json
    const configFile = files.find((f) => f.name === "config.json");
    if (!configFile) {
      return { success: false, error: "必须上传 config.json 才能安装模型" };
    }

    // 2. 解析 config.json
    let config: Record<string, unknown>;
    try {
      const text = new TextDecoder().decode(configFile.data);
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") {
        return { success: false, error: "config.json 顶层不是对象" };
      }
      config = parsed as Record<string, unknown>;
    } catch (e) {
      return {
        success: false,
        error: `config.json 解析失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    if (typeof config.modelName !== "string" || !config.modelName.trim()) {
      return { success: false, error: "config.json 缺少 modelName（非空字符串）" };
    }
    const dims = Number(config.dimensions);
    if (!Number.isFinite(dims) || dims <= 0 || !Number.isInteger(dims)) {
      return { success: false, error: "config.json dimensions 必须是正整数" };
    }

    // 3. 校验 modelId 唯一性
    const registry = await ensureRegistry();
    if (registry.models.some((m) => m.id === modelId)) {
      return { success: false, error: `模型 ID "${modelId}" 已存在，请勿重复安装` };
    }

    // 4. 写入文件到子目录
    const rootDir = await getModelDirectory();
    const targetDir = `${rootDir}/${modelId}`;

    let writeError: string | null = null;
    for (const file of files) {
      const filePath = `${targetDir}/${file.name}`;
      const result = await writeFile(filePath, file.data);
      if (!result.success) {
        writeError = `写入 ${file.name} 失败：${result.error ?? "未知错误"}`;
        break;
      }
    }
    if (writeError) {
      return { success: false, error: writeError };
    }

    // 5. 完整性校验 + 构建条目（使用传入的 modelId，与子目录名保持一致）
    const { entry, error } = await buildEntryFromDirectory(targetDir, Date.now(), modelId);
    if (!entry || error) {
      // 校验失败：清理已写入的文件，避免残留
      await cleanupDirectory(targetDir);
      return { success: false, error: error ?? "模型校验失败" };
    }

    // 6. 注册到 registry
    registry.models.push(entry);

    // 7. 若是第一个模型，设为 active
    let activeChanged = false;
    if (registry.activeModelId === null) {
      registry.activeModelId = entry.id;
      activeChanged = true;
    }

    const ok = await writeRegistry(registry);
    if (!ok) {
      return { success: false, error: "写入 registry.json 失败" };
    }

    if (activeChanged) {
      notifyActiveModelChange(entry.id);
    }

    return { success: true, entry };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 清理目录下所有已知模型文件（安装失败回滚用）
 *
 * 静默删除，不抛出异常。
 */
async function cleanupDirectory(dir: string): Promise<void> {
  const allFiles = [...ONNX_FILE_CANDIDATES, ...REQUIRED_NON_ONNX_FILES, ...OPTIONAL_FILES];
  for (const fileName of allFiles) {
    const filePath = `${dir}/${fileName}`;
    try {
      if (await fileExists(filePath)) {
        await deleteFile(filePath);
      }
    } catch {
      // 静默忽略
    }
  }
}

// ============= 公共 API：向后兼容 =============

/**
 * 检测本地 embedding 模型状态（向后兼容）
 *
 * M5：返回当前 active 模型状态（内部调用 getActiveModelEntry）。
 * 同时附带 activeModelId 与 installedModels 字段供 UI 使用。
 *
 * 若无 active 模型或 active 模型文件缺失/校验失败，返回 available: false。
 */
export async function detectLocalModel(): Promise<ModelStatus> {
  try {
    const dir = await getModelDirectory();
    const registry = await ensureRegistry();
    const installedModels = registry.models;
    const activeModelId = registry.activeModelId;

    // 无 active 模型
    if (!activeModelId) {
      return {
        available: false,
        info: null,
        missingFiles: [],
        integrityErrors: [],
        directory: dir,
        activeModelId: null,
        installedModels,
      };
    }

    const entry = registry.models.find((m) => m.id === activeModelId) ?? null;
    if (!entry) {
      // registry 不一致：activeId 指向不存在的条目
      return {
        available: false,
        info: null,
        missingFiles: [],
        integrityErrors: [],
        directory: dir,
        activeModelId,
        installedModels,
      };
    }

    // 校验 active 模型文件
    const missingFiles: string[] = [];
    const integrityErrors: string[] = [];

    // 1. ONNX 文件
    if (!(await fileExists(entry.modelPath))) {
      missingFiles.push(entry.modelFileName);
    } else {
      const onnxError = await verifyOnnxIntegrity(entry.modelPath);
      if (onnxError) {
        integrityErrors.push(`${entry.modelFileName}: ${onnxError}`);
      }
    }

    // 2. tokenizer.json
    if (!(await fileExists(entry.tokenizerPath))) {
      missingFiles.push("tokenizer.json");
    } else {
      const tokenizerError = await verifyTokenizerIntegrity(entry.tokenizerPath);
      if (tokenizerError) {
        integrityErrors.push(`tokenizer.json: ${tokenizerError}`);
      }
    }

    // 3. config.json
    const configPath = `${entry.directory}/config.json`;
    if (!(await fileExists(configPath))) {
      missingFiles.push("config.json");
    } else {
      const { error: configError } = await verifyConfigIntegrity(configPath);
      if (configError) {
        integrityErrors.push(`config.json: ${configError}`);
      }
    }

    if (missingFiles.length > 0 || integrityErrors.length > 0) {
      return {
        available: false,
        info: null,
        missingFiles,
        integrityErrors,
        directory: dir,
        activeModelId,
        installedModels,
      };
    }

    // 4. 构造模型信息
    const info: EmbeddingModelInfo = {
      modelName: entry.modelName,
      dimensions: entry.dimensions,
      maxTokens: entry.maxTokens,
      language: entry.language,
      description: entry.description,
      modelPath: entry.modelPath,
      modelFileName: entry.modelFileName,
      tokenizerPath: entry.tokenizerPath,
      directory: entry.directory,
    };

    return {
      available: true,
      info,
      missingFiles: [],
      integrityErrors: [],
      directory: dir,
      activeModelId,
      installedModels,
    };
  } catch (error) {
    errorLogger.warn("[model-manager] 检测本地模型失败:", error instanceof Error ? error.message : error);
    return {
      available: false,
      info: null,
      missingFiles: [...ONNX_FILE_CANDIDATES, ...REQUIRED_NON_ONNX_FILES] as string[],
      integrityErrors: [],
      directory: "",
      activeModelId: null,
      installedModels: [],
    };
  }
}

/**
 * 删除本地模型文件（向后兼容）
 *
 * M5：删除当前 active 模型（内部调用 removeModel(activeId)）。
 * 若无 active 模型，返回成功（无操作）。
 *
 * @returns success=true 表示删除完成
 */
export async function deleteLocalModel(): Promise<{ success: boolean; error?: string }> {
  try {
    const activeId = await getActiveModelId();
    if (!activeId) {
      // 无 active 模型：无操作
      return { success: true };
    }
    return await removeModel(activeId);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============= 导出常量（供 UI / 测试使用） =============

/**
 * 候选 ONNX 文件名列表（供 UI 显示"接受哪些文件"）
 */
export const ACCEPTED_ONNX_FILES = ONNX_FILE_CANDIDATES;

/**
 * 所有必需文件（含 ONNX 候选 + 必需非 ONNX）
 */
export const ALL_REQUIRED_FILES = [
  ...ONNX_FILE_CANDIDATES,
  ...REQUIRED_NON_ONNX_FILES,
] as const;
