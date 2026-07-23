<!-- AI: Before modifying this module, read contract.json for invariants -->

# Agent Memory Module ✅

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

> Agent 记忆系统模块 — 三层记忆架构（核心/归档/工作），支持 LLM 自动抽取与向量检索。

## 模块概览

- **定位**：Agent 的持久化记忆系统，提供用户偏好、项目事实、会话摘要的存储与检索
- **架构**：三层记忆（核心常驻 prompt / 归档按需检索 / 工作即会话历史）
- **来源**：阶段2-d 从 `@/modules/agent/services/` 拆分（memory-service.ts + seed-data + extraction）
- **向量检索**：委托 `@/modules/vector-search`（三策略链：API > 本地模型 > 关键词）

## 子域

| 子域 | 状态 | 路径 | 职责 |
|------|:----:|------|------|
| domain | ✅ | `domain/` | CoreMemory / MemoryFact / ExtractedMemory 类型定义；re-export ArchivalMemoryEntry |
| services | ✅ | `services/` | memory-service（主入口）+ memory-service-seed-data（种子记忆）+ memory-service-extraction（自动抽取与摘要） |

## Public API

### ✅ 类型
- `CoreMemory` — 核心记忆（preferences + facts）
- `MemoryFact` — 项目事实条目
- `ExtractedMemory` — LLM 自动抽取结果
- `ArchivalMemoryEntry` — 归档记忆条目（re-export from @/domain/types/memory）

### ✅ 核心记忆操作
- `getCoreMemory` — 读取核心记忆
- `saveCoreMemory` — 保存核心记忆
- `updatePreference` — 更新单个偏好
- `saveFact` — 保存事实（同 key 覆盖）
- `removeFact` — 删除事实
- `removePreference` — 删除偏好
- `clearCoreMemory` — 清空核心记忆
- `getCoreMemorySize` — 获取核心记忆大小
- `getArchivalMemoryCount` — 获取归档记忆条数

### ✅ 归档记忆操作
- `getAllArchivalMemory` — 读取所有归档记忆
- `addArchivalMemory` — 追加归档记忆（串行化锁防并发覆盖）
- `searchArchivalMemory` — 搜索归档记忆（向量检索 + 关键词降级）
- `deleteArchivalMemory` — 删除归档记忆

### ✅ System Prompt 注入
- `buildCoreMemoryPrompt` — 构建核心记忆 prompt 片段
- `searchRelevantMemory` — RAG 检索相关记忆

### ✅ 自动抽取与摘要
- `shouldExtract` — 判断是否触发自动抽取
- `extractFromConversation` — 从对话抽取记忆
- `applyExtractedMemory` — 应用抽取结果
- `summarizeConversation` — 摘要对话历史

### ✅ 种子记忆
- `ensureSeedMemory` — 确保种子记忆初始化（首次启动注入）
- `getSeedMemoryStats` — 获取种子记忆统计
- `resetSeedMemoryFlag` — 重置种子记忆标志
- `prewarmEmbeddings` — 预热嵌入向量

### ✅ 单例
- `memoryService` — MemoryService 单例
- `MemoryService` — 服务类（implements IMemoryService）

### ✅ 测试辅助（_ 前缀，仅测试用）
- `_setSearchEngine` — 测试用：设置搜索引擎
- `_resetSearchEngine` — 测试用：重置搜索引擎
- `_getTestEmbeddingStore` — 测试用：获取嵌入存储
- `_resetAllMemory` — 测试用：重置所有记忆

## 设计要点

### 类型级依赖（编译时擦除）
- `AgentMessage` 仍归属于 `@/modules/agent`（Agent 核心类型，与 AgentSession 耦合）
- `IMemoryService` 仍归属于 `@/modules/agent/domain/ports`（Agent Port 接口）
- agent-memory 通过 `import type` 引用上述类型，编译时擦除，无运行时循环依赖
- 此模式与阶段2-b agent-session 拆分一致

### 三层记忆架构
1. **核心记忆**：存储于 `getConfig("agent.coreMemory")`，约 2KB，常驻 system prompt
2. **归档记忆**：存储于 `{cacheDir}/agent/memory/archival.json`，上限 200 条，按时间淘汰
3. **工作记忆**：即 `AgentSession.messages`（由 agent-session 模块管理，本模块不涉及）

### 串行化写锁
`archivalWriteChain` 是模块级 Promise 链，串行化所有 read-modify-write 操作（addArchivalMemory / updatePreference / removeFact），防止并发覆盖。

### 向量检索委托
归档记忆检索委托 `@/modules/vector-search` 的三策略链：
- API 模式：embeddingProvider 已配置时调用
- 本地模式：用户拖入 ONNX 模型时调用
- 关键词模式：以上都不可用时降级

### Embedding 独立存储
Embedding 存储于 `agent/memory/embeddings.json`（与 archival.json 解耦），含 modelId/dimensions 元信息，支持维度版本检测与自动失效。

## 边界约束

- **禁止**：直接调用 `electronAPI.*`（文件操作必须走 `@/shared/file-http`）
- **禁止**：domain 层导入任何外部依赖（零依赖约束，除 @/domain/types/memory re-export）
- **必须**：所有持久化通过 `getConfig`/`setConfig`/`writeFile`/`readFile`（@/shared/file-http）
- **必须**：错误 try/catch 静默处理（记忆失败不阻断 Agent Loop）
- **必须**：向量检索委托 `@/modules/vector-search`，本模块只负责存储与抽取

## 依赖方向

```
agent-memory → domain（类型，零依赖，ArchivalMemoryEntry re-export 自 @/domain/types/memory）
              → shared（file-http）
              → shared-logic（json）
              → infrastructure/di（container，用于获取 textProvider/embeddingProvider）
              → modules/vector-search（向量检索委托）
              → @/modules/agent（仅类型级：AgentMessage, IMemoryService，编译时擦除）
```

注意：agent-memory 在类型层面引用 agent 的 AgentMessage 和 IMemoryService，但这是 `import type`（编译时擦除），运行时不产生循环依赖。agent 模块通过 barrel re-export agent-memory 的 API 保持向后兼容。
