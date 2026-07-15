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
