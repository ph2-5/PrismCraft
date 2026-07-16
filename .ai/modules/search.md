# Search 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services/global-search | 🟡 中 | 跨四类资源搜索、动态 import 多个 service、相关度排序、结果上限控制 |
| presentation/search-bar | 🟢 低 | 搜索栏 UI 组件、Ctrl+K 快捷键、集成 SearchDialog |

## 子域依赖图

```
services/global-search.ts
  ← @/domain/schemas（SearchResult 类型）
  ← @/modules/character, @/modules/scene, @/modules/storyboard, @/modules/asset（动态 import service）
  ← @/shared/constants（t() 国际化）
presentation/search-bar.tsx
  ← @/shared/presentation/SearchDialog
  ← @/shared/presentation/BeforeUnloadGuard（useNavigationGuard）
  ← @/shared/constants（t() 国际化）
  ← services/global-search
  ↑
index.ts（barrel）
  ↑
@/app/SidebarWithSearch.tsx
@/modules/agent-tools-asset/asset-tools.ts（search_assets 工具）
```

- 两个子域彼此独立：services 负责搜索逻辑，presentation 负责 UI 触发器
- 所有 service 通过 `await import()` 动态加载，避免静态导入触发的循环依赖风险，并减少初始 bundle 体积
- 不持有任何状态（纯函数 + UI 组件）
- 不修改任何资源数据（只读操作）

## 公共 API

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

## 常见修改场景

### 1. 修改搜索相关度排序或匹配逻辑
- 修改文件：`services/global-search.ts`
- 检查不变量：名称完全匹配 100 分 / 前缀匹配 80 分 / 包含匹配 50 分 / 描述匹配 20 分 / 风格匹配 15 分（仅角色有 style）/ 标签匹配 10 分；各 service 失败时返回空数组而非抛异常
- 测试：`npx vitest run src/modules/search/services/__tests__/global-search.test.ts`

### 2. 修改类型筛选或标签搜索
- 修改文件：`services/global-search.ts`
- 检查不变量：`assetType: "all"` 搜索全部四类（默认）；标签搜索大小写不敏感子串匹配，仅对 character/scene/media-asset 生效（story schema 无 tags 字段）；每类资产返回上限 50，总结果上限 100
- 测试：`npx vitest run src/modules/search/services/__tests__/global-search.test.ts`

### 3. 修改搜索结果路由映射
- 修改文件：`services/global-search.ts`（`getSearchResultRoute`）
- 检查不变量：character → `/characters?highlight={id}`；scene → `/scenes?highlight={id}`；story → `/storyboard/{id}`；media-asset → `/asset-library?highlight={id}`；纯函数无副作用
- 测试：`npx vitest run src/modules/search/services/__tests__/global-search.test.ts`

### 4. 修改搜索栏 UI 或快捷键
- 修改文件：`presentation/search-bar.tsx`
- 检查不变量：`Ctrl+K` / `Cmd+K` 快捷键默认启用，可通过 `enableShortcut=false` 禁用；点击搜索结果使用 `guardedPush` 跳转，不直接修改 location；SearchDialog 由 `@/shared/presentation` 提供
- 测试：手动验证 Ctrl+K 触发搜索栏

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`（presentation、constants）、`@/modules/character`、`@/modules/scene`、`@/modules/storyboard`、`@/modules/asset`（动态 import）
- **禁止导入**：`@/infrastructure/*`（除 di）、`electronAPI.*`、`localStorage`
- **禁止**：直接调用 `electronAPI.*` 和 IPC
- **禁止**：修改任何资源数据（只读操作）
- **必须**：各 service 通过动态 `import()` 加载，避免循环依赖
- **必须**：各 service 失败时返回空数组而非抛异常，保证部分可用
- **必须**：点击搜索结果使用 `guardedPush` 跳转，不直接修改 location

## 测试验证

- 测试命令：`npx vitest run src/modules/search`
- 关键测试文件：
  - `services/__tests__/global-search.test.ts` — 全局搜索服务（跨四类资源、相关度排序、类型筛选）
