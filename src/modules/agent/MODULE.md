<!-- AI: Before modifying this module, read contract.json for invariants -->

# Agent Module ✅

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

> AI Agent 助手模块 — 系统管理员角色，通过工具调用（function-calling）操控项目所有功能。

## 模块概览

- **定位**：系统管理员助手，非简单聊天机器人
- **架构**：单一 Agent + 动态工具注册表（不划分多个 Agent）
- **核心**：Agent Loop（流式推理 → 工具调用 → 结果回灌 → 重复）
- **依赖**：Task 1.0 流式基础设施（`generateTextStream` + `ToolDef`/`StreamChunk`）

## 子域

| 子域 | 状态 | 路径 | 职责 |
|------|:----:|------|------|
| domain | ✅ | `domain/` | 类型定义、System Prompt 模板 |
| services | ✅ | `services/` | Agent Loop、ToolRegistry、ToolExecutor、ConversationManager、SubAgentRunner |
| tools | ✅ | `tools/index.ts` | 纯 barrel 入口 — 工具实现已拆分至 13 个独立子模块（见"工具子模块架构"） |
| hooks | ✅ | `hooks/` | useAgent（React Hook） |
| presentation | ✅ | `presentation/` | AgentPage、AgentMessage、ToolCallCard |

## Public API

### ✅ Hooks
- `UseAgentReturn` — useAgent 返回值类型
- `AgentSettings` — Agent 设置类型

### ✅ React 组件
- `AgentPage` — 主页面组件

### ✅ 核心服务（高级用法/测试）
- `toolRegistry` — 工具注册表（单例）
- `toolExecutor` — 工具执行器（单例）
- `conversationManager` — 会话管理器（单例）

### ✅ 记忆服务
记忆系统（三层记忆架构 + 自动抽取 + 向量检索委托）已拆分至 `@/modules/agent-memory`，详见该模块的 MODULE.md。
agent barrel 仍 re-export `memoryService` / `MemoryService` / `prewarmEmbeddings` 及相关类型保持向后兼容。
`AgentMessage` 和 `IMemoryService` 仍归属于 agent 模块（Agent 核心类型/端口接口），agent-memory 通过 `import type` 引用。
- `memoryService` — 记忆服务单例
- `MemoryService` — 记忆服务类
- `prewarmEmbeddings` — 预热嵌入向量

### ✅ 会话持久化
会话存储 + 断点恢复已拆分至 `@/modules/agent-session`，详见该模块的 MODULE.md。
agent barrel 仍 re-export `listSessions` 和 `SessionListItem` 保持向后兼容。
- `listSessions` — 列出所有会话
- `SessionListItem` — 会话列表项类型

### ✅ 多 Agent 编排（P4）
- `runSpecialist` — 运行专家子 Agent
- `listAvailableSpecialists` — 列出可用专家
- `SpecialistAgent` — 专家 Agent 类型

### ✅ Port 接口（DI 化）
- `IConversationManager` — 会话管理器端口接口
- `IToolRegistry` — 工具注册表端口接口
- `IToolExecutor` — 工具执行器端口接口
- `IMemoryService` — 记忆服务端口接口
- `AgentLoopDeps` — Agent Loop 依赖接口

### ✅ 领域类型
- `AgentSession` — 会话数据结构
- `AgentMessage` — 消息结构
- `AgentRole` — 角色类型
- `ToolImpl` — 工具实现类型
- `ToolResult` — 工具结果类型
- `ToolContext` — 工具上下文类型
- `ToolDomain` — 工具域类型
- `ToolExecution` — 工具执行类型
- `ToolExecutionStatus` — 工具执行状态类型
- `AgentLoopConfig` — Loop 配置类型
- `AgentLoopCallbacks` — Loop 回调类型
- `ContextBudget` — 上下文预算类型
- `CoreMemory` — 核心记忆类型
- `MemoryFact` — 记忆事实类型
- `ArchivalMemoryEntry` — 归档记忆条目类型
- `ExtractedMemory` — 提取记忆类型
- `createEmptySession` — 创建空会话
- `generateMessageId` — 生成消息 ID
- `AgentPersona` — 人格模板类型

### ✅ 工具插件类型
- `ToolPluginConfig` — 工具插件配置类型
- `ToolPluginTool` — 工具插件工具定义类型
- `ToolPluginAction` — 工具插件动作类型
- `HttpCallAction` — HTTP 调用动作类型
- `BuiltinMirrorAction` — 内置镜像动作类型
- `TextTemplateAction` — 文本模板动作类型
- `ToolPluginLoadResult` — 插件加载结果类型
- `ToolPluginsConfig` — 插件集合配置类型

### ✅ 断点恢复（P5）
断点恢复已拆分至 `@/modules/agent-session`，详见该模块的 MODULE.md。
agent barrel 仍 re-export `SessionCheckpoint`/`CheckpointStatus`/`CheckpointIndexEntry` 类型保持向后兼容。
- `SessionCheckpoint` — 会话检查点类型
- `CheckpointStatus` — 检查点状态类型
- `CheckpointIndexEntry` — 检查点索引条目类型

### ✅ 审计日志
审计日志已拆分至 `@/modules/audit-log`，详见该模块的 MODULE.md。

### ✅ Few-Shot 缓存
工具调用 few-shot 缓存（内置示例 + 运行时缓存）已拆分至 `@/modules/agent-fewshot`，详见该模块的 MODULE.md。
agent-loop 通过 `@/modules/agent-fewshot` 导入 recordFewShot / buildFewShotPrompt 完成调用记录与 system prompt 注入。

## 边界约束

- **禁止**：Agent 工具直接访问 infrastructure（除 `@/infrastructure/di`）
- **禁止**：Agent 工具直接调用 `electronAPI.*`
- **必须**：调用其他模块时通过其 public API（如 `characterService`、`sceneService`）
- **必须**：文件操作通过 `@/shared/file-http`
- **必须**：工具命名唯一（ToolRegistry 注册时校验冲突）

## Agent 特权访问声明

Agent 模块作为**系统管理员**，承担跨模块的统一编排与运维职责。部分场景下需要直接读写底层存储层（storage token），无法通过其他模块的 public API 完成。

### 允许的特权访问

Agent 模块及其拆分出的工具子模块代码**允许**通过 DI container 直接访问以下 storage token：

| Storage Token | 用途 | 涉及模块/文件 |
|---------------|------|--------------|
| `container.videoTaskStorage` | 查询/创建/更新视频任务记录（任务列表、状态轮询、批量创建） | `@/modules/agent-tools-media`、`@/modules/agent-tools-meta`、`agent/services/agent-loop.ts` |
| `container.templateStorage` | 模板 CRUD（AST 模板元数据 + 内容文件） | `@/modules/agent-tools-template` |
| `container.storyStorage` | 故事诊断与回滚（查询历史故事） | `@/modules/agent-tools-meta` |
| `container.versionStorage` | 故事版本备份查询（rollback 场景） | `@/modules/agent-tools-meta` |
| `container.errorLogStorage` | 错误历史查询（监控/诊断） | `@/modules/agent-tools-meta` |
| `container.elementStorage` | 道具（prop）元素入库（网络素材下载后注册） | `@/modules/agent-tools-web-file` |

### 声明依据

1. **系统管理员角色**：Agent 通过 function-calling 操控项目所有功能，需要跨模块的统一读写能力，与普通业务模块的"仅通过 public API"约束不同。
2. **与 architecture-rules.md 的"Port 实现"例外一致**：DI container 的 Token Categories 中，Storage 实例（Category C）即为 stateful storage modules，Agent 作为系统编排者访问这些 token 属于合理的依赖注入用途。
3. **public API 不可替代**：部分 storage 操作（如 `getStoryVersions`、`getErrorLogs`、`createElement`）在对应模块的 service 层未暴露 public API，强行改为 public API 会导致功能丢失或大量重写。

### 特权访问的边界

即使享有特权访问，Agent 模块仍受以下约束：

- **禁止**直接修改其他模块的 Zustand store 内部状态（如 `useVideoTaskStore.setState`）
- **禁止**调用 `electronAPI.*`（文件操作仍走 `@/shared/file-http`）
- **禁止**访问 `@/infrastructure/*` 中除 `@/infrastructure/di` 之外的其他模块
- **必须**：所有特权访问在工具文件顶部注释中引用本声明
- **必须**：当对应模块新增 public API 后，应优先迁移到 public API 调用（逐步消除特权访问）

## 依赖方向

```
agent → domain（类型）
      → shared-logic（纯逻辑，如引用检查）
      → shared（file-http 等）
      → infrastructure/di（container）
      → modules/*（通过 barrel 导入其他模块的 public API）
```

## 工具子模块架构

为降低单模块体积、便于独立维护，工具实现已拆分为 13 个独立子模块。所有子模块通过 `tools/index.ts` 聚合注册到 `toolRegistry`（详见 [tools/index.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/agent/tools/index.ts)）。

### 子模块清单

共约 150 个工具，分布在 13 个独立子模块中，覆盖 18 个业务域：

| 子模块 | 路径 | 业务域 | 关键工具 |
|--------|------|--------|---------|
| agent-tools-asset | `@/modules/agent-tools-asset` | asset | list_characters / get_character / search_assets / create_character / update_character / delete_character |
| agent-tools-meta | `@/modules/agent-tools-meta` | config + monitor + diagnostic + help | get_api_config / check_api_health / list_providers / get_task_status / diagnose_error / auto_fix / list_tools / get_capabilities |
| agent-tools-system | `@/modules/agent-tools-system` | system | get_project_stats / get_app_info / get_disk_usage |
| agent-tools-generation | `@/modules/agent-tools-generation` | generation + image-edit | generate_image / generate_video / auto_generate_video_full / generate_text_stream / crop_image / blend_images / remove_background |
| agent-tools-web-file | `@/modules/agent-tools-web-file` | web + file-management | search_web_images / download_image / search_unsplash / search_pexels / list_files / read_file / write_file |
| agent-tools-story | `@/modules/agent-tools-story` | story | create_story / generate_storyboard / auto_create_from_novel / export_story |
| agent-tools-media | `@/modules/agent-tools-media` | video + video-post + audio | generate_video / poll_video_status / cancel_video_task / trim_video / merge_videos / add_subtitle / generate_tts / transcribe_audio |
| agent-tools-shot | `@/modules/agent-tools-shot` | shot | create_shot / update_shot / bind_element / check_consistency |
| agent-tools-template | `@/modules/agent-tools-template` | template + prompt-template | list_templates / apply_template / create_template / export_template |
| agent-tools-workflow | `@/modules/agent-tools-workflow` | workflow + subworkflow | create_workflow / execute_workflow / batch_process / chain_operations / schedule_task |
| agent-tools-memory | `@/modules/agent-tools-memory` | memory | save_memory / recall_memory / list_memories / clear_memory |
| agent-tools-project-io | `@/modules/agent-tools-project-io` | project-io | export_project / import_project / backup_project / restore_project |
| agent-tools-specialist | `@/modules/agent-tools-specialist` | specialist | delegate_to_specialist / list_specialists |

### 工具子模块依赖方向

工具子模块对 agent 服务的访问通过 DI container 异步获取，避免静态依赖循环：

```
agent-tools-* → domain（类型）
              → shared-logic（纯逻辑）
              → shared（file-http 等）
              → infrastructure/di（container，异步获取 agentToolRegistry / agentToolExecutor）
              → modules/agent（仅动态 import barrel 获取 runSpecialist 等高级服务）
```

- `agent-tools-meta`、`agent-tools-system`、`agent-tools-workflow` 通过 `await container.agentToolRegistry` 获取工具注册表（用于工具存在性检查 `toolRegistry.has()`）
- `agent-tools-workflow` 通过 `await container.agentToolExecutor` 获取工具执行器（用于嵌套工具调用 `toolExecutor.execute()`）
- `agent-tools-specialist` 通过 `await import("@/modules/agent")` 动态获取 `runSpecialist` / `listAvailableSpecialists`（避免与 agent 模块静态循环依赖）

### 工具注册流程

`tools/index.ts` 是唯一的工具注册入口，应用启动时由 `useAgent` 调用 `registerAllTools()`：

1. 先调用 `specialistRegistry.registerBuiltins()` 注册内置 5 个专家
2. 按 13 个子模块的 barrel 导入所有工具数组
3. 一次性 `toolRegistry.registerAll([...所有工具数组])` 注册
4. 通过 `registered` 标志保证幂等

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
