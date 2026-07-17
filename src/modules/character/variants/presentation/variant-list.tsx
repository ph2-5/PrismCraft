/**
 * Task 2A.10 — VariantList 组件
 *
 * 替代 CharacterEditor.tsx 中的 OutfitList 内联组件。
 * 展示角色变体列表，支持：
 *   - 添加变体（弹出 VariantDialog）
 *   - 编辑变体
 *   - 删除变体
 *   - 设为默认变体
 *   - 生成图（调用 AI）
 *   - 在 Compositor 中打开（预填该变体）
 *
 * 注意：本组件是展示组件，所有 handlers 通过 props 注入。
 */

import { Plus, Pencil, Trash2, Star, Image as ImageIcon, Sparkles } from "lucide-react";
import { t } from "@/shared/constants";
import { SafeImage } from "@/shared/presentation/SafeImage";
import { resolveImageUrl } from "@/shared/utils/image-url";
import type { CharacterVariant } from "@/domain/schemas";

export interface VariantListProps {
  /** 角色变体列表（已按 is_default DESC, created_at ASC 排序） */
  variants: CharacterVariant[];
  /** 是否正在生成某变体的图 */
  isGenerating?: string | null;
  /** 添加新变体 */
  onAddVariant: () => void;
  /** 编辑变体 */
  onEditVariant: (variant: CharacterVariant) => void;
  /** 删除变体 */
  onDeleteVariant: (variant: CharacterVariant) => void;
  /** 设为默认变体 */
  onSetDefaultVariant: (variant: CharacterVariant) => void;
  /** 生成变体图（调用 AI 图像合成） */
  onGenerateVariantImage: (variant: CharacterVariant) => void;
  /** 在 Compositor 中打开（用该变体作为基础） */
  onOpenInCompositor: (variant: CharacterVariant) => void;
}

export function VariantList({
  variants,
  isGenerating,
  onAddVariant,
  onEditVariant,
  onDeleteVariant,
  onSetDefaultVariant,
  onGenerateVariantImage,
  onOpenInCompositor,
}: VariantListProps) {
  return (
    <div className="card">
      <div className="flex justify-between items-center mb-2">
        <div className="section-label">{t("character.variants.title")}</div>
        <button
          type="button"
          className="btn btn-outline btn-xs gap-1"
          onClick={onAddVariant}
        >
          <Plus className="w-3 h-3" />
          {t("character.variants.add")}
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
                      className="element-avatar character"
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
                        {t("character.variants.default")}
                      </span>
                    )}
                    {variant.isCanonical && (
                      <span className="badge badge-secondary text-[10px]">
                        {t("character.variants.canonical")}
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
                    title={t("character.variants.openInCompositor")}
                    aria-label={t("character.variants.openInCompositor")}
                  >
                    <Sparkles className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => onGenerateVariantImage(variant)}
                    disabled={isGenerating === variant.id}
                    title={t("character.variants.generateImage")}
                    aria-label={t("character.variants.generateImage")}
                  >
                    <ImageIcon className={`w-3 h-3 ${isGenerating === variant.id ? "animate-pulse" : ""}`} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => onSetDefaultVariant(variant)}
                    disabled={variant.isDefault}
                    title={t("character.variants.markDefault")}
                    aria-label={t("character.variants.markDefault")}
                  >
                    <Star className={`w-3 h-3 ${variant.isDefault ? "fill-current" : ""}`} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => onEditVariant(variant)}
                    title={t("character.variants.edit")}
                    aria-label={t("character.variants.edit")}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-danger"
                    onClick={() => onDeleteVariant(variant)}
                    title={t("character.variants.delete")}
                    aria-label={t("character.variants.delete")}
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
          <p className="text-[13px]">{t("character.variants.empty")}</p>
          <p className="text-[11px] mt-1 text-muted-foreground/70">
            {t("character.variants.emptyHint")}
          </p>
        </div>
      )}
    </div>
  );
}
