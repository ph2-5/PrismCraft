<!-- AI: Before modifying this module, read contract.json for invariants -->

# Agent Tools - Asset Module

> 资产查询与 CRUD 工具模块 — 从 agent/tools/ 拆分而来（阶段3-2）。

## 模块概览

- **定位**：从 agent 模块拆分出的独立工具集模块，包含资产查询与资产 CRUD 工具
- **核心**：14 个工具实现（5 个 query + 9 个 crud），通过 `toolRegistry` 注册到 agent
- **依赖**：仅依赖 `@/domain/types/agent-tools`、`@/shared/constants/tool-timeouts`、`@/domain/schemas`、`@/modules/character`、`@/modules/scene`、`@/modules/storyboard`、`@/modules/shot`

## 背景

这些工具均为叶子工具集，无 `agent/services` 依赖，因此可独立成模块。从 `@/modules/agent/tools/` 拆分后，agent 模块通过 `@/modules/agent-tools-asset` 导入工具数组并注册。

## 子域

| 子域 | 路径 | 职责 |
|------|------|------|
| query | `asset-tools.ts` | 资产查询工具（列出角色/场景、获取详情、跨资产搜索） |
| crud | `asset-crud-tools.ts` | 资产 CRUD 工具（创建/更新/删除角色/场景、打标签、整理、去重） |

## Public API

### Asset Query Tools（5 个）

- `listCharactersTool` — 列出角色
- `listScenesTool` — 列出场景
- `getCharacterTool` — 获取角色详情
- `getSceneTool` — 获取场景详情
- `searchAssetsTool` — 跨资产搜索
- `assetTools` — 所有资产查询工具数组

### Asset CRUD Tools（9 个）

- `createCharacterTool` — 创建角色
- `updateCharacterTool` — 更新角色
- `deleteCharacterTool` — 删除角色（需确认）
- `createSceneTool` — 创建场景
- `updateSceneTool` — 更新场景
- `deleteSceneTool` — 删除场景（需确认）
- `tagAssetTool` — 为资产打标签
- `organizeAssetsTool` — 整理资产
- `deduplicateAssetsTool` — 资产去重
- `assetCrudTools` — 所有资产 CRUD 工具数组

## 边界约束

- **禁止**：本模块导入 `@/modules/agent/*`（agent 模块依赖本模块的工具数组，避免循环）
- **禁止**：本模块导入 `@/infrastructure/*`
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：业务 service 通过动态导入（`@/modules/character`、`@/modules/scene` 等），避免静态循环依赖

## 依赖方向

```
agent-tools-asset → @/domain/types/agent-tools（类型）
                  → @/shared/constants/tool-timeouts
                  → @/domain/schemas（CreateCharacterInput 等）
                  → @/modules/character, @/modules/scene（动态导入 service）
                  → @/modules/storyboard, @/modules/shot（动态导入 service，删除前引用检查）
```
