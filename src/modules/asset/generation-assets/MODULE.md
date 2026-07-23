# asset/generation-assets ✅

生成资产统一管理（Task 4.11）。

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 子域

| 子域 | 状态 | 说明 | 公共 API |
|------|:----:|------|----------|
| services | ✅ | CRUD 业务逻辑 | listAssetsByType, listAssetsByProject, createAsset, deleteAsset, deleteUnreferencedAssets, getReferenceInfo |
| hooks | ✅ | React 状态管理 | useGenerationAssets |
| presentation | ✅ | UI 组件 | AssetGallery |

## 公共 API

- `listAssetsByType(type)` — 按类型筛选资产
- `listAssetsByProject(projectId)` — 按项目筛选资产
- `listAssetsByBeat(beatId)` — 按分镜筛选资产
- `createAsset(input)` — 创建生成资产记录
- `deleteAsset(id)` — 删除资产（软删除）
- `deleteUnreferencedAssets()` — 清理未被引用的资产
- `getReferenceInfo(asset)` — 获取资产的引用位置信息
- `useGenerationAssets(options)` — React Hook
- `AssetGallery` — UI 组件，资产画廊

## 边界约束

- 通过 DI container 获取 IGenerationAssetStorage
- 禁止导入 infrastructure/storage
- generation_assets 表独立于 media_assets 表
