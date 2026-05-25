# 错误处理文档

> 更新日期: 2026-05-18

## 1. 设计原则

项目采用 **Result Monad** 模式替代异常，所有可能失败的操作返回 `Result<T, E>` 类型。

### 核心原则

1. **不抛异常** — 业务逻辑使用 `Result` 返回
2. **类型安全** — 编译器强制处理错误路径
3. **错误分类** — 12 种具体错误类型覆盖所有场景
4. **统一日志** — 所有错误通过 `errorLogger` 记录
5. **禁止空 catch** — 所有 catch 块至少添加日志

## 2. Result 类型

### 2.1 定义

```typescript
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

### 2.2 构造函数

```typescript
import { ok, err, fromThrowable, fromAsyncThrowable } from "@/domain/types/result";

ok(data);                           // 成功
err(new ApiError("CODE", "msg"));   // 失败
fromThrowable(() => riskyOp());     // 包装同步异常
fromAsyncThrowable(() => asyncOp()); // 包装异步异常
```

### 2.3 使用模式

```typescript
function doWork(): Result<Data> {
  const result = someOperation();
  if (!result.ok) return result; // 透传错误
  return ok(processData(result.value));
}

// 调用方
const result = doWork();
if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error.code, result.error.message);
}
```

## 3. AppError 错误类型

### 3.1 基类

```typescript
class AppError extends Error {
  code: string;
  cause?: unknown;
}
```

### 3.2 具体错误类型

| 错误类 | code 值 | 用途 |
|--------|---------|------|
| `DatabaseError` | DATABASE_ERROR | 数据库操作失败 |
| `ValidationError` | VALIDATION_ERROR | 数据验证失败 |
| `ApiError` | API_ERROR | 外部 API 调用失败 |
| `NotFoundError` | NOT_FOUND | 资源不存在 |
| `NetworkError` | NETWORK_ERROR | 网络连接问题 |
| `StorageError` | STORAGE_ERROR | 本地存储失败 |
| `ConfigurationError` | CONFIGURATION_ERROR | 配置错误 |
| `GenerationError` | GENERATION_ERROR | AI 生成失败 |
| `TimeoutError` | TIMEOUT_ERROR | 操作超时 |
| `RateLimitError` | RATE_LIMIT_ERROR | 速率限制 |
| `AuthenticationError` | AUTHENTICATION_ERROR | 认证失败 |
| `TransitionError` | INVALID_TRANSITION | 非法状态转换 |

### 3.3 TransitionError

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

### 3.4 使用示例

```typescript
return err(new ApiError("API_VIDEO_GENERATION_FAILED", "视频生成请求失败", { cause: originalError }));
return err(new NotFoundError("NOT_FOUND_TASK", `任务不存在: ${taskId}`));
return err(new ValidationError("VALIDATION_INVALID_STATUS", `非法状态: ${status}`));
return err(new TransitionError("completed", "processing")); // 非法状态转换
```

## 4. errorLogger

### 4.1 API

```typescript
import { errorLogger } from "@/shared/error-logger";

errorLogger.debug(error, context?);
errorLogger.info(error, context?);
errorLogger.warn(error, context?);
errorLogger.error(error, context?);
errorLogger.fatal(error, context?);
```

### 4.2 参数类型

第一个参数 `error` 支持三种形式：

```typescript
// 1. AppError 实例
errorLogger.warn(new AppError("CODE", "message"));

// 2. 字符串
errorLogger.warn("简单错误描述");

// 3. 对象字面量 (仅允许 code, message, cause)
errorLogger.warn({ code: "CODE", message: "描述信息" });
errorLogger.error({ code: "CODE", message: "描述", cause: originalError });
```

### 4.3 禁止事项

**禁止**传入非法属性：

```typescript
// ❌ 错误 — taskId, field, operation 不在类型定义中
errorLogger.warn({ code: "CODE", taskId: "123", operation: "insert" });

// ✅ 正确 — 嵌入 message
errorLogger.warn({ code: "CODE", message: "taskId=123, operation=insert failed" });
```

### 4.4 context 参数

第二个参数 `context` 为可选字符串，标识错误来源：

```typescript
errorLogger.warn({ code: "CODE", message: "..." }, "VideoTasks");
errorLogger.error({ code: "CODE", message: "..." }, "PollingScheduler");
```

## 5. 错误处理模式

### 5.1 存储层

```typescript
async createVideoTask(task: VideoTaskRecord): Promise<void> {
  try {
    const { sql, params } = buildInsert("video_tasks", task, "REPLACE");
    await safeRun(sql, params);
  } catch (e) {
    errorLogger.error({ code: "DB_CREATE_FAILED", message: extractErrorMessage(e) }, "VideoTasks");
    throw e; // 存储层允许向上抛出
  }
}
```

### 5.2 Hook 层

```typescript
const handleRecoverVideo = async () => {
  const result = await recoverVideoByTaskId(taskId);
  if (result.success) {
    toast.success("找回成功", result.message);
  } else {
    toast.error("找回失败", result.message);
  }
};
```

### 5.3 状态机层

```typescript
const result = TaskMachine.transition(task, targetStatus);
if (!result.ok) {
  // result.error 是 TransitionError 实例
  errorLogger.warn({
    code: "INVALID_TRANSITION",
    message: `taskId=${task.taskId}, from=${result.error.from}, to=${result.error.to}`,
  });
  return; // 静默跳过，不抛异常
}
```

### 5.4 空 catch 块处理

所有 catch 块至少添加日志：

```typescript
// ✅ 正确
} catch (e) {
  console.debug("[Sync] localStorage read failed:", e);
}

// ✅ 正确 — 防御性编程
} catch (e) {
  console.debug("[NetworkMonitor] Listener error:", e);
}

// ❌ 禁止
} catch {}
```

## 6. 错误日志输出

### 6.1 格式

```
2026-05-18T14:15:48.204Z [WARN] [Context] [CODE] message
```

### 6.2 日志级别

| 级别 | 优先级 | 用途 |
|------|--------|------|
| debug | 0 | 调试信息 (空 catch 块日志) |
| info | 1 | 一般信息 |
| warn | 2 | 警告 (默认最低级别) |
| error | 3 | 错误 |
| fatal | 4 | 致命错误 |

### 6.3 事件总线

所有日志同时通过事件总线发布：

```typescript
eventBus.emit(ErrorEvents.LOGGED, entry);
```

## 7. 网络层错误处理

### 7.1 熔断器

```typescript
CircuitBreaker — 三态: CLOSED → OPEN → HALF_OPEN
```

### 7.2 重试执行器

```typescript
RetryExecutor — 指数退避 + 抖动
```

### 7.3 弹性 Fetch

```typescript
resilientFetch — 熔断 + 重试 + 缓存 + 日志拦截器链
```

### 7.4 智能重试引擎

```typescript
SmartRetryEngine — 基于 AI 提供商错误类型的重试决策
- 超时 → 重试 (指数退避)
- 限流 → 重试 (延迟 ≥ 60s)
- 余额不足 → 不重试
- 参数错误 → 不重试
- 网络错误 → 重试 (低 tokenWasteRisk)
- 验证失败 → 重试 (可能是假成功)
```
