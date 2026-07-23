# Settings Module ✅

> 应用配置与插件管理模块。从 `src/app/settings/` 迁移至 `src/modules/settings/`。

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 概述

提供 API 提供商配置、模型映射、嵌入模型管理、插件系统等设置功能。

## 公共 API

- `SettingsPage` — 设置页面组件（默认导出，由 router lazy import）

## 子域

| 子域 | 状态 | 文件 | 说明 |
|------|:----:|------|------|
| API 配置 | ✅ | `ApiConfigPanel.tsx`, `ApiConfigPanelParts.tsx`, `ProviderCard.tsx`, `ProviderCardParts.tsx`, `ProviderForm.tsx`, `ProviderFormParts.tsx`, `ModelMappingSection.tsx`, `ModelParams.tsx` | API 提供商配置 UI |
| API 配置逻辑 | ✅ | `apiConfigActions.ts`, `use-api-config-handlers.ts`, `hooks/use-settings-page.ts` | API 配置业务逻辑 |
| 嵌入模型 | ✅ | `EmbeddingModelPanel.tsx` | 本地嵌入模型管理 |
| 插件系统 | ✅ | `PluginList.tsx`, `PluginDetail.tsx`, `PluginBasicInfo.tsx`, `PluginApiConfig.tsx`, `PluginModelDefs.tsx`, `PluginPreviewExport.tsx`, `PluginRequestFormat.tsx`, `PluginResponseFormat.tsx`, `PluginUrlRules.tsx`, `plugin-manager.tsx`, `plugin-creator.tsx`, `plugin-add-form.tsx`, `plugin-schema-viewer.tsx`, `plugin-spec-viewer.tsx` | 插件管理 UI |
| 插件逻辑 | ✅ | `plugin-api.ts`, `plugin-creator-api.ts`, `plugin-creator-types.ts` | 插件业务逻辑 |
| 提示模板 | ✅ | `PromptTemplatePanel.tsx` | 提示模板配置 |
| 页面入口 | ✅ | `page.tsx` | Settings 页面主入口 |

## 边界约束

- **依赖方向**：可导入 `@/domain/*`, `@/shared/*`, `@/shared-logic/*`, `@/infrastructure/di`
- **禁止导入**：`@/infrastructure/*`（除 DI 容器），`@/modules/*`（其他模块），`@/app/*`
- **基础设施访问**：通过 `@/shared/api-config` 和 `@/shared/embedding` 代理访问 infrastructure

## 架构债务状态

迁移前存在 11 处直接 import `@/infrastructure/*` 的违规（5 处 value/mixed + 6 处 type-only），已在迁移时全部修复为通过 `@/shared/*` 代理访问。
