# Search 模块

> 全局搜索模块，提供跨角色 / 场景 / 故事 / 素材的统一搜索能力。

## 模块概述

Task 4.6 新增模块。统一搜索入口，支持模糊匹配 + 标签搜索 + 类型筛选。复用现有 `SearchDialog` UI 组件，提供独立的 `SearchBar` 触发器（支持 `Ctrl+K` 快捷键）。Agent 工具 `search_assets` 调用此模块的 `globalSearch` 服务。

## 子域

| 子域 | 路径 | 说明 |
|------|------|------|
| services | `./services/global-search.ts` | 全局搜索服务（跨四类资源） |
| presentation | `./presentation/search-bar.tsx` | 搜索栏 UI 组件（含 Ctrl+K 快捷键） |

## 依赖

- `@/domain/schemas` — SearchResult 类型
- `@/modules/character` — characterService.getAll()（动态 import）
- `@/modules/scene` — sceneService.getAll()（动态 import）
- `@/modules/storyboard` — storyService.getAll()（动态 import）
- `@/modules/asset` — mediaAssetService.getAll()（动态 import）
- `@/shared/presentation/SearchDialog` — 搜索弹窗 UI
- `@/shared/presentation/BeforeUnloadGuard` — useNavigationGuard
- `@/shared/constants` — t() 国际化

**动态 import 策略**：所有 service 通过 `await import()` 动态加载，避免静态导入触发的循环依赖风险，并减少初始 bundle 体积。

## 公共 API

通过 `@/modules/search` 导入。

### 搜索服务
- `globalSearch` — 跨四类资源搜索，返回 `{ results, total, counts }`
- `quickSearch` — 简化搜索（仅返回 `SearchResult[]`，兼容 SearchDialog.onSearch 签名）
- `getSearchResultRoute` — 获取搜索结果对应的路由路径

### 类型
- `GlobalSearchOptions` — 搜索选项（assetType / tag / limitPerType / totalLimit）
- `GlobalSearchResult` — 搜索结果（results / total / counts）
- `SearchableType` — 可搜索类型联合（"character" | "scene" | "story" | "media-asset"）

### UI 组件
- `SearchBar` — 搜索栏组件
  - Props: `variant?: "button" | "inline"`、`enableShortcut?: boolean`、`buttonText?: string`
  - 内置 `Ctrl+K` / `Cmd+K` 快捷键监听
  - 集成 SearchDialog + globalSearch + guardedPush

## 搜索逻辑

### 相关度排序
- 名称完全匹配：100 分
- 名称前缀匹配：80 分
- 名称包含匹配：50 分
- 描述匹配：20 分
- 风格匹配：15 分（仅角色有 style 字段）
- 标签匹配：10 分

### 标签搜索
- 通过 `tag` 参数过滤
- 大小写不敏感，子串匹配
- 仅对 character / scene / media-asset 生效（story schema 无 tags 字段）

### 类型筛选
- `assetType: "all"` — 搜索全部四类（默认）
- `assetType: "character"` — 仅搜索角色
- `assetType: "scene"` — 仅搜索场景
- `assetType: "story"` — 仅搜索故事
- `assetType: "media-asset"` — 仅搜索媒体素材

### 结果限制
- 每类资产返回上限：默认 20，最大 50
- 总结果上限：默认 50，最大 100

## 路由映射

| 类型 | 路由 |
|------|------|
| character | `/characters?highlight={id}` |
| scene | `/scenes?highlight={id}` |
| story | `/storyboard/{id}` |
| media-asset | `/asset-library?highlight={id}` |

## 边界约束

- 不持有任何状态（纯函数 + UI 组件）
- 不直接调用 electronAPI；不调用 IPC
- 各 service 失败时返回空数组而非抛异常，保证部分可用
- 不修改任何资源数据（只读操作）
- SearchDialog 组件由 `@/shared/presentation` 提供，本模块仅提供触发器和服务
