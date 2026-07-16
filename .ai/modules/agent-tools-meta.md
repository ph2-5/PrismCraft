# Agent Tools Meta 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| diagnostic | 🔴 高 | 系统诊断与修复、rollback 回滚操作、调用 videoTaskStorage/errorLogStorage/storyStorage |
| monitor | 🔴 高 | 任务监控、活动日志、错误历史查询、调用 videoTaskStorage/errorLogStorage |
| config | 🟡 中 | API 配置管理（6 个）、validate_api_key 等敏感操作 |
| help | 🟢 低 | 功能解释/教程/帮助文档/命令列表，help-tools-data 静态字典数据 |
| barrel | 🟢 低 | 仅 index.ts 聚合导出 |

## 子域依赖图

```
config-tools.ts（6 个） ← @/domain/*、@/shared/*
diagnostic-tools.ts（4 个） ← @/infrastructure/di（container.videoTaskStorage / errorLogStorage / storyStorage）
monitor-tools.ts（5 个） ← @/infrastructure/di（container.videoTaskStorage / errorLogStorage）
help-tools.ts（6 个） ← @/infrastructure/di（container.agentToolRegistry 异步获取）、help-tools-data.ts（静态字典）
  ↑
index.ts（barrel + allMetaTools 聚合）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- 四个工具文件彼此独立，均为叶子工具集
- `help-tools` 通过 DI container 异步获取 `agentToolRegistry`（避免对 agent/services 的静态依赖）
- `diagnostic` / `monitor` 通过 DI container 访问 videoTaskStorage、errorLogStorage 等
- `help-tools-data` 提供静态字典数据，无运行时依赖

## 公共 API

### Config 工具（6 个）
- `configTools` — API 配置管理工具聚合数组（get_api_config / check_api_health / list_providers / test_connection / validate_api_key / configure_api_provider）

### Diagnostic 工具（4 个）
- `diagnoseErrorTool` / `autoFixTool` / `diagnoseSystemHealthTool` / `rollbackTool`
- `diagnosticTools` — 诊断工具聚合数组

### Monitor 工具（5 个）
- `monitorTasksTool` / `notifyCompletionTool` / `getActivityLogTool` / `watchProgressTool` / `getErrorHistoryTool`
- `monitorTools` — 监控工具聚合数组

### Help 工具（6 个）
- `explainFeatureTool` / `showTutorialTool` / `getHelpTool` / `listAvailableCommandsTool` / `suggestNextActionTool` / `getKeyboardShortcutsTool`
- `helpTools` — 帮助工具聚合数组

### 工具聚合数组
- `allMetaTools` — 全部 21 个元工具的聚合数组（config + diagnostic + monitor + help）

## 常见修改场景

### 1. 新增元工具
- 修改文件：对应 `*-tools.ts`，在 `index.ts` 追加 export，更新 `allMetaTools` 数组
- 检查不变量：工具命名唯一、所有工具声明 `dangerLevel`、危险操作（rollback）`requiresConfirmation: true`、通过 DI container 异步获取 agent 服务
- 测试：`npx vitest run src/modules/agent-tools-meta/__tests__/`

### 2. 修改诊断或回滚逻辑
- 修改文件：`diagnostic-tools.ts`（diagnoseErrorTool / autoFixTool / rollbackTool）
- 检查不变量：通过 `container.videoTaskStorage` / `errorLogStorage` / `storyStorage` 访问数据；rollback 需 `requiresConfirmation: true`
- 测试：`npx vitest run src/modules/agent-tools-meta/__tests__/diagnostic-tools.test.ts`

### 3. 修改帮助文档或命令列表
- 修改文件：`help-tools.ts`、`help-tools-data.ts`（静态字典数据）
- 检查不变量：`help-tools` 通过 `await container.agentToolRegistry` 获取可用工具列表
- 测试：`npx vitest run src/modules/agent-tools-meta/__tests__/help-tools.test.ts`

### 4. 修改 API 配置工具
- 修改文件：`config-tools.ts`
- 检查不变量：validate_api_key 等敏感操作需脱敏返回（API key 只显示前 4 位 + ***）
- 测试：`npx vitest run src/modules/agent-tools-meta/__tests__/config-tools.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`、`@/infrastructure/di`
- **禁止导入**：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）、`@/infrastructure/*`（除 `@/infrastructure/di`）、`@/modules/*/*/*`（深路径）
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：agent 服务（toolRegistry 等）通过 `await container.agentToolRegistry` 异步获取

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-meta`
- 关键测试文件：
  - `__tests__/config-tools.test.ts` — API 配置管理工具
  - `__tests__/diagnostic-tools.test.ts` — 系统诊断与修复工具
  - `__tests__/monitor-tools.test.ts` — 任务监控与活动日志工具
  - `__tests__/help-tools.test.ts` — 功能解释/教程/帮助工具
