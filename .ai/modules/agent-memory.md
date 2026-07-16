# Agent Memory 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services/memory-service | 🔴 高 | 三层记忆架构（核心/归档/工作）、串行化写锁防并发覆盖、向量检索委托、LLM 自动抽取 |
| services/extraction | 🔴 高 | LLM 驱动的偏好/事实/摘要抽取，错误处理影响 Agent Loop |
| services/seed-data | 🟡 中 | 首次启动种子记忆注入，prewarmEmbeddings 预热 |
| domain | 🟢 低 | 类型定义（CoreMemory / MemoryFact / ExtractedMemory），零运行时依赖 |

## 子域依赖图

```
domain/types.ts（CoreMemory / MemoryFact / ExtractedMemory，re-export ArchivalMemoryEntry 自 @/domain/types/memory）
  ↑
services/memory-service.ts ← @/shared/file-http、@/shared-logic/json、@/infrastructure/di、@/modules/vector-search
  ├── memory-service-seed-data.ts（种子记忆）
  └── memory-service-extraction.ts（自动抽取与摘要）
  ↑
@/modules/agent/services/agent-loop.ts（注入 system prompt + RAG 检索）
@/modules/agent/hooks/use-agent.ts（自动抽取触发）
@/modules/agent/tools/memory-tools.ts（工具调用）
@/modules/agent/presentation/MemoryPanel.tsx（UI 管理）
@/modules/settings/EmbeddingModelPanel.tsx（预热嵌入）
@/infrastructure/di/container.ts（DI token: agentMemoryService）
```

- `domain` 是底层类型子域，ArchivalMemoryEntry 通过 re-export 来自 `@/domain/types/memory`
- `services` 三个文件：memory-service 是主入口，seed-data 和 extraction 是拆分子模块
- agent-memory 在类型层面引用 agent 的 AgentMessage 和 IMemoryService（`import type` 编译时擦除，无运行时循环）
- agent 模块通过 barrel re-export 本模块 API 保持向后兼容

## 公共 API

### 类型
- `CoreMemory` — 核心记忆（preferences + facts）
- `MemoryFact` — 项目事实条目
- `ExtractedMemory` — LLM 自动抽取结果
- `ArchivalMemoryEntry` — 归档记忆条目（re-export from @/domain/types/memory）

### 核心记忆操作
- `getCoreMemory` / `saveCoreMemory` / `clearCoreMemory`
- `updatePreference` / `removePreference`
- `saveFact` / `removeFact`
- `getCoreMemorySize` / `getArchivalMemoryCount`

### 归档记忆操作
- `getAllArchivalMemory` / `addArchivalMemory`（串行化锁防并发覆盖）/ `deleteArchivalMemory`
- `searchArchivalMemory`（向量检索 + 关键词降级）

### System Prompt 注入
- `buildCoreMemoryPrompt` — 构建核心记忆 prompt 片段
- `searchRelevantMemory` — RAG 检索相关记忆

### 自动抽取与摘要
- `shouldExtract` / `extractFromConversation` / `applyExtractedMemory` / `summarizeConversation`

### 种子记忆
- `ensureSeedMemory` / `getSeedMemoryStats` / `resetSeedMemoryFlag` / `prewarmEmbeddings`

### 单例与测试辅助
- `memoryService` / `MemoryService`
- `_setSearchEngine` / `_resetSearchEngine` / `_getTestEmbeddingStore` / `_resetAllMemory`（_ 前缀，仅测试用）

## 常见修改场景

### 1. 修改核心记忆存储与 prompt 注入
- 修改文件：`services/memory-service.ts`（`getCoreMemory`/`saveCoreMemory`/`buildCoreMemoryPrompt`）
- 检查不变量：核心记忆存储于 `getConfig("agent.coreMemory")`，约 2KB，常驻 system prompt；所有持久化通过 `@/shared/file-http`
- 测试：`npx vitest run src/modules/agent-memory/services/__tests__/memory-service.test.ts`

### 2. 修改归档记忆或向量检索
- 修改文件：`services/memory-service.ts`（`addArchivalMemory`/`searchArchivalMemory`/`searchRelevantMemory`）
- 检查不变量：归档记忆存储于 `{cacheDir}/agent/memory/archival.json`，上限 200 条按时间淘汰；`archivalWriteChain` 串行化所有 read-modify-write 防并发覆盖；向量检索委托 `@/modules/vector-search`（三策略链：API > 本地模型 > 关键词）
- 测试：`npx vitest run src/modules/agent-memory/services/__tests__/memory-service.test.ts`

### 3. 修改 LLM 自动抽取逻辑
- 修改文件：`services/memory-service-extraction.ts`（`shouldExtract`/`extractFromConversation`/`applyExtractedMemory`/`summarizeConversation`）
- 检查不变量：错误 try/catch 静默处理（记忆失败不阻断 Agent Loop）
- 测试：`npx vitest run src/modules/agent-memory/services/__tests__/memory-service.test.ts`

### 4. 修改种子记忆或嵌入预热
- 修改文件：`services/memory-service-seed-data.ts`（`ensureSeedMemory`/`getSeedMemoryStats`/`resetSeedMemoryFlag`/`prewarmEmbeddings`）
- 检查不变量：首次启动注入种子记忆；Embedding 独立存储于 `agent/memory/embeddings.json`（与 archival.json 解耦），含 modelId/dimensions 元信息，支持维度版本检测与自动失效
- 测试：`npx vitest run src/modules/agent-memory/services/__tests__/memory-service.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`（file-http）、`@/shared-logic/*`（json）、`@/infrastructure/di`、`@/modules/vector-search`
- **类型级依赖**：`@/modules/agent`（仅 `import type` AgentMessage、IMemoryService，编译时擦除，无运行时循环）
- **禁止导入**：`@/infrastructure/*`（除 `@/infrastructure/di`）、其他 `@/modules/*`（除 vector-search）
- **禁止**：直接调用 `electronAPI.*`（文件操作必须走 `@/shared/file-http`）
- **禁止**：domain 层导入任何外部依赖（零依赖约束，除 @/domain/types/memory re-export）
- **必须**：所有持久化通过 `getConfig`/`setConfig`/`writeFile`/`readFile`（@/shared/file-http）
- **必须**：错误 try/catch 静默处理（记忆失败不阻断 Agent Loop）
- **必须**：向量检索委托 `@/modules/vector-search`，本模块只负责存储与抽取

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-memory`
- 关键测试文件：
  - `services/__tests__/memory-service.test.ts` — 记忆服务全链路（核心/归档/抽取/种子）
