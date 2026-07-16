# Agent Few-Shot 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services/runtime-cache | 🟡 中 | few-shot 缓存持久化（writeFile/readFile）、LRU 淘汰、错误静默处理 |
| services/builtin-examples | 🟢 低 | 内置静态示例数据（46 条），无 I/O，纯函数检索 |
| domain | 🟢 低 | 仅 FewShotEntry 类型定义（零外部依赖） |

## 子域依赖图

```
domain/types.ts（FewShotEntry，零依赖）
  ↑
services/tool-fewshot-cache.ts ← @/shared/file-http、@/shared/error-logger、@/shared/utils/format
services/builtin-fewshot-examples.ts ← domain/types
  ↑
@/modules/agent/services/agent-loop.ts（唯一消费者）
```

- `domain` 是底层类型子域，零外部依赖（打破类型循环依赖）
- `services` 两个文件彼此独立：tool-fewshot-cache 负责运行时缓存，builtin-fewshot-examples 负责内置示例
- 唯一外部消费者是 `@/modules/agent/services/agent-loop.ts`，注入 system prompt + 记录工具调用结果

## 公共 API

- `FewShotEntry` — 单条 few-shot 缓存条目类型
- `recordFewShot` — 记录一条成功调用的 few-shot（仅 success=true）
- `getFewShots` — 获取指定工具的 few-shot 条目（最新 limit 条）
- `getRelevantFewShots` — 根据用户查询检索相关 few-shot（合并内置 + 运行时，关键词匹配排序）
- `buildFewShotPrompt` — 构建 few-shot 提示文本（注入 system prompt）
- `clearFewShotCache` — 清空所有运行时缓存
- `getFewShotStats` — 获取缓存统计信息（含内置示例统计）
- `BUILTIN_FEWSHOT_EXAMPLES` — 内置示例常量数组（46 条，覆盖 5 个 domain）
- `getBuiltinFewShotExamples` — 获取所有内置示例（返回副本）
- `getBuiltinFewShotsByTool` — 按工具名筛选内置示例
- `getRelevantBuiltinFewShots` — 按用户查询检索相关内置示例
- `getBuiltinFewShotStats` — 获取内置示例统计

## 常见修改场景

### 1. 修改 few-shot 缓存持久化逻辑
- 修改文件：`services/tool-fewshot-cache.ts`
- 检查不变量：缓存文件 `{cacheDir}/agent/fewshot-cache.json`，每个工具保留最近 3 条（LRU 淘汰），仅记录 `success=true` 调用，错误 try/catch 静默处理（不阻断 Agent 主流程）
- 测试：`npx vitest run src/modules/agent/services/__tests__/agent-loop.test.ts`

### 2. 新增或修改内置 few-shot 示例
- 修改文件：`services/builtin-fewshot-examples.ts`（`BUILTIN_FEWSHOT_EXAMPLES` 常量数组）
- 检查不变量：内置示例 timestamp=0（早于任何运行时缓存），相同匹配度时运行时优先（timestamp 倒序）
- 测试：手动验证 Agent Loop 调用工具时的 system prompt 注入

### 3. 修改检索排序或 prompt 构建逻辑
- 修改文件：`services/tool-fewshot-cache.ts`（`getRelevantFewShots`、`buildFewShotPrompt`）
- 检查不变量：检索时合并内置 + 运行时两层示例，关键词匹配排序
- 测试：`npx vitest run src/modules/agent/services/__tests__/agent-loop.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`（file-http、error-logger、utils/format）
- **禁止导入**：`@/modules/agent/*`（agent 单向消费本模块，避免循环）、`@/infrastructure/*`、其他 `@/modules/*`
- **禁止**：直接调用 `electronAPI.*`（文件操作必须走 `@/shared/file-http`）
- **禁止**：domain 层导入任何外部依赖（零依赖约束）
- **必须**：错误静默处理（few-shot 失败不阻断 Agent 主流程）
- **必须**：仅记录 `success=true` 的工具调用（失败调用无引导价值）

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-fewshot`
- 关键测试：本模块无独立测试目录，由 `src/modules/agent/services/__tests__/agent-loop.test.ts` 覆盖集成场景
