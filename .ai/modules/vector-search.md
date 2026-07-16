# Vector Search 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| engine | 🔴 高 | 策略链调度器、三模式 fallback（API > 本地模型 > 关键词）、首个成功策略结果直接返回 |
| strategies | 🔴 高 | 三种检索策略实现、ApiVectorStrategy 联网调用 embeddingProvider、LocalVectorStrategy 动态 import ONNX 模型、维度版本检测 |
| embedding-store | 🟡 中 | 文件存储实现、embedding 独立存储（embeddings.json）、维度版本检测与自动失效 |
| types | 🟢 低 | 策略接口、存储接口、进度类型定义 |

## 子域依赖图

```
types.ts（EmbeddingStore / EmbeddingMeta / RetrievalStrategy / SearchProgress / ProgressCallback，零依赖）
  ↑
embedding-store.ts（FileEmbeddingStore） ← @/shared/file-http、@/domain/types/memory
strategies.ts（ApiVectorStrategy / LocalVectorStrategy / KeywordStrategy）
  ← @/infrastructure/di（container.embeddingProvider，API 策略）
  ← @/shared/embedding（动态 import，本地 ONNX 模型推理 + findTopK）
  ← @/shared/error-logger、@/shared/file-http
engine.ts（VectorSearchEngine + createDefaultEngine）
  ← strategies、embedding-store、types
  ↑
index.ts（barrel）
  ↑
@/modules/agent-memory/services/memory-service.ts（引擎单例由 memory-service 模块级缓存）
```

- `types` 是底层类型子域
- `embedding-store` 与 `strategies` 彼此独立，均依赖 types
- `engine` 聚合 strategies 和 embedding-store，提供策略链调度
- 引擎单例由调用方管理（memory-service 模块级缓存）
- 存储路径固定为 `<cacheDir>/agent/memory/embeddings.json`（与 agent memory-service 保持一致）

## 公共 API

### 引擎
- `VectorSearchEngine` — 策略链调度器类
- `createDefaultEngine` — 创建默认引擎（含三策略链）

### 策略
- `ApiVectorStrategy` — API embedding 策略（联网模式，modelId=`"api"`）
- `LocalVectorStrategy` — 本地 ONNX 模型策略（离线模式，modelId=模型 modelName）
- `KeywordStrategy` — 关键词策略（兜底，总是可用）
- `keywordSearch` — 关键词检索函数

### 存储
- `FileEmbeddingStore` — 文件存储实现类
- `createEmbeddingStore` — 创建嵌入存储实例

### 类型
- `EmbeddingStore` — 嵌入存储接口
- `EmbeddingMeta` — 嵌入元信息（modelId/dimensions）
- `RetrievalStrategy` — 检索策略接口
- `SearchProgress` — 检索进度信息
- `ProgressCallback` — 进度回调类型

## 常见修改场景

### 1. 修改策略链调度逻辑
- 修改文件：`engine.ts`（`VectorSearchEngine` / `createDefaultEngine`）
- 检查不变量：策略链按优先级依次尝试（API > 本地模型 > 关键词）；首个成功的策略结果直接返回；引擎单例由调用方管理（memory-service 模块级缓存）
- 测试：`npx vitest run src/modules/agent/services/__tests__/vector-search.test.ts`

### 2. 修改检索策略实现
- 修改文件：`strategies.ts`（`ApiVectorStrategy` / `LocalVectorStrategy` / `KeywordStrategy` / `keywordSearch`）
- 检查不变量：ApiVectorStrategy 联网调用 `container.embeddingProvider`；LocalVectorStrategy 动态 `import("@/shared/embedding")` 加载 ONNX 模型 + findTopK 相似度计算；KeywordStrategy 兜底总是可用
- 测试：`npx vitest run src/modules/agent/services/__tests__/vector-search.test.ts`

### 3. 修改 embedding 存储
- 修改文件：`embedding-store.ts`（`FileEmbeddingStore` / `createEmbeddingStore`）
- 检查不变量：Embedding 独立存储于 `<cacheDir>/agent/memory/embeddings.json`（与 archival.json 解耦）；含 modelId/dimensions 元信息；切换模型时自动清空旧 embedding（维度版本检测与自动失效）；懒生成（检索时按需生成缺失 embedding）
- 测试：`npx vitest run src/modules/agent/services/__tests__/vector-search.test.ts`

### 4. 修改进度通知
- 修改文件：`engine.ts`、`strategies.ts`（ProgressCallback 透传）
- 检查不变量：backfill 大批量 embedding 时通过 ProgressCallback 报告进度（S3）；进度回调透传至策略层，便于 UI 显示进度条
- 测试：`npx vitest run src/modules/agent/services/__tests__/vector-search.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`（types/memory、ports）、`@/shared/*`（file-http、error-logger、embedding 动态导入）、`@/infrastructure/di`
- **禁止导入**：`@/modules/agent`（ArchivalMemoryEntry 已提取到 `@/domain/types/memory`，无运行时依赖）、其他 `@/modules/*`
- **禁止**：直接调用 `electronAPI.*`，文件操作通过 `@/shared/file-http` 统一层
- **必须**：存储路径固定为 `<cacheDir>/agent/memory/embeddings.json`（与 agent memory-service 保持一致）
- **必须**：本地 ONNX 模型推理通过动态 `import("@/shared/embedding")` 加载

## 测试验证

- 测试命令：`npx vitest run src/modules/vector-search`
- 关键测试：本模块无独立测试目录，由 `src/modules/agent/services/__tests__/vector-search.test.ts` 覆盖三策略链集成场景
