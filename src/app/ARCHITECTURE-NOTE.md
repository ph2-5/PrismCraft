# src/app/ 架构违规技术债务记录

> 本文件记录 `src/app/` 目录下直接导入 `@/infrastructure/*` 绕过 `@/shared/*` 代理层的已知技术债务。
> 根据 `.trae/rules/architecture-rules.md`，纯函数应通过 `@/shared/` 代理模块访问。
> 创建时间：2026-07-12 | 最后更新：2026-07-14

---

## 一、已修复的违规

### 1.1 Settings 模块迁移（2026-07-14 完成）

`src/app/settings/` 已整体迁移至 `src/modules/settings/`，迁移时修复了全部 11 处 `@/infrastructure/*` 违规：

| 文件 | 原导入来源 | 修复后 |
|------|-----------|--------|
| `apiConfigActions.ts` | `@/infrastructure/api-config-facade` | `@/shared/api-config` |
| `EmbeddingModelPanel.tsx` | `@/infrastructure/embedding` | `@/shared/embedding` |
| `ApiConfigPanel.tsx` | `@/infrastructure/api-config-facade` | `@/shared/api-config` |
| `ApiConfigPanelParts.tsx` | `@/infrastructure/api-config-facade` | `@/shared/api-config` |
| `ModelMappingSection.tsx` | `@/infrastructure/api-config-facade` | `@/shared/api-config` |
| `ProviderCard.tsx` | `@/infrastructure/api-config-facade` | `@/shared/api-config` |
| `ProviderCardParts.tsx` | `@/infrastructure/api-config-facade` | `@/shared/api-config` |
| `ProviderForm.tsx` | `@/infrastructure/api-config-facade` | `@/shared/api-config` |
| `ProviderFormParts.tsx` | `@/infrastructure/api-config-facade` | `@/shared/api-config` |
| `plugin-manager.tsx` | `@/infrastructure/api-config-facade` | `@/shared/api-config` |
| `use-api-config-handlers.ts` | `@/infrastructure/api-config-facade` | `@/shared/api-config` |

同时扩展了 `@/shared/api-config`（新增 10 个 value + 7 个 type re-export）和 `@/shared/embedding`（新增 4 个 value re-export）代理模块。

### 1.2 早期修复（3 处）

| 文件 | 原导入 | 修复后 |
|------|--------|--------|
| `apiConfigActions.ts` | `saveConfig` from `@/infrastructure/api-config-facade` | `@/shared/api-config` |
| `apiConfigActions.ts` | `testConnection` from `@/infrastructure/ai-providers` | `@/shared/api-config` |
| `ProviderCardParts.tsx` | `testConnection` from `@/infrastructure/ai-providers` | `@/shared/api-config` |

---

## 二、允许保留的导入（6 处，不需修复）

### DI Container 导入（6 处）

`@/infrastructure/di` 是 architecture-rules.md 明确允许 app/ 层导入的：

- `src/app/ClientProviders.tsx:4` — `container`
- `src/app/story/hooks/use-story-page-parts.ts:2` — `container`
- `src/app/story/StoryProvider.tsx:14` — `container`
- `src/app/asset-library/use-asset-edit-handlers.ts:11` — `container`
- `src/app/story/beat/$beatId/use-beat-detail-actions.ts:13` — `container`

注：原 `src/app/settings/hooks/useSettingsPage.ts` 的 DI 导入随 settings 迁移至 `src/modules/settings/`，不再属于 app/ 范围。

---

## 三、未修复的技术债务（0 处）

所有 `@/infrastructure/*` 直接导入违规已全部修复。`src/app/` 下仅剩 6 处 `@/infrastructure/di` 导入（architecture-rules.md 明确允许）。

### MigrationInitializer.tsx 违规已修复（2026-07-14）

新建 `@/shared/ai-providers/index.ts` 代理模块，re-export `apiCall`、`processPendingQueue`、`cleanCompletedRequests`，然后将 MigrationInitializer.tsx 的 2 处直接导入改为通过代理访问。

---

## 四、验证状态

- `npm run typecheck`：✅ 通过（0 错误）
- `npm run lint:arch`：✅ 无架构违规
- 已修复 16 处（settings 迁移 11 + 早期 3 + MigrationInitializer 2），保留 6 处（DI），剩余 0 处技术债务
