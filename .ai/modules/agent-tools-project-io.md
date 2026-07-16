# Agent Tools Project IO 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| project-io-tools | 🟡 中 | 项目导入导出（4 个工具）、动态导入 @/modules/asset 服务、write-then-clean 模式（导入侧） |

## 子域依赖图

```
project-io-tools.ts（4 个工具）
  ← @/domain/types/agent-tools（ToolImpl 类型）
  ← @/shared/file-http（静态导入）
  ← @/modules/asset（动态导入服务，避免静态循环）
  ↑
index.ts（barrel + allProjectIoTools 聚合）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- 单一工具文件，结构简单
- 静态导入 `@/shared/file-http`，动态导入 `@/modules/asset` 服务
- 工具聚合数组 `allProjectIoTools` 与 `projectIoTools` 等价

## 公共 API

### 工具实现
- `exportProjectTool` — 导出项目工具（export_project）
- `importProjectTool` — 导入项目工具（import_project）
- `exportCharactersTool` — 导出角色工具（export_characters）
- `exportScenesTool` — 导出场景工具（export_scenes）

### 工具聚合数组
- `projectIoTools` — 4 个项目 IO 工具的聚合数组
- `allProjectIoTools` — 全量工具聚合（与 projectIoTools 等价，便于统一注册）

## 常见修改场景

### 1. 新增项目导入导出工具
- 修改文件：`project-io-tools.ts`，在 `index.ts` 追加 export，更新 `projectIoTools` 数组
- 检查不变量：工具命名唯一、所有工具声明 `dangerLevel`、导入类工具 `requiresConfirmation: true`（覆盖现有数据）
- 测试：`npx vitest run src/modules/agent-tools-project-io/__tests__/project-io-tools.test.ts`

### 2. 修改导出格式或范围
- 修改文件：`project-io-tools.ts`（exportProjectTool / exportCharactersTool / exportScenesTool 的 execute 函数）
- 检查不变量：通过动态 `import("@/modules/asset")` 获取 service；导出保持引用关系（INV-8）
- 测试：`npx vitest run src/modules/agent-tools-project-io/__tests__/project-io-tools.test.ts`

### 3. 修改导入合并策略
- 修改文件：`project-io-tools.ts`（importProjectTool 的 execute 函数）
- 检查不变量：导入必须校验格式（INV-6）、合并策略三种模式（INV-7）、write-then-clean 模式（INV-12，禁止先删后写）
- 测试：`npx vitest run src/modules/agent-tools-project-io/__tests__/project-io-tools.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`（file-http）
- **禁止导入**：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）、`@/infrastructure/*`（除 `@/infrastructure/di`）、`@/modules/*/*/*`（深路径）
- **禁止**：直接调用 `electronAPI.*`（文件操作必须走 `@/shared/file-http`）
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：asset 服务通过动态 `import("@/modules/asset")` 获取，避免静态循环依赖

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-project-io`
- 关键测试文件：
  - `__tests__/project-io-tools.test.ts` — 4 个项目导入导出工具
