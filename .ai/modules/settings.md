# Settings 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| API 配置 | 🟡 中 | Provider CRUD、模型映射、参数校验，涉及加密存储 |
| 插件系统 | 🔴 高 | 插件 CRUD、热重载、Schema 校验、预览导出，逻辑复杂且与 worker 进程交互 |
| 嵌入模型 | 🟢 低 | 单一面板 UI，依赖 `@/shared/embedding` 代理 |
| 提示模板 | 🟢 低 | 纯 UI 配置面板 |
| 页面入口 | 🟢 低 | `page.tsx` 组合各面板，无业务逻辑 |

## 子域依赖图

```
page.tsx（组合入口）
  ├→ API 配置（ApiConfigPanel + apiConfigActions + use-api-config-handlers）
  │     ← @/shared/api-config（代理 infrastructure 加密存储）
  ├→ 嵌入模型（EmbeddingModelPanel）
  │     ← @/shared/embedding
  ├→ 插件系统（plugin-manager + plugin-creator + plugin-api）
  │     ← @/infrastructure/di（pluginWorkerPool 等）、@/shared/*
  └→ 提示模板（PromptTemplatePanel）
        ← @/shared/*（配置读写）
```

## 公共 API

- `SettingsPage`（默认导出，由 router lazy import）— 唯一对外暴露的入口

> 本模块无 contract.json。所有内部子域文件不对外导出，仅由 `page.tsx` 内部组合使用。

## 常见修改场景

### 1. 新增/修改 API Provider 字段
- 修改文件：`ProviderForm.tsx`、`ProviderFormParts.tsx`、`apiConfigActions.ts`、`use-api-config-handlers.ts`
- 注意：Provider 配置通过 `@/shared/api-config` 代理写入加密存储，不要直接调用 `electronAPI.setConfig`
- 测试：手动验证（无单元测试覆盖）

### 2. 修改模型映射（Model Mapping）
- 修改文件：`ModelMappingSection.tsx`、`ModelParams.tsx`
- 注意：模型能力查询走 `@/shared/model-capabilities` 代理
- 测试：手动验证

### 3. 新增插件字段或修改插件 Schema
- 修改文件：`plugin-creator-types.ts`（类型）、`plugin-api.ts`（API）、`PluginModelDefs.tsx` / `PluginApiConfig.tsx` / `PluginRequestFormat.tsx` / `PluginResponseFormat.tsx` / `PluginUrlRules.tsx`（UI）
- 检查：声明式插件 Schema 与 `src/domain/schemas/user-plugin-schema.ts` 一致
- 测试：`npx vitest run src/modules/settings/__tests__/plugin-manager.test.tsx`、`plugin-add-form.test.tsx`

### 4. 修改插件管理逻辑（CRUD/热重载）
- 修改文件：`plugin-manager.tsx`、`plugin-api.ts`
- 注意：插件 worker 进程通过 DI container 访问，禁止直接 import `@/infrastructure/*`
- 测试：`npx vitest run src/modules/settings/__tests__/plugin-manager.test.tsx`

### 5. 修改嵌入模型配置
- 修改文件：`EmbeddingModelPanel.tsx`
- 注意：通过 `@/shared/embedding` 代理访问 infrastructure
- 测试：手动验证

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`、`@/shared-logic/*`、`@/infrastructure/di`
- **禁止导入**：`@/infrastructure/*`（除 DI 容器）、`@/modules/*`（其他模块）、`@/app/*`
- **基础设施访问**：通过 `@/shared/api-config`、`@/shared/embedding`、`@/shared/model-capabilities` 代理
- **文件/配置读写**：使用 `@/shared/file-http` 统一层，禁止直接调用 `electronAPI.writeFile/getConfig`

## 架构债务状态

迁移前存在 11 处直接 import `@/infrastructure/*` 的违规（5 处 value/mixed + 6 处 type-only），已在迁移时全部修复为通过 `@/shared/*` 代理访问。新增代码必须保持代理访问模式。

## 测试验证

- 测试命令：`npx vitest run src/modules/settings`
- 关键测试文件：
  - `__tests__/plugin-manager.test.tsx` — 插件管理 CRUD
  - `__tests__/plugin-list.test.tsx` — 插件列表渲染
  - `__tests__/plugin-add-form.test.tsx` — 插件新增表单校验
