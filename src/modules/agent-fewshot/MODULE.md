<!-- AI: Before modifying this module, read contract.json for invariants -->

# Agent Few-Shot Module

> Agent 工具调用 few-shot 缓存模块 — 从历史成功调用中提取示例，引导 LLM 正确调用工具。

## 模块概览

- **定位**：为 Agent Loop 提供 few-shot 示例检索服务，提升工具调用准确率
- **职责**：内置示例 + 运行时缓存合并检索，构建注入 system prompt 的提示文本
- **来源**：阶段2-c 从 `@/modules/agent/services/` 拆分（tool-fewshot-cache.ts + builtin-fewshot-examples.ts）
- **唯一消费者**：`@/modules/agent/services/agent-loop.ts`（注入 system prompt + 记录工具调用结果）

## 子域

| 子域 | 路径 | 职责 |
|------|------|------|
| domain | `domain/` | `FewShotEntry` 类型定义（零外部依赖，打破循环依赖） |
| services | `services/` | tool-fewshot-cache（运行时缓存）+ builtin-fewshot-examples（内置示例库） |

## Public API

### 类型
- `FewShotEntry` — 单条 few-shot 缓存条目类型

### 运行时缓存服务（services/tool-fewshot-cache.ts）
- `recordFewShot(toolName, args, result, userQuery)` — 记录一条成功调用的 few-shot（仅 success=true）
- `getFewShots(toolName, limit?)` — 获取指定工具的 few-shot 条目（最新 limit 条）
- `getRelevantFewShots(userQuery, limit?)` — 根据用户查询检索相关 few-shot（合并内置 + 运行时，关键词匹配排序）
- `buildFewShotPrompt(userQuery, limit?)` — 构建 few-shot 提示文本（注入 system prompt）
- `clearFewShotCache()` — 清空所有运行时缓存
- `getFewShotStats()` — 获取缓存统计信息（含内置示例统计）

### 内置示例库（services/builtin-fewshot-examples.ts）
- `BUILTIN_FEWSHOT_EXAMPLES` — 内置示例常量数组（46 条，覆盖 5 个 domain）
- `getBuiltinFewShotExamples()` — 获取所有内置示例（返回副本）
- `getBuiltinFewShotsByTool(toolName, limit?)` — 按工具名筛选内置示例
- `getRelevantBuiltinFewShots(userQuery, limit?)` — 按用户查询检索相关内置示例
- `getBuiltinFewShotStats()` — 获取内置示例统计

## 设计要点

### 类型循环依赖消除
原 `tool-fewshot-cache.ts` 定义 `FewShotEntry`，`builtin-fewshot-examples.ts` 通过 `import type` 引用，形成类型级循环。本模块将 `FewShotEntry` 提取到 `domain/types.ts`，两个服务文件都从 domain 导入，打破循环。

### 双层 few-shot 设计
- **内置示例（BUILTIN_FEWSHOT_EXAMPLES）**：timestamp=0（早于任何运行时缓存），覆盖典型参数组合，新用户开箱即用
- **运行时缓存（fewshot-cache.json）**：timestamp=Date.now()，从用户实际成功调用中学习，更贴近用户习惯
- 检索时合并两者，相同匹配度时运行时优先（timestamp 倒序）

### 持久化
- 缓存文件：`{cacheDir}/agent/fewshot-cache.json`
- 按 `@/shared/file-http` 访问（不直接调用 electronAPI）
- 格式：`{ version: 1, entries: Record<toolName, FewShotEntry[]> }`
- 每个工具保留最近 3 条（LRU 淘汰）

## 边界约束

- **禁止**：直接调用 `electronAPI.*`（文件操作必须走 `@/shared/file-http`）
- **禁止**：domain 层导入任何外部依赖（零依赖约束）
- **必须**：所有持久化通过 `writeFile`/`readFile`（@/shared/file-http）
- **必须**：错误静默处理（few-shot 失败不阻断 Agent 主流程）
- **必须**：仅记录 success=true 的工具调用（失败调用无引导价值）

## 依赖方向

```
agent-fewshot → domain（类型，零依赖）
              → shared（file-http、error-logger、utils/format）
```

注意：本模块不依赖 `@/modules/agent`，单向被 agent 消费，避免循环。
