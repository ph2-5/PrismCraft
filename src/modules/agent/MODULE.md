<!-- AI: Before modifying this module, read contract.json for invariants -->

# Agent Module

> AI Agent 助手模块 — 系统管理员角色，通过工具调用（function-calling）操控项目所有功能。

## 模块概览

- **定位**：系统管理员助手，非简单聊天机器人
- **架构**：单一 Agent + 动态工具注册表（不划分多个 Agent）
- **核心**：Agent Loop（流式推理 → 工具调用 → 结果回灌 → 重复）
- **依赖**：Task 1.0 流式基础设施（`generateTextStream` + `ToolDef`/`StreamChunk`）

## 子域

| 子域 | 路径 | 职责 |
|------|------|------|
| domain | `domain/` | 类型定义、System Prompt 模板 |
| services | `services/` | Agent Loop、ToolRegistry、ToolExecutor、ConversationManager |
| tools | `tools/` | 工具实现（按业务域分文件） |
| hooks | `hooks/` | useAgent（React Hook） |
| presentation | `presentation/` | AgentPage、AgentMessage、ToolCallCard |

## Public API

- `useAgent()` — 主 Hook，管理会话/流式/工具状态
- `AgentPage` — 主页面组件（替换 ComingSoon）
- `AgentLoop` — Agent Loop 核心（高级用法）
- `toolRegistry` — 工具注册表（高级用法）
- `registerAllTools()` — 注册所有 Phase 1 工具

## 边界约束

- **禁止**：Agent 工具直接访问 infrastructure（除 `@/infrastructure/di`）
- **禁止**：Agent 工具直接调用 `electronAPI.*`
- **必须**：调用其他模块时通过其 public API（如 `characterService`、`sceneService`）
- **必须**：文件操作通过 `@/shared/file-http`
- **必须**：工具命名唯一（ToolRegistry 注册时校验冲突）

## 依赖方向

```
agent → domain（类型）
      → shared-logic（纯逻辑，如引用检查）
      → shared（file-http 等）
      → infrastructure/di（container）
      → modules/*（通过 barrel 导入其他模块的 public API）
```

## Phase 1 已实现工具

| 工具 | 域 | 说明 |
|------|----|----|
| list_characters | asset | 查询角色列表（过滤/分页） |
| list_scenes | asset | 查询场景列表（过滤/分页） |
| get_character | asset | 获取角色详情 |
| get_scene | asset | 获取场景详情 |
| search_assets | asset | 跨资产搜索 |
| get_api_config | config | 获取 API 配置（脱敏） |
| check_api_health | config | 检查 API 健康状态 |
| list_providers | config | 列出已配置 provider |
| test_connection | config | 测试 provider 连接 |
| validate_api_key | config | 验证 API key |
| configure_api_provider | config | 自动配置 provider（用户发 key+vendor） |
| get_project_stats | system | 项目统计概览 |
| get_app_info | system | 应用信息 |
| get_disk_usage | system | 磁盘使用情况 |

## 安全约束

- 删除类工具 `requiresConfirmation: true`（Phase 2 实现）
- `maxIterations: 10` 防死循环
- `maxTokensPerTurn: 4096` 防 token 溢出
- API key 在返回时脱敏（只显示前 4 位 + ***）
- 工具超时：查询 30s / 变更 60s / 生成 5min / 视频 30min
