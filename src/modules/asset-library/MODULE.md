# Asset Library Module ✅

> 素材库页面型模块。提供角色/场景/道具/视频/图片素材的统一浏览、筛选、编辑、上传、删除入口。

## 概述

素材库是用户管理所有生成资产的中心入口，支持分类树导航、批量操作、属性编辑、上传导入等能力。本模块为页面型模块，仅暴露 `AssetLibraryPage` 给路由，内部通过 hooks 组织业务逻辑。

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 公共 API

- `AssetLibraryPage` — 素材库页面组件（默认导出，由 router lazy import）

## 子域

| 子域 | 状态 | 文件 | 说明 |
|------|:----:|------|------|
| 页面入口 | ✅ | `page.tsx` | 素材库页面主入口 |
| 页面编排 | ✅ | `hooks/use-asset-library-page.ts` | 页面状态编排（筛选 + 列表 + 对话框） |
| 筛选状态 | ✅ | `hooks/use-asset-filtering.ts`, `hooks/use-asset-dialog-state.ts` | 筛选条件与对话框状态管理 |
| 辅助数据 | ✅ | `hooks/use-secondary-data-loader.ts` | 加载分类、集合等辅助数据 |
| 列表展示 | ✅ | `AssetCardGrid.tsx`, `AssetCards.tsx`, `CategoryTree.tsx` | 卡片网格 + 分类树 |
| 工具栏 | ✅ | `AssetToolbar.tsx` | 顶部筛选/搜索/视图切换工具栏 |
| 上传 | ✅ | `AssetUploadSection.tsx` | 文件上传区域 |
| 编辑对话框 | ✅ | `AssetEditDialog.tsx` | 资产属性编辑 |
| 集合对话框 | ✅ | `AssetCollectionDialogs.tsx`, `AssetCollectionDialogsParts.tsx` | 集合创建/编辑对话框 |
| 道具库 | ✅ | `PropLibraryPanel.tsx` | 道具库专属面板 |
| 内容容器 | ✅ | `AssetLibraryContent.tsx`, `asset-library-shared.ts` | 内容区容器 + 共享类型 |
| 操作逻辑 | ✅ | `assetLibraryActions.ts`, `use-asset-library-actions.ts`, `use-asset-batch-handlers.ts`, `use-asset-collection-handlers.ts`, `use-asset-delete-handlers.ts`, `use-asset-edit-handlers.ts` | CRUD 操作处理器 |

## 边界约束

- **依赖方向**：可导入 `@/domain/*`, `@/shared/*`, `@/shared-logic/*`, `@/infrastructure/di`
- **禁止导入**：`@/infrastructure/*`（除 DI 容器），`@/modules/*`（其他模块的深层路径），`@/app/*`
- **数据访问**：通过 `@/infrastructure/di` 的 `container.generationAssetStorage` 等存储端口访问数据
- **文件操作**：通过 `@/shared/file-http` 统一层，禁止直接调用 `electronAPI`

## 测试

- `__tests__/regression-r185-upload-drop-zone.test.tsx` — R185 上传拖拽区回归
- `__tests__/regression-reentry-guard.test.ts` — 重入防护回归
