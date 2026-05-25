# 任务管理系统 v2 — 设计与实现

> 更新日期: 2026-05-18

## 1. 设计动机

v1 版本的问题诊断结论：**「有骨架、缺心脏」**——适合个人尝鲜，但距离工业化批量生产有差距。

| 问题 | v1 表现 | v2 解决方案 |
|------|---------|-------------|
| 状态转换无约束 | 任意 `as` 强转，pending→completed 可直接跳 | TaskMachine 状态机强制校验 + TransitionError |
| 时间戳混乱 | 毫秒/秒混用，内联类型检查 | ISO 8601 统一 + TimestampBridge |
| UNIQUE 冲突不一致 | ABORT+fallback / IGNORE 混用 | 统一 REPLACE 策略 |
| 错误静默吞没 | 空 catch 块 | errorLogger.warn 记录 |
| UI 组件过大 | VideoTaskManager.tsx 1740 行 | 拆分为 9 个子组件 + handlers |
| 轮询策略简陋 | 固定间隔 | PollingScheduler 自适应退避 |
| 缺少策略引擎 | 超时/过期逻辑散落各处 | PolicyEngine 统一评估 |
| 存储层反向依赖 | video-tasks.ts 导入 TaskMachine | 状态验证移至 hook 层 |

## 2. 架构

```
task-management/
├── domain/                          # 领域子域
│   ├── task-machine.ts              # 状态机核心 + TransitionError
│   ├── task-events.ts               # 8 种领域事件
│   ├── task-schema.ts               # 轮询结果 Schema + API 状态映射
│   ├── policies/
│   │   ├── timeout-policy.ts        # 2 小时超时策略
│   │   ├── expiration-policy.ts     # 7 天过期策略
│   │   └── policy-engine.ts         # 策略聚合引擎
│   └── index.ts                     # Barrel 导出 (TransitionError 类+类型)
├── infrastructure/                  # 基础设施子域
│   ├── timestamp-bridge.ts          # 时间戳桥接 (ISO ↔ Unix)
│   └── polling-scheduler.ts         # 自适应轮询调度器
├── hooks/
│   ├── use-video-task-manager.ts    # 核心 Store + Hook (624行)
│   └── internals/                   # 内部实现拆分
│       ├── polling-engine.ts        # 轮询引擎
│       ├── sync-engine.ts           # 同步引擎
│       └── transition-guard.ts      # 状态转换守卫
├── services/
│   └── video-tracker.ts             # 云端追踪服务
├── presentation/
│   ├── VideoTaskManager.tsx          # 主组件 (362行)
│   ├── handlers/                     # 事件处理器拆分
│   │   └── video-task-handlers.ts   # 下载/恢复/追踪等处理器
│   ├── task-card/                    # 任务卡片拆分
│   │   ├── video-preview.tsx        # 视频预览 (DOM API, 无 innerHTML)
│   │   └── task-actions.tsx         # 任务操作按钮
│   ├── TaskFilterBar.tsx             # 筛选栏
│   ├── RecoverySection.tsx           # 手动找回
│   ├── TaskTrackingDialog.tsx        # 追踪对话框
│   ├── VideoPreviewDialog.tsx        # 视频预览
│   ├── DeleteConfirmDialog.tsx       # 删除确认
│   ├── BulkDeleteDialog.tsx          # 批量删除
│   ├── TaskDetailDialog.tsx          # 任务详情
│   ├── task-status-helpers.tsx       # 状态图标/颜色/标签
│   ├── use-task-filter.ts            # 筛选逻辑 Hook
│   └── use-video-preview.ts          # 预览逻辑 Hook
└── index.ts                          # 子域公共 API
```

## 3. 状态机 (TaskMachine)

### 3.1 状态转换图

```
                    ┌──────────┐
          ┌────────►│ pending  │
          │         └────┬─────┘
          │              │
          │     ┌────────┴────────┐
          │     ▼                 ▼
          │  ┌──────────┐    ┌─────────┐◄────┐
          │  │processing│    │ failed  │     │
          │  └────┬─────┘    └────┬────┘     │
          │       │               │          │
          │  ┌────┴────┐         │     ┌────┴────┐
          │  ▼         ▼         │     │retrying │
          │  │completed│         │     └────┬────┘
          │  └─────────┘         │          │
          │                      └──────────┘
          │
     (cancelled — 终态，无入边)
```

### 3.2 合法转换表

| from | to |
|------|----|
| pending | processing, failed |
| processing | completed, failed |
| completed | *(终态)* |
| failed | retrying |
| cancelled | *(终态)* |
| retrying | processing, completed, failed |

### 3.3 TransitionError

非法转换返回 `TransitionError`（`AppError` 子类），含 `from`/`to` 属性：

```typescript
export class TransitionError extends AppError {
  constructor(
    public readonly from: VideoTaskStatus,
    public readonly to: VideoTaskStatus,
  ) {
    super("INVALID_TRANSITION", `不允许从 ${from} 转换到 ${to}`);
  }
}
```

### 3.4 API

```typescript
TaskMachine.canTransition(from, to): boolean
TaskMachine.transition(task, targetStatus, context?): Result<VideoTask, TransitionError>
TaskMachine.isPollable(status): boolean    // pending, processing, retrying
TaskMachine.isTerminal(status): boolean    // completed, cancelled
```

### 3.5 转换副作用

| 目标状态 | 副作用 |
|----------|--------|
| processing | pollFailureCount=0, lastPolledAt=now (ISO string) |
| completed | progress=100, videoUrl=context.videoUrl |
| failed | message=context.error |
| retrying | recoveryAttempts+1, pollFailureCount=0 |

## 4. 策略引擎

### 4.1 超时策略 (timeout-policy)

- 活跃任务 (pending/processing/retrying) 超过 **2 小时** → TRANSITION to failed
- 终态任务 (completed/failed/cancelled) → NONE

### 4.2 过期策略 (expiration-policy)

- completed 任务有 `expiresAt` 且已过期 → DELETE
- completed 任务无 `expiresAt` 且超过 **7 天** → DELETE
- 非 completed 任务 → NONE

### 4.3 策略引擎 (policy-engine)

```typescript
evaluatePolicies(task): PolicyAction[]
// 聚合所有策略结果，过滤 NONE，返回需要执行的动作
```

### 4.4 动作类型

```typescript
type PolicyAction =
  | { type: "NONE" }
  | { type: "TRANSITION"; targetStatus: VideoTaskStatus; reason: string }
  | { type: "DELETE"; reason: string }
```

## 5. TimestampBridge

统一内存 (ISO string) 与存储 (Unix timestamp 秒) 的时间戳转换：

```typescript
TimestampBridge.toStorage(isoString: string | null): number | null   // ISO → Unix sec
TimestampBridge.fromStorage(unixSec: number | null): string | null   // Unix sec → ISO
TimestampBridge.toStorageOrThrow(isoString): number                   // 失败抛异常
TimestampBridge.fromStorageOrThrow(unixSec): string                   // 失败抛异常
```

## 6. PollingScheduler

自适应退避轮询调度器：

| 参数 | 值 |
|------|-----|
| 基础间隔 | 5 秒 |
| 最大间隔 | 60 秒 |
| 退避因子 | 1.5x |
| 失败计数 | 每次失败 +1 |

```typescript
const scheduler = new PollingScheduler(onPollCallback);
scheduler.start(taskId);         // 开始轮询
scheduler.stop(taskId);          // 停止轮询
scheduler.stopAll();             // 停止所有轮询
scheduler.reportSuccess(taskId); // 成功 → 重置间隔
scheduler.reportFailure(taskId); // 失败 → 退避
scheduler.isActive(taskId);      // 是否活跃
scheduler.getActiveCount();      // 活跃数量
```

## 7. 状态守卫 (withTransitionGuard)

在 Store 层面，所有状态变更通过守卫函数验证：

```typescript
function withTransitionGuard(task, targetStatus, updates): Partial<VideoTask> {
  if (TaskMachine.canTransition(task.status, targetStatus)) {
    return { ...updates, status: targetStatus };  // 合法：放行
  }
  errorLogger.warn({ code: "INVALID_TRANSITION", message: "..." });
  const { status: _s, ...safeUpdates } = updates;
  return safeUpdates;  // 非法：跳过状态变更，保留其他字段
}
```

## 8. 存储层集成

状态验证已从存储层移至 Hook 层，存储层不再导入 TaskMachine：

```typescript
// hooks/use-video-task-manager.ts — 状态验证在此
if (!TaskMachine.canTransition(task.status, targetStatus)) {
  errorLogger.warn(...);
  return;
}
await videoTaskStorage.updateVideoTask(taskId, updates);
```

## 9. VideoTaskStatus 类型

```typescript
// Zod Schema (src/domain/schemas/api.ts)
videoTaskStatusSchema = z.enum(["pending", "processing", "completed", "failed", "cancelled", "retrying"])
```

## 10. 测试覆盖

| 测试文件 | 测试数 | 覆盖范围 |
|----------|--------|----------|
| task-machine.test.ts | 44 | canTransition 全量、transition 副作用、TransitionError、不可变性、isPollable、isTerminal |
| task-schema.test.ts | 12 | pollResultSchema 验证、mapApiStatus 映射 |
| policies.test.ts | 21 | 超时策略、过期策略、策略引擎组合 |
| timestamp-bridge.test.ts | 23 | ISO↔Unix 转换、null/NaN/Infinity、round-trip 精度 |
| polling-scheduler.test.ts | 17 | start/stop/stopAll、backoff、failCount |
