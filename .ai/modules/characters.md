# Characters 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| 角色编辑 | 🟡 中 | 表单校验、AI 请求预览、并行更新守卫 |
| 角色列表 | 🟢 低 | 列表渲染、选择状态 |
| 页面组合 | 🟢 低 | `page.tsx` 组合列表和编辑器，无业务逻辑 |

## 子域依赖图

```
page.tsx（组合入口）
  ├→ CharacterList（列表展示）
  └→ CharacterEditor（编辑器）
       ├→ AiRequestPreview（AI 请求预览）
       └→ hooks/use-character-page（业务逻辑）
            ← @/shared/*（配置/存储代理）
```

## 公共 API

- `CharactersPage`（默认导出，由 router lazy import）— 唯一对外暴露的入口

> 本模块无 contract.json。所有内部文件不对外导出，仅由 `page.tsx` 内部组合使用。

## 常见修改场景

### 1. 修改角色编辑表单
- 修改文件：`CharacterEditor.tsx`、`hooks/use-character-page.ts`
- 检查不变量：parallel-updates（并行更新守卫）
- 测试：`npx vitest run src/modules/characters/__tests__/regression-parallel-updates.test.ts`

### 2. 修改 AI 请求预览
- 修改文件：`AiRequestPreview.tsx`
- 注意：预览内容不暴露完整 API 密钥
- 测试：手动验证

### 3. 修改角色列表展示
- 修改文件：`CharacterList.tsx`
- 测试：手动验证

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`、`@/shared-logic/*`、`@/infrastructure/di`
- **禁止导入**：`@/infrastructure/*`（除 DI 容器）、`@/modules/*`（其他模块）、`@/app/*`
- **文件操作**：使用 `@/shared/file-http` 统一层，禁止直接调用 `electronAPI.writeFile/getConfig`

## 测试验证

- 测试命令：`npx vitest run src/modules/characters`
- 关键测试文件：
  - `__tests__/regression-parallel-updates.test.ts` — 并行更新守卫
