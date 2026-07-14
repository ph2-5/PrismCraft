# Scenes 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| 场景列表 | 🟢 低 | 列表渲染、选择状态 |
| 场景编辑 | 🟢 低 | 编辑表单、图片上传 |
| 页面组合 | 🟢 低 | `page.tsx` 组合列表和编辑器，无业务逻辑 |

## 子域依赖图

```
page.tsx（组合入口）
  ├→ components/SceneList（列表展示）
  └→ SceneEditorParts（编辑器部件）
       ← hooks/use-scenes-page（业务逻辑）
            ← @/shared/*（配置/存储代理）
```

## 公共 API

- `ScenesPage`（默认导出，由 router lazy import）— 唯一对外暴露的入口

> 本模块无 contract.json。所有内部文件不对外导出，仅由 `page.tsx` 内部组合使用。

## 常见修改场景

### 1. 修改场景编辑表单
- 修改文件：`SceneEditorParts.tsx`、`hooks/use-scenes-page.ts`
- 测试：手动验证（无单元测试）

### 2. 修改场景列表展示
- 修改文件：`components/SceneList.tsx`
- 测试：手动验证

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`、`@/shared-logic/*`、`@/infrastructure/di`
- **禁止导入**：`@/infrastructure/*`（除 DI 容器）、`@/modules/*`（其他模块）、`@/app/*`
- **文件操作**：使用 `@/shared/file-http` 统一层，禁止直接调用 `electronAPI.writeFile/getConfig`

## 测试验证

- 测试命令：无单元测试
- 验证方式：手动验证场景 CRUD 和图片上传
