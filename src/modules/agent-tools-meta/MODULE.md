# Agent Tools Meta Module

> 元工具集（系统配置/诊断/监控/帮助），从 `agent` 模块拆分而来。

<!-- AI: Before modifying this module, read contract.json for invariants -->

## 模块概览

| 项目 | 内容 |
|------|------|
| 模块路径 | `src/modules/agent-tools-meta/` |
| 来源 | 从 `src/modules/agent/tools/` 多个文件拆分 |
| 工具数量 | 21 个 |
| 依赖方向 | `@/domain/*`, `@/shared/*`, `@/infrastructure/di` |

## 背景

agent 模块拆分阶段：将系统配置、诊断、监控、帮助类工具从 agent/tools 中独立出来，形成元工具集模块。

核心改造点：
- `help-tools` 通过 DI container 异步获取 `agentToolRegistry`
- `diagnostic-tools` / `monitor-tools` 通过 DI container 访问 `videoTaskStorage`、`errorLogStorage` 等
- `help-tools-data` 提供静态字典数据，无运行时依赖

## 子域表

| 子域 | 文件 | 工具 | 说明 |
|------|------|------|------|
| config-tools | config-tools.ts | 6 | API 配置管理（get_api_config / check_api_health / list_providers / test_connection / validate_api_key / configure_api_provider） |
| diagnostic-tools | diagnostic-tools.ts | 4 | 系统诊断与修复（diagnose_error / auto_fix / diagnose_system_health / rollback） |
| monitor-tools | monitor-tools.ts | 5 | 任务监控与活动日志（monitor_tasks / notify_completion / get_activity_log / watch_progress / get_error_history） |
| help-tools | help-tools.ts | 6 | 功能解释/教程/帮助文档/命令列表（explain_feature / show_tutorial / get_help / list_available_commands / suggest_next_action / get_keyboard_shortcuts） |

## Public API

通过 `@/modules/agent-tools-meta` 导入。

### Config 工具（6 个）
- `configTools` — API 配置管理工具聚合数组（get_api_config / check_api_health / list_providers / test_connection / validate_api_key / configure_api_provider）

### Diagnostic 工具（4 个）
- `diagnoseErrorTool` — 错误诊断工具（diagnose_error）
- `autoFixTool` — 自动修复工具（auto_fix）
- `diagnoseSystemHealthTool` — 系统健康诊断工具（diagnose_system_health）
- `rollbackTool` — 回滚工具（rollback）
- `diagnosticTools` — 诊断工具聚合数组（4 个）

### Monitor 工具（5 个）
- `monitorTasksTool` — 任务监控工具（monitor_tasks）
- `notifyCompletionTool` — 完成通知工具（notify_completion）
- `getActivityLogTool` — 活动日志获取工具（get_activity_log）
- `watchProgressTool` — 进度观察工具（watch_progress）
- `getErrorHistoryTool` — 错误历史获取工具（get_error_history）
- `monitorTools` — 监控工具聚合数组（5 个）

### Help 工具（6 个）
- `explainFeatureTool` — 功能解释工具（explain_feature）
- `showTutorialTool` — 教程展示工具（show_tutorial）
- `getHelpTool` — 帮助文档工具（get_help）
- `listAvailableCommandsTool` — 可用命令列表工具（list_available_commands）
- `suggestNextActionTool` — 下一步建议工具（suggest_next_action）
- `getKeyboardShortcutsTool` — 快捷键查询工具（get_keyboard_shortcuts）
- `helpTools` — 帮助工具聚合数组（6 个）

### 工具聚合数组
- `allMetaTools` — 全部 21 个元工具的聚合数组（config + diagnostic + monitor + help）

### 类型签名

```typescript
// config-tools（6 个）
export { configTools } from "./config-tools";

// diagnostic-tools（4 个）
export {
  diagnoseErrorTool,
  autoFixTool,
  diagnoseSystemHealthTool,
  rollbackTool,
  diagnosticTools,
} from "./diagnostic-tools";

// monitor-tools（5 个）
export {
  monitorTasksTool,
  notifyCompletionTool,
  getActivityLogTool,
  watchProgressTool,
  getErrorHistoryTool,
  monitorTools,
} from "./monitor-tools";

// help-tools（6 个）
export {
  explainFeatureTool,
  showTutorialTool,
  getHelpTool,
  listAvailableCommandsTool,
  suggestNextActionTool,
  getKeyboardShortcutsTool,
  helpTools,
} from "./help-tools";

// 工具聚合数组
export { allMetaTools } from "./index";
```

## 边界约束

- ✅ 允许导入：`@/domain/*`, `@/shared/*`, `@/infrastructure/di`
- ✅ 允许导入：同级模块内的相对路径（`./config-tools` 等）
- ❌ 禁止导入：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）
- ❌ 禁止导入：`@/modules/*/*/*`（深路径）
- ❌ 禁止导入：`@/infrastructure/*`（除 `@/infrastructure/di`）
