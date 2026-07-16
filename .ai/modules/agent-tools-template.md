# Agent Tools Template 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| template-tools | 🟡 中 | 项目模板管理（5 个）、applyTemplate 覆盖现有数据需确认、通过 container.videoTaskStorage 访问 |
| prompt-template-tools | 🟢 低 | Prompt 模板管理（4 个）、纯 CRUD 操作 |

## 子域依赖图

```
template-tools.ts（5 个）
  ← @/domain/types/agent-tools、@/shared/constants/tool-timeouts
  ← @/infrastructure/di（container.videoTaskStorage）
  ← @/modules/character, @/modules/scene, @/modules/storyboard（动态导入 service）
prompt-template-tools.ts（4 个）
  ← @/domain/types/agent-tools
  ↑
index.ts（barrel + allTemplateTools 聚合）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- 两个工具文件彼此独立，均为叶子工具集
- `template-tools` 通过 DI container 访问 `videoTaskStorage`
- 两者都动态导入 character/scene/storyboard 服务
- 工具聚合数组 `allTemplateTools` = `templateTools` + `promptTemplateTools`

## 公共 API

### 项目模板工具（5 个）
- `listTemplatesTool` — 列出模板工具（list_templates）
- `applyTemplateTool` — 应用模板工具（apply_template）
- `createTemplateTool` — 创建模板工具（create_template）
- `importTemplateTool` — 导入模板工具（import_template）
- `exportTemplateTool` — 导出模板工具（export_template）
- `templateTools` — 项目模板工具聚合数组（5 个）

### Prompt 模板工具（4 个）
- `promptTemplateTools` — Prompt 模板管理工具聚合数组（4 个）

### 工具聚合数组
- `allTemplateTools` — 全部 9 个模板工具的聚合数组（项目模板 + Prompt 模板）

## 常见修改场景

### 1. 新增项目模板或 Prompt 模板工具
- 修改文件：`template-tools.ts` 或 `prompt-template-tools.ts`，在 `index.ts` 追加 export，更新 `allTemplateTools` 数组
- 检查不变量：工具命名唯一、所有工具声明 `dangerLevel`、applyTemplate / importTemplate `requiresConfirmation: true`（覆盖现有数据）
- 测试：`npx vitest run src/modules/agent-tools-template/__tests__/template-tools.test.ts`

### 2. 修改模板应用逻辑
- 修改文件：`template-tools.ts`（applyTemplateTool 的 execute 函数）
- 检查不变量：通过 `container.videoTaskStorage` 访问；动态导入 character/scene/storyboard service 应用模板内容
- 测试：`npx vitest run src/modules/agent-tools-template/__tests__/template-tools.test.ts`

### 3. 修改 Prompt 模板管理
- 修改文件：`prompt-template-tools.ts`
- 检查不变量：Prompt 模板 CRUD 操作
- 测试：`npx vitest run src/modules/agent-tools-template/__tests__/template-tools.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`、`@/infrastructure/di`
- **禁止导入**：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）、`@/infrastructure/*`（除 `@/infrastructure/di`）、`@/modules/*/*/*`（深路径）
- **禁止**：直接调用 `electronAPI.*`
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：character/scene/storyboard service 通过动态 import 获取

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-template`
- 关键测试文件：
  - `__tests__/template-tools.test.ts` — 9 个模板工具
