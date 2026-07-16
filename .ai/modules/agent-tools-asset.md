# Agent Tools Asset 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| crud | 🔴 高 | 角色/场景 CRUD、删除需确认、删除前引用检查（storyboard/shot）、跨模块动态导入 service |
| query | 🟡 中 | 跨资产搜索、动态导入 character/scene/storyboard/shot service |
| barrel | 🟢 低 | 仅 index.ts 聚合导出 |

## 子域依赖图

```
asset-tools.ts（query 5 个）
  ← @/domain/types/agent-tools、@/shared/constants/tool-timeouts
  ← @/modules/character, @/modules/scene, @/modules/storyboard, @/modules/shot（动态导入 service）
asset-crud-tools.ts（crud 9 个）
  ← 同上 + @/domain/schemas（CreateCharacterInput 等）
  ↑
index.ts（barrel）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- 两个工具文件彼此独立，均为叶子工具集，无 agent/services 依赖
- 业务 service 通过动态导入避免静态循环依赖
- 删除类工具（deleteCharacterTool / deleteSceneTool）需 `requiresConfirmation: true`

## 公共 API

### Asset Query Tools（5 个）
- `listCharactersTool` / `listScenesTool` / `getCharacterTool` / `getSceneTool` / `searchAssetsTool`
- `assetTools` — 所有资产查询工具数组

### Asset CRUD Tools（9 个）
- `createCharacterTool` / `updateCharacterTool` / `deleteCharacterTool`（需确认）
- `createSceneTool` / `updateSceneTool` / `deleteSceneTool`（需确认）
- `tagAssetTool` / `organizeAssetsTool` / `deduplicateAssetsTool`
- `assetCrudTools` — 所有资产 CRUD 工具数组

## 常见修改场景

### 1. 新增资产查询或 CRUD 工具
- 修改文件：`asset-tools.ts` 或 `asset-crud-tools.ts`，在 `index.ts` 追加 export
- 检查不变量：工具命名唯一（`toolRegistry.register` 重名抛错）、删除类工具 `requiresConfirmation: true`、所有工具声明 `dangerLevel`、工具类型从 `@/domain/types/agent-tools` 导入、业务 service 通过动态导入
- 测试：`npx vitest run src/modules/agent-tools-asset/__tests__/`

### 2. 修改角色/场景删除引用检查
- 修改文件：`asset-crud-tools.ts`（deleteCharacterTool / deleteSceneTool）
- 检查不变量：删除前需检查是否被分镜/场景引用，通过 `@/modules/storyboard`、`@/modules/shot` 动态导入 service
- 测试：`npx vitest run src/modules/agent-tools-asset/__tests__/asset-crud-tools.test.ts`

### 3. 修改跨资产搜索逻辑
- 修改文件：`asset-tools.ts`（searchAssetsTool）
- 检查不变量：跨角色/场景/素材统一搜索
- 测试：`npx vitest run src/modules/agent-tools-asset/__tests__/asset-tools.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`、`@/infrastructure/di`、`@/modules/character`、`@/modules/scene`、`@/modules/storyboard`、`@/modules/shot`（动态导入）
- **禁止导入**：`@/modules/agent/*`（agent 依赖本模块工具数组，避免循环）、`@/infrastructure/*`（除 DI）、`@/modules/*/*/*`（深路径）
- **禁止**：直接调用 `electronAPI.*`
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：业务 service 通过动态导入避免静态循环依赖

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-asset`
- 关键测试文件：
  - `__tests__/asset-crud-tools.test.ts` — 资产 CRUD 工具
  - `__tests__/asset-tools.test.ts` — 资产查询工具
