# Asset Library 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| 资产上传 | 🔴 高 | 拖拽上传、防重入守卫、批量上传、文件校验 |
| 资产编辑/删除 | 🟡 中 | 编辑表单、级联删除、集合管理 |
| 资产过滤/分类 | 🟢 低 | 分类树、过滤逻辑、UI 状态 |
| 页面组合 | 🟢 低 | `page.tsx` 组合内容区，无业务逻辑 |

## 子域依赖图

```
page.tsx（组合入口）
  └→ AssetLibraryContent
       ├→ AssetUploadSection ← @/shared/file-http（上传）
       ├→ AssetToolbar + CategoryTree（过滤/分类）
       ├→ AssetCardGrid + AssetCards（展示）
       └→ AssetEditDialog + AssetCollectionDialogs（编辑/集合）
            ← hooks/use-asset-*（业务逻辑）
```

## 公共 API

- `AssetLibraryPage`（默认导出，由 router lazy import）— 唯一对外暴露的入口

> 本模块无 contract.json。所有内部文件不对外导出，仅由 `page.tsx` 内部组合使用。

## 常见修改场景

### 1. 修改资产上传逻辑
- 修改文件：`AssetUploadSection.tsx`、`use-asset-batch-handlers.ts`、`assetLibraryActions.ts`
- 检查不变量：R185（拖拽上传 drop zone）、reentry-guard（上传防重入）
- 测试：`npx vitest run src/modules/asset-library/__tests__/regression-r185-upload-drop-zone.test.tsx`、`regression-reentry-guard.test.ts`

### 2. 修改资产编辑/删除
- 修改文件：`AssetEditDialog.tsx`、`use-asset-edit-handlers.ts`、`use-asset-delete-handlers.ts`
- 注意：删除资产时需检查是否被角色/场景/分镜引用
- 测试：手动验证

### 3. 修改资产过滤/分类
- 修改文件：`CategoryTree.tsx`、`use-asset-filtering.ts`、`use-asset-dialog-state.ts`
- 测试：手动验证

### 4. 修改资产集合
- 修改文件：`AssetCollectionDialogs.tsx`、`use-asset-collection-handlers.ts`
- 测试：手动验证

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`、`@/shared-logic/*`、`@/infrastructure/di`
- **禁止导入**：`@/infrastructure/*`（除 DI 容器）、`@/modules/*`（其他模块）、`@/app/*`
- **文件操作**：使用 `@/shared/file-http` 统一层，禁止直接调用 `electronAPI.writeFile/getConfig`

## 测试验证

- 测试命令：`npx vitest run src/modules/asset-library`
- 关键测试文件：
  - `__tests__/regression-r185-upload-drop-zone.test.tsx` — 拖拽上传 drop zone
  - `__tests__/regression-reentry-guard.test.ts` — 上传防重入守卫
