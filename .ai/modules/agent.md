# Agent 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services | 🔴 高 | Agent Loop 编排、流式 chunk 累积、工具调用结果回灌、maxIterations 防死循环、错误恢复 |
| tools | 🟡 中 | 21 个工具文件、150 个工具、跨业务域调用、需通过其他模块 public API |
| domain | 🟡 中 | System Prompt 模板、类型契约、人格定义 |
| hooks | 🟡 中 | 会话状态管理（ref + forceUpdate）、流式状态、工具执行状态、配置持久化 |
| presentation | 🟢 低 | UI 组件，通过 useAgent 获取状态 |

## 子域依赖图

```
domain（底层，类型 + Prompt 模板）
  ↑
services ← domain, @/infrastructure/di, @/domain/ports/ai-provider-port
  │   ├── agent-loop ← conversation-manager, tool-executor, tool-registry, memory-service
  │   ├── tool-registry ← @/domain/ports/ai-provider-port (ToolDef)
  │   ├── tool-executor ← tool-registry
  │   ├── conversation-manager ← domain (AgentMessage)
  │   ├── memory-service ← domain (AgentSession)
  │   ├── session-storage ← @/shared/file-http
  │   └── ffmpeg-service ← @/infrastructure/di
  ↑
tools ← services (toolRegistry 注册), @/modules/* (public API), @/shared/file-http, @/shared/api-config
  ↑
hooks ← services (AgentLoop), tools (registerAllTools), domain, @/shared/utils/preferences
  │   └── use-agent ← session-storage, memory-service
  ↑
presentation ← hooks (useAgent), @/shared/ui
```

- `domain` 是最底层子域，仅包含类型与 Prompt 模板，无外部依赖
- `services` 编排 Agent Loop，依赖 DI 容器获取 provider（`container.apiClient` 等）
- `tools` 通过 `toolRegistry.registerAll()` 注册，调用其他模块时**必须**通过其 barrel public API
- `hooks` 聚合 services 与 tools，提供 React 响应式状态
- `presentation` 仅依赖 `hooks`，不直接访问 services

## 常见修改场景

### 1. 新增工具（按业务域扩展）
- 修改文件：在 `tools/` 下新增 `{domain}-tools.ts`，导出 `ToolImpl[]`；在 `tools/index.ts` 追加 import 与 `registerAll` 调用
- 同步新增测试：`tools/__tests__/{domain}-tools.test.ts`
- 检查不变量：工具命名唯一（`toolRegistry.register` 重名抛错）、不直接调用 `electronAPI.*`、不直接访问 `@/infrastructure/*`（除 `@/infrastructure/di`）
- 测试：`npx vitest run src/modules/agent/tools/__tests__/{domain}-tools.test.ts`

### 2. 修改 Agent Loop 行为（迭代次数、超时、错误恢复）
- 修改文件：`services/agent-loop.ts`、`domain/types.ts`（`AgentLoopConfig`、`DEFAULT_AGENT_CONFIG`）
- 检查不变量：`maxIterations: 10` 防死循环、`maxTokensPerTurn: 4096` 防 token 溢出、LLM 失败重试一次、工具失败不中断循环
- 测试：`npx vitest run src/modules/agent/services/__tests__/agent-loop.test.ts`

### 3. 修改 System Prompt 或人格模板
- 修改文件：`domain/prompts.ts`（`DEFAULT_SYSTEM_PROMPT`、`AGENT_PERSONAS`、`buildProjectStateSummary`、`buildAvailableToolsSummary`）
- 检查不变量：动态项目状态摘要通过 `buildDynamicProjectState()` 注入 system prompt；人格切换通过 `AgentSettingsPanel` 持久化到 localStorage
- 测试：`npx vitest run src/modules/agent/services/__tests__/agent-loop.test.ts`

### 4. 修改会话持久化或记忆抽取逻辑
- 修改文件：`services/session-storage.ts`（saveSession/loadSession/listSessions/deleteSession/persistSession）、`services/memory-service.ts`（shouldExtract/extractFromConversation/applyExtractedMemory）
- 检查不变量：会话通过 `@/shared/file-http` 持久化到缓存目录（禁止直接 `electronAPI`）、配置通过 `usePreference` 持久化到 localStorage
- 测试：`npx vitest run src/modules/agent/services/__tests__/memory-service.test.ts`

### 5. 修改工具执行超时策略
- 修改文件：`services/tool-executor.ts`
- 检查不变量：工具超时分级（查询 30s / 变更 60s / 生成 5min / 视频 30min）、删除类工具 `requiresConfirmation: true`（Phase 2）、API key 返回时脱敏（只显示前 4 位 + ***）
- 测试：`npx vitest run src/modules/agent/services/__tests__/tool-executor.test.ts`

## 内部实现细节（非明确要求不要修改）

- `services/agent-loop.ts` — 流式推理 → 工具调用累积（按 id 合并增量 chunk）→ 结果回灌 → 重复；通过 `AbortSignal` 支持取消
- `services/tool-registry.ts` — 单例 `ToolRegistry`，按 name 唯一注册，重名抛错；支持 `getByDomain` / `getToolDefs` 过滤
- `services/tool-executor.ts` — 工具执行器，分级超时，错误不中断 Agent Loop
- `services/conversation-manager.ts` — 会话消息序列构建（system prompt + 历史 + 用户消息）
- `services/memory-service.ts` — 记忆抽取与注入（`buildCoreMemoryPrompt`）
- `services/session-storage.ts` — 会话本地持久化（通过 `@/shared/file-http`）
- `hooks/use-agent.ts` — session 使用 ref + forceUpdate 模式（避免深层嵌套 setState）；工具执行状态用 useState；配置通过 `usePreference` 持久化
- `domain/prompts.ts` — `buildDynamicProjectState()` 异步查询 character/scene/story/videoTask/config 概览注入 system prompt

## 边界约束（来自 MODULE.md）

- **禁止**：Agent 工具直接访问 `@/infrastructure/*`（除 `@/infrastructure/di`）
- **禁止**：Agent 工具直接调用 `electronAPI.*`
- **必须**：调用其他模块时通过其 public API（如 `characterService`、`sceneService`、`storyService`）
- **必须**：文件操作通过 `@/shared/file-http`
- **必须**：工具命名唯一（`toolRegistry.register` 时校验冲突）

## 测试验证

- 测试命令：`npx vitest run src/modules/agent`
- 关键测试文件：
  - `services/__tests__/agent-loop.test.ts` — Agent Loop 编排与流式处理
  - `services/__tests__/tool-registry.test.ts` — 工具注册与命名冲突校验
  - `services/__tests__/tool-executor.test.ts` — 工具执行与超时
  - `services/__tests__/memory-service.test.ts` — 记忆抽取与注入
  - `tools/__tests__/` — 21 个工具测试文件（按业务域分：asset/config/system/generation/web/image-edit/story/video/shot/video-post/audio/template/workflow/monitor/diagnostic/help/subworkflow/memory/project-io/file-management）
