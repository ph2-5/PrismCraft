/**
 * 模型 ID 防混淆表（Task 4.7 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 SKILL 模式。
 *
 * 问题：同一模型族有多个相似 ID（如 Seedance 2.0 / Seedance V2 / Seedance Pro /
 * doubao-seedance-2-0-260128 / doubao-seedance-2-0-fast-260128），用户和 AI 容易混淆。
 *
 * 方案：建立模型 ID → 标准名称 + 能力差异标注的映射表，避免混淆。
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

export interface ModelIdEntry {
  /** 模型 ID（完整字符串） */
  id: string;
  /** 标准名称（人类可读） */
  standardName: string;
  /** 模型族 */
  family: string;
  /** 版本 */
  version: string;
  /** 能力差异标注 */
  capabilities: {
    maxResolution: string;
    maxDuration: string;
    supportsLastFrame: boolean;
    supportsCharacterRef: boolean;
    notes?: string;
  };
  /** 常见混淆 ID（指向同一模型但写法不同） */
  aliases?: string[];
}

// === 模型 ID 防混淆表 ===
const MODEL_ID_TABLE: ModelIdEntry[] = [
  // === Seedance 2.0 族 ===
  {
    id: "doubao-seedance-2-0-260128",
    standardName: "Seedance 2.0 标准",
    family: "seedance",
    version: "2.0",
    capabilities: {
      maxResolution: "1080p",
      maxDuration: "10s",
      supportsLastFrame: true,
      supportsCharacterRef: true,
      notes: "标准版，平衡质量与速度",
    },
    aliases: ["seedance-2.0", "seedance-2", "seedance-v2", "seedance pro"],
  },
  {
    id: "doubao-seedance-2-0-fast-260128",
    standardName: "Seedance 2.0 快速",
    family: "seedance",
    version: "2.0-fast",
    capabilities: {
      maxResolution: "720p",
      maxDuration: "5s",
      supportsLastFrame: true,
      supportsCharacterRef: false,
      notes: "快速版，牺牲质量换速度，不支持角色参考",
    },
    aliases: ["seedance-2.0-fast", "seedance-fast", "seedance v2 fast"],
  },

  // === Kling 族 ===
  {
    id: "kling-v2-master",
    standardName: "Kling V2 Master",
    family: "kling",
    version: "v2-master",
    capabilities: {
      maxResolution: "1080p",
      maxDuration: "10s",
      supportsLastFrame: true,
      supportsCharacterRef: true,
      notes: "高质量版，支持首尾帧 + 角色参考",
    },
    aliases: ["kling-2", "kling-v2", "kling master"],
  },
  {
    id: "kling-v2-standard",
    standardName: "Kling V2 Standard",
    family: "kling",
    version: "v2-standard",
    capabilities: {
      maxResolution: "720p",
      maxDuration: "5s",
      supportsLastFrame: true,
      supportsCharacterRef: false,
      notes: "标准版，不支持角色参考",
    },
    aliases: ["kling-standard", "kling v2 std"],
  },

  // === Runway 族 ===
  {
    id: "runway-gen4",
    standardName: "Runway Gen-4",
    family: "runway",
    version: "gen4",
    capabilities: {
      maxResolution: "1080p",
      maxDuration: "10s",
      supportsLastFrame: true,
      supportsCharacterRef: true,
      notes: "Gen-4 支持 first-last-frame 模式",
    },
    aliases: ["runway-gen-4", "runway gen4", "runway4"],
  },

  // === MiniMax 族 ===
  {
    id: "minimax-video-01",
    standardName: "MiniMax Video 01",
    family: "minimax",
    version: "01",
    capabilities: {
      maxResolution: "1080p",
      maxDuration: "6s",
      supportsLastFrame: false,
      supportsCharacterRef: true,
      notes: "不支持尾帧，但支持角色参考",
    },
    aliases: ["minimax-video", "minimax 01", "minimax-v01"],
  },
];

// === 索引：id → entry，以及 alias → id ===
const ID_INDEX: Map<string, ModelIdEntry> = new Map(
  MODEL_ID_TABLE.map((e) => [e.id.toLowerCase(), e]),
);

const ALIAS_INDEX: Map<string, string> = new Map();
for (const entry of MODEL_ID_TABLE) {
  if (entry.aliases) {
    for (const alias of entry.aliases) {
      ALIAS_INDEX.set(alias.toLowerCase(), entry.id);
    }
  }
}

/**
 * 按模型 ID 查询条目。
 * 支持精确 ID 匹配 + alias 匹配。
 * 返回 null 表示未识别的模型 ID。
 */
export function lookupModelId(modelId: string): ModelIdEntry | null {
  const lower = modelId.toLowerCase();

  // 1. 精确 ID 匹配
  const direct = ID_INDEX.get(lower);
  if (direct) return direct;

  // 2. alias 匹配
  const aliasedId = ALIAS_INDEX.get(lower);
  if (aliasedId) {
    return ID_INDEX.get(aliasedId.toLowerCase()) ?? null;
  }

  // 3. 前缀模糊匹配（如 "seedance-2.0-custom" 匹配 "seedance-2.0"）
  for (const entry of MODEL_ID_TABLE) {
    if (lower.startsWith(entry.id.toLowerCase())) {
      return entry;
    }
    if (entry.aliases) {
      for (const alias of entry.aliases) {
        if (lower.startsWith(alias.toLowerCase())) {
          return entry;
        }
      }
    }
  }

  return null;
}

/**
 * 标准化模型 ID：将 alias 转换为正式 ID。
 * 若无法识别，返回原 ID。
 */
export function normalizeModelId(modelId: string): string {
  const entry = lookupModelId(modelId);
  return entry ? entry.id : modelId;
}

/**
 * 获取模型的标准名称（人类可读）。
 */
export function getModelStandardName(modelId: string): string {
  const entry = lookupModelId(modelId);
  return entry ? entry.standardName : modelId;
}

/**
 * 列出所有已注册的模型条目。
 */
export function listModelEntries(): ModelIdEntry[] {
  return [...MODEL_ID_TABLE];
}

/**
 * 列出指定模型族的所有条目。
 */
export function listModelsByFamily(family: string): ModelIdEntry[] {
  return MODEL_ID_TABLE.filter((e) => e.family === family.toLowerCase());
}

/**
 * 检测两个模型 ID 是否指向同一模型（通过 alias 关系）。
 */
export function areSameModel(idA: string, idB: string): boolean {
  const entryA = lookupModelId(idA);
  const entryB = lookupModelId(idB);
  if (!entryA || !entryB) return false;
  return entryA.id === entryB.id;
}
