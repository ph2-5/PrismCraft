# Storyboard 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| planning | 🔴 高 | 复杂异步保存逻辑、并发守卫、级联删除、上下文验证 |
| generation | 🔴 高 | 多步生成链、批量编排、AbortController、视频URL同步 |
| beat-editor | 🟡 中 | Zustand 状态管理、dirty 状态抑制计数器 |
| template | 🟡 中 | 版本控制、导入导出、恢复前备份 |
| prompt-editor | 🟢 低 | 纯 UI 交互、AI 提示词生成，依赖少 |

## 子域依赖图

```
planning ← @/domain, @/infrastructure/di, @/shared/db-core
  │
  ├→ beat-editor ← planning (useStorySaver)
  │     │
  │     └→ generation ← beat-editor (useStoryState), @/modules/prompt, @/modules/shot
  │           │
  │           └→ prompt-editor ← generation (嵌入使用)
  │
  └→ template ← @/infrastructure/di (versionStorage)
```

## 常见修改场景

### 1. 新增分镜生成类型（如新增 AI 生成模式）
- 修改文件：`generation/services/storyboard-generation-service.ts`、`generation/hooks/useKeyframeGenerator.ts` 或 `useFramePairGenerator.ts`
- 检查不变量：INV-1（生成前置依赖链）、INV-7（生成去重）
- 测试：`npx vitest run src/modules/storyboard/generation`

### 2. 修改保存逻辑（如新增保存前校验）
- 修改文件：`planning/hooks/useStorySaver.ts`
- 检查不变量：INV-2（持久化先于状态更新）、INV-4（并发守卫）、INV-5（上下文验证）
- 测试：`npx vitest run src/modules/storyboard/planning`

### 3. 新增批量操作策略
- 修改文件：`generation/hooks/useBatchGenerator.ts`
- 检查不变量：INV-6（批量取消机制）、INV-7（生成去重）
- 测试：`npx vitest run src/modules/storyboard/generation/hooks/__tests__/useBatchGenerator.test.ts`

### 4. 修改模板/版本管理
- 修改文件：`template/services/version-control.ts`、`template/services/storyboard-template.ts`
- 检查不变量：INV-10（版本恢复前自动备份）
- 测试：`npx vitest run src/modules/storyboard/template`

### 5. 修改 dirty 状态管理
- 修改文件：`beat-editor/hooks/useStoryState.ts`
- 检查不变量：边界约束 #5（suppressDirtyCountRef 计数器机制）
- 测试：`npx vitest run src/modules/storyboard/beat-editor`

## 内部实现细节（非明确要求不要修改）

- `planning/hooks/useStorySaver.ts` — savingRef 并发守卫、storyIdAtSaveStart 上下文快照
- `generation/hooks/useAIGeneratorBase.ts` — ongoingGenerations Map 去重机制
- `generation/services/video-url-sync.ts` — 视频URL同步与缓存请求构建
- `beat-editor/hooks/useStoryState.ts` — suppressDirtyCountRef 脏状态抑制计数器
- `generation/hooks/useUploadHandlers.ts` — 乐观更新回滚逻辑

## 测试验证

- 测试命令：`npx vitest run src/modules/storyboard`
- 关键测试文件：
  - `planning/hooks/__tests__/useStorySaver.test.ts` — 保存并发与上下文验证
  - `generation/hooks/__tests__/useBatchGenerator.test.ts` — 批量生成与取消
  - `generation/hooks/__tests__/r32-batch-cancellation.test.ts` — 批量取消守卫
  - `planning/hooks/__tests__/r31-save-context-verify.test.ts` — 保存上下文验证
  - `generation/services/__tests__/video-url-sync.test.ts` — 视频URL同步
