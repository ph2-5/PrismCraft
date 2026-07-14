# Quick Generate 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| 生成表单 | 🟡 中 | Reducer 状态管理、高级设置、模板选择 |
| 历史记录 | 🟡 中 | Blob URL 生命周期管理、DOM ref 使用 |
| 任务结果 | 🟢 低 | 结果展示面板 |
| 页面组合 | 🟢 低 | `page.tsx` 组合各面板，无业务逻辑 |

## 子域依赖图

```
page.tsx（组合入口）
  ├→ QuickGenerateForm（表单）
  │     ├→ AdvancedSettingsCard（高级设置）
  │     └→ TemplateSelectDialog（模板选择）
  ├→ QuickGenerateHistory（历史）
  └→ TaskResultPanel（结果）
       ← hooks/use-quick-generate-page + quick-generate-reducer
            ← @/shared/*（配置/存储代理）
```

## 公共 API

- `QuickGeneratePage`（默认导出，由 router lazy import）— 唯一对外暴露的入口

> 本模块无 contract.json。所有内部文件不对外导出，仅由 `page.tsx` 内部组合使用。

## 常见修改场景

### 1. 修改生成表单逻辑
- 修改文件：`QuickGenerateForm.tsx`、`quick-generate-reducer.ts`、`hooks/use-quick-generate-page.ts`
- 注意：状态管理使用 Reducer 模式，修改时需同步更新 `QuickGenerateState.ts` 类型定义
- 测试：手动验证

### 2. 修改历史记录展示
- 修改文件：`QuickGenerateHistory.tsx`
- 检查不变量：R177（DOM ref 使用）、blob-url（Blob URL 内存管理）
- 测试：`npx vitest run src/modules/quick-generate/__tests__/regression-r177-dom-use-ref.test.tsx`、`regression-blob-url.test.ts`

### 3. 修改高级设置
- 修改文件：`AdvancedSettingsCard.tsx`
- 测试：手动验证

### 4. 修改模板选择
- 修改文件：`TemplateSelectDialog.tsx`
- 测试：手动验证

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`、`@/shared-logic/*`、`@/infrastructure/di`
- **禁止导入**：`@/infrastructure/*`（除 DI 容器）、`@/modules/*`（其他模块）、`@/app/*`
- **文件操作**：使用 `@/shared/file-http` 统一层，禁止直接调用 `electronAPI.writeFile/getConfig`
- **Blob URL**：创建后必须在组件卸载时 `URL.revokeObjectURL()` 释放，防止内存泄漏

## 测试验证

- 测试命令：`npx vitest run src/modules/quick-generate`
- 关键测试文件：
  - `__tests__/regression-r177-dom-use-ref.test.tsx` — DOM ref 使用守卫
  - `__tests__/regression-blob-url.test.ts` — Blob URL 内存管理
