# src/app/ 架构违规技术债务记录

> 本文件记录 `src/app/` 目录下直接导入 `@/infrastructure/*` 绕过 `@/shared/*` 代理层的已知技术债务。
> 根据 `.trae/rules/architecture-rules.md`，纯函数应通过 `@/shared/` 代理模块访问。
> 创建时间：2026-07-12

---

## 一、已修复的违规（3 处）

以下导入已改为通过 `@/shared/api-config` 代理：

| 文件 | 原导入 | 修复后 |
|------|--------|--------|
| `src/app/settings/apiConfigActions.ts` | `saveConfig` from `@/infrastructure/api-config-facade` | `@/shared/api-config` |
| `src/app/settings/apiConfigActions.ts` | `testConnection` from `@/infrastructure/ai-providers` | `@/shared/api-config` |
| `src/app/settings/ProviderCardParts.tsx` | `testConnection` from `@/infrastructure/ai-providers` | `@/shared/api-config` |

---

## 二、允许保留的导入（12 处，不需修复）

### 2.1 DI Container 导入（6 处）

`@/infrastructure/di` 是 architecture-rules.md 明确允许 app/ 层导入的：

- `src/app/ClientProviders.tsx:4` — `container`
- `src/app/story/hooks/useStoryPageParts.ts:2` — `container`
- `src/app/story/StoryProvider.tsx:14` — `container`
- `src/app/asset-library/useAssetEditHandlers.ts:11` — `container`
- `src/app/settings/hooks/useSettingsPage.ts:5` — `container`
- `src/app/story/beat/$beatId/use-beat-detail-actions.ts:13` — `container`

### 2.2 Type-only 导入（6 处）

`import type { ... }` 或 `import { type X }` 在编译时消除，不算运行时违规：

- `src/app/settings/ApiConfigPanel.tsx:12` — `type ApiCapability`
- `src/app/settings/ApiConfigPanelParts.tsx:3` — `type ApiCapability`
- `src/app/settings/ModelMappingSection.tsx:6` — `type ApiCapability, type ApiConfig`
- `src/app/settings/ProviderCard.tsx:1` — `type ApiConfig, type ProviderConfig, type ModelConfig`
- `src/app/settings/ProviderCardParts.tsx:19` — `type ApiCapability, type ProviderConfig, type ModelConfig`
- `src/app/settings/ProviderForm.tsx:4` — `type DetectResult`

---

## 三、未修复的技术债务（7 处）

### 3.1 无 shared 代理可用（2 处）

以下 infrastructure 模块在 `@/shared/` 下没有对应的代理模块，且任务要求不创建新代理文件：

#### `src/app/MigrationInitializer.tsx`

| 行号 | 导入 | 来源模块 | 原因 |
|------|------|----------|------|
| 3 | `processPendingQueue, cleanCompletedRequests` | `@/infrastructure/ai-providers/offline-queue` | `@/shared/` 下无 offline-queue 代理 |
| 4 | `apiCall` | `@/infrastructure/ai-providers/core` | `@/shared/` 下无 ai-providers/core 代理 |

**后续迁移计划**：在 `@/shared/` 下新建 `ai-providers/index.ts` 代理模块，re-export `apiCall`、`processPendingQueue`、`cleanCompletedRequests` 等纯函数。注意 `apiCall` 涉及网络 I/O，需确认是否属于"纯函数"范畴；若不属于，则应通过 DI container 注入而非 shared 代理。

### 3.2 shared 代理存在但不完整（5 处）

以下导入有对应的 shared 代理模块，但代理未导出所需的全部符号。
混合导入（同一 import 语句包含 type 和 value）中，type 部分可保留，value 部分因代理缺失而无法迁移。

#### `src/app/settings/apiConfigActions.ts:4-15`

从 `@/infrastructure/api-config-facade` 导入：
- **Type（保留）**：`ApiConfig, ApiCapability, ProviderConfig, ModelConfig`
- **Value（代理缺失）**：`addProvider, removeProvider, setCapabilityMapping, createProviderFromTemplate, getTemplateWithPlugins`
- **Value（代理已有但未拆分）**：`checkConfigStatus`（`@/shared/api-config` 已导出）

**原因**：`@/shared/api-config` 代理仅导出 `loadConfig, saveConfig, checkConfigStatus, initConfig, getAllTemplatesAsync, loadPluginTemplates, testConnection, ProviderTemplate`，缺少上述 5 个函数。
**后续迁移计划**：扩展 `@/shared/api-config/index.ts`，添加 `addProvider, removeProvider, setCapabilityMapping, createProviderFromTemplate, getTemplateWithPlugins` 的 re-export，然后拆分此 import。

#### `src/app/settings/EmbeddingModelPanel.tsx:35-44`

从 `@/infrastructure/embedding` 导入：
- **Value（代理已有）**：`detectLocalModel, ACCEPTED_ONNX_FILES`
- **Value（代理缺失）**：`installModelFromFiles, setActiveModel, removeModel, deriveModelId`
- **Type（代理已有）**：`ModelStatus, LocalModelEntry`

**原因**：`@/shared/embedding/index.ts` 代理未导出 `installModelFromFiles, setActiveModel, removeModel, deriveModelId`。
**后续迁移计划**：扩展 `@/shared/embedding/index.ts`，添加缺失的 re-export，然后迁移整个 import。

#### `src/app/settings/ProviderFormParts.tsx:11`

从 `@/infrastructure/api-config-facade` 导入：
- **Value（代理缺失）**：`getAllTemplates`（注意：代理有 `getAllTemplatesAsync` 但没有同步版 `getAllTemplates`）
- **Type（保留）**：`PluginProviderTemplate, ApiCapability, DetectResult`

**原因**：`@/shared/api-config` 代理未导出同步版 `getAllTemplates`。
**后续迁移计划**：扩展 `@/shared/api-config/index.ts`，添加 `getAllTemplates` 的 re-export。

#### `src/app/settings/plugin-manager.tsx:19-22`

从 `@/infrastructure/api-config-facade` 导入：
- **Value（代理缺失）**：`loadPluginDetectionRules`
- **Value（代理已有但未拆分）**：`loadPluginTemplates`（`@/shared/api-config` 已导出）

**原因**：`@/shared/api-config` 代理未导出 `loadPluginDetectionRules`。
**后续迁移计划**：扩展 `@/shared/api-config/index.ts`，添加 `loadPluginDetectionRules` 的 re-export，然后拆分此 import。

#### `src/app/settings/useApiConfigHandlers.ts:6-20`

从 `@/infrastructure/api-config-facade` 导入：
- **Type（保留）**：`ApiConfig, ApiCapability, ProviderConfig, ModelConfig, ConfigStatus`
- **Value（代理已有但未拆分）**：`loadConfig, saveConfig, loadPluginTemplates, checkConfigStatus`
- **Value（代理缺失）**：`getDefaultConfig, detectAllProviders, validateApiKey, loadPluginDetectionRules`

**原因**：`@/shared/api-config` 代理未导出 `getDefaultConfig, detectAllProviders, validateApiKey, loadPluginDetectionRules`。
**后续迁移计划**：扩展 `@/shared/api-config/index.ts`，添加缺失的 re-export，然后拆分此 import。

---

## 四、迁移优先级建议

1. **高优先级**：扩展 `@/shared/api-config/index.ts` 代理 — 影响 4 个文件（apiConfigActions.ts、plugin-manager.tsx、useApiConfigHandlers.ts、ProviderFormParts.tsx）
2. **高优先级**：扩展 `@/shared/embedding/index.ts` 代理 — 影响 1 个文件（EmbeddingModelPanel.tsx）
3. **中优先级**：为 `@/infrastructure/ai-providers/offline-queue` 和 `@/infrastructure/ai-providers/core` 建立 shared 代理 — 影响 1 个文件（MigrationInitializer.tsx），需先确认这些函数是否属于纯函数范畴

## 五、验证状态

- `npm run typecheck`：✅ 通过（0 错误）
- 已修复 3 处，保留 12 处（DI/type-only），记录 7 处技术债务
