# Video 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| task-management | 🔴 高 | 状态机、Zustand Store、轮询引擎、beforeunload 同步保存 |
| recovery | 🔴 高 | 智能恢复、Token 浪费检测、重复检测、验证逻辑 |
| cache | 🟡 中 | 双层缓存（视频+图片）、容量限制、URL 过期刷新 |
| utils | 🟢 低 | 纯工具函数，无状态 |

## 子域依赖图

```
utils（底层，无依赖）
  ↑
cache ← @/infrastructure/di, @/shared/video-cache
  ↑
task-management ← cache, @/infrastructure/di, zustand, @/shared/utils/toast-bridge
  ↑
recovery ← task-management (通过 registerCacheVideoBlobFn/registerRecoveryFn)
```

- `cache` 和 `utils` 不依赖 `task-management` 或 `recovery`
- `recovery` 通过注册函数（registerCacheVideoBlobFn、registerRecoveryFn）与 cache 解耦

## 常见修改场景

### 1. 新增视频任务状态或修改状态转换
- 修改文件：`task-management/domain/task-machine.ts`、`task-management/domain/task-schema.ts`
- 检查不变量：INV-1（状态转换必须经过 TaskMachine）、INV-15（终态不可轮询，failed/timeout 可恢复）、INV-18（mapApiStatus 降级）
- 测试：`npx vitest run src/modules/video/task-management/domain`

### 2. 修改轮询逻辑或策略引擎
- 修改文件：`task-management/hooks/internals/polling-engine.ts`、`task-management/domain/policies/`（policy-engine.ts、timeout-policy.ts、expiration-policy.ts）
- 检查不变量：INV-7（轮询失败上限，超时标记为 timeout，网络错误不累计 pollFailureCount）、INV-14（策略评估顺序）
- 测试：`npx vitest run src/modules/video/task-management/hooks/internals`

### 3. 修改缓存策略或容量限制
- 修改文件：`cache/services/video-cache.ts`、`cache/services/image-cache.ts`
- 检查不变量：INV-8（缓存容量限制）、INV-9（缓存写入原子性）、INV-10（URL 过期刷新）
- 测试：`npx vitest run src/modules/video/cache`

### 4. 修改恢复逻辑或重试策略
- 修改文件：`recovery/services/smart-retry-engine.ts`、`recovery/services/video-intelligent-recovery-service.ts`
- 检查不变量：INV-11（恢复前必须验证）、INV-12（高风险重试必须拒绝）、INV-13（重复检测阈值）
- 测试：`npx vitest run src/modules/video/recovery`

### 5. 修改任务创建/删除流程
- 修改文件：`task-management/hooks/use-video-task-manager.ts`
- 检查不变量：INV-2（持久化先于状态更新）、INV-3（删除级联清理）、INV-4（批量删除容忍部分失败）、INV-5（创建防重入）
- 测试：`npx vitest run src/modules/video/task-management/hooks`

### 6. 修改视频任务与故事联动
- 修改文件：`task-management/hooks/use-video-task-manager.ts`、`app/story/useStoryVideo.ts`、`app/story/StoryProvider.tsx`
- 关键模式：
  - **stableActions**: `useVideoTaskManager` 通过 `useMemo([store])` 缓存所有 action 方法为稳定引用
  - **useStableCompletedUrls**: `useStoryVideo` 中 `completedTaskUrls` Map 通过 shallow 比较确保只有内容真正变化时才创建新引用
  - **StoryProvider useMemo 依赖拆分**: 依赖从 `videoTaskManager` 整体对象拆分为具体属性
- 测试：`npx vitest run src/modules/video/task-management/hooks`

### 7. 修改文件操作通信层
- 修改文件：`@/shared/file-http/index.ts`（统一通信层入口）
- 影响范围：cache 子域通过别名导入（httpWriteFile、httpReadFile、httpFileExists、httpDeleteFile、httpGetCacheDirectory、httpGetDiskSpace、httpGetFileInfo），recovery 子域使用 httpFileExists、httpGetFileInfo
- 通信策略：HTTP 优先 + IPC 回退（向后兼容），修改时需确保两条路径行为一致
- 测试：`npx vitest run src/modules/video/cache src/modules/video/recovery`

## 内部实现细节（非明确要求不要修改）

- `task-management/domain/task-machine.ts` — withTransitionGuard 开发/生产双模式
- `task-management/hooks/internals/polling-engine.ts` — 轮询引擎、MAX_POLL_FAILURES 逻辑
- `task-management/hooks/internals/` — store 内部实现、beforeunload 同步 XHR、sync-engine
- `recovery/services/duplicate-detection-service.ts` — 相似度权重分配与阈值
- `recovery/services/video-intelligent-recovery-service.ts` — 恢复决策树
- `cache/services/video-cache.ts` — 内存缓存 + 磁盘缓存双层、TTL 80% 刷新（磁盘缓存部分通过 `@/shared/file-http` 实现，HTTP 优先 + IPC 回退）

## 测试验证

- 测试命令：`npx vitest run src/modules/video`
- 关键测试文件：
  - `task-management/domain/__tests__/task-machine.test.ts` — 状态机转换
  - `task-management/domain/__tests__/policies.test.ts` — 策略引擎
  - `task-management/hooks/__tests__/r46-polling-state-reset-order.test.ts` — 轮询状态重置顺序
  - `task-management/hooks/__tests__/r34-zustand-functional-update.test.ts` — Zustand 函数式更新
  - `recovery/services/__tests__/smart-retry-engine.test.ts` — 智能重试
  - `recovery/services/__tests__/duplicate-detection-service.test.ts` — 重复检测
  - `task-management/hooks/internals/__tests__/polling-engine.test.ts` — 轮询引擎
