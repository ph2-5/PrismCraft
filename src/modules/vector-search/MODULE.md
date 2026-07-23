# Vector Search Module ✅

> 向量检索引擎模块 — 三模式检索架构（API > 本地模型 > 关键词）
>
> 从 `src/modules/agent/services/vector-search/` 拆分为独立模块。

<!-- AI: Before modifying this module, read contract.json for invariants -->

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 概述

向量检索引擎，为 agent 记忆系统提供 RAG（Retrieval-Augmented Generation）检索能力。
采用策略链模式，按优先级依次尝试三种检索方式，首个成功的策略结果直接返回。

### 策略链

| 优先级 | 策略 | 适用场景 | modelId |
|--------|------|----------|---------|
| 1 | ApiVectorStrategy | embedding capability 已配置（联网） | `"api"` |
| 2 | LocalVectorStrategy | 用户拖入 ONNX 模型文件（离线） | 模型 modelName |
| 3 | KeywordStrategy | 兜底（总是可用） | N/A |

### 关键特性

- **Embedding 独立存储**：与 archival.json 解耦，存储在 `embeddings.json`
- **维度版本检测**：切换模型时自动清空旧 embedding（S2）
- **懒生成**：检索时按需生成缺失 embedding
- **进度通知**：backfill 大批量 embedding 时通过 ProgressCallback 报告进度（S3）
- **渐进增强**：无任何向量配置时零破坏，退回关键词匹配

## 子域

| 子域 | 状态 | 文件 | 职责 |
|------|:----:|------|------|
| types | ✅ | `types.ts` | 策略接口、存储接口、进度类型定义 |
| engine | ✅ | `engine.ts` | VectorSearchEngine 策略链调度器 |
| embedding-store | ✅ | `embedding-store.ts` | FileEmbeddingStore 文件存储实现 |
| strategies | ✅ | `strategies.ts` | 三种检索策略实现 |

## Public API

```typescript
// 引擎
import { VectorSearchEngine, createDefaultEngine } from "@/modules/vector-search";

// 策略
import { ApiVectorStrategy, LocalVectorStrategy, KeywordStrategy, keywordSearch } from "@/modules/vector-search";

// 存储
import { FileEmbeddingStore, createEmbeddingStore } from "@/modules/vector-search";

// 类型
import type { EmbeddingStore, EmbeddingMeta, RetrievalStrategy, SearchProgress, ProgressCallback } from "@/modules/vector-search";
```

### ✅ 引擎
- `VectorSearchEngine` — 策略链调度器类
- `createDefaultEngine` — 创建默认引擎（含三策略链）

### ✅ 策略
- `ApiVectorStrategy` — API embedding 策略（联网模式）
- `LocalVectorStrategy` — 本地 ONNX 模型策略（离线模式）
- `KeywordStrategy` — 关键词策略（兜底）
- `keywordSearch` — 关键词检索函数

### ✅ 存储
- `FileEmbeddingStore` — 文件存储实现类
- `createEmbeddingStore` — 创建嵌入存储实例

### ✅ 类型
- `EmbeddingStore` — 嵌入存储接口
- `EmbeddingMeta` — 嵌入元信息（modelId/dimensions）
- `RetrievalStrategy` — 检索策略接口
- `SearchProgress` — 检索进度信息
- `ProgressCallback` — 进度回调类型

## 依赖

| 依赖 | 用途 |
|------|------|
| `@/domain/types/memory` | `ArchivalMemoryEntry` 类型（全局共享类型） |
| `@/domain/ports` | `IEmbeddingProvider` 接口 |
| `@/shared/file-http` | 文件 I/O（writeFile, readFile, fileExists, getCacheDirectory） |
| `@/shared/error-logger` | 日志 |
| `@/infrastructure/di` | `container.embeddingProvider`（API 策略） |
| `@/shared/embedding`（动态导入） | 本地 ONNX 模型推理 + findTopK 相似度计算 |

## 边界约束

- 本模块不依赖 `@/modules/agent`（ArchivalMemoryEntry 已提取到 `@/domain/types/memory`）
- 不直接调用 electronAPI，文件操作通过 `@/shared/file-http` 统一层
- 存储路径固定为 `<cacheDir>/agent/memory/embeddings.json`（与 agent memory-service 保持一致）
