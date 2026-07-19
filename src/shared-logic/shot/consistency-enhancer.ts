/**
 * Task 2A.12 — 角色一致性增强器（Consistency Enhancer）
 *
 * 设计目标：
 *   同一角色在不同分镜中保持外观一致（肉眼可辨）。
 *
 * 实现策略（基于现有 characterRefs 链路，无需新增 provider 字段）：
 *   1. 自动提取：从角色主图 + 造型(outfits) + 变体(variants) 中收集候选参考图
 *   2. 优先级排序：主图 > 默认变体 > 默认造型 > 其他
 *   3. 模型能力适配：根据 maxCharacterRefs 截断；根据 consistencyStrategy 选择策略
 *   4. 预处理提示：返回参考图时附带预处理建议（裁剪/分辨率），由调用方决定是否执行
 *
 * 与现有 characterRefMode 的关系：
 *   - consistency-enhancer 只负责"选哪些图、按什么顺序"
 *   - "怎么把图传给 provider"仍由 characterRefMode + provider.buildVideoRequest 决定
 *   - 这样不破坏现有 14 个 provider 的实现，仅增强"参考图来源"
 *
 * 零依赖约束：本文件位于 shared-logic/，不导入 @/ @shared/ @domain/，所有类型自包含。
 */

/** 一致性策略（标记模型支持的最强一致化能力） */
export type ConsistencyStrategy =
  | "multi_ref_fusion" // 多参考图融合（IP-Adapter 风格，≥3 张参考图）
  | "single_ref" // 单参考图（如 Kling subject_reference）
  | "text_only" // 仅文本描述（无参考图能力）
  | "unknown"; // 未知模型

/** 角色参考图来源类型 */
export type CharacterRefSource =
  | "primary" // 角色主图（generatedImage）
  | "default_variant" // 默认变体图
  | "default_outfit" // 默认造型图
  | "variant" // 其他变体
  | "outfit"; // 其他造型

/** 角色参考图候选（由调用方填充） */
export interface CharacterRefCandidate {
  url: string;
  source: CharacterRefSource;
  /** 是否为该角色的"权威"参考（用于单参考图策略时优先选取） */
  isAuthoritative: boolean;
  /** 来源 ID（variant/outfit 的 id，便于去重） */
  sourceId?: string;
  /** 预处理建议（由 selectConsistencyStrategy 填充） */
  preprocessHint?: PreprocessHint;
}

/** 参考图预处理建议 */
export interface PreprocessHint {
  /** 建议裁剪为正方形（头像聚焦） */
  centerCropToSquare: boolean;
  /** 建议最大边长（像素，0 = 不限制） */
  maxEdge: number;
  /** 建议格式（默认 image/png） */
  format: "image/png" | "image/jpeg" | "image/webp";
}

/** 默认预处理建议（适用于大多数视频模型） */
export const DEFAULT_PREPROCESS_HINT: PreprocessHint = {
  centerCropToSquare: true,
  maxEdge: 1024,
  format: "image/png",
};

/** 角色素材输入（由调用方从角色库中提取后传入） */
export interface CharacterAssetInput {
  characterId: string;
  /** 角色主图 URL（character.generatedImage） */
  primaryImageUrl?: string;
  /** 默认变体图 URL（is_default=true 的 variant.imageUrl） */
  defaultVariantImageUrl?: string;
  /** 默认造型图 URL（is_default=true 的 outfit.imageUrl） */
  defaultOutfitImageUrl?: string;
  /** 其他变体图 URL 列表 */
  variantImageUrls?: string[];
  /** 其他造型图 URL 列表 */
  outfitImageUrls?: string[];
}

/** 模型一致性能力（由调用方从 ModelCapabilities 转换而来） */
export interface ModelConsistencyCapability {
  modelId: string;
  /** 模型支持的最强一致性策略 */
  strategy: ConsistencyStrategy;
  /** 最大参考图数量（≤1 表示仅支持单图） */
  maxCharacterRefs: number;
}

/**
 * 从角色素材输入中提取参考图候选列表。
 *
 * 优先级（高 → 低）：
 *   1. primaryImageUrl（主图，权威）
 *   2. defaultVariantImageUrl（默认变体，权威）
 *   3. defaultOutfitImageUrl（默认造型，权威）
 *   4. variantImageUrls（其他变体）
 *   5. outfitImageUrls（其他造型）
 *
 * @returns 去重后的候选列表（按优先级排序）
 */
export function extractCharacterReferenceCandidates(
  input: CharacterAssetInput,
): CharacterRefCandidate[] {
  const seen = new Set<string>();
  const result: CharacterRefCandidate[] = [];

  // P2-6 修复：URL 规范化去重，处理 trim 和 hash fragment 差异
  // 同一张图片可能因 hash fragment（#v=1）或前后空白被视为不同，导致重复参考图
  // 注意：不规范化重复斜杠（//），因为不同服务器对 // 的处理可能不同
  // 第 8 轮审计修复：normalizeUrlForKey 收回归 trim 责任，避免依赖外部调用契约
  // 第 9 轮审计修复：返回 {key, trimmedUrl} 避免 push 时重复调用 url.trim()
  const normalizeUrlForKey = (url: string): { key: string; trimmedUrl: string } => {
    const trimmed = url.trim();
    // 移除 hash fragment（#...），同一图片的不同 hash 视为相同
    const hashIdx = trimmed.indexOf("#");
    const key = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
    return { key, trimmedUrl: trimmed };
  };

  const push = (
    url: string | undefined,
    source: CharacterRefSource,
    isAuthoritative: boolean,
    sourceId?: string,
  ) => {
    if (!url) return; // 过滤 undefined/null/空字符串
    const { key, trimmedUrl } = normalizeUrlForKey(url);
    if (!key) return; // 过滤纯空白或 trim 后仅剩 hash fragment 的情况
    if (seen.has(key)) return;
    seen.add(key);
    // 第 6 轮审计修复：候选 URL 保留 trim 后的值（含 hash fragment）
    // hash fragment 可能有意义（cache busting 如 #v=1，或 SVG sprite 引用如 #icon-id）
    // 仅用移除 hash 的 key 进行去重，避免破坏 URL 语义
    result.push({ url: trimmedUrl, source, isAuthoritative, sourceId });
  };

  push(input.primaryImageUrl, "primary", true);
  push(input.defaultVariantImageUrl, "default_variant", true);
  push(input.defaultOutfitImageUrl, "default_outfit", true);
  for (const url of input.variantImageUrls ?? []) {
    push(url, "variant", false);
  }
  for (const url of input.outfitImageUrls ?? []) {
    push(url, "outfit", false);
  }

  return result;
}

/**
 * 根据模型能力选择最佳一致性策略。
 *
 * 决策规则：
 *   - maxCharacterRefs >= 3 且 supportsCharacterRef → "multi_ref_fusion"
 *   - maxCharacterRefs >= 1 且 supportsCharacterRef → "single_ref"
 *   - 否则 → "text_only"
 *
 * 如果传入 strategy 已明确（来自 model-registry 配置），则直接使用；
 * 否则按上述规则推断。
 */
export function selectConsistencyStrategy(
  capability: ModelConsistencyCapability,
  availableCandidateCount: number,
): ConsistencyStrategy {
  // 如果配置已明确指定，且与可用候选数兼容，则使用配置
  if (capability.strategy !== "unknown") {
    if (capability.strategy === "multi_ref_fusion") {
      // 需要至少 2 张候选才有意义
      return availableCandidateCount >= 2 ? "multi_ref_fusion" : "single_ref";
    }
    return capability.strategy;
  }

  // 未知模型：按能力推断
  if (capability.maxCharacterRefs >= 3 && availableCandidateCount >= 2) {
    return "multi_ref_fusion";
  }
  if (capability.maxCharacterRefs >= 1) {
    return "single_ref";
  }
  return "text_only";
}

/**
 * 根据一致性策略从候选列表中选取最终参考图。
 *
 * - "multi_ref_fusion": 取前 N 张（N = maxCharacterRefs，默认 4）
 * - "single_ref": 仅取第一张权威图
 * - "text_only" / "unknown": 返回空数组
 *
 * 同时为每张图填充预处理建议。
 */
export function selectReferenceImages(
  candidates: CharacterRefCandidate[],
  strategy: ConsistencyStrategy,
  maxCharacterRefs: number,
): CharacterRefCandidate[] {
  if (strategy === "text_only" || strategy === "unknown") {
    return [];
  }

  if (strategy === "single_ref") {
    // 优先选权威图
    const authoritative = candidates.find((c) => c.isAuthoritative);
    const selected = authoritative ?? candidates[0];
    if (!selected) return [];
    return [{ ...selected, preprocessHint: DEFAULT_PREPROCESS_HINT }];
  }

  // multi_ref_fusion
  const limit = Math.max(1, Math.min(maxCharacterRefs, candidates.length));
  return candidates.slice(0, limit).map((c) => ({
    ...c,
    preprocessHint: DEFAULT_PREPROCESS_HINT,
  }));
}

/**
 * 一站式：从角色素材 + 模型能力 → 最终参考图列表。
 *
 * 这是 consistency-enhancer 的主入口，调用方只需传入角色素材和模型能力，
 * 即可得到最终的 characterRefs 数组（URL 列表）。
 *
 * @returns URL 字符串数组，可直接赋值给 VideoGenerationRequestBody.characterRefs
 */
export function buildConsistencyEnhancedCharacterRefs(
  input: CharacterAssetInput,
  capability: ModelConsistencyCapability,
): string[] {
  const candidates = extractCharacterReferenceCandidates(input);
  const strategy = selectConsistencyStrategy(capability, candidates.length);
  const selected = selectReferenceImages(candidates, strategy, capability.maxCharacterRefs);
  return selected.map((c) => c.url);
}

/**
 * Task 2A.12: 为调用方（UI 层）提供"重选参考图"的候选列表。
 *
 * 返回所有可选的参考图（含来源标记），由 UI 展示给用户选择。
 * 与 buildConsistencyEnhancedCharacterRefs 不同，此函数不做策略过滤，
 * 返回所有候选供用户手动选择。
 */
export function listAllCharacterReferenceOptions(
  input: CharacterAssetInput,
): CharacterRefCandidate[] {
  return extractCharacterReferenceCandidates(input);
}

/**
 * Task 2A.12: 根据用户手动选择的 URL 列表 + 模型能力，构建最终参考图。
 *
 * 用户手动选择后，仍需按 maxCharacterRefs 截断，并填充预处理建议。
 */
export function buildManualCharacterRefs(
  selectedUrls: string[],
  capability: ModelConsistencyCapability,
): string[] {
  if (capability.maxCharacterRefs <= 0) return [];
  const limit = Math.min(selectedUrls.length, capability.maxCharacterRefs);
  return selectedUrls.slice(0, limit);
}

/**
 * Task 2A.12: 一致性策略的可读描述（用于 UI 提示）。
 */
export function describeConsistencyStrategy(strategy: ConsistencyStrategy): string {
  switch (strategy) {
    case "multi_ref_fusion":
      return "多参考图融合（IP-Adapter 风格）";
    case "single_ref":
      return "单参考图";
    case "text_only":
      return "仅文本描述（模型不支持参考图）";
    case "unknown":
      return "未知模型（将按能力推断）";
  }
}
