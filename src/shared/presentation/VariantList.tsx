/**
 * 泛型变体列表展示组件（character/scene variants 共用）
 *
 * character/variants/presentation/variant-list.tsx 与 scene 侧对应文件
 * 曾为 186 行逐行对称的复制（仅 CharacterVariant vs SceneVariant 类型、
 * i18n 前缀、element-avatar class 不同）。本组件抽取公共展示逻辑，
 * 差异通过 props 注入：
 *   - 类型参数 T：CharacterVariant 或 SceneVariant
 *   - strings：i18n 文案（由调用方用 t() 解析后传入）
 *   - avatarClassName：缩略图占位样式（"character" | "scene"）
 *
 * 本组件是纯展示组件，所有 handlers 通过 props 注入。
 */

import { Plus, Pencil, Trash2, Star, Image as ImageIcon, Sparkles } from "lucide-react";
import { SafeImage } from "@/shared/presentation/SafeImage";
import { resolveImageUrl } from "@/shared/utils/image-url";

/** 变体展示所需的最小字段集（CharacterVariant / SceneVariant 均满足） */
export interface VariantListItem {
  id: string;
  name: string;
  imageUrl?: string | null;
  description?: string | null;
  promptFragment?: string | null;
  isDefault: boolean;
  isCanonical: boolean;
}

/** 变体列表展示所需的 i18n 文案（由调用方用 t() 解析） */
export interface VariantListStrings {
  title: string;
  add: string;
  defaultBadge: string;
  canonicalBadge: string;
  openInCompositor: string;
  generateImage: string;
  markDefault: string;
  edit: string;
  delete: string;
  empty: string;
  emptyHint: string;
}

export interface VariantListProps<T extends VariantListItem> {
  /** 变体列表（已按 is_default DESC, created_at ASC 排序） */
  variants: T[];
  /** 是否正在生成某变体的图 */
  isGenerating?: string | null;
  /** i18n 文案（由调用方用 t() 解析后传入） */
  strings: VariantListStrings;
  /** 缩略图占位样式（element-avatar 的变体 class） */
  avatarClassName: "character" | "scene";
  /** 添加新变体 */
  onAddVariant: () => void;
  /** 编辑变体 */
  onEditVariant: (variant: T) => void;
  /** 删除变体 */
  onDeleteVariant: (variant: T) => void;
  /** 设为默认变体 */
  onSetDefaultVariant: (variant: T) => void;
  /** 生成变体图（调用 AI 图像合成） */
  onGenerateVariantImage: (variant: T) => void;
  /** 在 Compositor 中打开（用该变体作为基础） */
  onOpenInCompositor: (variant: T) => void;
}

export function VariantList<T extends VariantListItem>({
  variants,
  isGenerating,
  strings,
  avatarClassName,
  onAddVariant,
  onEditVariant,
  onDeleteVariant,
  onSetDefaultVariant,
  onGenerateVariantImage,
  onOpenInCompositor,
}: VariantListProps<T>) {
  return (
    <div className="card">
      <div className="flex justify-between items-center mb-2">
        <div className="section-label">{strings.title}</div>
        <button
          type="button"
          className="btn btn-outline btn-xs gap-1"
          onClick={onAddVariant}
        >
          <Plus className="w-3 h-3" />
          {strings.add}
        </button>
      </div>
      {variants.length > 0 ? (
        <div className="flex flex-col gap-2">
          {variants.map((variant) => (
            <div
              key={variant.id}
              className="element-card !p-2"
              data-variant-id={variant.id}
              data-is-default={variant.isDefault ? "1" : "0"}
              data-is-canonical={variant.isCanonical ? "1" : "0"}
            >
              <div className="flex items-start gap-2">
                {/* 缩略图 */}
                <div className="flex-shrink-0">
                  {variant.imageUrl ? (
                    <SafeImage
                      src={resolveImageUrl(variant.imageUrl)}
                      alt={variant.name}
                      width={48}
                      height={48}
                    />
                  ) : (
                    <div
                      className={`element-avatar ${avatarClassName}`}
                      style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <ImageIcon className="w-5 h-5 opacity-50" />
                    </div>
                  )}
                </div>

                {/* 文本信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold truncate">{variant.name}</span>
                    {variant.isDefault && (
                      <span className="badge badge-primary text-[10px]">
                        {strings.defaultBadge}
                      </span>
                    )}
                    {variant.isCanonical && (
                      <span className="badge badge-secondary text-[10px]">
                        {strings.canonicalBadge}
                      </span>
                    )}
                  </div>
                  {variant.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {variant.description}
                    </div>
                  )}
                  {variant.promptFragment && (
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                      <span className="font-mono">prompt:</span> {variant.promptFragment}
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => onOpenInCompositor(variant)}
                    title={strings.openInCompositor}
                    aria-label={strings.openInCompositor}
                  >
                    <Sparkles className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => onGenerateVariantImage(variant)}
                    disabled={isGenerating === variant.id}
                    title={strings.generateImage}
                    aria-label={strings.generateImage}
                  >
                    <ImageIcon className={`w-3 h-3 ${isGenerating === variant.id ? "animate-pulse" : ""}`} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => onSetDefaultVariant(variant)}
                    disabled={variant.isDefault}
                    title={strings.markDefault}
                    aria-label={strings.markDefault}
                  >
                    <Star className={`w-3 h-3 ${variant.isDefault ? "fill-current" : ""}`} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => onEditVariant(variant)}
                    title={strings.edit}
                    aria-label={strings.edit}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-danger"
                    onClick={() => onDeleteVariant(variant)}
                    title={strings.delete}
                    aria-label={strings.delete}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center p-6 text-muted-foreground">
          <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-[13px]">{strings.empty}</p>
          <p className="text-[11px] mt-1 text-muted-foreground/70">
            {strings.emptyHint}
          </p>
        </div>
      )}
    </div>
  );
}
