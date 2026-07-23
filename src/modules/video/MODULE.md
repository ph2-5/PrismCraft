<!-- AI: Before modifying this module, read contract.json for invariants -->
# Video Module ✅

## 职责

视频任务全生命周期管理：创建、轮询、状态机转换、缓存（视频+图片双层磁盘缓存）、智能恢复（验证+去重+重试决策+Token浪费检测）、编解码检测、帧提取、模板与追踪导出。

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

---

## 子域结构

| 子域 | 状态 | 路径 | 职责 |
|------|:----:|------|------|
| `task-management` | ✅ | [task-management/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/video/task-management/) | 视频任务状态机、Zustand Store、轮询引擎、同步引擎、策略引擎（超时/过期）、UI 组件 |
| `cache` | ✅ | [cache/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/video/cache/) | 视频 Blob 磁盘缓存、图片磁盘缓存、缓存统计、过期清理、未缓存资源恢复 |
| `recovery` | ✅ | [recovery/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/video/recovery/) | 视频验证（URL/文件）、重复检测、智能重试引擎、智能恢复、Token 浪费检测、任务持久化 |
| `utils` | ✅ | [utils/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/video/utils/) | 编解码检测、帧提取、文件导出、视频模板 |

---

## 公共 API（index.ts）

### ✅ 导出清单

> 以下为 `index.ts` 的完整导出列表，详细签名见各子域章节。

**task-management**: `VideoTask`、`useVideoTaskManager`、`useVideoTaskStore`、`useVideoTaskQueries`、`useVideoTaskCommands`、`useVideoTaskPolling`、`useVideoTasks`、`useFailedVideoTasks`、`useRecoverVideo`、`useCleanExpiredTasks`、`useStartBackgroundRecovery`、`buildTrackingInfoByProviderId`、`VideoTaskManager`、`VideoTaskManagerInitializer`、`VideoTaskManagerUI`

**cache**: `useVideoCacheStats`、`cacheVideoBlob`、`getCachedVideoUrl`、`getVideoUrlWithCache`、`removeCachedVideo`、`cleanExpiredVideoCache`、`getCacheStats`、`revokeObjectURL`、`touchMemoryCache`、`clearMemoryCache`、`checkCachedVideo`、`getVideoFileStream`、`getCachedVideo`、`cacheImageBlob`、`getCachedImagePath`、`getImageUrlWithCache`、`removeCachedImage`、`cleanExpiredImageCache`、`getImageCacheStats`、`recoverUncachedImages`

**recovery**: `VideoVerificationResult`、`VideoVerificationDetails`、`RetryDecision`、`VideoRecoveryLog`、`VideoTaskRecoveryInfo`、`DuplicateCheckResult`、`RetryConfig`、`recoverVideoByTaskId`、`saveVideoTask`、`verifyVideoUrl`、`verifyMultipleVideos`、`checkForDuplicateVideos`、`findSimilarTasks`、`smartRetryEngine`、`SmartRetryEngine`、`createRetryEngine`、`getTaskRecoveryInfo`、`performIntelligentRecovery`、`checkForTokenWaste`、`registerCacheVideoBlobFn`、`getFailedTasks`、`getTaskById`、`startBackgroundRecovery`、`cleanExpiredTasks`、`getAllTaskHistory`

**utils**: `detectVideoCodec`、`isCodecSupportedByProvider`、`extractVideoFrames`、`downloadJSONFile`、`videoTemplates`、`templateCategories`、`getTemplatesByCategory`、`applyVideoTemplate`、`VideoTemplate`

### ✅ 诊断 UI 组件与类型（task-management）
- `TaskDiagnosticPanel` — 任务诊断面板组件
- `AgentBar` — Agent 状态栏组件
- `TaskErrorGroup` — 任务错误分组组件
- `ProviderHealthCard` — Provider 健康状态卡片组件
- `DiagnoseResult` — 诊断结果类型
- `ProviderHealth` — Provider 健康状态类型

---

### ✅ 任务管理子域 (`task-management`)

#### 类型

```typescript
type VideoTask = import("@/domain/schemas").VideoTask
type VideoTaskStatus = import("@/domain/schemas").VideoTaskStatus
```

#### 状态机

```typescript
class TransitionError extends AppError {
  constructor(public readonly from: VideoTaskStatus, public readonly to: VideoTaskStatus)
}

const TaskMachine: {
  canTransition(from: VideoTaskStatus, to: VideoTaskStatus): boolean
  isPollable(status: VideoTaskStatus): boolean
  isTerminal(status: VideoTaskStatus): boolean
  isRecoverable(status: VideoTaskStatus): boolean
  transition(
    task: VideoTask,
    targetStatus: VideoTaskStatus,
    context?: { videoUrl?: string; error?: string; progress?: number },
  ): Result<VideoTask, TransitionError>
}
```

**合法状态转换表**：

| from → to | **pending** | **generating** | **completed** | **failed** | **cancelled** | **retrying** | **timeout** |
|-----------|---------|------------|-----------|--------|-----------|----------|---------|
| **pending** | - | ✓ | - | ✓ | ✓ | - | ✓ |
| **generating** | - | - | ✓ | ✓ | ✓ | - | ✓ |
| **completed** | ✓ | - | - | - | - | - | - |
| **failed** | - | - | - | - | ✓ | ✓ | - |
| **cancelled** | - | - | - | - | - | - | - |
| **retrying** | - | ✓ | ✓ | ✓ | ✓ | - | ✓ |
| **timeout** | - | - | - | ✓ | ✓ | ✓ | - |

**可轮询状态**：pending、generating、retrying
**终态**：completed、cancelled
**可恢复状态**：failed、timeout（可通过 `isRecoverable()` 查询）

#### 状态映射

```typescript
function mapApiStatus(apiStatus: string, videoUrl?: string): "pending" | "generating" | "completed" | "failed" | "timeout"
```

#### 策略引擎

```typescript
interface PolicyAction {
  type: "TRANSITION" | "DELETE" | "NONE"
  targetStatus?: "failed" | "timeout"
  reason?: string
}

function checkTimeout(task: VideoTask): PolicyAction    // 超时阈值: 2小时
function checkExpiration(task: VideoTask): PolicyAction  // 过期阈值: 7天
function evaluatePolicies(task: VideoTask): PolicyAction[]
```

#### 事件

```typescript
type TaskEvent =
  | { type: "TASK_CREATED"; taskId: string }
  | { type: "TASK_STATUS_CHANGED"; taskId: string; from: VideoTaskStatus; to: VideoTaskStatus }
  | { type: "TASK_POLL_SUCCEEDED"; taskId: string; status: VideoTaskStatus }
  | { type: "TASK_POLL_FAILED"; taskId: string; error: string; failCount: number }
  | { type: "TASK_TIMED_OUT"; taskId: string }
  | { type: "TASK_DELETED"; taskId: string }
  | { type: "TASK_EXPIRED"; taskId: string }
  | { type: "TASK_RECOVERY_REQUESTED"; taskId: string }

type TaskEventHandler = (event: TaskEvent) => void
```

#### Store & Hook

```typescript
interface VideoTaskManagerState {
  allTasks: VideoTask[]
  isBackgroundProcessing: boolean
  isInitialized: boolean
  isCreating: boolean
  initError: string | null

  initialize(): void
  setAllTasks(tasks: VideoTask[] | ((prev: VideoTask[]) => VideoTask[])): void  // 仅更新状态，不自动触发 sync/polling
  addTask(task: Omit<VideoTask, "progress" | "createdAt">): Promise<VideoTask>
  removeTask(taskId: string): Promise<void>
  removeTasks(taskIds: string[]): Promise<void>
  batchUpdateVideoTasks(updates: Array<{ taskId: string; changes: Partial<VideoTask> }>): Promise<void>
  batchDeleteVideoTasks(taskIds: string[]): Promise<void>
  clearActiveTasks(): Promise<void>
  clearAllTasks(): Promise<void>
  clearCompletedTasks(): Promise<void>
  clearFailedTasks(): Promise<void>  // 清除 failed + timeout 状态的任务
  createTask(
    prompt: string,
    extraOptions?: {
      fixedImageUrl?: string
      fixedImageLockType?: "character" | "scene"
      referenceVideo?: string | null
      duration?: number
      storyId?: string
      storyTitle?: string
      beatId?: string
      beatTitle?: string
      firstFrameUrl?: string
      lastFrameUrl?: string
      providerId?: string
      modelId?: string
      format?: string
      characterRef?: string
      sceneRef?: string
    },
  ): Promise<(VideoTask & { promptWasTruncated?: boolean }) | null>
  pollTask(taskId: string): Promise<void>
  cancelTask(taskId: string): Promise<void>
  recoverTask(taskId: string, status: string, videoUrl?: string): void
  startBackgroundProcessing(): void
  cleanup(): void
}

const useVideoTaskStore: UseBoundStore<StoreApi<VideoTaskManagerState>>

function useVideoTaskManager(): {
  tasks: VideoTask[]
  allTasks: VideoTask[]
  isGenerating: boolean
  activeTaskId: string | null
  activeTasks: VideoTask[]
  hasActiveTasks: boolean
  addTask: VideoTaskManagerState["addTask"]
  createTask: VideoTaskManagerState["createTask"]
  pollTask: VideoTaskManagerState["pollTask"]
  cancelTask: VideoTaskManagerState["cancelTask"]
  recoverTask: VideoTaskManagerState["recoverTask"]
  removeTask: VideoTaskManagerState["removeTask"]
  removeTasks: VideoTaskManagerState["removeTasks"]
  batchUpdateVideoTasks: VideoTaskManagerState["batchUpdateVideoTasks"]
  batchDeleteVideoTasks: VideoTaskManagerState["batchDeleteVideoTasks"]
  clearTasks: VideoTaskManagerState["clearActiveTasks"]
  clearAllTasks: VideoTaskManagerState["clearAllTasks"]
  clearCompletedTasks: VideoTaskManagerState["clearCompletedTasks"]
  clearFailedTasks: VideoTaskManagerState["clearFailedTasks"]
  startBackgroundProcessing: VideoTaskManagerState["startBackgroundProcessing"]
  initialize: VideoTaskManagerState["initialize"]
  isBackgroundProcessing: boolean
}
```

**stableActions 模式**：useVideoTaskManager 内部通过 useMemo 将所有 action 方法（addTask、createTask、pollTask 等）缓存为稳定引用。这些方法来自 store.getState()，其引用永不变化，因此 stableActions 对象的 useMemo 依赖为常量 [store]。这避免了 allTasks 变化时 action 方法引用也变化，导致消费方（如 StoryProvider）的 useMemo 被不必要地触发。

**setAllTasks 不自动触发 sync/polling**：setAllTasks 仅更新 Zustand 状态，不再自动调用 scheduleSync() 和 checkAndStartOrStopPolling()。所有写操作（addTask、removeTask、cancelTask、recoverTask、clearActiveTasks 等）在调用 setAllTasks 后显式调用 scheduleSync() + checkAndStartOrStopPolling()。轮询引擎（polling-engine.ts）在批量更新后统一触发一次 sync/polling 检查，使用动态 import("./sync-engine") 避免循环依赖。

#### CQRS Hooks（细粒度拆分）

> 以下 hooks 将 useVideoTaskManager 的职责按 CQRS 模式拆分，供需要更精细控制的消费方使用。useVideoTaskManager 仍作为向后兼容的统一接口。

```typescript
function useVideoTaskState(): {
  allTasks: VideoTask[]
  isBackgroundProcessing: boolean
  isInitialized: boolean
  isCreating: boolean
  initError: string | null
}

function useVideoTaskQueries(): {
  tasks: VideoTask[]
  activeTasks: VideoTask[]
  hasActiveTasks: boolean
  isGenerating: boolean
  activeTaskId: string | null
}

function useVideoTaskCommands(): {
  addTask: VideoTaskManagerState["addTask"]
  createTask: VideoTaskManagerState["createTask"]
  pollTask: VideoTaskManagerState["pollTask"]
  cancelTask: VideoTaskManagerState["cancelTask"]
  recoverTask: VideoTaskManagerState["recoverTask"]
  removeTask: VideoTaskManagerState["removeTask"]
  removeTasks: VideoTaskManagerState["removeTasks"]
  batchUpdateVideoTasks: VideoTaskManagerState["batchUpdateVideoTasks"]
  batchDeleteVideoTasks: VideoTaskManagerState["batchDeleteVideoTasks"]
  clearTasks: VideoTaskManagerState["clearActiveTasks"]
  clearAllTasks: VideoTaskManagerState["clearAllTasks"]
  clearCompletedTasks: VideoTaskManagerState["clearCompletedTasks"]
  clearFailedTasks: VideoTaskManagerState["clearFailedTasks"]
  setAllTasks: VideoTaskManagerState["setAllTasks"]
  initialize: VideoTaskManagerState["initialize"]
  startBackgroundProcessing: VideoTaskManagerState["startBackgroundProcessing"]
}

function useVideoTaskPolling(): {
  startPolling: (taskIds?: string[]) => void
  stopPolling: () => void
  isPolling: boolean
}
```

#### React Query Hooks

> **IPC 效率说明**：batchUpdateVideoTasks 和 batchDeleteVideoTasks 使用 safeTransaction 将多条 SQL 包在单个事务内执行，避免逐条 safeRun 的 IPC 开销（R39）；trackChange 使用 Promise.allSettled 并行触发变更通知，不阻塞主流程（R40）。

```typescript
function useVideoTasks(): UseQueryResult<VideoTask[]>
function useFailedVideoTasks(): UseQueryResult<VideoTask[]>
function useRecoverVideo(): UseMutationResult<VideoRecoverySuccessResult, Error, string>
function useCleanExpiredTasks(): UseMutationResult<number, Error, void>
function useStartBackgroundRecovery(): UseMutationResult<void, Error, void>
```

#### 追踪服务

```typescript
interface TrackingInfo {
  providerName?: string
  model?: string
  apiUrl?: string
  queryEndpoint?: string
  howToCheck: string
  apiDocUrl?: string
}

function buildTrackingInfoByProviderId(taskId: string, apiUrl?: string, providerId?: string, model?: string): TrackingInfo
function copyTrackingInfoToClipboard(trackingInfo: TrackingInfo): Promise<Result<void>>
function openTaskQueryLink(trackingInfo: TrackingInfo): boolean
```

#### UI 组件

```typescript
const VideoTaskManager: ComponentType          // 任务管理器主组件
const VideoTaskManagerInitializer: ComponentType  // 初始化组件（调用 initialize）
const VideoTaskManagerUI: ComponentType        // 管理 UI 面板
```

---

### ✅ 缓存子域

> **通信层说明**：cache 子域的磁盘文件操作已迁移至 `@/shared/file-http` 统一通信层（HTTP 优先 + IPC 回退），不再直接调用 `window.electronAPI`。`video-cache.ts` 和 `image-cache.ts` 通过别名导入（httpWriteFile、httpReadFile、httpFileExists、httpDeleteFile、httpGetCacheDirectory、httpGetDiskSpace、httpGetFileInfo）使用该层。

#### 视频缓存

```typescript
function registerRecoveryFn(fn: (taskId: string) => Promise<Result<{ videoUrl?: string; message: string; status?: string }>>): void
function cacheVideoBlob(taskId: string, videoUrl: string): Promise<Result<boolean>>
function getCachedVideoUrl(taskId: string): Promise<Result<string | null>>
function getVideoUrlWithCache(taskId: string, remoteUrl?: string): Promise<Result<{ url: string | null; fromCache: boolean; cacheFailed: boolean }>>
function removeCachedVideo(taskId: string): Promise<Result<void>>
function cleanExpiredVideoCache(maxAgeMs?: number): Promise<Result<number>>  // 默认 30 天
function getCacheStats(): Promise<Result<{ count: number; totalSizeMB: number; maxCount: number; maxSizeMB: number }>>
function revokeObjectURL(blobUrl: string): void
function touchMemoryCache(taskId: string): void
function clearMemoryCache(): void
function checkCachedVideo(taskId: string): Promise<{ exists: boolean; fileSizeMB?: number }>
function getVideoFileStream(taskId: string): Promise<string | null>
function getCachedVideo(taskId: string): Promise<Blob | null>
```

**缓存限制**：
- 最大缓存条目数：500
- 最大总缓存大小：10240 MB
- 重试次数：3
- URL 过期自动刷新（TTL 80% 时触发）

#### 图片缓存

```typescript
function cacheImageBlob(sourceUrl: string): Promise<Result<string>>   // 返回缓存文件路径
function getCachedImagePath(sourceUrl: string): Promise<Result<string | null>>
function getImageUrlWithCache(sourceUrl: string): Promise<Result<{ url: string; fromCache: boolean }>>
function removeCachedImage(sourceUrl: string): Promise<Result<void>>
function cleanExpiredImageCache(maxAgeMs?: number): Promise<Result<number>>  // 默认 30 天
function getImageCacheStats(): Promise<Result<{ count: number; totalSizeMB: number; maxCount: number; maxSizeMB: number }>>
function recoverUncachedImages(urls: string[]): Promise<Result<number>>
```

**缓存限制**：
- 最大缓存条目数：500
- 最大总缓存大小：512 MB
- 重试次数：2

#### 缓存 Hook

```typescript
function useVideoCacheStats(): UseQueryResult<{ count: number; totalSizeMB: number; maxCount: number; maxSizeMB: number }>
```

---

### ✅ 恢复子域

#### 类型

```typescript
interface VideoVerificationDetails {
  apiStatus: string
  urlAccessible: boolean
  contentValid: boolean
  contentSize?: number
  contentType?: string
  errorMessage?: string
}

interface VideoVerificationResult {
  isValid: boolean
  reason: string
  details?: VideoVerificationDetails
  confidence: "high" | "medium" | "low"
}

interface RetryDecision {
  shouldRetry: boolean
  reason: string
  errorCategory?: ErrorCategory
  confidence: "high" | "medium" | "low"
  retryAfterMs?: number
  maxRetries?: number
  tokenWasteRisk: "high" | "medium" | "low"
}

interface VideoRecoveryLog {
  timestamp: number
  action: string
  details?: string
  success?: boolean
}

interface VideoTaskRecoveryInfo {
  taskId: string
  verification?: VideoVerificationResult
  decision: RetryDecision
  logs: VideoRecoveryLog[]
  duplicateCheck?: DuplicateCheckResult
  statistics: {
    totalAttempts: number
    failedAttempts: number
    lastAttempt?: number
    averageRetryInterval?: number
  }
}

interface DuplicateCheckResult {
  hasDuplicate: boolean
  existingTaskId?: string
  existingVideoUrl?: string
  similarity?: number
  reason?: string
}

interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  exponentialBackoff: boolean
  jitter: boolean
}
```

#### 视频验证

```typescript
function verifyVideoUrl(videoUrl: string): Promise<Result<VideoVerificationResult>>
function verifyMultipleVideos(videoUrls: string[]): Promise<Result<Map<string, VideoVerificationResult>>>
```

**验证规则**：
- 最小视频大小：1 KB
- 最大视频大小：500 MB
- 允许的内容类型：`video/mp4`、`video/webm`、`video/quicktime`、`video/x-msvideo`
- HEAD 请求超时：10s，GET 请求超时：15s
- 批量验证并发数：3

#### 重复检测

```typescript
function checkForDuplicateVideos(newTask: Partial<VideoTask>, existingTasks: VideoTask[]): Promise<DuplicateCheckResult>
function findSimilarTasks(task: Partial<VideoTask>, allTasks: VideoTask[], limit?: number): Array<{ task: VideoTask; similarity: number }>
```

**相似度阈值**：0.85（判定重复）、0.3（相似任务筛选）
**权重分配**：prompt 0.4、providerId 0.2、providerModelId 0.2、fixedImageUrl 0.1、referenceVideoUrl 0.1、parameters 0.1

#### 智能重试引擎

```typescript
class SmartRetryEngine {
  constructor(config?: Partial<RetryConfig>)
  makeRetryDecision(task: VideoTask, verification?: VideoVerificationResult, previousAttempts?: number): RetryDecision
  getRecommendedRetryDelay(decision: RetryDecision, currentAttempt: number): number
}

const smartRetryEngine: SmartRetryEngine
function createRetryEngine(config: Partial<RetryConfig>): SmartRetryEngine
```

**默认重试配置**：
- maxRetries: 60
- baseDelayMs: 10000
- maxDelayMs: 300000
- exponentialBackoff: true
- jitter: true

#### 智能恢复

```typescript
function getTaskRecoveryInfo(taskId: string, existingTasks?: VideoTask[]): Promise<Result<VideoTaskRecoveryInfo | null>>
function performIntelligentRecovery(taskId: string): Promise<Result<IntelligentRecoveryResult>>
function checkForTokenWaste(taskId: string): Promise<Result<TokenWasteCheckResult>>
```

```typescript
// 内部类型（未导出）
interface IntelligentRecoveryResult {
  videoUrl?: string
  message: string
  decision?: RetryDecision
  verification?: VideoVerificationResult
}

interface TokenWasteCheckResult {
  risk: "high" | "medium" | "low"
  reason: string
  suggestions: string[]
}
```

#### 任务持久化与恢复

```typescript
function registerCacheVideoBlobFn(fn: (taskId: string, videoUrl: string) => Promise<Result<boolean>>): void
function saveVideoTask(task: VideoTask): Promise<Result<void>>
function getFailedTasks(): Promise<Result<VideoTask[]>>  // 返回 failed + timeout 状态的任务
function getTaskById(taskId: string): Promise<Result<VideoTask | undefined>>
function recoverVideoByTaskId(taskId: string): Promise<Result<VideoRecoverySuccessResult>>
function startBackgroundRecovery(): Promise<Result<void>>
function cleanExpiredTasks(): Promise<Result<number>>
function getAllTaskHistory(): Promise<Result<VideoTask[]>>
```

**恢复约束**：
- 任务过期时间：720 小时（30 天）
- 最大轮询时长：120 分钟
- 轮询间隔：60 秒
- 最大恢复尝试次数：60
- 后台恢复并发数：3
- 后台恢复防重入：isRecoveryRunning 标志

#### 错误分类（内部使用，未导出）

```typescript
function classifyError(errorCode?: string, errorMessage?: string): ErrorCategory
type ErrorCategory = ...
```

---

### ✅ 工具子域

#### 编解码检测

```typescript
type VideoCodec = ...
type AudioCodec = ...
type ContainerFormat = ...
interface VideoCodecInfo { ... }

function detectVideoCodec(file: File | Blob): Promise<VideoCodecInfo>
function getVideoCodecLabel(codec: VideoCodec): string
function getContainerLabel(format: ContainerFormat): string
function isCodecSupportedByProvider(codec: VideoCodec, providerId: string): boolean
```

#### 帧提取

```typescript
interface ExtractedFrames { ... }

function extractVideoFrames(videoUrl: string, options?: { count?: number; startTime?: number; endTime?: number }): Promise<ExtractedFrames>
```

#### 文件导出

```typescript
function downloadJSONFile(data: unknown, filename: string): void
```

#### 视频模板

```typescript
interface VideoTemplate {
  id: string
  name: string
  description: string
  category: string
  prompt: string
  style: string
  duration: number
  imageDescription?: string
}

const videoTemplates: VideoTemplate[]
const templateCategories: Array<{ id: string; name: string }>
function getTemplatesByCategory(category: string): VideoTemplate[]
function applyVideoTemplate(template: VideoTemplate): { prompt: string; duration: number; style: string }
```

---

## 依赖

| 依赖 | 用途 |
|------|------|
| `@/domain/schemas` | `VideoTask`、`VideoTaskStatus` 类型定义 |
| `@/domain/types` | `Result`、`AppError`、`NotFoundError`、`fromAsyncThrowable`、`classifyError`、`ErrorCategory` |
| `@/infrastructure/di` | `container.videoProvider`、`container.videoTaskStorage`、`container.videoCacheStorage`、`container.imageCacheStorage` |
| `@/shared/error-logger` | `errorLogger` 错误日志 |
| `@/shared/file-http` | `writeFile`、`readFile`、`fileExists`、`deleteFile`、`getFileInfo`、`getCacheDirectory`、`getDiskSpace`（cache 和 recovery 子域使用，HTTP 优先 + IPC 回退） |
| `@/shared/utils/toast-bridge` | `emitToast` 非 React 环境通知 |
| `@/shared/video-cache` | `resilientFetch`、`registerObjectUrl`、`revokeObjectUrl` |
| `@/shared/video-utils` | `detectVideoCodec`、`extractVideoFrames` 等工具函数代理导出 |
| `@/shared/model-capabilities` | `getVideoGenerationStrategy`（参考图策略过滤，story 模块调用） |
| `@/shared/utils/file-download` | `downloadJSONFile` 文件下载代理导出 |
| `@tanstack/react-query` | `useQuery`、`useMutation`、`useQueryClient` |
| `zustand` | `create` Store |

---

## 边界约束

1. **子域隔离**：子域之间只能通过各自的 `index.ts` 导出的 API 通信，禁止直接引用其他子域的内部文件
2. **底层无依赖**：`cache` 和 `utils` 子域是最底层，不依赖 `task-management` 或 `recovery` 子域
3. **跨子域引用**：必须通过 `../subdomain` 导入，禁止 `../recovery/services/xxx.ts` 形式的深路径
4. **禁止导入路径**：`@/types/*`、`@/lib/*`、`@/modules/*/*/*`（ESLint 错误）
5. **类型导入**：必须从 `@/domain/schemas` 导入，不从其他模块重新导出
6. **基础设施访问**：仅通过 `@/infrastructure/di` 容器访问，不直接导入 `@/infrastructure/*`
7. **Result 模式**：所有异步操作必须返回 `Result<T>`，禁止抛出未捕获异常

---

## 不变量（Invariants）

### INV-1: 状态转换必须经过 TaskMachine
所有 VideoTask 状态变更必须通过 `TaskMachine.transition()` 执行。直接修改 `task.status` 是非法的。开发模式下 `withTransitionGuard` 会对非法转换抛出 `TransitionError`，生产模式下静默剥离非法状态字段。

### INV-2: 持久化先于状态更新
异步操作修改 React 状态和持久化存储时，存储写入必须先于状态更新完成（R1）。`addTask`、`removeTask`、`removeTasks`、`clearCompletedTasks`、`clearFailedTasks` 均遵循此规则。

### INV-3: 删除必须级联清理
删除任务时必须同时清理关联的视频缓存（`removeCachedVideo`）和数据库记录。`removeTask` 和 `removeTasks` 均执行级联清理（R2）。

### INV-4: 批量删除必须容忍部分失败
`removeTasks` 使用逐项 try-catch，收集成功删除的 ID 后批量更新 store，不因单项失败阻止后续删除（R15）。

### INV-5: 创建任务防重入
`createTask` 使用 `isCreating` 标志防止并发创建，同一时刻只允许一个创建请求。

### INV-6: 后台恢复防重入
`startBackgroundRecovery` 使用 `isRecoveryRunning` 标志防止并发执行，重复调用直接返回成功。

### INV-7: 轮询失败上限
连续轮询失败次数达到 `MAX_POLL_FAILURES` 时，任务自动标记为 `timeout`，并通知用户（使用可读标签而非 ID）。网络错误（ECONNREFUSED、ETIMEDOUT 等）不累计 `pollFailureCount`，仅等待下次轮询重试。

### INV-8: 缓存容量限制
视频缓存最大 500 条 / 10240 MB，图片缓存最大 500 条 / 512 MB。写入前检查容量，超限时自动清理至 70% 阈值。

### INV-9: 缓存写入原子性
缓存写入（文件 + 数据库记录）失败时，必须清理已写入的文件，防止孤立缓存文件。

### INV-10: URL 过期自动刷新
视频缓存写入时检查 URL TTL，当已用时间超过 TTL 的 80% 时自动调用恢复函数刷新 URL。

### INV-11: 智能恢复必须验证后操作
`performIntelligentRecovery` 在恢复视频前必须通过 `verifyVideoUrl` 验证，验证失败不写入数据库。

### INV-12: 高风险重试必须拒绝
当 `tokenWasteRisk === "high"` 且 `confidence === "low"` 时，`performIntelligentRecovery` 必须拒绝重试。

### INV-13: 重复检测阈值不可绕过
`checkForDuplicateVideos` 的相似度阈值（0.85）和 `findSimilarTasks` 的筛选阈值（0.3）为硬编码常量，不可通过参数绕过。

### INV-14: 策略引擎评估顺序
`evaluatePolicies` 按固定顺序评估策略（先 timeout 后 expiration），所有非 NONE 的动作必须返回，由调用方决定执行顺序。

### INV-15: 终态任务不可轮询
`TaskMachine.isPollable()` 定义的可轮询状态为 `pending`、`generating`、`retrying`。终态（`completed`、`cancelled`）任务不得进入轮询队列。`failed` 和 `timeout` 是可恢复状态（`isRecoverable()` 返回 true），可通过重试回到轮询队列。

### INV-16: beforeunload 同步保证
页面关闭时，通过同步 XHR 将所有任务状态批量保存到主进程（`/video-tasks/bulk-save`），确保不丢失进行中任务的状态。

### INV-17: 全局 store 生命周期
`useVideoTaskStore` 的 `cleanup()` 只能由 app 级生命周期组件（`VideoTaskManagerInitializer`）调用。页面级组件不得在卸载时调用 `cleanup()`——这会停止所有轮询引擎并重置 `isInitialized`，导致其他页面的任务无法被追踪。快速模式创建的任务（无 storyId/beatId）与 Story 模式任务共享同一个 store，在任务管理页面（`/video-tasks`）的 "others" 分组中显示。

### INV-18: mapApiStatus videoUrl 确认信号
`mapApiStatus(apiStatus, videoUrl?)` 中 videoUrl 仅在 API status 映射为 completed 时作为确认信号。当 API 返回 completed 但无 videoUrl 时，状态降级为 generating，避免标记为完成但无实际视频资源。

---

## AI 维护指南

本模块的详细 AI 重构规范请参见：[.ai/modules/video.md](../../../.ai/modules/video.md)

### 快速参考

- 禁止导入路径：`@/types/*`、`@/lib/*`、`@/modules/*/*/*`
- 类型必须从：`@/domain/schemas` 导入
- 使用 Result 模式处理异步操作
- 错误处理使用：`@/shared/error-logger`
- 非 React 代码通知使用：`@/shared/utils/toast-bridge` 的 `emitToast`
- DI 容器访问基础设施：`container.videoProvider`、`container.videoTaskStorage`、`container.videoCacheStorage`、`container.imageCacheStorage`
