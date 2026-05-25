# Asset Module

## 职责

资产库管理：媒体资产管理、角色/场景/分镜资源的导入导出、项目备份与恢复

---

## 子域结构

本模块采用子域架构，包含 5 个内部子域：

| 子域 | 路径 | 职责 |
|------|------|------|
| `asset-library` | [asset-library/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/asset/asset-library/) | 资产库服务：角色、场景、分镜资源、收藏集 CRUD |
| `media-assets` | [media-assets/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/asset/media-assets/) | 媒体资产管理 |
| `import-export` | [import-export/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/asset/import-export/) | 项目数据导入导出 |
| `hooks` | [hooks/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/asset/hooks/) | React Query Hooks 封装 |
| `presentation` | [presentation/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/asset/presentation/) | UI 组件 |

---

## 公共 API（index.ts）

### 资产库子域
- `characterService` — 角色服务
- `sceneService` — 场景服务
- `storyboardAssetService` — 分镜资源服务
- `collectionService` — 收藏集服务
- `assetExportService` — ASA 格式导出服务

### 媒体资产子域
- `mediaAssetService` — 媒体资产服务

### 导入导出子域
- `MergeStrategy` — 合并策略类型 (type)

### Hooks 子域
- `useMediaAssets` — 获取媒体资产列表 Hook
- `useCreateMediaAsset` — 创建媒体资产 Hook
- `useDeleteMediaAsset` — 删除媒体资产 Hook
- `useExportData` — 导出数据 Hook
- `useDownloadExport` — 下载导出 Hook
- `useImportData` — 导入数据 Hook
- `useImportFromFile` — 从文件导入 Hook
- `useProjectExport` — 项目导出 Hook
- `ProjectData` — 项目数据类型 (type)
- `ExportResult` — 导出结果类型 (type)

### 展示子域
- `BatchOperations` — 批量操作组件
- `MediaExporter` — 媒体导出组件
- `ProjectExportImport` — 项目导入导出组件

---

## 依赖

- `@/domain/schemas` - MediaAsset, Character, Scene 等类型
- `@/infrastructure/di` - 依赖注入容器
- `@/infrastructure/storage` - 数据持久化

---

## 边界约束

⚠️ **重要约束**：
- 子域之间只能通过各自的 `index.ts` 导出的 API 通信
- 禁止直接引用其他子域的内部文件
- hooks 子域依赖 asset-library、media-assets、import-export 子域
- presentation 子域依赖 hooks 子域

---

## AI 维护指南

本模块的详细 AI 重构规范请参见：[.ai/modules/asset.md](../../../.ai/modules/asset.md)

### 快速参考

- 禁止导入路径：`@/types/*`, `@/lib/*`, `@/modules/*/*/*`
- 类型必须从：`@/domain/schemas` 导入
- 使用 Result 模式处理异步操作
