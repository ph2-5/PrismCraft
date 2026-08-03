/**
 * Q3-1 — SceneVariantList 组件
 *
 * 场景侧包装：绑定 SceneVariant 类型与 scene.variants.* i18n 文案，
 * 实际渲染逻辑复用共享泛型组件 @/shared/presentation/VariantList。
 *
 * 展示场景变体列表，支持：
 *   - 添加变体（弹出 SceneVariantDialog）
 *   - 编辑变体
 *   - 删除变体
 *   - 设为默认变体
 *   - 生成图（调用 AI）
 */

import { t } from "@/shared/constants";
import {
  VariantList as SharedVariantList,
  type VariantListProps as SharedVariantListProps,
} from "@/shared/presentation/VariantList";
import type { SceneVariant } from "@/domain/schemas";

export interface SceneVariantListProps
  extends Omit<SharedVariantListProps<SceneVariant>, "strings" | "avatarClassName"> {}

export function SceneVariantList(props: SceneVariantListProps) {
  return (
    <SharedVariantList
      {...props}
      avatarClassName="scene"
      strings={{
        title: t("scene.variants.title"),
        add: t("scene.variants.add"),
        defaultBadge: t("scene.variants.default"),
        canonicalBadge: t("scene.variants.canonical"),
        openInCompositor: t("scene.variants.openInCompositor"),
        generateImage: t("scene.variants.generateImage"),
        markDefault: t("scene.variants.markDefault"),
        edit: t("scene.variants.edit"),
        delete: t("scene.variants.delete"),
        empty: t("scene.variants.empty"),
        emptyHint: t("scene.variants.emptyHint"),
      }}
    />
  );
}
