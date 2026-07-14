<!-- AI: Before modifying this module, read contract.json for invariants -->

# Embedding Infrastructure Module

> 本地 ONNX embedding 模型管理 + transformers.js 推理引擎 + 余弦相似度计算。

## 模块概览

- **定位**：infrastructure 层，提供本地 embedding 全套基础设施
- **核心**：三模式向量检索架构（API > 本地 ONNX > 关键词）的本地模型层
- **依赖**：`@/shared/file-http`（文件操作）、`@huggingface/transformers`（推理引擎，动态 import）

## 架构设计

### 三模式向量检索链

```
searchArchivalMemory(query)
  └── VectorSearchEngine.search()
        ├── 1. ApiVectorStrategy    (container.embeddingProvider，需联网)
        ├── 2. LocalVectorStrategy  (本模块的 getLocalEmbeddingProvider，离线可用)
        └── 3. KeywordStrategy      (兜底，总是可用)
```

本模块实现 **LocalVectorStrategy** 的底层支撑：
- `model-manager.ts` — 模型文件检测、多模型 registry 管理、完整性校验
- `local-embedding-provider.ts` — transformers.js pipeline 懒加载 + IEmbeddingProvider 实现
- `similarity.ts` — 纯函数余弦相似度计算（无外部依赖）

### 多模型管理（M5）

```
<cacheDir>/models/embedding/
  ├── registry.json              ← 多模型注册表
  ├── model.onnx                 ← 旧模型（兼容，根目录）
  ├── tokenizer.json
  ├── config.json
  ├── <modelId-1>/               ← 新安装模型（子目录）
  │   ├── model_quantized.onnx
  │   ├── tokenizer.json
  │   └── config.json
  └── <modelId-2>/               ← 第二个模型
      └── ...
```

- **单活跃模型**：同一时间只有一个 `activeModelId`（transformers.js pipeline 单例限制）
- **软迁移**：首次 `detectLocalModel` 发现根目录有模型文件但无 `registry.json` 时，不移动文件，只创建 registry 注册根目录模型为 active
- **切换 active**：`setActiveModel(id)` 触发 `_onActiveModelChange` 回调，provider 清空 pipeline 缓存

### 完整性校验（M3）

| 文件 | 校验规则 |
|------|---------|
| `*.onnx` | 大小 ≥ 1KB + protobuf magic byte（0x08/0x0a/0x12） |
| `tokenizer.json` | 合法 JSON + 含 `model.model_type` 或 `vocab` 字段 |
| `config.json` | 合法 JSON + `modelName`（非空字符串）+ `dimensions`（正整数） |

校验失败时 `ModelStatus.integrityErrors` 填充错误列表（与 `missingFiles` 区分）。

## 文件结构

```
src/infrastructure/embedding/
  ├── index.ts                    ← Barrel export
  ├── model-manager.ts            ← 模型管理（检测/删除/多模型 registry/完整性校验）
  ├── local-embedding-provider.ts ← transformers.js 推理引擎（IEmbeddingProvider 实现）
  ├── similarity.ts               ← 余弦相似度纯函数（零依赖）
  ├── contract.json               ← 接口契约 + invariants
  ├── MODULE.md                   ← 本文档
  └── __tests__/
      └── model-manager.test.ts   ← 多模型管理测试（49 个）
```

## Public API

### 模型管理（向后兼容 + M5 多模型）

**向后兼容**（签名不变，已有测试 mock 依赖）：
- `getModelDirectory()` — 返回 embedding 根目录 `<cacheDir>/models/embedding`
- `detectLocalModel()` — 返回当前 active 模型的 `ModelStatus`
- `deleteLocalModel()` — 删除当前 active 模型（委托 `removeModel(activeId)`）

**M5 多模型管理**：
- `listLocalModels()` — 列出所有已注册模型（`LocalModelEntry[]`）
- `getActiveModelId()` — 获取 active 模型 id（`string | null`）
- `getActiveModelEntry()` — 获取 active 模型条目（`LocalModelEntry | null`）
- `setActiveModel(id)` — 切换 active 模型（触发 provider 缓存清空回调）
- `removeModel(id)` — 删除指定模型（文件 + registry 条目；删除 active 时自动切换）
- `installModelFromFiles(modelId, files)` — 安装新模型到子目录，完整性校验，注册到 registry
- `deriveModelId(modelName)` — 从 modelName 派生 id
- `_setActiveModelChangeCallback(cb)` — 注册 active 模型变更回调（provider 用）

### 推理引擎

- `getLocalEmbeddingProvider()` — 返回 `IEmbeddingProvider | null`（null 表示不可用）
- `preloadLocalModel()` — 预热模型（可选，避免首次调用延迟）
- `clearLocalModelCache()` — 清空 pipeline 缓存（切换模型时调用）

### 相似度计算（纯函数，零依赖）

- `cosineSimilarity(a, b)` — 两个向量的余弦相似度 `[-1, 1]`
- `batchCosineSimilarity(query, candidates)` — 批量计算
- `findTopK(query, candidates, k)` — 返回 Top-K `{ index, similarity }`（降序）

### 常量

- `ACCEPTED_ONNX_FILES` — 候选 ONNX 文件名列表（7 种变体）
- `ALL_REQUIRED_FILES` — 所有必需文件（ONNX 候选 + tokenizer.json + config.json）

## Invariants

详见 [contract.json](./contract.json) 的 `invariants` 字段。关键约束：

1. **单活跃模型**：同一时间只有一个 `activeModelId`
2. **切换清缓存**：`setActiveModel` 必须触发 provider pipeline 缓存清空
3. **完整性校验**：`installModelFromFiles` 安装前必须校验，失败必须回滚
4. **软迁移**：不移动文件，只创建 registry.json
5. **向后兼容**：`detectLocalModel` / `deleteLocalModel` 签名不变
6. **文件操作统一层**：必须通过 `@/shared/file-http`，禁止直接 electronAPI

## 扩展点

### 添加新的 ONNX 文件名变体

在 `model-manager.ts` 的 `ONNX_FILE_CANDIDATES` 数组添加新文件名，`findOnnxFile` 自动按顺序查找。

### 添加新的完整性校验规则

在 `model-manager.ts` 新增 `verifyXxxIntegrity(filePath)` 函数，在 `detectLocalModel` / `installModelFromFiles` 中调用，失败时 push 到 `integrityErrors`。

### 添加新的相似度算法

在 `similarity.ts` 新增纯函数（零依赖），通过 barrel export 暴露。

### 替换为近似最近邻索引（未来）

当前 `findTopK` 是 O(n) flat index 暴力搜索。当记忆条目超过 10K 时，可抽象出 `VectorIndex` 接口（`build` / `search`），替换为 HNSW/IVF 实现。`VectorSearchEngine` 的策略链无需改动。

## 消费者

- `src/modules/vector-search/strategies.ts` — `LocalVectorStrategy` 使用 `detectLocalModel` / `getLocalEmbeddingProvider`
- `src/modules/agent/services/memory-service.ts` — `searchArchivalMemory` 通过 `VectorSearchEngine` 间接使用
- `src/app/settings/EmbeddingModelPanel.tsx` — UI 使用 `listLocalModels` / `setActiveModel` / `removeModel` / `installModelFromFiles`
