/**
 * Task 2A.10 — VariantList 组件
 *
 * 角色侧包装：绑定 CharacterVariant 类型与 character.variants.* i18n 文案，
 * 实际渲染逻辑复用共享泛型组件 @/shared/presentation/VariantList。
 *
 * 展示角色变体列表，支持：
 *   - 添加变体（弹出 VariantDialog）
 *   - 编辑变体
 *   - 删除变体
 *   - 设为默认变体
 *   - 生成图（调用 AI）
 *   - 在 Compositor 中打开（预填该变体）
 */

import { t } from "@/shared/constants";
import {
  VariantList as SharedVariantList,
  type VariantListProps as SharedVariantListProps,
} from "@/shared/presentation/VariantList";
import type { CharacterVariant } from "@/domain/schemas";

export interface VariantListProps
  extends Omit<SharedVariantListProps<CharacterVariant>, "strings" | "avatarClassName"> {}

export function VariantList(props: VariantListProps) {
  return (
    <SharedVariantList
      {...props}
      avatarClassName="character"
      strings={{
        title: t("character.variants.title"),
        add: t("character.variants.add"),
        defaultBadge: t("character.variants.default"),
        canonicalBadge: t("character.variants.canonical"),
        openInCompositor: t("character.variants.openInCompositor"),
        generateImage: t("character.variants.generateImage"),
        markDefault: t("character.variants.markDefault"),
        edit: t("character.variants.edit"),
        delete: t("character.variants.delete"),
        empty: t("character.variants.empty"),
        emptyHint: t("character.variants.emptyHint"),
      }}
    />
  );
}
