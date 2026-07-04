<!-- AI: Before modifying this module, read contract.json for invariants -->
# Asset Module

## 模块概述

资产库管理模块，负责媒体资产的创建/更新/删除、角色/场景/分镜资源的 CRUD 与本地文件管理、项目数据的导入导出（JSON 格式备份与恢复）、以及收藏集管理。本模块是资源持久化的核心入口。

---

## 子域结构

| 子域 | 路径 | 职责 |
|------|------|------|
| `asset-library` | [asset-library/](./asset-library/) | 资产库服务：角色、场景、分镜资源、收藏集 CRUD 与本地文件管理、ASA 格式导出 |
| `media-assets` | [media-assets/](./media-assets/) | 媒体资产管理：媒体文件的创建、更新、删除、批量操作 |
| `import-export` | [import-export/](./import-export/) | 项目数据导入导出：JSON 格式完整项目备份与恢复、合并策略 |
| `hooks` | [hooks/](./hooks/) | React Query Hooks 封装：媒体资产、导入导出、项目导出 |
| `presentation` | [presentation/](./presentation/) | UI 组件：批量操作、媒体导出、项目导入导出 |

---

## 公共 API

### asset-library 子域

| API | 签名 | 说明 |
|-----|------|------|
| `characterService` | `AssetService<Character>` | 角色资产服务（getAll, getById, create, update, delete） |
| `sceneService` | `AssetService<Scene>` | 场景资产服务（getAll, getById, create, update, delete） |
| `storyboardAssetService` | `AssetService<StoryboardAsset>` | 分镜资源服务（getAll, getById, create, update, delete） |
| `collectionService` | CollectionService | 收藏集服务（CRUD + 资产关联管理） |
| `assetExportService` | AsaExportService | ASA 格式导出服务 |

### media-assets 子域

| API | 签名 | 说明 |
|-----|------|------|
| `mediaAssetService` | MediaAssetService | 媒体资产服务（create, update, delete, batchDelete） |

### import-export 子域

| API | 签名 | 说明 |
|-----|------|------|
| `MergeStrategy` | `type: "replace" \| "merge" \| "skip"` | 合并策略类型 |

### hooks 子域

| API | 签名 | 说明 |
|-----|------|------|
| `useMediaAssets` | `() → UseQueryResult<MediaAsset[]>` | 获取媒体资产列表 |
| `useCreateMediaAsset` | `() → UseMutationResult` | 创建媒体资产 |
| `useDeleteMediaAsset` | `() → UseMutationResult` | 删除媒体资产 |
| `useExportData` | `() → UseMutationResult<ExportResult>` | 导出数据 |
| `useDownloadExport` | `() → UseMutationResult` | 下载导出文件 |
| `useImportData` | `() → UseMutationResult` | 导入数据 |
| `useImportFromFile` | `() → UseMutationResult` | 从文件导入 |
| `useProjectExport` | `() → UseMutationResult<ProjectData>` | 项目导出 |
| `ProjectData` | `type` | 项目数据类型 |
| `ExportResult` | `type` | 导出结果类型 |

### presentation 子域

| API | 签名 | 说明 |
|-----|------|------|
| `BatchOperations` | `React.FC` | 批量操作组件 |
| `ProjectExportImport` | `React.FC` | 项目导入导出组件 |

---

## 依赖关系

| 依赖 | 用途 |
|------|------|
| `@/domain/schemas` | MediaAsset, Character, Scene, StoryboardAsset, Collection 等类型定义 |
| `@/domain/types` | Result, AppError, ValidationError, NotFoundError 类型 |
| `@/infrastructure/di` | 依赖注入容器，获取 storage 实例 |
| `@/shared/event-types` | 领域事件类型 |
| `@tanstack/react-query` | hooks 子域的数据获取与缓存 |

### 子域内部依赖图

```
asset-library ← @/domain/schemas, @/infrastructure/di
media-assets  ← @/domain/schemas, @/infrastructure/di
import-export ← @/domain/schemas, @/infrastructure/di
  │
  ▼
hooks ← asset-library, media-assets, import-export, @tanstack/react-query
  │
  ▼
presentation ← hooks, @/shared/ui
```

- `asset-library`、`media-assets`、`import-export` 是底层服务子域，彼此独立
- `hooks` 依赖三个底层子域，提供 React hooks
- `presentation` 依赖 `hooks`，提供 UI 组件

---

## 边界约束

1. 子域之间只能通过各自的 `index.ts` 导出的 API 通信
2. 禁止直接引用其他子域的内部文件
3. `hooks` 子域依赖 `asset-library`、`media-assets`、`import-export` 子域
4. `presentation` 子域依赖 `hooks` 子域，不直接调用 services
5. 禁止导入路径：`@/types/*`、`@/lib/*`、`@/modules/*/*/*`
6. 类型必须从 `@/domain/schemas` 导入
7. 禁止 `@/infrastructure/*` 直接导入（除 `@/infrastructure/di`），必须通过 DI 容器

---

## 不变量

- **INV-1**：生成的图片文件通过 `saveImageToLocal` 保存到本地，不使用远程 URL 存储
- **INV-2**：删除资产时同步删除关联的本地文件（图片、缩略图等），防止孤立文件
- **INV-3**：角色服装图片通过 `updateOutfitImage` 更新，确保本地路径与数据库记录同步
- **INV-4**：`asset-library` 子域不依赖其他子域
- **INV-5**：媒体资产 ID 使用 `crypto.randomUUID()` 生成
- **INV-6**：导入数据必须通过 `validateImportData` 校验格式和完整性
- **INV-7**：合并策略支持 `replace` / `merge` / `skip` 三种模式
- **INV-8**：导出格式为标准 JSON，导出操作必须保持资产间的引用关系
- **INV-9**：`import-export` 子域不依赖其他子域
- **INV-10**：使用 React Query 进行数据获取和缓存，mutation 成功后自动 `invalidateQueries`
- **INV-11**：`presentation` 子域通过 hooks 获取数据，不直接调用 services
- **INV-12**：导入使用 write-then-clean 模式（R13），禁止先删后写

---

## AI 维护指南

详细 AI 重构规范请参见：[.ai/modules/asset.md](../../../.ai/modules/asset.md)

### 修改前必读顺序

1. 本文件（MODULE.md）— 模块概览与公共 API
2. 子域 `contract.json` — 不变量与依赖
3. [.ai/modules/asset.md](../../../.ai/modules/asset.md) — 详细修改规则
4. `index.ts` — 实际桶导出

### 新增公共 API 时

1. 在子域 `index.ts` 中导出
2. 在模块 `index.ts` 中重新导出
3. 更新本文件「公共 API」部分
4. 更新子域 `contract.json` 的 `publicAPI` 字段
5. 运行 `node scripts/check-module-api-consistency.mjs` 验证

### 修改子域内部实现时

1. 检查 `contract.json` 的 `invariants`，确保不违反不变量
2. 不改变公共 API 签名则无需更新文档
3. 运行 `npx eslint .` 和 `node scripts/check-architecture.mjs` 验证

### 回归守卫提醒

- **R2**：删除资产时必须级联清理关联资源（VideoTask、cache、media refs）
- **R13**：导入使用 write-then-clean 模式，禁止先删后写
- **R15**：批量删除操作必须对每个条目独立 try-catch，部分失败不影响其余条目
- **R18**：存储配额错误必须通知用户

### 测试

- 测试文件位于各子域的 `__tests__/` 目录
- 运行：`npx vitest run src/modules/asset`
- 新增服务必须编写单元测试
