# 视频任务管理系统 v2 设计文档

## 设计目标

| 目标 | 当前状态 | v2 目标 |
|------|---------|---------|
| 状态转换 | 任意跳转，无约束 | 状态机强制约束，非法转换被拒绝 |
| 数据完整性 | 毫秒字符串 bug、竞态风险 | 边界校验、原子操作、幂等写入 |
| 可观测性 | 955 行核心零测试、14 个空 catch | 100% 核心路径测试、结构化日志 |
| 代码结构 | 2 个 God Object（1740行+1000行） | 单一职责，最大文件 < 300 行 |
| 类型安全 | 8 处 `as unknown as` | 零类型断言，Schema 校验所有边界 |

---

## 一、架构总览

```
┌──────────────────────────────────────────────────────────┐
│                     Presentation                          │
│   VideoTaskDashboard / TaskCard / TaskDialog / Hooks      │
│   (纯 UI，零业务逻辑，通过 useTaskCommands/useTaskQueries)  │
├──────────────────────────────────────────────────────────┤
│                     Application                           │
│                                                           │
│   ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│   │  Commands    │  │   Queries    │  │  EventHandlers │  │
│   │ (写操作)     │  │  (读操作)     │  │  (副作用)      │  │
│   └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
│          │                │                   │           │
├──────────┼────────────────┼───────────────────┼───────────┤
│          ▼                ▼                   ▼           │
│                     Domain                                │
│                                                           │
│   ┌──────────────┐  ┌──────────┐  ┌──────────────────┐  │
│   │  TaskMachine  │  │  Events  │  │  Policies        │  │
│   │  (状态机)     │  │  (事件)  │  │  (超时/重试/清理) │  │
│   └──────────────┘  └──────────┘  └──────────────────┘  │
│                                                           │
├──────────────────────────────────────────────────────────┤
│                   Infrastructure                          │
│                                                           │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│   │Repository│  │EventBus  │  │Scheduler │  │APIClient│ │
│   │(SQLite)  │  │(发布订阅)│  │(轮询调度)│  │(视频API)│ │
│   └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 核心设计原则

1. **状态机是唯一的状态转换入口** — 任何代码不得直接修改 task.status
2. **命令产生事件，事件触发副作用** — 可审计、可回放、可测试
3. **Schema 校验所有边界** — API 返回值、用户输入、数据库读取，三重校验
4. **幂等写入** — 同一命令执行多次结果一致，UNIQUE 冲突自动合并
5. **单一职责** — 每个文件 < 300 行，每个函数 < 50 行

---

## 二、领域模型

### 2.1 状态机

```
                         ┌─────────────┐
                         │             │
           createTask    │   pending   │──── timeout ────┐
          ──────────────►│             │                  │
                         └──────┬──────┘                  │
                                │                         │
                    pollSuccess │                         │
                                │                         │
                         ┌──────▼──────┐                  │
                         │             │                  │
                         │ processing  │──── timeout ────┤
                         │             │                  │
                         └──────┬──────┘                  │
                                │                         │
              ┌─────────────────┼──────────────┐          │
              │                 │              │          │
     pollSuccess          pollFailed      pollFailed      │
     (videoUrl ready)     (with error)    (max retries)   │
              │                 │              │          │
       ┌──────▼──────┐  ┌──────▼──────┐       │          │
       │             │  │             │       │          │
       │  completed  │  │   failed    │◄──────┘          │
       │             │  │             │◄─────────────────┘
       └─────────────┘  └──────┬──────┘
                               │
                    retryTask  │
                    ──────────►│
                               │
                         ┌─────▼──────┐
                         │            │
                         │  retrying  │──── pollSuccess ──► completed
                         │            │──── pollFailed  ──► failed
                         └────────────┘
```

**合法状态转换表**：

| 从 → 到 | pending | processing | completed | failed | retrying |
|---------|---------|-----------|-----------|--------|----------|
| **pending** | - | ✅ | ❌ | ✅(超时) | ❌ |
| **processing** | - | - | ✅ | ✅ | ❌ |
| **completed** | - | - | - | - | ❌ |
| **failed** | - | - | ❌ | - | ✅ |
| **retrying** | - | ✅ | ✅ | ✅ | - |

**关键约束**：
- `completed` 是终态，不可回退
- `pending` 不能直接跳到 `completed`（必须经过 processing）
- `failed` 只能转到 `retrying`（不能直接回 pending/processing）
- 删除 `cancelled` 死状态（或作为独立操作，非状态转换）

### 2.2 类型定义

```typescript
// ---- 状态 ----
type TaskStatus = "pending" | "processing" | "completed" | "failed" | "retrying";

// ---- 事件 ----
type TaskEvent =
  | { type: "TASK_CREATED";       taskId: string; input: CreateTaskInput }
  | { type: "TASK_POLL_STARTED";  taskId: string }
  | { type: "TASK_POLL_SUCCEEDED";taskId: string; result: PollSuccessResult }
  | { type: "TASK_POLL_FAILED";   taskId: string; error: string; failCount: number }
  | { type: "TASK_TIMED_OUT";     taskId: string; reason: TimeoutReason }
  | { type: "TASK_RETRY_REQUESTED";taskId: string }
  | { type: "TASK_DELETED";       taskId: string }
  | { type: "TASK_EXPIRED";       taskId: string };

// ---- 命令 ----
type TaskCommand =
  | { type: "CREATE_TASK";  input: CreateTaskInput }
  | { type: "POLL_TASK";    taskId: string }
  | { type: "RETRY_TASK";   taskId: string }
  | { type: "DELETE_TASK";  taskId: string }
  | { type: "DELETE_TASKS_BY_STATUS"; statuses: TaskStatus[] }
  | { type: "CLEAN_EXPIRED"; maxAgeMs: number };

// ---- 核心聚合 ----
interface VideoTask {
  taskId: string;
  status: TaskStatus;
  progress: number;           // 0-100
  videoUrl?: string;
  error?: string;
  providerId: string;
  modelId: string;
  prompt: string;
  createdAt: number;          // 毫秒时间戳（内存中统一用毫秒）
  updatedAt: number;
  expiresAt?: number;
  lastPolledAt?: number;
  pollFailCount: number;
  recoveryAttempts: number;
  metadata: TaskMetadata;
}

interface TaskMetadata {
  storyId?: string;
  beatId?: string;
  shotInstruction?: string;
  framePair?: { firstFrameUrl?: string; lastFrameUrl?: string };
  templateShots?: unknown[];
  [key: string]: unknown;     // 扩展字段
}
```

### 2.3 状态机实现

```typescript
interface TransitionResult {
  success: boolean;
  newStatus: TaskStatus;
  event?: TaskEvent;
  error?: string;
}

class TaskMachine {
  private static transitions: Record<TaskStatus, TaskStatus[]> = {
    pending:     ["processing", "failed"],
    processing:  ["completed", "failed"],
    completed:   [],
    failed:      ["retrying"],
    retrying:    ["processing", "completed", "failed"],
  };

  static canTransition(from: TaskStatus, to: TaskStatus): boolean {
    return TaskMachine.transitions[from].includes(to);
  }

  static transition(
    task: VideoTask,
    targetStatus: TaskStatus,
    context: TransitionContext
  ): Result<VideoTask, TransitionError> {
    if (!TaskMachine.canTransition(task.status, targetStatus)) {
      return err({
        code: "INVALID_TRANSITION" as const,
        message: `不允许从 ${task.status} 转换到 ${targetStatus}`,
        from: task.status,
        to: targetStatus,
      });
    }

    const updated: VideoTask = {
      ...task,
      status: targetStatus,
      updatedAt: Date.now(),
      ...TaskMachine.applySideEffects(task, targetStatus, context),
    };

    return ok(updated);
  }

  private static applySideEffects(
    task: VideoTask,
    targetStatus: TaskStatus,
    context: TransitionContext
  ): Partial<VideoTask> {
    switch (targetStatus) {
      case "processing":
        return { lastPolledAt: Date.now(), pollFailCount: 0 };
      case "completed":
        return {
          progress: 100,
          videoUrl: context.videoUrl,
          error: undefined,
        };
      case "failed":
        return { error: context.error };
      case "retrying":
        return {
          recoveryAttempts: task.recoveryAttempts + 1,
          pollFailCount: 0,
        };
      default:
        return {};
    }
  }
}
```

---

## 三、命令/查询 API

### 3.1 Commands（写操作）

```typescript
interface TaskCommands {
  create(input: CreateTaskInput): Promise<Result<VideoTask>>;
  poll(taskId: string): Promise<Result<VideoTask>>;
  retry(taskId: string): Promise<Result<VideoTask>>;
  delete(taskId: string): Promise<Result<void>>;
  deleteByStatus(statuses: TaskStatus[]): Promise<Result<number>>;
  cleanExpired(maxAgeMs: number): Promise<Result<number>>;
}
```

**命令处理流程**：

```
Command → Validate → StateMachine.transition → Persist → Emit Event
                ↓              ↓                    ↓          ↓
           Schema校验     状态机约束          原子写入     通知副作用
```

每个命令的实现骨架：

```typescript
async create(input: CreateTaskInput): Promise<Result<VideoTask>> {
  // 1. Schema 校验
  const parsed = createTaskInputSchema.safeParse(input);
  if (!parsed.success) return err(new ValidationError(parsed.error));

  // 2. 构建初始任务
  const task: VideoTask = {
    taskId: generateTaskId(),
    status: "pending",
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pollFailCount: 0,
    recoveryAttempts: 0,
    metadata: {},
    ...parsed.data,
  };

  // 3. 持久化（幂等：UNIQUE 冲突时合并而非报错）
  const persistResult = await this.repo.upsert(task);
  if (!persistResult.ok) return err(persistResult.error);

  // 4. 发射事件
  this.eventBus.emit({ type: "TASK_CREATED", taskId: task.taskId, input: parsed.data });

  // 5. 启动轮询
  this.scheduler.schedulePoll(task.taskId);

  return ok(task);
}

async poll(taskId: string): Promise<Result<VideoTask>> {
  // 1. 读取当前任务
  const taskResult = await this.repo.findById(taskId);
  if (!taskResult.ok) return err(taskResult.error);
  if (!taskResult.value) return err(new NotFoundError(taskId));

  const task = taskResult.value;

  // 2. 状态机校验：只有 pending/processing/retrying 可以轮询
  if (!["pending", "processing", "retrying"].includes(task.status)) {
    return err({ code: "INVALID_TRANSITION", message: `状态为 ${task.status} 的任务无需轮询` });
  }

  // 3. 调用 API 查询
  const apiResult = await this.apiClient.queryStatus(task);
  if (!apiResult.ok) {
    // 轮询失败 → 累加 failCount
    const newFailCount = task.pollFailCount + 1;
    if (newFailCount >= MAX_POLL_FAILURES) {
      return this.transitionTask(task, "failed", { error: apiResult.error.message });
    }
    await this.repo.update(taskId, { pollFailCount: newFailCount, lastPolledAt: Date.now() });
    return ok({ ...task, pollFailCount: newFailCount });
  }

  // 4. API 返回值经过 Schema 校验后再使用
  const validated = pollResultSchema.safeParse(apiResult.value);
  if (!validated.success) {
    return this.transitionTask(task, "failed", { error: "API 返回了无法识别的状态" });
  }

  // 5. 根据校验后的结果转换状态
  const targetStatus = mapApiStatus(validated.data.status);
  return this.transitionTask(task, targetStatus, {
    videoUrl: validated.data.videoUrl,
    progress: validated.data.progress,
  });
}
```

### 3.2 Queries（读操作）

```typescript
interface TaskQueries {
  getById(taskId: string): Promise<VideoTask | null>;
  getAll(): Promise<VideoTask[]>;
  getByStatus(status: TaskStatus[]): Promise<VideoTask[]>;
  getByStory(storyId: string): Promise<VideoTask[]>;
  getActiveTasks(): Promise<VideoTask[]>;       // pending + processing + retrying
  getFailedTasks(): Promise<VideoTask[]>;
  getStats(): Promise<TaskStats>;
}

interface TaskStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  oldestActive?: number;   // 最早活跃任务的 createdAt
  expiredCount: number;
}
```

---

## 四、存储层设计

### 4.1 时间戳统一规则

**核心原则：内存中统一用毫秒，存储层统一用秒，转换只在 I/O 边界发生。**

```typescript
// 唯一的时间戳转换入口
const TimestampBridge = {
  toStorage(ms: number): number {
    return Math.floor(ms / 1000);
  },
  fromStorage(sec: number): number {
    // 兼容旧数据：如果存储的是毫秒值（> 1e12），直接返回
    return sec > 1e12 ? sec : sec * 1000;
  },
  // 用于批量写入时统一转换
  toStorageRecord(task: VideoTask): VideoTaskRecord {
    return {
      ...task,
      createdAt: TimestampBridge.toStorage(task.createdAt),
      updatedAt: TimestampBridge.toStorage(task.updatedAt),
      expiresAt: task.expiresAt ? TimestampBridge.toStorage(task.expiresAt) : null,
      lastPolledAt: task.lastPolledAt ? TimestampBridge.toStorage(task.lastPolledAt) : null,
    };
  },
  // 用于读取时统一转换
  fromStorageRecord(record: VideoTaskRecord): VideoTask {
    return {
      ...record,
      createdAt: TimestampBridge.fromStorage(record.createdAt),
      updatedAt: TimestampBridge.fromStorage(record.updatedAt),
      expiresAt: record.expiresAt ? TimestampBridge.fromStorage(record.expiresAt) : undefined,
      lastPolledAt: record.lastPolledAt ? TimestampBridge.fromStorage(record.lastPolledAt) : undefined,
    };
  },
};
```

### 4.2 幂等写入

```typescript
interface TaskRepository {
  upsert(task: VideoTask): Promise<Result<void>>;
  update(taskId: string, changes: Partial<VideoTask>): Promise<Result<void>>;
  delete(taskId: string): Promise<Result<void>>;
  deleteByStatus(statuses: TaskStatus[]): Promise<Result<number>>;
  findById(taskId: string): Promise<VideoTask | null>;
  findByStatus(statuses: TaskStatus[]): Promise<VideoTask[]>;
  findExpired(maxAgeMs: number): Promise<VideoTask[]>;
  bulkUpsert(tasks: VideoTask[]): Promise<Result<void>>;
}
```

**upsert 实现**（替代 createVideoTask 的 UNIQUE 冲突回退）：

```typescript
async upsert(task: VideoTask): Promise<Result<void>> {
  const record = TimestampBridge.toStorageRecord(task);
  const columns = Object.keys(COLUMN_MAP);
  const values = columns.map(col => toSqlValue(record[COLUMN_MAP[col]]));

  // INSERT OR REPLACE：冲突时整体替换，不会丢失字段
  const { sql, params } = buildInsert("video_tasks", columns, values, "REPLACE");
  await safeRun(sql, params);
  return ok(undefined);
}
```

**bulkUpsert 实现**（替代 145 行的 bulkPutVideoTasks）：

```typescript
async bulkUpsert(tasks: VideoTask[]): Promise<Result<void>> {
  if (tasks.length === 0) return ok(undefined);

  if (isElectron()) {
    // Electron 路径：单事务批量 REPLACE
    const statements = tasks.map(task => {
      const record = TimestampBridge.toStorageRecord(task);
      const columns = Object.keys(COLUMN_MAP);
      const values = columns.map(col => toSqlValue(record[COLUMN_MAP[col]]));
      return buildInsert("video_tasks", columns, values, "REPLACE");
    });
    await safeTransaction(statements);
  } else {
    // 非 Electron 路径：逐条 upsert（已有幂等保证）
    for (const task of tasks) {
      await this.upsert(task);
    }
  }

  return ok(undefined);
}
```

### 4.3 原子删除

```typescript
async deleteByStatus(statuses: TaskStatus[]): Promise<Result<number>> {
  // 先查再删，但整个操作在一个事务中
  const statements = [
    {
      sql: `DELETE FROM video_cache WHERE task_id IN (
              SELECT task_id FROM video_tasks WHERE status IN (${placeholders})
            )`,
      params: statuses,
    },
    {
      sql: `DELETE FROM video_tasks WHERE status IN (${placeholders})`,
      params: statuses,
    },
  ];

  const result = await safeTransaction(statements);
  return ok(result.changes ?? 0);
}
```

---

## 五、调度器设计

### 5.1 PollingScheduler

```typescript
interface PollingScheduler {
  start(taskId: string): void;
  stop(taskId: string): void;
  stopAll(): void;
  isActive(taskId: string): boolean;
  getActiveCount(): number;
}

class AdaptivePollingScheduler implements PollingScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly CONCURRENT_LIMIT = 3;
  private readonly BASE_INTERVAL_MS = 5000;
  private readonly MAX_INTERVAL_MS = 60000;

  start(taskId: string): void {
    if (this.timers.has(taskId)) return;
    this.scheduleNext(taskId, this.BASE_INTERVAL_MS);
  }

  private scheduleNext(taskId: string, intervalMs: number): void {
    const timer = setTimeout(async () => {
      await this.executePoll(taskId);
    }, intervalMs);
    this.timers.set(taskId, timer);
  }

  private async executePoll(taskId: string): Promise<void> {
    try {
      const result = await this.commands.poll(taskId);

      if (!result.ok) {
        // 轮询失败 → 指数退避
        const currentInterval = this.getCurrentInterval(taskId);
        const nextInterval = Math.min(currentInterval * 1.5, this.MAX_INTERVAL_MS);
        this.scheduleNext(taskId, nextInterval);
        return;
      }

      const task = result.value;
      if (task.status === "completed" || task.status === "failed") {
        // 终态 → 停止轮询
        this.stop(taskId);
        return;
      }

      // 成功 → 恢复基础间隔
      this.scheduleNext(taskId, this.BASE_INTERVAL_MS);
    } catch (error) {
      this.eventBus.emit({ type: "POLL_ERROR", taskId, error });
      this.scheduleNext(taskId, this.MAX_INTERVAL_MS);
    }
  }
}
```

### 5.2 Policy 引擎

```typescript
interface TaskPolicy {
  readonly name: string;
  check(task: VideoTask): PolicyAction | null;
}

type PolicyAction =
  | { type: "TRANSITION"; targetStatus: TaskStatus; reason: string }
  | { type: "DELETE"; reason: string }
  | { type: "NONE" };

// 超时策略
class TimeoutPolicy implements TaskPolicy {
  readonly name = "timeout";
  private readonly MAX_DURATION_MS = 2 * 60 * 60 * 1000; // 2小时

  check(task: VideoTask): PolicyAction | null {
    if (!["pending", "processing", "retrying"].includes(task.status)) return null;
    if (Date.now() - task.createdAt > this.MAX_DURATION_MS) {
      return { type: "TRANSITION", targetStatus: "failed", reason: "任务超时" };
    }
    return null;
  }
}

// 过期清理策略
class ExpirationPolicy implements TaskPolicy {
  readonly name = "expiration";
  private readonly MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7天

  check(task: VideoTask): PolicyAction | null {
    if (task.status !== "completed") return null;
    if (task.expiresAt && Date.now() > task.expiresAt) {
      return { type: "DELETE", reason: "任务已过期" };
    }
    if (!task.expiresAt && Date.now() - task.createdAt > this.MAX_AGE_MS) {
      return { type: "DELETE", reason: "任务超过最大保留期" };
    }
    return null;
  }
}

// Policy 引擎
class PolicyEngine {
  private policies: TaskPolicy[] = [];

  register(policy: TaskPolicy): void {
    this.policies.push(policy);
  }

  evaluate(task: VideoTask): PolicyAction[] {
    return this.policies
      .map(p => p.check(task))
      .filter((a): a is PolicyAction => a !== null);
  }
}
```

---

## 六、错误处理策略

### 6.1 错误分类

```typescript
type TaskError =
  | { code: "VALIDATION_ERROR";   message: string; details: ZodError }
  | { code: "NOT_FOUND";          message: string; taskId: string }
  | { code: "INVALID_TRANSITION"; message: string; from: TaskStatus; to: TaskStatus }
  | { code: "API_ERROR";          message: string; providerId: string; cause?: Error }
  | { code: "STORAGE_ERROR";      message: string; cause?: Error }
  | { code: "TIMEOUT";            message: string; taskId: string; durationMs: number }
  | { code: "QUOTA_EXCEEDED";     message: string; providerId: string };
```

### 6.2 错误处理规则

| 错误类型 | 处理方式 | 是否重试 | 是否通知用户 |
|---------|---------|---------|------------|
| VALIDATION_ERROR | 拒绝命令，返回 err | 否 | 是（表单校验） |
| NOT_FOUND | 拒绝命令，返回 err | 否 | 是（404提示） |
| INVALID_TRANSITION | 拒绝命令，返回 err | 否 | 否（静默，可能是竞态） |
| API_ERROR | 标记轮询失败，累加 failCount | 是（指数退避） | failCount >= 阈值时 |
| STORAGE_ERROR | 返回 err，记录 errorLogger | 否 | 是（存储异常提示） |
| TIMEOUT | 状态机转换到 failed | 否 | 是（超时提示） |
| QUOTA_EXCEEDED | 立即标记 failed | 否 | 是（配额提示） |

### 6.3 空 catch 消除

```typescript
// 旧：空 catch
try {
  trackChange("video_task", taskId, "insert");
} catch {}

// 新：结构化日志
try {
  trackChange("video_task", taskId, "insert");
} catch (error) {
  errorLogger.warn(
    { code: "TRACK_CHANGE_FAILED", taskId, operation: "insert" },
    "TaskRepository"
  );
}
```

---

## 七、模块拆分方案

### 7.1 文件结构

```
src/modules/video/task-management/
├── contract.json
├── index.ts                              # 统一导出
│
├── domain/
│   ├── task-machine.ts                   # 状态机（~80行）
│   ├── task-types.ts                     # 类型定义（~60行）
│   ├── task-events.ts                    # 事件定义（~40行）
│   ├── task-schema.ts                    # Zod Schema（~80行）
│   └── policies/
│       ├── timeout-policy.ts             # 超时策略（~30行）
│       ├── expiration-policy.ts          # 过期清理策略（~30行）
│       └── policy-engine.ts             # 策略引擎（~40行）
│
├── application/
│   ├── task-commands.ts                  # 命令处理（~200行）
│   ├── task-queries.ts                   # 查询处理（~80行）
│   └── task-event-handlers.ts           # 事件处理器（~100行）
│
├── infrastructure/
│   ├── task-repository-sqlite.ts         # SQLite 仓储（~250行）
│   ├── timestamp-bridge.ts              # 时间戳转换（~50行）
│   ├── polling-scheduler.ts             # 轮询调度器（~120行）
│   └── task-api-client.ts              # API 客户端适配（~80行）
│
└── presentation/
    ├── VideoTaskDashboard.tsx            # 主面板（~200行）
    ├── TaskCard.tsx                      # 任务卡片（~80行）
    ├── TaskDetailDialog.tsx              # 详情弹窗（~120行）
    ├── TaskDeleteDialog.tsx              # 删除确认（~60行）
    ├── use-task-commands.ts             # 命令 Hook（~40行）
    ├── use-task-queries.ts              # 查询 Hook（~60行）
    ├── use-task-filter.ts               # 过滤排序（~100行）
    └── use-video-preview.ts             # 视频预览（~50行）
```

### 7.2 行数对比

| 文件 | 当前行数 | v2 行数 | 缩减 |
|------|---------|---------|------|
| use-video-task-manager.ts | 1000 | 拆分为 6 个文件，最大 200 | -80% |
| VideoTaskManager.tsx | 1740 | 拆分为 8 个文件，最大 200 | -88% |
| video-tasks.ts | 515 | 拆为 repo(250) + bridge(50) | -42% |

---

## 八、测试策略

### 8.1 测试金字塔

```
        ┌─────────────┐
        │  E2E Tests  │   2 个：完整创建→轮询→完成流程
        │   (2 tests)  │
        ├─────────────┤
        │ Integration  │   8 个：命令+仓储+状态机联动
        │  (8 tests)   │
        ├─────────────┤
        │   Unit Tests │   30+ 个：状态机、策略、时间戳、Schema
        │  (30+ tests) │
        └─────────────┘
```

### 8.2 必须覆盖的核心路径

| 路径 | 测试文件 | 关键断言 |
|------|---------|---------|
| 状态机合法转换 | task-machine.test.ts | pending→processing✅, pending→completed❌ |
| 状态机非法转换拒绝 | task-machine.test.ts | 返回 INVALID_TRANSITION 错误 |
| 时间戳转换往返 | timestamp-bridge.test.ts | toStorage→fromStorage 值一致 |
| 时间戳兼容旧数据 | timestamp-bridge.test.ts | 毫秒值(>1e12)直接返回 |
| 幂等 upsert | task-repository.test.ts | 同一 taskId 写入两次不报错 |
| bulkUpsert 批量 | task-repository.test.ts | 100 条任务一次事务 |
| deleteByStatus 原子 | task-repository.test.ts | video_cache 级联删除 |
| 超时策略 | timeout-policy.test.ts | 超过2小时→TRANSITION to failed |
| 过期策略 | expiration-policy.test.ts | 超过7天→DELETE |
| API 返回值校验 | task-commands.test.ts | 非法 status 被拒绝 |
| 轮询调度启停 | polling-scheduler.test.ts | 终态自动停止 |
| Schema 边界 | task-schema.test.ts | progress<0❌, progress>100❌ |

---

## 九、迁移方案

### 阶段 1：修复 bug（1天，不改架构）

1. 修复 `bulkPutVideoTasks` 毫秒字符串 bug
2. 修复 `deleteVideoTasksByStatus` 竞态（改为事务内子查询）
3. 统一 UNIQUE 冲突策略为 REPLACE
4. 空 catch 添加 errorLogger.warn

### 阶段 2：引入状态机（1天）

1. 创建 `task-machine.ts`，实现转换表和校验
2. 在 `updateVideoTask` 中调用 `TaskMachine.canTransition` 校验
3. 在 `parseVideoTask` 中用 schema 校验 status 值
4. 删除 `cancelled` 死状态

### 阶段 3：拆分 God Object（2-3天）

1. 拆 `use-video-task-manager.ts` → commands + queries + scheduler
2. 拆 `VideoTaskManager.tsx` → dashboard + cards + dialogs
3. 统一 `VideoTask` / `VideoTaskRecord` 为单一类型
4. 删除死代码（video-recovery.ts、VideoTaskManagerUI.tsx）

### 阶段 4：补测试（2天）

1. 状态机单元测试
2. 仓储集成测试
3. 命令/查询测试
4. 策略引擎测试

### 阶段 5：优化（1天）

1. bulkUpsert 批量查询优化
2. 移除 `window.__VIDEO_TASK_STORE__` 全局变量
3. 移除 `navigator.sendBeacon` 死代码
4. contract.json 更新
