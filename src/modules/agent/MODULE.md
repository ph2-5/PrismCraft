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

### React 组件
- `useAgent()` — 主 Hook，管理会话/流式/工具状态，返回 `UseAgentReturn`
- `AgentPage` — 主页面组件
- `MarkdownRenderer` — Markdown 渲染组件（带代码高亮）
- `AgentSettingsPanel` — Agent 设置面板（API 配置、人格选择、参数调整）
- `getPersonaPrompt(persona)` — 获取人格模板的提示词
- `SessionHistory` — 会话历史组件

### 核心服务（高级用法/测试）
- `AgentLoop` — Agent Loop 核心类
- `runAgentLoop(config, callbacks)` — 启动 Agent Loop
- `toolRegistry` — 工具注册表（单例）
- `toolExecutor` — 工具执行器（单例）
- `conversationManager` — 会话管理器（单例）

### 会话持久化
- `saveSession(session)` — 保存会话到磁盘
- `loadSession(id)` — 加载会话
- `listSessions()` — 列出所有会话
- `deleteSession(id)` — 删除会话
- `persistSession(session)` — 持久化会话（内部使用）

### 工具注册
- `registerAllTools()` — 注册所有 150 个工具（幂等，应用启动时调用）

### 审计日志（v1.2.2 新增）
- `queryAuditLogs(filter)` — 查询审计日志（支持按 sessionId/toolName/success/时间范围/limit 过滤）
- `getAuditStats()` — 获取统计信息（总条目数/会话数/按工具统计）
- `clearAuditLogs(sessionId)` — 清空指定会话的审计日志
- `clearAllAuditLogs()` — 清空所有审计日志
- 类型：`AuditEntry` / `AuditQueryFilter`

### 领域类型
- `AgentSession` / `AgentMessage` / `AgentRole` — 会话数据结构
- `ToolImpl` / `ToolResult` / `ToolContext` / `ToolDomain` — 工具类型
- `ToolExecution` / `ToolExecutionStatus` — 工具执行状态
- `AgentLoopConfig` / `AgentLoopCallbacks` — Loop 配置
- `createEmptySession()` — 创建空会话
- `DEFAULT_AGENT_CONFIG` — 默认配置
- `AgentSettings` — 设置类型
- `AGENT_PERSONAS` / `DEFAULT_SYSTEM_PROMPT` / `AgentPersona` — 人格模板

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

## 已实现工具

共 150 个工具，分布在 21 个工具文件中，覆盖 18 个业务域：

| 域 | 工具文件 | 工具数 | 关键工具 |
|----|---------|-------|---------|
| asset | asset-tools.ts + asset-crud-tools.ts | 14 | list_characters / get_character / search_assets / create_character / update_character / delete_character |
| config | config-tools.ts | 6 | get_api_config / check_api_health / list_providers / test_connection / validate_api_key / configure_api_provider |
| system | system-tools.ts | 3 | get_project_stats / get_app_info / get_disk_usage |
| generation | generation-tools.ts | 9 | generate_image / generate_video / auto_generate_video_full / generate_text_stream |
| web | web-tools.ts | 8 | search_web_images / download_image / search_unsplash / search_pexels |
| image-edit | image-edit-tools.ts | 10 | crop_image / resize_image / apply_filter / blend_images / remove_background |
| story | story-tools.ts | 13 | create_story / generate_storyboard / auto_create_from_novel / export_story |
| video | video-tools.ts | 7 | generate_video / poll_video_status / cancel_video_task / retry_video_task |
| shot | shot-tools.ts | 5 | create_shot / update_shot / bind_element / check_consistency |
| video-post | video-post-tools.ts | 9 | trim_video / merge_videos / add_subtitle / extract_audio / apply_transition |
| audio | audio-tools.ts | 5 | generate_tts / transcribe_audio / mix_audio / extract_audio_track |
| template | template-tools.ts | 5 | list_templates / apply_template / create_template / export_template |
| workflow | workflow-tools.ts | 5 | create_workflow / execute_workflow / schedule_workflow |
| monitor | monitor-tools.ts | 5 | get_task_status / get_progress / get_logs / get_performance_metrics |
| diagnostic | diagnostic-tools.ts | 20 | diagnose_error / auto_fix / health_check / analyze_failure / suggest_solution |
| help | help-tools.ts | 6 | list_tools / get_tool_help / get_examples / get_capabilities |
| subworkflow | subworkflow-tools.ts | 9 | execute_subworkflow / chain_operations / batch_process |
| memory | memory-tools.ts | 6 | save_memory / recall_memory / list_memories / clear_memory |
| project-io | project-io-tools.ts | 4 | export_project / import_project / backup_project / restore_project |
| file-management | file-management-tools.ts | 6 | list_files / read_file / write_file / delete_file / move_file |

## 安全约束

### 工具三级权限分层（v1.2.2）

所有工具按 `dangerLevel` 分为三级，配合 `requiresConfirmation` 决定执行行为：

| 等级 | 说明 | 工具示例 | 默认确认行为 |
|------|------|---------|------------|
| `safe` | 只读/查询操作 | list_characters, get_story, search_assets, recall_memory | 无需确认 |
| `limited` | 有副作用但可恢复 | create_*, update_*, generate_*, edit_*, merge_*, auto_* | 按工具 `requiresConfirmation` 标记 |
| `destructive` | 不可逆操作 | delete_*, move_*, cancel_video_task, rollback, import_project(replace) | 强制要求用户确认 |

**插件 builtin-mirror 继承规则**：插件通过 `builtin-mirror` action 包装内置工具时，必须继承目标工具的 `dangerLevel` 和 `requiresConfirmation`，忽略插件声明的权限标记。

### 审计日志持久化（v1.2.2）

- **存储**：JSONL 格式，`{cacheDir}/agent/audit/{sessionId}.jsonl`
- **字段**：timestamp/sessionId/toolCallId/toolName/iteration/argsJson/status/success/error/resultPreview/durationMs/dangerLevel/confirmedByUser/specialist
- **淘汰**：单会话最大 500 条
- **specialist 字段**：主 Agent 工具调用为 undefined，子 Agent 工具调用为专家名（通过 `AgentLoopConfig.specialistName` 传递）

### 错误消息脱敏（v1.2.2）

- 工具执行异常的 `e.message` 通过 `sanitizeErrorMessage()` 脱敏后返回给 LLM
- 匹配 `sk-`/`key-`/`token-`/`Bearer` 前缀的 API key 替换为 `[REDACTED]`
- 脱敏 `Authorization` header，截断 >500 字符消息
- `config-tools`/`generation-tools` 失败时不透传原始 `result.message`

### 路径白名单保护（v1.2.2）

- `isProtectedAgentPath()` 拒绝操作 `/agent/audit/`、`/agent/sessions/`、`/agent/tool-plugins/` 内部目录
- `isPathSafe()` 拒绝系统目录（Windows/System32、/etc、/usr 等）和 `..` 路径穿越

### 批量操作限制（v1.2.2）

| 工具 | 限制 |
|------|------|
| `batch_create_video_tasks.tasks` | 最多 10 个 |
| `batch_generate.beatIds` | 最多 20 个 |
| `batch_process.items` | 最多 20 个 |
| `merge_videos.videoPaths` | 最多 10 个 |
| `merge_images.imageUrls` | 最多 9 个 |

### 输入验证约束（v1.2.2）

所有工具参数在 JSON Schema 层声明约束：
- prompt/text 类：`maxLength`（5000/2000/1000/500/200 按类型分级）
- 数值参数：`minimum`/`maximum`（temperature 0-2, speed 0.25-4.0, opacity 0-1, limit 1-200 等）
- URL/路径参数：`maxLength`（2048 for URL, 1024 for path, 100 for ID）

### 子 Agent 超时与权限控制（v1.2.2）

- 子 Agent 60 秒超时通过 `timeoutController.signal` 传递给 `AgentLoop.callbacks.signal`
- 危险操作确认向上传播给主 Agent UI；未提供确认回调时默认拒绝
- 子 Agent 通过 `ToolExecutor(whitelist)` 硬执行 Specialist 工具白名单

### 其他安全约束

- `maxIterations: 10` 防死循环
- `maxTokensPerTurn: 4096` 防 token 溢出
- `maxTotalDurationMs: 5 分钟` 总执行时间上限
- `maxToolCallsPerMinute: 60` 工具调用频率上限
- API key 在返回时脱敏（只显示前 4 位 + ***）
- 工具超时：查询 30s / 变更 60s / 生成 5min / 视频 30min
