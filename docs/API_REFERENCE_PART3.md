# API 参考手册 — 第三部分：共享层与基础设施层

---

## 1. 共享层 (src/shared)

### 1.1 代理导出模块

#### db-core/ (index.ts)

从 `@/infrastructure/storage` 代理导出数据库核心操作。

```typescript
// 代理导出 — 来源: @/infrastructure/storage
export { safeQuery, safeRun, safeTransaction } from "@/infrastructure/storage/sqlite-core";
export { parseRecord, toSqlValue, trackChange } from "@/infrastructure/storage/core";
```

#### api-config/ (index.ts)

从 `@/infrastructure/ai-providers/api-config` 代理导出 API 配置。

```typescript
export * from "@/infrastructure/ai-providers/api-config/types";
export * from "@/infrastructure/ai-providers/api-config/templates";
export * from "@/infrastructure/ai-providers/api-config/detect";
export * from "@/infrastructure/ai-providers/api-config/storage";
export * from "@/infrastructure/ai-providers/api-config/init";
```

#### video-cache/ (index.ts)

从 `@/infrastructure/storage/video-cache` 代理导出视频缓存操作。

```typescript
export { videoCacheStorage } from "@/infrastructure/storage/video-cache";
export type { VideoCacheStorage } from "@/infrastructure/storage/video-cache";
```

#### outfit/ (index.ts)

从 `@/infrastructure/storage/characters/outfit-manager` 代理导出角色服装管理。

```typescript
export { getOutfitsForCharacter, saveOutfitsForCharacter, updateOutfitImage } from "@/infrastructure/storage/characters/outfit-manager";
```

#### sql-safety/ (index.ts)

SQL 安全工具，防止 SQL 注入。

```typescript
export { toSqlValue } from "./sql-sanitizer";
export { sanitizeIdentifier, sanitizeTable, buildSafeInsert, buildSafeUpdate, buildSafeDelete } from "./sql-sanitizer";
export { registerColumn, registerColumns, getColumnKind, getAllRegisteredColumns, isColumnRegistered, _clearRegistry } from "./schema-registry";
export type { ColumnKind } from "./schema-registry";
```

##### sql-sanitizer.ts

```typescript
/** 将 JS 值转为 SQLite 安全值（JSON 序列化对象/数组，布尔转 0/1） */
export function toSqlValue(value: unknown): unknown;

/** 清洗 SQL 标识符（表名/列名），仅允许字母数字下划线 */
export function sanitizeIdentifier(identifier: string): string;

/** 清洗表名，仅允许字母数字下划线 */
export function sanitizeTable(table: string): string;

/** 构建安全的 INSERT 语句 */
export function buildSafeInsert(table: string, columns: string[], values: unknown[], conflictStrategy?: "IGNORE" | "REPLACE" | "ABORT"): { sql: string; params: unknown[] };

/** 构建安全的 UPDATE 语句 */
export function buildSafeUpdate(table: string, sets: Record<string, unknown>, where: string, whereParams: unknown[]): { sql: string; params: unknown[] };

/** 构建安全的 DELETE 语句 */
export function buildSafeDelete(table: string, where: string, whereParams: unknown[]): { sql: string; params: unknown[] };
```

##### schema-registry.ts

```typescript
export type ColumnKind = "json" | "boolean";

/** 注册单列的类型映射 */
export function registerColumn(table: string, column: string, kind: ColumnKind): void;

/** 批量注册列的类型映射 */
export function registerColumns(table: string, columns: Array<[column: string, kind: ColumnKind]>): void;

/** 获取列的类型映射 */
export function getColumnKind(table: string, column: string): ColumnKind | undefined;

/** 获取表的所有已注册列 */
export function getAllRegisteredColumns(table: string): Map<string, ColumnKind>;

/** 检查列是否已注册 */
export function isColumnRegistered(table: string, column: string): boolean;

/** 清空注册表（仅测试用） */
export function _clearRegistry(): void;
```

#### model-capabilities.ts

模型能力查询与参数配置。

```typescript
/** 模型参数配置 */
export interface ModelParameterProfile {
  durations: number[];
  defaultDuration: number;
  maxDuration: number;
  resolutions: Array<{ value: string; label: string; width: number; height: number }>;
  defaultResolution: string;
  styles: string[];
  defaultStyle: string;
  supportsNegativePrompt: boolean;
  supportsSeed: boolean;
  supportsCfgScale: boolean;
  defaultCfgScale: number;
  cfgScaleRange: { min: number; max: number; step: number };
  supportsFirstFrame: boolean;
  supportsLastFrame: boolean;
  supportsCharacterRef: boolean;
  maxCharacterRefs: number;
  videoGenerationStrategy: "single_shot" | "multi_shot";
  maxKeyframes: number;
}

/** 获取指定模型的参数配置 */
export function getModelParameterProfile(modelId: string | undefined): ModelParameterProfile;

/** 获取视频生成策略 */
export function getVideoGenerationStrategy(modelId: string | undefined): "single_shot" | "multi_shot";

/** 检查模型是否支持首帧参考 */
export function supportsFirstFrame(modelId: string | undefined): boolean;

/** 检查模型是否支持尾帧参考 */
export function supportsLastFrame(modelId: string | undefined): boolean;

/** 检查模型是否支持角色参考 */
export function supportsCharacterRef(modelId: string | undefined): boolean;
```

---

### 1.2 通用工具

#### event-bus.ts

全局事件总线，用于跨模块的 fire-and-forget 通知。

```typescript
type EventMap = Record<string, unknown>;
type EventHandler<T = unknown> = (data: T) => void;

class EventBus {
  /** 订阅事件，返回取消订阅函数 */
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void;

  /** 订阅事件（仅触发一次） */
  once<T = unknown>(event: string, handler: EventHandler<T>): () => void;

  /** 取消订阅 */
  off<T = unknown>(event: string, handler: EventHandler<T>): void;

  /** 发射事件 */
  emit<T = unknown>(event: string, data?: T): void;

  /** 移除指定事件的所有监听器 */
  removeAllListeners(event?: string): void;
}

export const eventBus: EventBus;
```

#### event-types.ts

事件类型定义。

```typescript
/** 视频任务事件 */
export interface VideoTaskEvents {
  "video:created": { taskId: string; storyId?: string };
  "video:completed": { taskId: string; videoUrl?: string };
  "video:failed": { taskId: string; error?: string };
  "video:progress": { taskId: string; progress: number };
  "video:cancelled": { taskId: string };
}

/** 同步事件 */
export interface SyncEvents {
  "sync:started": { entityType: string };
  "sync:completed": { entityType: string; count: number };
  "sync:failed": { entityType: string; error: string };
}

/** 应用事件 */
export interface AppEvents {
  "app:config-changed": { capability: string };
  "app:theme-changed": { theme: string };
  "app:network-status": { online: boolean };
}

/** 所有事件类型联合 */
export type AllEvents = VideoTaskEvents & SyncEvents & AppEvents;
```

#### app-store.ts

全局应用状态（Zustand Store）。

```typescript
interface AppState {
  /** 当前活跃的视图/页面 */
  activeView: string;
  /** 侧边栏是否折叠 */
  sidebarCollapsed: boolean;
  /** 全局加载状态 */
  globalLoading: boolean;
  /** 全局加载消息 */
  globalLoadingMessage: string;
}

interface AppActions {
  setActiveView: (view: string) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setGlobalLoading: (loading: boolean, message?: string) => void;
}

export const useAppStore: UseBoundStore<StoreApi<AppState & AppActions>>;
```

#### error-handler.ts

全局错误处理器。

```typescript
/** 注册全局未捕获错误处理器 */
export function registerGlobalErrorHandler(): void;

/** 注销全局错误处理器 */
export function unregisterGlobalErrorHandler(): void;

/** 处理 React 错误边界捕获的错误 */
export function handleReactError(error: Error, errorInfo: React.ErrorInfo): void;

/** 处理异步未拒绝 Promise */
export function handleUnhandledRejection(event: PromiseRejectionEvent): void;
```

#### error-logger.ts

分级错误日志器。

```typescript
/** 日志级别 */
type LogLevel = "debug" | "info" | "warn" | "error";

/** 从未知错误中提取错误消息 */
export function extractErrorMessage(error: unknown): string;

class ErrorLogger {
  debug(message: string, ...args: unknown[]): void;
  debug(message: unknown, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  info(message: unknown, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  warn(message: unknown, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  error(message: unknown, ...args: unknown[]): void;

  /** 获取最近的错误日志 */
  getRecentLogs(limit?: number): Array<{ level: LogLevel; message: string; timestamp: number; args: unknown[] }>;

  /** 清空日志 */
  clear(): void;
}

export const errorLogger: ErrorLogger;
```

---

### 1.3 常量

#### constants/messages.ts

国际化消息键值映射（中文）。

```typescript
/** 获取国际化消息 */
export function t(key: string, params?: Record<string, string | number>): string;

/** 消息键值对象 */
export const messages: Record<string, string>;
```

#### constants/error-codes.ts

API 错误码定义。

```typescript
/** API 错误码枚举 */
export type ApiErrorCode =
  | "INVALID_API_KEY"
  | "RATE_LIMITED"
  | "ENDPOINT_NOT_FOUND"
  | "API_SERVER_ERROR"
  | "TIMEOUT"
  | "CONNECTION_FAILED"
  | "INVALID_RESPONSE"
  | "POLLINATIONS_FAILED"
  | "INTERNAL_ERROR"
  | "UNKNOWN_ERROR";

/** 错误码到用户友好消息的映射 */
export const ERROR_MESSAGES: Record<ApiErrorCode, string>;

/** 根据错误码获取用户友好消息 */
export function getErrorMessage(code: ApiErrorCode): string;
```

---

### 1.4 Hooks

#### use-current-time.ts

```typescript
/** 获取当前时间，每秒自动更新 */
export function useCurrentTime(): Date;
```

#### use-dirty-state.ts

```typescript
/** 脏状态跟踪 Hook，用于未保存变更提示 */
export function useDirtyState(): {
  isDirty: boolean;
  markDirty: () => void;
  markClean: () => void;
};
```

#### use-entity-crud.ts

```typescript
interface UseEntityCrudOptions<T> {
  storage: {
    getAll: () => Promise<T[]>;
    create: (entity: Partial<T>) => Promise<void>;
    update: (id: string, entity: Partial<T>) => Promise<void>;
    delete: (id: string) => Promise<void>;
  };
  onCreated?: (entity: T) => void;
  onUpdated?: (entity: T) => void;
  onDeleted?: (id: string) => void;
}

/** 通用实体 CRUD Hook */
export function useEntityCrud<T extends { id: string }>(
  options: UseEntityCrudOptions<T>,
): {
  items: T[];
  loading: boolean;
  createItem: (entity: Partial<T>) => Promise<void>;
  updateItem: (id: string, entity: Partial<T>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};
```

#### use-global-keyboard-actions.ts

```typescript
/** 注册全局键盘快捷键动作 */
export function useGlobalKeyboardActions(): void;
```

#### use-memory-monitor.ts

```typescript
interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/** 内存监控 Hook */
export function useMemoryMonitor(): {
  memory: MemoryInfo | null;
  isHighMemory: boolean;
};
```

#### use-model-capabilities.ts

```typescript
/** 获取模型能力参数配置 */
export function useModelCapabilities(modelId: string | undefined): ModelParameterProfile;
```

#### use-network-monitor.ts

```typescript
/** 网络状态监控 Hook */
export function useNetworkMonitor(): {
  isOnline: boolean;
  lastOnlineTime: number | null;
};
```

#### use-provider-templates.ts

```typescript
/** 获取所有提供商模板（含插件） */
export function useProviderTemplates(): {
  templates: Record<string, ProviderTemplate>;
  loading: boolean;
  refresh: () => Promise<void>;
};
```

#### use-virtual-list.ts

```typescript
interface VirtualListOptions {
  itemHeight: number;
  overscan?: number;
}

/** 虚拟列表 Hook，用于大数据量列表渲染优化 */
export function useVirtualList<T>(
  items: T[],
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: VirtualListOptions,
): {
  visibleItems: T[];
  visibleRange: { start: number; end: number };
  totalHeight: number;
  offsetY: number;
};
```

#### useDebouncedState.ts

```typescript
/** 防抖状态 Hook */
export function useDebouncedState<T>(
  initialValue: T,
  delayMs: number,
): [T, T, (value: T) => void];
// 返回: [当前值, 防抖后的值, 设置函数]
```

#### useKeyboardShortcuts.ts

```typescript
interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  description?: string;
}

/** 键盘快捷键注册 Hook */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void;
```

---

### 1.5 工具函数

#### error-classifier.ts

```typescript
/** 错误分类类型 */
export type ErrorCategory =
  | "network"
  | "timeout"
  | "authentication"
  | "rate_limit"
  | "server"
  | "validation"
  | "database_busy"
  | "unknown";

/** 根据错误码/消息分类错误 */
export function classifyError(code?: string, message?: string): ErrorCategory;

/** 判断错误是否可重试 */
export function isRetryableError(error: unknown): boolean;
```

#### file-download.ts

```typescript
/** 触发浏览器文件下载 */
export function downloadFile(url: string, filename?: string): Promise<void>;

/** 触发 Blob 下载 */
export function downloadBlob(blob: Blob, filename: string): void;
```

#### image-url.ts

```typescript
/** 解析图片 URL（处理本地路径/相对路径/远程 URL） */
export function resolveImageUrl(path: string | undefined | null): string | undefined;

/** 判断路径是否为本地文件路径 */
export function isLocalFilePath(path: string): boolean;
```

#### media-error-handler.ts

```typescript
/** 处理媒体加载错误 */
export function handleMediaError(
  error: unknown,
  context: "image" | "video",
): {
  userMessage: string;
  errorCode: ApiErrorCode;
  retryable: boolean;
};
```

#### performance.ts

```typescript
/** 虚拟列表计算（同 useVirtualList 的核心逻辑） */
export function useVirtualList<T>(
  items: T[],
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: { itemHeight: number; overscan?: number },
): {
  visibleItems: T[];
  visibleRange: { start: number; end: number };
  totalHeight: number;
  offsetY: number;
};

/** 节流函数 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number,
): T;

/** 防抖函数 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number,
): T;
```

#### platform.ts

```typescript
/** 判断是否在 Electron 环境中运行 */
export function isElectron(): boolean;

/** 判断是否在浏览器环境中运行 */
export function isBrowser(): boolean;

/** 获取平台信息 */
export function getPlatform(): "electron" | "browser";
```

#### preferences.ts

```typescript
/** 偏好设置存储 */
export const preferencesStorage: {
  get<T = unknown>(key: string, defaultValue?: T): T;
  set<T = unknown>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
};
```

#### safe-json.ts

```typescript
/** 安全 JSON 解析，失败返回默认值 */
export function safeJsonParse<T>(value: unknown, defaultValue: T): T;

/** 安全 JSON 解析为数组 */
export function safeJsonParseArray<T = unknown>(value: unknown): T[];

/** 安全 JSON.stringify，失败返回空字符串 */
export function safeJsonStringify(value: unknown): string;
```

#### toast-bridge.ts

```typescript
/** Toast 通知类型 */
export type ToastType = "success" | "error" | "warning" | "info";

/** 显示 Toast 通知 */
export function showToast(type: ToastType, message: string, duration?: number): void;

/** 显示成功 Toast */
export function showSuccess(message: string): void;

/** 显示错误 Toast */
export function showError(message: string): void;

/** 显示警告 Toast */
export function showWarning(message: string): void;

/** 显示信息 Toast */
export function showInfo(message: string): void;
```

#### url-validation.ts

```typescript
/** 验证 URL 是否合法 */
export function isValidUrl(url: string): boolean;

/** 验证 URL 是否为允许的域名（防止 SSRF） */
export function isUrlAllowed(url: string): boolean;

/** 清洗 URL（移除敏感信息） */
export function sanitizeUrl(url: string): string;
```

#### user-facing-error.ts

```typescript
/** 用户友好错误 */
export class UserFacingError extends Error {
  code: ApiErrorCode;
  userMessage: string;
  retryable: boolean;

  constructor(options: {
    code: ApiErrorCode;
    userMessage: string;
    retryable?: boolean;
    cause?: Error;
  });
}

/** 将未知错误转换为用户友好错误 */
export function toUserFacingError(error: unknown): UserFacingError;
```

#### utils.ts

```typescript
/** 合并 CSS 类名（clsx 替代） */
export function cn(...inputs: (string | undefined | null | false)[]): string;

/** 生成唯一 ID */
export function generateId(prefix?: string): string;

/** 深拷贝对象 */
export function deepClone<T>(obj: T): T;

/** 延迟执行 */
export function sleep(ms: number): Promise<void>;

/** 限制并发数执行 */
export function limitConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]>;
```

#### confirm.tsx

```typescript
interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
}

/** 异步确认对话框 */
export function confirm(options?: ConfirmOptions): Promise<boolean>;
```

---

### 1.10 错误类型

#### errors/version-conflict.ts

乐观锁版本冲突错误。

```typescript
/** 乐观锁版本冲突错误 */
export class VersionConflictError extends Error {
  readonly table: string;
  readonly id: string;
  readonly expectedVersion: number;

  constructor(table: string, id: string, expectedVersion: number);
}
```

---

### 1.6 视频工具

#### video-codec.ts

```typescript
/** 视频编码格式 */
export type VideoCodec = "h264" | "h265" | "hevc" | "vp8" | "vp9" | "av1";

/** 音频编码格式 */
export type AudioCodec = "aac" | "mp3" | "opus" | "vorbis";

/** 容器格式 */
export type ContainerFormat = "mp4" | "webm" | "mov" | "avi";

/** 视频编码信息 */
export interface VideoCodecInfo {
  videoCodec: VideoCodec | null;
  audioCodec: AudioCodec | null;
  containerFormat: ContainerFormat | null;
  rawInfo: string;
}

/** 检测视频编码信息 */
export function detectVideoCodec(file: File): Promise<VideoCodecInfo>;

/** 获取视频编码的用户友好标签 */
export function getVideoCodecLabel(codec: VideoCodec | null): string;

/** 获取容器格式的用户友好标签 */
export function getContainerLabel(format: ContainerFormat | null): string;
```

#### codec-check.ts

```typescript
/** 检查编码格式是否被指定提供商支持 */
export function isCodecSupportedByProvider(
  codec: VideoCodec,
  providerId: string,
): boolean;
```

#### video-frame-extractor.ts

```typescript
/** 提取的视频帧 */
export interface ExtractedFrames {
  frames: string[];   // data URL 数组
  duration: number;    // 视频时长（秒）
  width: number;
  height: number;
}

/** 从视频文件中提取帧 */
export function extractVideoFrames(
  file: File,
  options?: {
    count?: number;           // 提取帧数，默认 5
    startTime?: number;       // 起始时间（秒）
    endTime?: number;         // 结束时间（秒）
    maxWidth?: number;        // 最大宽度
    maxHeight?: number;       // 最大高度
  },
): Promise<ExtractedFrames>;

/** 将 data URL 转为 File 对象 */
export function dataUrlToFile(dataUrl: string, filename: string): File;
```

#### provider-codecs.ts

```typescript
/** 提供商支持的编码格式映射 */
export const PROVIDER_CODECS: Record<string, VideoCodec[]>;
```

---

### 1.7 类型

#### types/api.ts

```typescript
/** API 请求基础类型 */
export interface ApiRequestBase {
  requestId?: string;
}

/** API 响应基础类型 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/** 分页请求 */
export interface PaginationRequest {
  page: number;
  pageSize: number;
}

/** 分页响应 */
export interface PaginationResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
```

#### types/ipc.ts

```typescript
/** IPC 通道名称 */
export type IpcChannel =
  | "saveImage"
  | "deleteFile"
  | "readFileBase64"
  | "getConfig"
  | "setConfig"
  | "saveFileDialog"
  | "openFileDialog"
  | "secureConfigResolve"
  | "dbQuery"
  | "dbRun"
  | "dbBatchInsert"
  | "dbGet"
  | "dbTransaction";

/** IPC 调用结果 */
export interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** ElectronAPI 类型声明 */
export interface ElectronAPI {
  dbQuery(sql: string, params?: unknown[]): Promise<IpcResult<unknown[]>>;
  dbRun(sql: string, params?: unknown[]): Promise<IpcResult<{ changes: number; lastInsertRowid: number }>>;
  dbTransaction(statements: Array<{ sql: string; params: unknown[] }>): Promise<IpcResult<unknown[]>>;
  dbGet(sql: string, params?: unknown[]): Promise<IpcResult<unknown>>;
  dbBatchInsert(table: string, columns: string[], rows: unknown[][]): Promise<IpcResult<number>>;
  saveImage(data: { filePath: string; data: string }): Promise<IpcResult<string>>;
  deleteFile(filePath: string): Promise<IpcResult<boolean>>;
  readFileBase64(filePath: string): Promise<IpcResult<string>>;
  getConfig(key: string): Promise<IpcResult<string | null>>;
  setConfig(key: string, value: string): Promise<IpcResult<boolean>>;
  saveFileDialog(options: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<IpcResult<string | null>>;
  openFileDialog(options: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }>; multiSelections?: boolean }): Promise<IpcResult<string[] | null>>;
  secureConfigResolve(key: string): Promise<IpcResult<string | null>>;
}
```

---

### 1.8 UI 组件

#### slider.tsx

```typescript
interface SliderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
}

export function Slider(props: SliderProps): JSX.Element;
```

#### switch.tsx

```typescript
interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}

export function Switch(props: SwitchProps): JSX.Element;
```

#### badge.tsx

```typescript
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

export function Badge(props: BadgeProps): JSX.Element;
```

#### progress.tsx

```typescript
interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;   // 0-100
}

interface ProgressTrackProps extends React.HTMLAttributes<HTMLDivElement> {}
interface ProgressIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  style?: React.CSSProperties;
}
interface ProgressLabelProps extends React.HTMLAttributes<HTMLSpanElement> {}
interface ProgressValueProps extends React.HTMLAttributes<HTMLSpanElement> {}

export function Progress(props: ProgressProps): JSX.Element;
Progress.Track = ProgressTrack;
Progress.Indicator = ProgressIndicator;
Progress.Label = ProgressLabel;
Progress.Value = ProgressValue;
```

#### separator.tsx

```typescript
interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

export function Separator(props: SeparatorProps): JSX.Element;
```

#### checkbox.tsx

```typescript
interface CheckboxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}

export function Checkbox(props: CheckboxProps): JSX.Element;
```

#### select.tsx

```typescript
// 基于 Radix UI Select 的封装
export function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>): JSX.Element;
export function SelectContent(props: React.ComponentProps<typeof SelectPrimitive.Content>): JSX.Element;
export function SelectItem(props: React.ComponentProps<typeof SelectPrimitive.Item>): JSX.Element;
export function SelectTrigger(props: React.ComponentProps<typeof SelectPrimitive.Trigger>): JSX.Element;
export function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>): JSX.Element;
```

#### input.tsx

```typescript
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>): JSX.Element;
```

#### textarea.tsx

```typescript
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element;
```

#### label.tsx

```typescript
export function Label(props: React.LabelHTMLAttributes<HTMLLabelElement>): JSX.Element;
```

#### input-group.tsx

```typescript
// 输入框分组组件
export function InputGroup(props: React.HTMLAttributes<HTMLDivElement>): JSX.Element;
```

#### button.tsx

```typescript
// 基于 class-variance-authority 的按钮组件
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}): JSX.Element;
```

#### dialog.tsx

```typescript
// 基于 Radix UI Dialog 的封装
export function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>): JSX.Element;
export function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>): JSX.Element;
export function DialogOverlay(props: React.ComponentProps<typeof DialogPrimitive.Overlay>): JSX.Element;
export function DialogContent(props: React.ComponentProps<typeof DialogPrimitive.Content>): JSX.Element;
export function DialogHeader(props: React.HTMLAttributes<HTMLDivElement>): JSX.Element;
export function DialogFooter(props: React.HTMLAttributes<HTMLDivElement>): JSX.Element;
export function DialogTitle(props: React.ComponentProps<typeof DialogPrimitive.Title>): JSX.Element;
export function DialogDescription(props: React.ComponentProps<typeof DialogPrimitive.Description>): JSX.Element;
```

#### tabs.tsx

```typescript
// 基于 Radix UI Tabs 的封装
export function Tabs(props: React.ComponentProps<typeof TabsPrimitive.Root>): JSX.Element;
export function TabsList(props: React.ComponentProps<typeof TabsPrimitive.List>): JSX.Element;
export function TabsTrigger(props: React.ComponentProps<typeof TabsPrimitive.Trigger>): JSX.Element;
export function TabsContent(props: React.ComponentProps<typeof TabsPrimitive.Content>): JSX.Element;
```

#### command.tsx

```typescript
// 命令面板组件（基于 cmdk）
export function Command(props: React.ComponentProps<typeof CommandPrimitive>): JSX.Element;
export function CommandInput(props: React.ComponentProps<typeof CommandPrimitive.Input>): JSX.Element;
export function CommandList(props: React.ComponentProps<typeof CommandPrimitive.List>): JSX.Element;
export function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>): JSX.Element;
export function CommandGroup(props: React.ComponentProps<typeof CommandPrimitive.Group>): JSX.Element;
export function CommandItem(props: React.ComponentProps<typeof CommandPrimitive.Item>): JSX.Element;
export function CommandSeparator(props: React.ComponentProps<typeof CommandPrimitive.Separator>): JSX.Element;
```

#### card.tsx

```typescript
export function Card(props: React.HTMLAttributes<HTMLDivElement>): JSX.Element;
export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>): JSX.Element;
export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>): JSX.Element;
export function CardDescription(props: React.HTMLAttributes<HTMLParagraphElement>): JSX.Element;
export function CardContent(props: React.HTMLAttributes<HTMLDivElement>): JSX.Element;
export function CardFooter(props: React.HTMLAttributes<HTMLDivElement>): JSX.Element;
```

#### alert.tsx

```typescript
export function Alert(props: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "destructive";
}): JSX.Element;
export function AlertTitle(props: React.HTMLAttributes<HTMLHeadingElement>): JSX.Element;
export function AlertDescription(props: React.HTMLAttributes<HTMLParagraphElement>): JSX.Element;
```

#### safe-image.tsx

```typescript
interface SafeImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  fallback?: React.ReactNode;
}

/** 安全图片组件，加载失败时显示占位符 */
export function SafeImage(props: SafeImageProps): JSX.Element;
```

#### feedback.tsx

```typescript
interface ErrorDisplayProps {
  error?: string;
  code?: ApiErrorCode;
  suggestion?: string;
  onRetry?: () => void;
  className?: string;
}

interface LoadingStateProps {
  message?: string;
  className?: string;
}

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

interface SuccessStateProps {
  message: string;
  className?: string;
}

export function ErrorDisplay(props: ErrorDisplayProps): JSX.Element;
export function LoadingState(props: LoadingStateProps): JSX.Element;
export function EmptyState(props: EmptyStateProps): JSX.Element;
export function SuccessState(props: SuccessStateProps): JSX.Element;
```

#### empty-state.tsx

```typescript
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState(props: EmptyStateProps): JSX.Element;
```

#### confirm-dialog.tsx

```typescript
interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
}

/** 确认对话框 Hook */
export function useConfirmDialog(): {
  confirm: (options?: ConfirmOptions) => Promise<boolean>;
  ConfirmDialogComponent: React.FC;
};
```

#### status-badge.tsx

```typescript
interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  children: React.ReactNode;
  className?: string;
}

/** 状态徽章组件 */
export function StatusBadge(props: StatusBadgeProps): JSX.Element;
// variant: "default" | "success" | "warning" | "error" | "info" | "pending"
```

#### loading-state.tsx

```typescript
interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState(props: LoadingStateProps): JSX.Element;
```

#### app-card.tsx

```typescript
interface AppCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function AppCard(props: AppCardProps): JSX.Element;
```

---

### 1.9 展示组件

#### ModelParameterPanel.tsx

```typescript
export interface ModelParameterValues {
  duration: number;
  resolution: string;
  style: string;
  negativePrompt: string;
  seed: string;
  cfgScale: number;
}

interface ModelParameterPanelProps {
  modelId: string | undefined;
  values: ModelParameterValues;
  onChange: (values: ModelParameterValues) => void;
  disabled?: boolean;
}

export function ModelParameterPanel(props: ModelParameterPanelProps): JSX.Element;
```

#### SearchDialog.tsx

```typescript
interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
  onSearch: (term: string) => Promise<SearchResult[]>;
}

export function SearchDialog(props: SearchDialogProps): JSX.Element;
```

#### onboarding.tsx

```typescript
/** 新手引导组件 */
export function OnboardingGuide(): JSX.Element;

/** API Key 提醒组件 */
export function ApiKeyAlert(): JSX.Element;
```

#### OnboardingGuide.tsx

```typescript
/** 新手引导组件（增强版） */
export function OnboardingGuide(): JSX.Element;

/** 重置新手引导状态 */
export function resetOnboarding(): void;
```

#### Toast.tsx

```typescript
/** Toast 通知提供者 */
export function ToastProvider(props: { children: React.ReactNode }): JSX.Element;

/** Toast Hook */
export function useToast(): {
  toast: (options: { type: "success" | "error" | "warning" | "info"; message: string; duration?: number }) => void;
};

/** Toast 便捷方法 Hook */
export function useToastHelpers(): {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
};
```

#### ErrorBoundary.tsx

```typescript
/** 错误边界组件 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {}

interface ErrorLogViewerProps {
  loadLogs: () => Promise<unknown[]>;
  clearLogs: () => Promise<void>;
}

export function ErrorLogViewer(props: ErrorLogViewerProps): JSX.Element;
```

#### PageErrorBoundary.tsx

```typescript
/** 页面级错误边界 */
export class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {}
```

#### ThemeSwitcher.tsx

```typescript
interface ThemeSwitcherProps {
  collapsed?: boolean;
}

export function ThemeSwitcher(props: ThemeSwitcherProps): JSX.Element;
```

#### ThemeProvider.tsx

```typescript
/** 主题提供者 */
export function ThemeProvider(props: { children: React.ReactNode }): JSX.Element;

/** 主题 Hook */
export function useTheme(): {
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
  resolvedTheme: "light" | "dark";
};
```

#### KeyboardShortcutsDialog.tsx

```typescript
interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsDialog(props: KeyboardShortcutsDialogProps): JSX.Element;

/** 键盘快捷键触发器 */
export function KeyboardShortcutsTrigger(props: { children: React.ReactNode }): JSX.Element;
```

#### CrashRecoveryDialog.tsx

```typescript
interface CrashRecoveryDialogProps {
  loadAutoSaves: () => Promise<Array<{ id: string; type: string; data_json: string; timestamp: number }>>;
  deleteAutoSave: (id: string) => Promise<void>;
}

export function CrashRecoveryDialog(props: CrashRecoveryDialogProps): JSX.Element;
```

#### NetworkStatusAlert.tsx

```typescript
/** 网络状态提醒组件 */
export function NetworkStatusAlert(): JSX.Element;
```

#### DeleteConfirmDialog.tsx

```typescript
interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityLabel: string;
  isDeleting: boolean;
  onConfirm: () => void;
  referenceCheck: {
    references: Array<{
      elementId: string;
      elementName: string;
      usedInBeats: Array<unknown>;
    }>;
  } | null;
}

export function DeleteConfirmDialog(props: DeleteConfirmDialogProps): JSX.Element;
```

#### Sidebar.tsx

```typescript
interface SidebarProps {
  onSearch?: (term: string) => Promise<SearchResult[]>;
  onSearchSelect?: (result: SearchResult) => void;
}

export function Sidebar(props: SidebarProps): JSX.Element;
```

#### SaveStatusIndicator.tsx

```typescript
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "unsaved";

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  errorMessage?: string;
  className?: string;
}

export function SaveStatusIndicator(props: SaveStatusIndicatorProps): JSX.Element;
```

#### BeforeUnloadGuard.tsx

```typescript
/** 页面离开守卫组件 */
export function BeforeUnloadGuard(): JSX.Element;

/** 导航守卫 Hook */
export function useNavigationGuard(): {
  guardedPush: (path: string) => void;
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
};
```

#### DebugOverlay.tsx

```typescript
/** 调试信息叠加层 */
export function DebugOverlay(): JSX.Element;
```

#### VirtualList.tsx

```typescript
interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  overscan?: number;
  emptyMessage?: string;
  maxHeight?: string;
}

export function VirtualList<T>(props: VirtualListProps<T>): JSX.Element;
```

#### PerformanceMonitorPanel.tsx

```typescript
/** 性能监控面板 */
export function PerformanceMonitorPanel(): JSX.Element;
```

#### MemoryMonitorPanel.tsx

```typescript
interface MemoryMonitorPanelProps {
  clearErrorLogs: () => Promise<void>;
}

export function MemoryMonitorPanel(props: MemoryMonitorPanelProps): JSX.Element;
```

#### AssetSelectorDialog.tsx

```typescript
interface Asset {
  id: string;
  name: string;
  url: string;
  type: "image" | "video";
  boundTo?: { type: string; id: string; name: string };
}

interface AssetSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: Asset[];
  description: string;
  onSelect: (asset: Asset) => void;
}

export function AssetSelectorDialog(props: AssetSelectorDialogProps): JSX.Element;
```

---

## 2. 基础设施层 (src/infrastructure)

### 2.1 AI 提供商 (ai-providers/)

#### core.ts

AI 提供商核心抽象。

```typescript
/** AI 提供商接口 */
export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly format: ApiFormat;

  /** 测试 API Key 是否有效 */
  testConnection(apiKey: string, baseUrl?: string): Promise<boolean>;

  /** 获取可用模型列表 */
  listModels(apiKey: string, baseUrl?: string): Promise<ModelConfig[]>;
}
```

#### config.ts

AI 提供商配置管理。

```typescript
/** 获取当前 AI 配置 */
export function getAIConfig(): Promise<ApiConfig>;

/** 保存 AI 配置 */
export function saveAIConfig(config: ApiConfig): Promise<void>;

/** 获取指定能力的提供商配置 */
export function getProviderForCapability(
  capability: ApiCapability,
): Promise<{ provider: ProviderConfig | null; modelId: string | null }>;
```

#### types.ts

AI 提供商类型定义。

```typescript
/** AI 提供商格式 */
export type ApiFormat = "openai" | "zhipu" | "anthropic" | "google" | "seedance" | "kuaishou" | "pixverse";

/** AI 能力类型 */
export type ApiCapability = "text" | "image" | "vision" | "video";

/** 提供商配置 */
export interface ProviderConfig {
  id: string;
  templateId?: string;
  name: string;
  format: ApiFormat;
  baseUrl: string;
  apiKey: string;
  models: ModelConfig[];
  isCustom?: boolean;
  _obfuscationVersion?: number;
}

/** 模型配置 */
export interface ModelConfig {
  id: string;
  name: string;
  capabilities: ApiCapability[];
  defaultParams?: {
    maxTokens?: number;
    temperature?: number;
    size?: string;
    duration?: number;
    quality?: string;
    maxKeyframes?: number;
    [key: string]: unknown;
  };
}

/** 能力映射 */
export interface CapabilityMapping {
  text?: string;
  image?: string;
  vision?: string;
  video?: string;
}

/** API 配置 */
export interface ApiConfig {
  version: number;
  providers: ProviderConfig[];
  mapping: CapabilityMapping;
  fallback: {
    enabled: boolean;
    order: ApiCapability[];
  };
  freeImageBackup?: boolean;
}
```

#### errors.ts

AI 提供商错误类型。

```typescript
/** AI 提供商错误 */
export class AIProviderError extends Error {
  code: ApiErrorCode;
  providerId: string;
  statusCode?: number;
  retryable: boolean;

  constructor(options: {
    message: string;
    code: ApiErrorCode;
    providerId: string;
    statusCode?: number;
    retryable?: boolean;
    cause?: Error;
  });
}

/** API 限流错误 */
export class RateLimitError extends AIProviderError {}

/** 认证错误 */
export class AuthenticationError extends AIProviderError {}

/** 连接超时错误 */
export class TimeoutError extends AIProviderError {}
```

#### text.ts

文本生成服务。

```typescript
export interface TextGenerationOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  signal?: AbortSignal;
}

export interface TextGenerationResult {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** 生成文本 */
export function generateText(
  prompt: string,
  options?: TextGenerationOptions,
): Promise<TextGenerationResult>;

/** 流式生成文本 */
export function generateTextStream(
  prompt: string,
  options?: TextGenerationOptions,
): AsyncIterable<string>;
```

#### image.ts

图像生成服务。

```typescript
export interface ImageGenerationOptions {
  model?: string;
  size?: string;
  quality?: string;
  style?: string;
  negativePrompt?: string;
  seed?: number;
  signal?: AbortSignal;
}

export interface ImageGenerationResult {
  url: string;
  localPath?: string;
  revisedPrompt?: string;
}

/** 生成图像 */
export function generateImage(
  prompt: string,
  options?: ImageGenerationOptions,
): Promise<ImageGenerationResult>;
```

#### video.ts

视频生成服务。

```typescript
export interface VideoGenerationOptions {
  model?: string;
  duration?: number;
  resolution?: string;
  style?: string;
  negativePrompt?: string;
  seed?: number;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  characterRefs?: Array<{ imageUrl: string; weight?: number }>;
  cfgScale?: number;
  signal?: AbortSignal;
}

export interface VideoGenerationResult {
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  localPath?: string;
  progress?: number;
}

/** 提交视频生成任务 */
export function submitVideoTask(
  prompt: string,
  options?: VideoGenerationOptions,
): Promise<VideoGenerationResult>;

/** 查询视频任务状态 */
export function queryVideoTask(taskId: string): Promise<VideoGenerationResult>;
```

#### video-service.ts

视频服务统一接口。

```typescript
export interface VideoService {
  /** 提交视频生成任务 */
  submitTask(params: VideoGenerationOptions & { prompt: string }): Promise<VideoGenerationResult>;

  /** 查询任务状态 */
  queryTask(taskId: string): Promise<VideoGenerationResult>;

  /** 取消任务 */
  cancelTask(taskId: string): Promise<void>;

  /** 获取任务历史 */
  getTaskHistory(limit?: number): Promise<VideoGenerationResult[]>;
}
```

#### enhanced-video.ts

增强视频服务（多提供商支持）。

```typescript
export interface EnhancedVideoService extends VideoService {
  /** 使用指定提供商提交任务 */
  submitTaskWithProvider(
    providerId: string,
    params: VideoGenerationOptions & { prompt: string },
  ): Promise<VideoGenerationResult>;

  /** 自动选择最佳提供商 */
  autoSelectProvider(
    params: VideoGenerationOptions,
  ): Promise<{ providerId: string; modelId: string } | null>;
}
```

#### multi-api.ts

多 API 聚合服务。

```typescript
/** 根据能力自动路由到合适的提供商 */
export function routeToProvider(
  capability: ApiCapability,
): Promise<{ provider: ProviderConfig; modelId: string } | null>;

/** 带回退的 API 调用 */
export async function callWithFallback<T>(
  capability: ApiCapability,
  fn: (provider: ProviderConfig, modelId: string) => Promise<T>,
): Promise<T>;
```

#### services.ts

AI 服务统一导出。

```typescript
export const aiTextService: {
  generate: typeof generateText;
  generateStream: typeof generateTextStream;
};

export const aiImageService: {
  generate: typeof generateImage;
};

export const aiVideoService: VideoService;
```

#### config-status.ts

配置状态检查。

```typescript
export interface ConfigStatusItem {
  configured: boolean;
  provider: string;
  available: boolean;
  model?: string;
}

export interface ConfigStatus {
  text: ConfigStatusItem;
  image: ConfigStatusItem;
  vision: ConfigStatusItem;
  video: ConfigStatusItem;
  allConfigured: boolean;
  configuredCount: number;
  totalCount: number;
  missing: string[];
}

/** 检查配置状态 */
export function checkConfigStatus(): Promise<ConfigStatus>;

/** 获取缺失的配置项 */
export function getMissingCapabilities(): Promise<string[]>;

/** 检查是否所有功能都已配置 */
export function isFullyConfigured(): Promise<boolean>;
```

#### utils.ts

AI 提供商工具函数。

```typescript
/** 构建 API 请求头 */
export function buildApiHeaders(apiKey: string, format: ApiFormat): Record<string, string>;

/** 解析 API 响应 */
export function parseApiResponse<T>(response: Response): Promise<T>;

/** 构建 API 请求 URL */
export function buildApiUrl(baseUrl: string, path: string): string;

/** 掩码 API Key */
export function maskApiKey(apiKey: string): string;
```

#### model-capabilities.ts

模型能力查询。

```typescript
/** 获取模型支持的能力 */
export function getModelCapabilities(modelId: string): ApiCapability[];

/** 检查模型是否支持指定能力 */
export function isModelCapable(modelId: string, capability: ApiCapability): boolean;
```

#### model-registry.ts

模型注册表。

```typescript
/** 提供商模板 */
export interface ProviderTemplate {
  name: string;
  format: ApiFormat;
  baseUrl: string;
  models: ModelConfig[];
}

/** 内置提供商模板 */
export const PROVIDER_TEMPLATES: Record<string, ProviderTemplate>;

/** 模板名称映射 */
export const TEMPLATE_NAMES: Record<string, string>;

/** 内置检测规则 */
export const BUILTIN_DETECTION_RULES: Array<{
  templateId: string;
  pattern: RegExp;
  confidence: "high" | "medium" | "low";
  check?: (apiKey: string) => boolean;
}>;
```

#### model-parameter-profile.ts

模型参数配置。

```typescript
/** 获取模型参数配置文件 */
export function getModelParameterProfile(modelId: string | undefined): ModelParameterProfile;
```

#### api-cache.ts

API 响应缓存。

```typescript
export class ApiCache {
  /** 获取缓存 */
  get<T>(key: string): T | null;

  /** 设置缓存 */
  set<T>(key: string, value: T, ttlMs?: number): void;

  /** 删除缓存 */
  delete(key: string): void;

  /** 清空缓存 */
  clear(): void;

  /** 获取缓存统计 */
  getStats(): { size: number; hitRate: number };
}

export const apiCache: ApiCache;
```

#### offline-queue.ts

离线任务队列。

```typescript
export interface QueuedTask {
  id: string;
  type: string;
  params: unknown;
  createdAt: number;
  retryCount: number;
  status: "pending" | "running" | "failed" | "completed";
}

export class OfflineQueue {
  /** 入队任务 */
  enqueue(task: Omit<QueuedTask, "id" | "createdAt" | "retryCount" | "status">): string;

  /** 出队任务 */
  dequeue(): QueuedTask | null;

  /** 标记任务完成 */
  complete(taskId: string): void;

  /** 标记任务失败并重试 */
  fail(taskId: string): void;

  /** 获取待处理任务数 */
  getPendingCount(): number;

  /** 获取所有任务 */
  getAll(): QueuedTask[];
}

export const offlineQueue: OfflineQueue;
```

#### outfit-synthesis.ts

服装合成服务。

```typescript
export interface OutfitSynthesisOptions {
  characterImageUrl: string;
  outfitDescription: string;
  model?: string;
  signal?: AbortSignal;
}

export interface OutfitSynthesisResult {
  imageUrl: string;
  localPath?: string;
}

/** 合成角色服装图像 */
export function synthesizeOutfit(
  options: OutfitSynthesisOptions,
): Promise<OutfitSynthesisResult>;
```

#### image-normalization.ts

图像标准化处理。

```typescript
export interface NormalizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  format?: "png" | "jpeg" | "webp";
  quality?: number;
}

/** 标准化图像 */
export function normalizeImage(
  input: File | Blob | string,
  options?: NormalizeOptions,
): Promise<{ blob: Blob; width: number; height: number; dataUrl: string }>;

/** 将图像转为 Base64 */
export function imageToBase64(input: File | Blob): Promise<string>;

/** 调整图像大小 */
export function resizeImage(
  input: File | Blob,
  maxWidth: number,
  maxHeight: number,
): Promise<Blob>;
```

#### model-capabilities-types.ts

模型能力类型定义。

```typescript
/** 图片尺寸选项 */
export interface ImageSizeOption {
  width: number;
  height: number;
  label: string;
  aspectRatio: string;
}

/** 模型能力配置 */
export interface ModelCapabilities {
  maxReferences: number;
  maxResolution: number;
  maxSizeMB: number;
  supportsLastFrame: boolean;
  referenceMode: "separate" | "merged";
  supportedFormats?: string[];
  supportedImageSizes?: ImageSizeOption[];
  defaultImageSize?: string;
  providerId?: string;
  urlTtl?: number;
  supportsCharacterRef?: boolean;
  supportsSceneRef?: boolean;
  nativeCharacterRef?: boolean;
  nativeSceneRef?: boolean;
  characterRefMode?: "native_field" | "multimodal" | "ref_field" | "text_append" | "bake_into_first" | "none";
  sceneRefMode?: "native_field" | "multimodal" | "ref_field" | "text_append" | "bake_into_first" | "none";
  imageUploadMode?: "base64" | "url" | "upload";
  maxCharacterRefs?: number;
  promptLanguage?: "en" | "zh" | "auto";
  supportsReferenceVideo?: boolean;
}

/** 模型参数配置文件 */
export interface ModelParameterProfile {
  modelId: string;
  displayName?: string;
  providerId?: string;
  isUserPlugin?: boolean;
  isCodePlugin?: boolean;
  capabilities: ModelCapabilities;
  parameters: {
    durations?: Array<{ value: number; label: string }>;
    resolutions?: Array<{ value: string; label: string; width: number; height: number }>;
    styles?: Array<{ value: string; label: string; description?: string }>;
    negativePrompt?: boolean;
    seed?: boolean;
    cfgScale?: { min: number; max: number; default: number; step: number };
    lora?: boolean;
  };
}

/** 参考图优先级枚举 */
export enum ReferencePriority {
  CHARACTER_REF = 1,
  SCENE_REF = 2,
  FIRST_FRAME = 3,
  LAST_FRAME = 4,
  KEYFRAME_COMPOSITION = 5,
  PREV_KEYFRAME_STYLE = 6,
}

/** 参考图条目 */
export interface ReferenceImageItem {
  url: string;
  priority: ReferencePriority;
  description?: string;
  type: "character" | "scene" | "firstFrame" | "lastFrame" | "keyframe" | "prevKeyframe";
}

/** 图片尺寸用途 */
export type ImageSizePurpose = "style_guide" | "keyframe" | "frame" | "character" | "scene";

/** 参考图投递模式 */
export type ReferenceDeliveryMode = "native_field" | "bake_into_first" | "both";

/** 参考图策略 */
export interface ReferenceStrategy {
  characterRef: ReferenceDeliveryMode;
  sceneRef: ReferenceDeliveryMode;
}

/** 视频生成策略 */
export interface VideoGenerationStrategy {
  useFirstFrame: boolean;
  useLastFrame: boolean;
  useCharacterRef: boolean;
  useSceneRef: boolean;
  characterRefMode: string;
  sceneRefMode: string;
  imageUploadMode: string;
  maxCharacterRefs: number;
  referenceStrategy: ReferenceStrategy;
  promptLanguage: "en" | "zh" | "auto";
  supportsReferenceVideo: boolean;
}
```

#### model-capabilities-utils.ts

模型能力查询工具函数。

```typescript
export { ReferencePriority } from "./model-capabilities-types";

/** 获取模型能力配置（优先级：插件缓存 > 内置精确匹配 > 内置前缀匹配 > 保守默认值） */
export function getModelCapabilities(modelId: string): ModelCapabilities;

/** 检查模型是否支持尾帧参考 */
export function supportsLastFrame(modelId: string): boolean;

/** 获取模型最大参考图数量 */
export function getMaxReferences(modelId: string): number;

/** 按优先级调整参考图列表（过滤不支持的类型，截断超限数量） */
export function adjustReferenceImages(
  references: ReferenceImageItem[],
  modelId: string,
  mode?: "video" | "keyframe" | "framePair",
): ReferenceImageItem[];

/** 获取视频生成策略 */
export function getVideoGenerationStrategy(modelId: string): VideoGenerationStrategy;

/** 解析图片尺寸（优先用户偏好 > 模型默认 > 按用途匹配 > 最大分辨率） */
export function resolveImageSize(
  modelId: string,
  purpose?: ImageSizePurpose,
  preferredSize?: string,
): string;

/** 获取模型支持的图片尺寸列表 */
export function getSupportedImageSizes(modelId: string): ImageSizeOption[];
```

#### offline-queue-utils.ts

离线队列工具函数与类型。

```typescript
/** 排队请求 */
export interface QueuedRequest {
  id: string;
  type: string;
  payload: string;
  status: "pending" | "generating" | "failed";
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  lastAttemptAt: number | null;
  nextRetryAt: number | null;
  error: string | null;
  priority: TaskPriority;
}

/** 最大重试次数（配置） */
export const MAX_RETRIES: number;

/** 最大重试次数（硬上限） */
export const MAX_RETRY_COUNT: 5;

/** 计算重试延迟（指数退避 + 抖动） */
export function calculateRetryDelay(attempt: number, baseDelayMs?: number): number;

/** 去重缓存 */
export const deduplicationCache: Map<string, { value: string; expiresAt: number }>;

/** 去重缓存 TTL（毫秒） */
export const DEDUPE_TTL_MS: number;

/** 清理过期去重缓存条目 */
export function pruneDeduplicationCache(): void;

/** 检查是否在线 */
export function isOnline(): boolean;

/** 获取优先级数值 */
export function priorityValue(priority: TaskPriority): number;

/** 计算去重键 */
export function computeDeduplicationKey(type: string, payload: Record<string, unknown>): string;

/** 获取自适应处理间隔（根据网络质量调整） */
export function getAdaptiveInterval(): number;

/** 判断是否为永久性错误（不可重试） */
export function isPermanentError(errorMessage: string | null): boolean;
```

#### offline-queue-ops.ts

离线队列数据库操作。

```typescript
/** 启动自动处理（定时从队列取出任务并调用 processor） */
export function startAutoProcessing(
  processor: (type: string, payload: Record<string, unknown>) => Promise<boolean>,
  intervalMs?: number,
): void;

/** 停止自动处理 */
export function stopAutoProcessing(): void;

/** 入队请求（支持去重） */
export function enqueueRequest(
  type: string,
  payload: Record<string, unknown>,
  priority?: TaskPriority,
): Promise<string | null>;

/** 获取待处理请求列表 */
export function getPendingRequests(): Promise<QueuedRequest[]>;

/** 按优先级获取待处理请求列表 */
export function getPendingRequestsByPriority(): Promise<QueuedRequest[]>;

/** 标记请求为处理中 */
export function markRequestProcessing(id: string): Promise<void>;

/** 标记请求为已完成 */
export function markRequestCompleted(id: string): Promise<void>;

/** 标记请求为失败 */
export function markRequestFailed(id: string, error: string): Promise<void>;

/** 处理待处理队列（并发执行） */
export function processPendingQueue(
  processor: (type: string, payload: Record<string, unknown>) => Promise<boolean>,
  concurrency?: number,
): Promise<number>;

/** 恢复不完整的任务（将超时的 processing 状态重置为 pending） */
export function recoverIncompleteTasks(): Promise<number>;

/** 清理已完成的请求 */
export function cleanCompletedRequests(olderThanHours?: number): Promise<number>;

/** 获取队列统计 */
export function getQueueStats(): Promise<{ pending: number; generating: number; failed: number; timeout: number; total: number }>;

/** 重试所有失败任务（永久性错误除外） */
export function retryFailedTasks(): Promise<number>;
```

#### api-config/providers/provider-schema.ts

提供商插件 JSON Schema 校验。

```typescript
/** 提供商 JSON Schema（Zod） */
export const ProviderJsonSchema: z.ZodObject<...>;

/** 独立模型能力 Schema（Zod） */
export const StandaloneModelCapabilitySchema: z.ZodObject<...>;

/** 独立模型能力列表 Schema（Zod） */
export const StandaloneModelCapabilitiesSchema: z.ZodArray<...>;

/** 校验提供商 JSON 数据 */
export function validateProviderJson(data: unknown): { success: boolean; errors?: z.ZodError };

/** 校验独立模型能力数据 */
export function validateStandaloneCapabilities(data: unknown): { success: boolean; errors?: z.ZodError };
```

---

### 2.2 API 配置 (ai-providers/api-config/)

#### types.ts

```typescript
export type ApiFormat = "openai" | "zhipu" | "anthropic" | "google" | "seedance" | "kuaishou" | "pixverse";

export type ApiCapability = "text" | "image" | "vision" | "video";

export interface ProviderConfig {
  id: string;
  templateId?: string;
  name: string;
  format: ApiFormat;
  baseUrl: string;
  apiKey: string;
  models: ModelConfig[];
  isCustom?: boolean;
  _obfuscationVersion?: number;
}

export interface ModelConfig {
  id: string;
  name: string;
  capabilities: ApiCapability[];
  defaultParams?: {
    maxTokens?: number;
    temperature?: number;
    size?: string;
    duration?: number;
    quality?: string;
    maxKeyframes?: number;
    [key: string]: unknown;
  };
}

export interface CapabilityMapping {
  text?: string;
  image?: string;
  vision?: string;
  video?: string;
}

export interface ApiConfig {
  version: number;
  providers: ProviderConfig[];
  mapping: CapabilityMapping;
  fallback: {
    enabled: boolean;
    order: ApiCapability[];
  };
  freeImageBackup?: boolean;
}
```

#### detect.ts

API Key 自动检测。

```typescript
export interface DetectResult {
  templateId: string;
  confidence: "high" | "medium" | "low";
  suggestedName: string;
  baseUrl?: string;
  source: "builtin" | "plugin";
  pluginId?: string;
  isUserPlugin?: boolean;
  isCodePlugin?: boolean;
}

export interface DetectAllResult {
  builtinMatches: DetectResult[];
  pluginMatches: DetectResult[];
  recommended: DetectResult | null;
}

/** 加载插件检测规则 */
export function loadPluginDetectionRules(): Promise<void>;

/** 检测 API Key 对应的所有提供商 */
export function detectAllProviders(apiKey: string): DetectAllResult | null;

/** 检测 API Key 对应的提供商（兼容旧接口） */
export function detectProvider(apiKey: string): DetectResult | null;

/** 验证 API Key 格式 */
export function validateApiKey(apiKey: string): { valid: boolean; error?: string };
```

#### storage.ts

API 配置存储。

```typescript
/** 获取默认配置 */
export function getDefaultConfig(): ApiConfig;

/** 使配置缓存失效 */
export function invalidateConfigCache(): void;

/** 加载配置 */
export function loadConfig(): Promise<ApiConfig>;

/** 保存配置 */
export function saveConfig(config: ApiConfig): Promise<void>;

/** 添加提供商 */
export function addProvider(config: ApiConfig, provider: ProviderConfig): ApiConfig;

/** 移除提供商 */
export function removeProvider(config: ApiConfig, providerId: string): ApiConfig;

/** 设置能力映射 */
export function setCapabilityMapping(
  config: ApiConfig,
  capability: "text" | "image" | "vision" | "video",
  providerModelId: string | undefined,
): ApiConfig;

/** 获取能力配置 */
export function getCapabilityConfig(
  config: ApiConfig,
  capability: "text" | "image" | "vision" | "video",
): { provider: ProviderConfig | null; modelId: string | null };
```

#### templates.ts

提供商模板管理。

```typescript
export interface PluginProviderTemplate extends ProviderTemplate {
  pluginId: string;
  isUserPlugin: boolean;
  isCodePlugin: boolean;
  deprecated?: boolean;
  deprecatedReason?: string;
}

/** 插件模板是否已加载 */
export function isPluginTemplatesLoaded(): boolean;

/** 获取插件模板 */
export function getPluginTemplates(): Record<string, PluginProviderTemplate>;

/** 确保插件模板已加载 */
export function ensurePluginTemplatesLoaded(): Promise<void>;

/** 异步获取所有模板（含插件） */
export function getAllTemplatesAsync(): Promise<Record<string, ProviderTemplate>>;

/** 加载插件模板 */
export function loadPluginTemplates(): Promise<void>;

/** 获取所有模板（同步，可能不含插件） */
export function getAllTemplates(): Record<string, ProviderTemplate>;

/** 获取模板（含插件） */
export function getTemplateWithPlugins(id: string): ProviderTemplate | PluginProviderTemplate | undefined;

/** 从模板创建提供商配置 */
export function createProviderFromTemplate(
  templateId: string,
  apiKey: string,
  customId?: string,
): ProviderConfig | null;
```

#### init.ts

配置初始化与状态检查。

```typescript
export interface ConfigStatusItem {
  configured: boolean;
  provider: string;
  available: boolean;
  model?: string;
}

export interface ConfigStatus {
  text: ConfigStatusItem;
  image: ConfigStatusItem;
  vision: ConfigStatusItem;
  video: ConfigStatusItem;
  allConfigured: boolean;
  configuredCount: number;
  totalCount: number;
  missing: string[];
}

/** 检查配置状态 */
export function checkConfigStatus(): Promise<ConfigStatus>;

/** 获取缺失的配置项 */
export function getMissingCapabilities(): Promise<string[]>;

/** 检查是否所有功能都已配置 */
export function isFullyConfigured(): Promise<boolean>;

/** 初始化配置 */
export function initConfig(): void;
```

#### server.ts

服务端 API 配置导出。

```typescript
export { clearConfigCache, refreshConfigCache, saveServerConfig, loadServerConfig, hasServerCapability, getCapabilityConfigForServer, mergeWithServerConfig } from "./server-config-loader";
export { encryptField, decryptField, encryptConfig, decryptConfig } from "./server-encryption";
```

#### server-config-loader.ts

服务端配置加载器。

```typescript
/** 清除配置缓存 */
export function clearConfigCache(): void;

/** 刷新配置缓存 */
export function refreshConfigCache(): Promise<void>;

/** 保存服务端配置 */
export function saveServerConfig(config: ApiConfig): Promise<void>;

/** 加载服务端配置（优先环境变量 > 文件 > 默认） */
export function loadServerConfig(): Promise<ApiConfig>;

/** 检查服务端是否具备指定能力 */
export function hasServerCapability(capability: ApiCapability): Promise<boolean>;

/** 获取服务端指定能力的配置 */
export function getCapabilityConfigForServer(
  capability: ApiCapability,
): Promise<{ provider: ProviderConfig | null; modelId: string | null }>;

/** 合并客户端配置与服务端配置 */
export function mergeWithServerConfig(clientConfig: Partial<ApiConfig>): Promise<ApiConfig>;
```

#### server-encryption.ts

服务端加密工具。

```typescript
/** 加密字段 */
export function encryptField(text: string): string;

/** 解密字段 */
export function decryptField(encrypted: string): string | null;

/** 加密整个配置 */
export function encryptConfig(config: ApiConfig): ApiConfig;

/** 解密整个配置 */
export function decryptConfig(config: ApiConfig): ApiConfig;

/** 从文件加载配置 */
export function loadConfigFromFile(): Promise<ApiConfig | null>;

/** 保存配置到文件 */
export function saveConfigToFile(config: ApiConfig): Promise<void>;
```

#### server-key.ts

服务端密钥管理。

```typescript
/** 获取服务端加密密钥 */
export function getServerEncryptionKey(): Buffer;

/** 检查密钥是否来自环境变量 */
export function isKeyFromEnv(): boolean;

/** 检查密钥文件是否存在 */
export function keyFileExists(): boolean;

/** 删除密钥文件 */
export function deleteKeyFile(): boolean;

/** 验证密钥是否有效 */
export function validateKey(key: Buffer): boolean;
```

---

### 2.3 提供商实现 (ai-providers/providers/)

#### cloud-providers.ts

云提供商信息。

```typescript
export interface CloudProviderInfo {
  name: string;
  websiteUrl: string;
  taskUrlPattern: (taskId: string) => string;
  queryEndpoint: (baseUrl: string, taskId: string) => string;
  apiDocUrl: string;
  howToCheck: string;
}

/** 云提供商映射 */
export const CLOUD_PROVIDERS: Record<string, CloudProviderInfo>;
// 键: "volces.com" | "bytepluses.com" | "dashscope.aliyuncs.com" | "klingai.com" | "bigmodel.cn" | "openai.com" | "atlascloud.ai"

/** 默认云提供商（自定义 API） */
export const DEFAULT_CLOUD_PROVIDER: CloudProviderInfo;
```

---

### 2.4 API 客户端 (api/)

#### client.ts

```typescript
/** API 客户端 */
export class ApiClient {
  constructor(baseUrl?: string);

  /** GET 请求 */
  get<T>(path: string, params?: Record<string, unknown>): Promise<T>;

  /** POST 请求 */
  post<T>(path: string, body?: unknown): Promise<T>;

  /** PUT 请求 */
  put<T>(path: string, body?: unknown): Promise<T>;

  /** DELETE 请求 */
  delete<T>(path: string): Promise<T>;

  /** 设置请求头 */
  setHeader(key: string, value: string): void;

  /** 设置认证 Token */
  setAuthToken(token: string): void;
}

export const apiClient: ApiClient;
```

#### endpoints.ts

```typescript
/** API 端点常量 */
export const API_ENDPOINTS: {
  TEXT_GENERATE: string;
  IMAGE_GENERATE: string;
  VIDEO_SUBMIT: string;
  VIDEO_QUERY: string;
  VIDEO_CANCEL: string;
  CONFIG_GET: string;
  CONFIG_SET: string;
  PLUGINS_LIST: string;
};
```

---

### 2.5 DI 容器 (di/)

#### container.ts

```typescript
/** DI 容器 */
export const container: {
  // A. Domain Port 实现
  videoProvider: VideoService;
  characterStorage: typeof import("@/infrastructure/storage/characters").characterStorage;
  sceneStorage: typeof import("@/infrastructure/storage/scenes").sceneStorage;
  storyStorage: typeof import("@/infrastructure/storage/stories").storyStorage;
  videoTaskStorage: typeof import("@/infrastructure/storage/video-tasks").videoTaskStorage;
  elementStorage: typeof import("@/infrastructure/storage/elements").elementStorage;
  storyboardStorage: typeof import("@/infrastructure/storage/storyboard").storyboardStorage;
  collectionStorage: typeof import("@/infrastructure/storage/collections").collectionStorage;
  versionStorage: typeof import("@/infrastructure/storage/versions").versionStorage;
  templateStorage: typeof import("@/infrastructure/storage/templates").templateStorage;
  autoSaveStorage: typeof import("@/infrastructure/storage/auto-save").autoSaveStorage;
  sessionStorage: typeof import("@/infrastructure/storage/sessions").sessionStorage;
  importExportStorage: typeof import("@/infrastructure/storage/import-export").importExportStorage;
  errorLogStorage: typeof import("@/infrastructure/storage/error-logs").errorLogStorage;
  videoCacheStorage: typeof import("@/infrastructure/storage/video-cache").videoCacheStorage;
  imageCacheStorage: typeof import("@/infrastructure/storage/image-cache").imageCacheStorage;
  mediaAssetRepository: typeof import("@/infrastructure/database/media-asset-repository").mediaAssetRepository;

  // B. 有状态服务
  eventBus: EventBus;
  apiClient: ApiClient;

  // E. 懒加载模块
  syncEngine: SyncEngine;
  referenceEngine: ReferenceEngine;
  elementManager: ElementStorage;
};

/** 获取 Token 注册表 */
export function getTokenRegistry(): Record<string, unknown>;
```

#### types.ts

```typescript
/** DI Token 类型 */
export interface DIToken<T> {
  readonly id: string;
  readonly description: string;
  resolve: () => T;
}
```

#### registry.ts

```typescript
/** 注册 DI Token */
export function registerToken<T>(token: DIToken<T>, factory: () => T): void;

/** 解析 DI Token */
export function resolveToken<T>(token: DIToken<T>): T;

/** 检查 Token 是否已注册 */
export function hasToken(tokenId: string): boolean;
```

---

### 2.6 存储 (storage/)

#### sqlite-core.ts

SQLite 核心操作。

```typescript
/** 带重试执行异步函数 */
export function withRetry<T>(fn: () => Promise<T>, maxRetries?: number): Promise<T>;

/** 安全查询（SELECT） */
export function safeQuery<T>(sql: string, params?: unknown[]): Promise<T[]>;

/** 安全执行（INSERT/UPDATE/DELETE） */
export function safeRun(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>;

/** 安全事务 */
export function safeTransaction(
  statements: Array<{ sql: string; params: unknown[] }>,
): Promise<unknown[]>;
```

#### core.ts

存储核心工具。

```typescript
/** 注册变更追踪器 */
export function registerChangeTracker(
  tracker: (entityType: SyncEntityType, entityId: string, operation: ChangeOperation) => Promise<void>,
): void;

/** 追踪变更 */
export function trackChange(
  entityType: SyncEntityType,
  entityId: string,
  operation: ChangeOperation,
): Promise<void>;

/** 解析数据库记录（通用） */
export function parseRecord(
  record: Record<string, unknown>,
  table?: string,
): Record<string, unknown>;

/** 解析数据库记录（带表名，自动处理 JSON/布尔列） */
export function parseRecordWithTable(
  record: Record<string, unknown>,
  table: string,
): Record<string, unknown>;

/** 批量解析记录 */
export function parseRecords(
  records: Record<string, unknown>[],
  table?: string,
): Record<string, unknown>[];

/** 字段目标类型 */
export interface FixedColumnTarget {
  type: "fixed";
  column: string;
}

export interface JsonContainerTarget {
  type: "json";
  container: string;
  key: string;
}

export type FieldTarget = FixedColumnTarget | JsonContainerTarget;

/** 字段值处理器 */
export type FieldValueProcessor = (value: unknown, target: FieldTarget) => unknown;

/** 构建 UPDATE SET 子句 */
export function buildUpdateSets(
  data: Record<string, unknown>,
  fieldTargets: Record<string, FieldTarget>,
  options?: { valueProcessor?: FieldValueProcessor },
): { sql: string; params: unknown[] };

/** 构建基于字段目标的 INSERT 语句 */
export function buildInsertFromTargets(
  table: string,
  data: Record<string, unknown>,
  fieldTargets: Record<string, FieldTarget>,
  baseColumns: string[],
  baseValues: unknown[],
  options?: {
    valueProcessor?: FieldValueProcessor;
    conflictStrategy?: "IGNORE" | "REPLACE" | "ABORT";
  },
): { sql: string; params: unknown[] };

/** 构建 JSON SET 子句 */
export function buildJsonSet(
  container: string,
  fields: Array<{ key: string; value: unknown }>,
): { sql: string; params: unknown[] };

/** 构建 INSERT 语句 */
export function buildInsert(
  table: string,
  columns: string[],
  values: unknown[],
  conflictStrategy?: "IGNORE" | "REPLACE" | "ABORT",
): { sql: string; params: unknown[] };

/** 导出 toSqlValue */
export { toSqlValue } from "@/shared/sql-safety";
```

#### characters.ts

角色存储。

```typescript
export const characterStorage: {
  /** 获取所有角色 */
  getCharacters<T = Character>(): Promise<T[]>;

  /** 根据 ID 获取角色 */
  getCharacterById<T = Character>(id: string): Promise<T | null>;

  /** 获取角色版本号 */
  getCharacterVersion(id: string): Promise<number | null>;

  /** 创建角色 */
  createCharacter(character: Partial<Character>): Promise<void>;

  /** 更新角色（支持乐观锁） */
  updateCharacter(id: string, character: Partial<Character>, version?: number): Promise<void>;

  /** 删除角色 */
  deleteCharacter(id: string): Promise<void>;

  /** 增加角色使用计数 */
  incrementCharacterUseCount(id: string): Promise<void>;
};

export { getOutfitsForCharacter, saveOutfitsForCharacter, updateOutfitImage };
```

#### scenes.ts

场景存储。

```typescript
export const sceneStorage: {
  /** 获取所有场景 */
  getScenes<T = Scene>(): Promise<T[]>;

  /** 根据 ID 获取场景 */
  getSceneById<T = Scene>(id: string): Promise<T | null>;

  /** 获取场景版本号 */
  getSceneVersion(id: string): Promise<number | null>;

  /** 创建场景 */
  createScene(scene: Partial<Scene>): Promise<void>;

  /** 更新场景（支持乐观锁） */
  updateScene(id: string, scene: Partial<Scene>, version?: number): Promise<void>;

  /** 删除场景 */
  deleteScene(id: string): Promise<void>;

  /** 增加场景使用计数 */
  incrementSceneUseCount(id: string): Promise<void>;
};
```

#### stories.ts

故事存储。

```typescript
export const storyStorage: {
  /** 获取所有故事 */
  getStories<T = Story>(): Promise<T[]>;

  /** 根据 ID 获取故事 */
  getStoryById<T = Story>(id: string): Promise<T | null>;

  /** 根据 Beat ID 获取故事 */
  getStoryByBeatId(beatId: string): Promise<Story | null>;

  /** 获取故事版本号 */
  getStoryVersion(id: string): Promise<number | null>;

  /** 创建故事 */
  createStory(story: Partial<Story>): Promise<void>;

  /** 更新故事（支持乐观锁） */
  updateStory(id: string, story: Partial<Story>, version?: number): Promise<void>;

  /** 删除故事 */
  deleteStory(id: string): Promise<void>;
};
```

#### video-tasks.ts

视频任务存储。

```typescript
export const videoTaskStorage: {
  /** 获取所有视频任务 */
  getVideoTasks<T = VideoTask>(): Promise<T[]>;

  /** 获取已完成的视频任务 */
  getCompletedVideoTasks<T = VideoTask>(): Promise<T[]>;

  /** 根据 ID 获取视频任务 */
  getVideoTaskById<T = VideoTask>(taskId: string): Promise<T | null>;

  /** 根据故事 ID 获取视频任务 */
  getVideoTasksByStory<T = VideoTask>(storyId: string): Promise<T[]>;

  /** 根据状态获取视频任务 */
  getVideoTasksByStatus<T = VideoTask>(status: string): Promise<T[]>;

  /** 获取待处理的视频任务 */
  getPendingVideoTasks<T = VideoTask>(): Promise<T[]>;

  /** 创建视频任务 */
  createVideoTask(task: Partial<VideoTask> & { taskId: string }): Promise<void>;

  /** 更新视频任务（支持乐观锁） */
  updateVideoTask(taskId: string, updates: Partial<VideoTask>, version?: number): Promise<void>;

  /** 删除视频任务 */
  deleteVideoTask(taskId: string): Promise<void>;

  /** 批量删除视频任务 */
  batchDeleteVideoTasks(taskIds: string[]): Promise<void>;

  /** 按状态批量删除视频任务 */
  deleteVideoTasksByStatus(statuses: string[]): Promise<void>;

  /** 按 Beat ID 删除视频任务 */
  deleteVideoTasksByBeatId(beatId: string): Promise<void>;

  /** 按故事 ID 删除视频任务 */
  deleteVideoTasksByStoryId(storyId: string): Promise<void>;

  /** 删除过期的视频任务 */
  deleteExpiredVideoTasks(): Promise<number>;

  /** 清空所有视频任务 */
  clearVideoTasks(): Promise<void>;

  /** 批量写入视频任务 */
  bulkPutVideoTasks(tasks: Partial<VideoTask>[]): Promise<void>;

  /** 批量更新视频任务 */
  batchUpdateVideoTasks(
    updates: Array<{ taskId: string; updates: Partial<VideoTask>; version?: number }>,
  ): Promise<void>;

  /** 同步 Beat 视频状态 */
  syncBeatVideoStatus(taskId: string, status: string): Promise<void>;
};

export { normalizeTimestamp, toStorageTimestamp, toStorageTimestampOrNow } from "./video-tasks/parser";
```

#### storyboard.ts

故事板资产存储。

```typescript
export const storyboardStorage: {
  /** 获取故事板资产列表 */
  getStoryboardAssets(limit?: number, offset?: number): Promise<StoryboardAsset[]>;

  /** 根据 ID 获取故事板资产 */
  getStoryboardAssetById(id: string): Promise<StoryboardAsset | null>;

  /** 创建故事板资产 */
  createStoryboardAsset(asset: Partial<StoryboardAsset>): Promise<string>;

  /** 更新故事板资产 */
  updateStoryboardAsset(id: string, updates: Partial<StoryboardAsset>): Promise<void>;

  /** 删除故事板资产 */
  deleteStoryboardAsset(id: string): Promise<void>;
};
```

#### collections.ts

集合存储。

```typescript
export const collectionStorage: {
  /** 获取所有集合 */
  getCollections(): Promise<Collection[]>;

  /** 根据 ID 获取集合 */
  getCollectionById(id: string): Promise<Collection | null>;

  /** 创建集合 */
  createCollection(name: string, id?: string): Promise<Collection>;

  /** 删除集合 */
  deleteCollection(id: string): Promise<void>;

  /** 获取所有集合资产 */
  getCollectionAssets(): Promise<CollectionAsset[]>;

  /** 获取集合内的资产 */
  getAssetsInCollection(collectionId: string): Promise<CollectionAsset[]>;

  /** 添加资产到集合 */
  addAssetToCollection(collectionId: string, assetType: string, assetId: string): Promise<void>;

  /** 从集合移除资产 */
  removeAssetFromCollection(collectionId: string, assetType: string, assetId: string): Promise<void>;

  /** 根据资产获取所属集合 */
  getCollectionAssetsByAsset(assetType: string, assetId: string): Promise<CollectionAsset[]>;
};
```

#### versions.ts

故事版本存储。

```typescript
export const versionStorage: {
  /** 获取故事版本列表 */
  getStoryVersions<T = StoryVersion>(storyId: string): Promise<T[]>;

  /** 创建故事版本 */
  createStoryVersion(version: Partial<StoryVersion> & { storyId: string; beats: StoryVersion["beats"] }): Promise<void>;

  /** 删除故事版本 */
  deleteStoryVersion(versionId: string): Promise<void>;

  /** 删除旧版本（保留指定数量） */
  deleteOldStoryVersions(storyId: string, keepCount: number): Promise<void>;
};
```

#### error-logs.ts

错误日志存储。

```typescript
export const errorLogStorage: {
  /** 添加错误日志 */
  addErrorLog(error: {
    message: string;
    stack?: string;
    timestamp?: number;
    component?: string;
  }): Promise<void>;

  /** 获取错误日志 */
  getErrorLogs<T = Record<string, unknown>>(limit?: number): Promise<T[]>;

  /** 获取错误日志数量 */
  getErrorLogCount(): Promise<number>;

  /** 删除旧错误日志 */
  deleteOldErrorLogs(keepCount: number): Promise<void>;

  /** 清空错误日志 */
  clearErrorLogs(): Promise<void>;
};
```

#### video-cache.ts

视频缓存存储。

```typescript
/** 注册 Object URL */
export function registerObjectUrl(taskId: string, url: string): void;

/** 获取 Object URL */
export function getObjectUrl(taskId: string): string | undefined;

/** 撤销 Object URL */
export function revokeObjectUrl(taskId: string): void;

/** 清理所有 Object URL */
export function cleanupAllObjectUrls(): void;

export const videoCacheStorage: {
  /** 缓存视频文件 */
  cacheVideoFile(meta: {
    taskId: string;
    filePath: string;
    originalUrl?: string;
    mimeType?: string;
    fileSize: number;
  }): Promise<void>;

  /** 获取缓存的视频文件 */
  getCachedVideoFile(taskId: string): Promise<{
    filePath: string;
    mimeType: string;
    originalUrl?: string;
    cachedAt: number;
    fileSize?: number;
  } | null>;

  /** 移除缓存的视频文件 */
  removeCachedVideoFile(taskId: string): Promise<string | null>;

  /** 获取视频缓存总大小 */
  getTotalVideoCacheSize(): Promise<number>;

  /** 获取视频缓存统计 */
  getVideoCacheStats(): Promise<{ count: number; totalSize: number }>;

  /** 清理过期视频缓存 */
  cleanExpiredVideoCache(maxAgeMs?: number): Promise<string[]>;

  /** 按大小限制清理视频缓存 */
  cleanVideoCacheBySizeLimit(maxTotalSizeBytes: number): Promise<string[]>;
};
```

#### image-cache.ts

图片缓存存储。

```typescript
export const imageCacheStorage: {
  /** 缓存图片文件 */
  cacheImageFile(meta: {
    sourceUrl: string;
    filePath: string;
    mimeType?: string;
    fileSize: number;
    width?: number;
    height?: number;
  }): Promise<void>;

  /** 获取缓存的图片文件 */
  getCachedImageFile(sourceUrl: string): Promise<{
    filePath: string;
    mimeType: string;
    fileSize?: number;
    width?: number;
    height?: number;
    cachedAt: number;
  } | null>;

  /** 移除缓存的图片文件 */
  removeCachedImageFile(sourceUrl: string): Promise<string | null>;

  /** 获取图片缓存总大小 */
  getTotalImageCacheSize(): Promise<number>;

  /** 获取图片缓存统计 */
  getImageCacheStats(): Promise<{ count: number; totalSize: number }>;

  /** 清理过期图片缓存 */
  cleanExpiredImageCache(maxAgeMs?: number): Promise<string[]>;

  /** 按大小限制清理图片缓存 */
  cleanImageCacheBySizeLimit(maxTotalSizeBytes: number): Promise<string[]>;

  /** 刷新待处理的访问更新 */
  flushPendingAccessUpdates(): Promise<void>;
};
```

#### templates.ts

模板存储。

```typescript
export const templateStorage: {
  /** 获取视频模板列表 */
  getVideoTemplates<T = Record<string, unknown>>(): Promise<T[]>;

  /** 创建视频模板 */
  createVideoTemplate(template: Record<string, unknown>): Promise<void>;

  /** 保存 AST 模板 */
  saveASTTemplate(meta: {
    id: string;
    name: string;
    description?: string;
    category?: string;
    genre?: string;
    tone?: string;
    tags?: string;
    author?: string;
    totalDuration: number;
    beatsCount: number;
    charactersCount?: number;
    scenesCount?: number;
    astFilePath?: string;
    astFileSize?: number;
    isPublic?: boolean;
    parentTemplateId?: string;
  }): Promise<void>;

  /** 获取 AST 模板 */
  getASTTemplate(id: string): Promise<Record<string, unknown> | null>;

  /** 获取 AST 模板列表 */
  getASTTemplates(filters?: {
    category?: string;
    search?: string;
    sortBy?: "created" | "usage" | "name";
    limit?: number;
  }): Promise<Record<string, unknown>[]>;

  /** 删除 AST 模板 */
  deleteASTTemplate(id: string): Promise<boolean>;

  /** 增加 AST 模板使用计数 */
  incrementASTTemplateUsage(id: string): Promise<void>;
};
```

#### auto-save.ts

自动保存存储。

```typescript
export const autoSaveStorage: {
  /** 获取所有自动保存记录 */
  getAutoSaves<T = Record<string, unknown>>(): Promise<T[]>;

  /** 创建自动保存记录 */
  createAutoSave(autoSave: {
    id: string;
    type: string;
    data: unknown;
    timestamp?: number;
  }): Promise<void>;

  /** 删除自动保存记录 */
  deleteAutoSave(id: string): Promise<void>;

  /** 清空所有自动保存记录 */
  clearAllAutoSaves(): Promise<void>;

  /** 清理过期自动保存记录 */
  cleanExpiredAutoSaves(maxAgeMs?: number): Promise<number>;

  /** 按类型获取自动保存记录 */
  getAutoSavesByType<T = Record<string, unknown>>(type: string): Promise<T[]>;

  /** 按 ID 获取自动保存记录 */
  getAutoSaveById<T = Record<string, unknown>>(id: string): Promise<T | undefined>;
};
```

#### sessions.ts

会话存储。

```typescript
export const sessionStorage: {
  /** 获取会话值 */
  getSession(key: string): Promise<unknown | null>;

  /** 设置会话值 */
  setSession(key: string, value: unknown): Promise<void>;
};
```

#### import-export.ts

导入导出存储。

```typescript
/** 驼峰转蛇形 */
export function camelToSnakeCase(str: string): string;

/** 蛇形转驼峰 */
export function snakeToCamel(str: string): string;

/** 记录键名转换 */
export function convertRecordToCamel(record: Record<string, unknown>): Record<string, unknown>;

/** 表主键映射 */
export const TABLE_PRIMARY_KEYS: Record<string, string>;

export const importExportStorage: {
  /** 导出所有数据 */
  exportAll(): Promise<Record<string, unknown[]>>;

  /** 导入数据 */
  importData(
    data: Record<string, unknown[]>,
    strategy: "replace" | "merge" | "skip",
  ): Promise<Record<string, number>>;
};
```

#### elements.ts

元素存储。

```typescript
export class ElementStorage {
  /** 订阅变更通知 */
  subscribe(listener: () => void): () => void;

  /** 通知变更 */
  notify(): void;

  /** 获取元素库 */
  getLibrary(): Promise<ElementLibrary>;

  /** 获取单个元素 */
  getElement(elementId: string): Promise<StoryElement | undefined>;

  /** 获取所有元素 */
  getAllElements(): Promise<StoryElement[]>;

  /** 按类型获取元素 */
  getElementsByType(type: ElementType): Promise<StoryElement[]>;

  /** 创建元素 */
  createElement(type: ElementType, name: string, description?: string): Promise<StoryElement>;

  /** 更新元素 */
  updateElement(elementId: string, updates: Partial<StoryElement>): Promise<StoryElement>;

  /** 删除元素 */
  deleteElement(elementId: string): Promise<void>;
}

export const elementStorage: ElementStorage;
```

#### db.ts

数据库类型定义。

```typescript
export interface AutoSaveRecord {
  id: string;
  type: string;
  data: unknown;
  timestamp: number;
}

export interface ErrorLog {
  id?: number;
  message: string;
  stack?: string;
  timestamp: number;
  component?: string;
}

export interface SessionData {
  id: string;
  key: string;
  value: unknown;
  timestamp: number;
}
```

---

### 2.6.1 角色存储子目录 (storage/characters/)

#### parser.ts

角色数据库记录解析器。

```typescript
/** 解析角色数据库记录为 Character 对象 */
export function parseCharacter(record: Record<string, unknown>): Character;

/** 解析角色记录并加载服装数据 */
export function parseCharacterWithOutfits(record: Record<string, unknown>): Promise<Character>;

/** 批量解析角色记录并加载服装数据 */
export function parseCharactersWithOutfits(records: Record<string, unknown>[]): Promise<Character[]>;
```

#### outfit-manager.ts

角色服装管理。

```typescript
/** 获取指定角色的服装列表 */
export function getOutfitsForCharacter(characterId: string): Promise<CharacterOutfit[]>;

/** 获取所有角色的服装映射 */
export function getAllOutfits(): Promise<Map<string, CharacterOutfit[]>>;

/** 构建服装保存的 SQL 语句列表 */
export function buildOutfitStatements(
  characterId: string,
  outfits: CharacterOutfit[],
): { sql: string; params: unknown[] }[];

/** 保存角色服装列表（事务方式） */
export function saveOutfitsForCharacter(characterId: string, outfits: CharacterOutfit[]): Promise<void>;

/** 更新服装图片 */
export function updateOutfitImage(outfitId: string, imageUrl: string, localImagePath?: string): Promise<void>;
```

#### json-schemas.ts

角色 JSON 容器解析器。

```typescript
/** 角色外观容器 */
export interface CharacterAppearanceContainer {
  avatarPath?: string;
  thumbnailPath?: string;
  previewPath?: string;
  generatedImage?: string;
  generatedVideo?: string;
  videoGenerationStatus?: string;
  videoGenerationTaskId?: string;
  imageGenerationPrompt?: string;
}

/** 角色生成容器 */
export interface CharacterGenerationContainer {
  prompt?: string;
  generationPrompt?: string;
  generationParams?: Record<string, unknown>;
}

/** 角色配置容器 */
export interface CharacterConfigContainer {
  appearance?: Record<string, unknown>;
  personality?: unknown[];
  traits?: unknown[];
}

/** 角色元数据容器 */
export interface CharacterMetaContainer {
  tags?: unknown[];
  outfits?: unknown;
}

/** 解析外观容器 JSON */
export function parseAppearanceContainer(raw: unknown): CharacterAppearanceContainer;

/** 解析生成容器 JSON */
export function parseGenerationContainer(raw: unknown): CharacterGenerationContainer;

/** 解析配置容器 JSON */
export function parseConfigContainer(raw: unknown): CharacterConfigContainer;

/** 解析元数据容器 JSON */
export function parseMetaContainer(raw: unknown): CharacterMetaContainer;
```

---

### 2.6.2 故事存储子目录 (storage/stories/)

#### relations.ts

故事关联数据查询。

```typescript
/** 获取指定故事的关联数据（角色、场景、Beat、元素） */
export function fetchStoryRelations(storyId: string): Promise<{
  characters: string[];
  scenes: string[];
  beats: Record<string, unknown>[];
  elementIds: string[];
  elementBindings: Record<string, unknown>;
}>;

/** 获取所有故事的关联数据映射 */
export function fetchAllStoryRelations(): Promise<Map<string, {
  characters: string[];
  scenes: string[];
  beats: Record<string, unknown>[];
  elementIds: string[];
  elementBindings: Record<string, unknown>;
}>>;
```

#### beat-transformer.ts

Beat 数据扁平化与 SQL 构建。

```typescript
/** 将 Beat 对象扁平化为数据库容器格式 */
export function flattenBeat(
  beat: Record<string, unknown>,
  now: number,
): {
  cameraContainer: Record<string, unknown>;
  generationContainer: Record<string, unknown>;
  metaContainer: Record<string, unknown> | null;
  createdAt: unknown;
  updatedAt: unknown;
};

/** 构建 Beat INSERT 语句 */
export function buildBeatInsert(
  beatId: string,
  storyId: string,
  index: number,
  beat: Record<string, unknown>,
  now: number,
): { sql: string; params: unknown[] };
```

---

### 2.6.3 元素存储子目录 (storage/elements/)

#### queries.ts

元素查询操作。

```typescript
/** 获取元素库（含自增编码） */
export function getLibrary(): Promise<ElementLibrary>;

/** 获取单个元素 */
export function getElement(elementId: string): Promise<StoryElement | undefined>;

/** 获取所有元素 */
export function getAllElements(): Promise<StoryElement[]>;

/** 按类型获取元素 */
export function getElementsByType(type: ElementType): Promise<StoryElement[]>;
```

#### commands.ts

元素写入操作。

```typescript
/** 创建元素 */
export function createElement(type: ElementType, name: string, description?: string): Promise<StoryElement>;

/** 更新元素（支持乐观锁） */
export function updateElement(elementId: string, updates: Partial<StoryElement>, version?: number): Promise<StoryElement>;

/** 删除元素（级联删除关联） */
export function deleteElement(elementId: string): Promise<void>;
```

#### json-schemas.ts

元素 JSON 容器解析器。

```typescript
/** 元素角色配置 */
export interface ElementCharacterConfig {
  gender?: string;
  age?: number;
  style?: string;
  personality?: string[];
  appearance?: {
    hairColor?: string;
    hairStyle?: string;
    eyeColor?: string;
    height?: string;
    build?: string;
    clothing?: string;
  };
}

/** 元素场景配置 */
export interface ElementSceneConfig {
  timeOfDay?: string;
  weather?: string;
  mood?: string;
  lighting?: string;
  style?: string;
}

/** 解析角色配置 JSON */
export function parseCharacterConfig(raw: unknown): StoryElement["characterConfig"] | undefined;

/** 解析场景配置 JSON */
export function parseSceneConfig(raw: unknown): StoryElement["sceneConfig"] | undefined;

/** 解析特征锚点 JSON */
export function parseFeatureAnchor(raw: unknown): ElementFeatureAnchor | undefined;

/** 解析参考图质量 JSON */
export function parseReferenceImageQuality(raw: unknown): ReferenceImageQuality | undefined;

/** 解析绑定关系 JSON */
export function parseBindings(raw: unknown): AssetBinding[];
```

---

### 2.6.4 场景存储子目录 (storage/scenes/)

#### json-schemas.ts

场景 JSON 容器解析器。

```typescript
/** 场景外观容器 */
export interface SceneAppearanceContainer {
  avatarPath?: string;
  thumbnailPath?: string;
  previewPath?: string;
  generatedImage?: string;
  generatedVideo?: string;
  videoGenerationStatus?: string;
  videoGenerationTaskId?: string;
  imageGenerationPrompt?: string;
  scenePath?: string;
  imageUrl?: string;
}

/** 场景氛围容器 */
export interface SceneAtmosphereContainer {
  mood?: string;
  timeOfDay?: string;
  weather?: string;
  setting?: string;
  location?: string;
  style?: string;
  elements?: unknown[];
  colors?: unknown[];
  lighting?: string;
}

/** 场景生成容器 */
export interface SceneGenerationContainer {
  prompt?: string;
  generationPrompt?: string;
  generationParams?: Record<string, unknown>;
}

/** 场景配置容器 */
export interface SceneConfigContainer {
  atmosphere?: string;
  camera?: Record<string, unknown>;
  props?: unknown[];
  tags?: unknown[];
  relatedCharacters?: unknown[];
}

/** 解析外观容器 JSON */
export function parseAppearanceContainer(raw: unknown): SceneAppearanceContainer;

/** 解析氛围容器 JSON */
export function parseAtmosphereContainer(raw: unknown): SceneAtmosphereContainer;

/** 解析生成容器 JSON */
export function parseGenerationContainer(raw: unknown): SceneGenerationContainer;

/** 解析配置容器 JSON */
export function parseConfigContainer(raw: unknown): SceneConfigContainer;
```

---

### 2.6.5 视频任务存储子目录 (storage/video-tasks/)

#### parser.ts

视频任务记录解析与 SQL 构建。

```typescript
/** 将时间戳标准化为 ISO 字符串（自动检测秒/毫秒级） */
export function normalizeTimestamp(value: unknown, fallbackSec: number): string;

/** 将时间值转为存储用秒级时间戳 */
export function toStorageTimestamp(value: unknown): number | null;

/** 将时间值转为存储用秒级时间戳，失败返回当前时间 */
export function toStorageTimestampOrNow(value: unknown): number;

/** 解析视频任务数据库记录 */
export function parseVideoTask(record: Record<string, unknown>): VideoTask;

/** 字段目标类型（固定列 / JSON 容器） */
export interface FixedColumnTarget { type: "fixed"; column: string }
export interface JsonContainerTarget { type: "json"; container: "config" | "provider" | "media_refs" | "tracking"; key: string }
export type FieldTarget = FixedColumnTarget | JsonContainerTarget;

/** 视频任务字段目标映射 */
export const fieldTargets: Record<string, FieldTarget>;

/** 构建 config JSON */
export function buildConfigJson(task: Partial<VideoTask>): string;

/** 构建 provider JSON */
export function buildProviderJson(task: Partial<VideoTask>): string;

/** 构建 media_refs JSON */
export function buildMediaRefsJson(task: Partial<VideoTask>): string;

/** 构建 tracking JSON */
export function buildTrackingJson(task: Partial<VideoTask>, createdAtSec?: number): string;

/** 构建 UPDATE SET 子句（支持固定列 + JSON 容器更新） */
export function buildUpdateSets(updates: Partial<VideoTask>): { sql: string; params: unknown[] };
```

#### bulk-operations.ts

视频任务批量操作。

```typescript
/** 批量写入视频任务（已存在则更新，不存在则插入） */
export function bulkPutVideoTasks(tasks: Partial<VideoTask>[]): Promise<void>;
```

#### json-schemas.ts

视频任务 JSON 容器解析器。

```typescript
/** 视频任务配置容器 */
export interface VideoTaskConfig {
  model?: string;
  prompt?: string;
  parameters?: string;
  template_id?: string;
  template_shots?: string;
  story_title?: string;
  beat_title?: string;
}

/** 视频任务提供商容器 */
export interface VideoTaskProvider {
  api_url?: string;
  api_endpoint?: string;
  provider_id?: string;
  provider_model_id?: string;
  provider_format?: string;
}

/** 视频任务媒体引用容器 */
export interface VideoTaskMediaRefs {
  fixed_image_url?: string;
  fixed_image_lock_type?: string;
  reference_video_url?: string;
  reference_video_mimicry_level?: string;
}

/** 视频任务追踪容器 */
export interface VideoTaskTracking {
  last_polled_at?: number;
  poll_count?: number;
  poll_failure_count?: number;
  recovery_attempts?: number;
  expires_at?: number;
  url_obtained_at?: number;
  url_ttl?: number;
}

/** 解析 config JSON */
export function parseConfig(raw: string | null | undefined): VideoTaskConfig;

/** 解析 provider JSON */
export function parseProvider(raw: string | null | undefined): VideoTaskProvider;

/** 解析 media_refs JSON */
export function parseMediaRefs(raw: string | null | undefined): VideoTaskMediaRefs;

/** 解析 tracking JSON */
export function parseTracking(raw: string | null | undefined): VideoTaskTracking;
```

---

### 2.7 网络 (network/)

#### types.ts

```typescript
/** 网络请求拦截器 */
export interface Interceptor {
  (request: RequestInit & { url?: string; endpoint?: string }, next: (request: RequestInit) => Promise<Response>): Promise<Response>;
}

/** 网络配置 */
export interface NetworkConfig {
  retry: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
  };
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    resetTimeout: number;
  };
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  timeout: {
    connectMs: number;
    readMs: number;
    totalMs: number;
  };
}
```

#### circuit-breaker.ts

```typescript
/** 熔断器状态 */
export type CircuitState = "closed" | "open" | "half-open";

/** 获取熔断器状态 */
export function getCircuitState(providerId: string): CircuitState;

/** 通过熔断器执行请求 */
export function executeThroughCircuit<T>(
  providerId: string,
  fn: () => Promise<T>,
): Promise<T>;

/** 手动重置熔断器 */
export function resetCircuit(providerId: string): void;
```

#### resilient-fetch.ts

```typescript
/** 弹性 Fetch 请求 */
export function resilientFetch(
  url: string,
  options?: RequestInit,
): Promise<Response>;
```

#### download-manager.ts

```typescript
/** 下载管理器 */
export const downloadManager: {
  /** 下载文件 */
  download(url: string, options?: {
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<Blob>;

  /** 批量下载 */
  downloadBatch(
    urls: string[],
    options?: {
      concurrency?: number;
      onProgress?: (completed: number, total: number) => void;
      signal?: AbortSignal;
    },
  ): Promise<Blob[]>;
};
```

#### retry-executor.ts

```typescript
/** 带重试执行 */
export function executeWithRetry<T>(
  fn: () => Promise<T>,
  category: "api" | "db" | "general",
  signal?: AbortSignal,
): Promise<T>;
```

#### network-monitor.ts

```typescript
/** 网络监控器 */
export const networkMonitor: {
  /** 是否在线 */
  isOnline(): boolean;

  /** 订阅网络状态变化 */
  onStatusChange(callback: (online: boolean) => void): () => void;

  /** 获取最近断线时间 */
  getLastOfflineTime(): number | null;
};
```

#### network.config.ts

```typescript
/** 网络配置 */
export const NETWORK_CONFIG: NetworkConfig;
```

#### profiles.ts

```typescript
/** 网络请求配置档案 */
export interface RequestProfile {
  retry: { maxRetries: number; baseDelay: number; maxDelay: number };
  timeout: { connectMs: number; readMs: number; totalMs: number };
  cache: { enabled: boolean; ttl: number };
}

/** 获取指定类型的请求配置档案 */
export function getRequestProfile(type: "api" | "download" | "upload"): RequestProfile;
```

#### request-lifecycle.ts

```typescript
/** 请求上下文 */
export interface RequestContext {
  id: string;
  type: string;
  endpoint: string;
  metadata: Record<string, unknown>;
  signal: { signal: AbortSignal };
  startTime: number;
}

/** 创建请求上下文 */
export function createRequest(options: { type: string; endpoint: string; metadata?: Record<string, unknown> }): RequestContext;

/** 标记请求开始 */
export function startRequest(context: RequestContext): void;

/** 标记请求完成 */
export function completeRequest(contextId: string): void;

/** 标记请求失败 */
export function failRequest(contextId: string, error?: Error): void;

/** 标记请求取消 */
export function cancelRequest(contextId: string): void;
```

#### interceptors/

##### lifecycle.interceptor.ts

请求生命周期拦截器，自动创建/完成/失败请求上下文。

```typescript
/** 请求生命周期拦截器 */
export const lifecycleInterceptor: Interceptor;
```

##### circuit-breaker.interceptor.ts

熔断器拦截器，在提供商熔断时返回 503。

```typescript
/** 熔断器拦截器 */
export const circuitBreakerInterceptor: Interceptor;
```

##### cache.interceptor.ts

GET 请求缓存拦截器，缓存 JSON 响应。

```typescript
/** 缓存拦截器（仅缓存 GET 请求的 JSON 响应，默认 TTL 60s，最大 100 条） */
export const cacheInterceptor: Interceptor;
```

##### retry.interceptor.ts

幂等请求重试拦截器。

```typescript
/** 重试拦截器（仅对幂等方法 GET/HEAD/PUT/DELETE 自动重试） */
export const retryInterceptor: Interceptor;
```

##### logging.interceptor.ts

请求日志拦截器。

```typescript
/** 日志拦截器（记录请求耗时与状态码） */
export const loggingInterceptor: Interceptor;
```

---

### 2.8 数据库 (database/)

#### media-asset-repository.ts

媒体资产仓库。

```typescript
export const mediaAssetRepository: {
  /** 查找所有媒体资产 */
  findAll(): Promise<Result<MediaAsset[]>>;

  /** 根据 ID 查找媒体资产 */
  findById(id: string): Promise<Result<MediaAsset | null>>;

  /** 创建媒体资产 */
  create(input: Partial<MediaAsset> & { id: string }): Promise<Result<MediaAsset>>;

  /** 更新媒体资产 */
  update(input: Partial<MediaAsset> & { id: string }): Promise<Result<MediaAsset>>;

  /** 删除媒体资产 */
  delete(id: string): Promise<Result<void>>;
};
```

---

### 2.9 监控 (monitoring/)

#### memory-leak-detector.ts

```typescript
interface LeakSnapshot {
  timestamp: number;
  domNodes: number;
  eventListeners: number;
  jsHeapUsedMB: number;
  jsHeapTotalMB: number;
  timers: number;
}

interface LeakAlert {
  type: "dom_growth" | "heap_growth" | "timer_leak" | "listener_leak";
  message: string;
  details: Record<string, unknown>;
  timestamp: number;
}

class MemoryLeakDetector {
  /** 启动内存泄漏检测 */
  start(): void;

  /** 停止内存泄漏检测 */
  stop(): void;

  /** 注册定时器（用于跟踪） */
  registerTimer(id: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>, type: "timeout" | "interval"): void;

  /** 注销定时器 */
  unregisterTimer(id: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>): void;

  /** 订阅泄漏告警 */
  onAlert(listener: (alert: LeakAlert) => void): () => void;

  /** 获取所有快照 */
  getSnapshots(): LeakSnapshot[];

  /** 获取最新快照 */
  getLatestSnapshot(): LeakSnapshot | null;

  /** 是否正在运行 */
  isRunning(): boolean;
}

export const memoryLeakDetector: MemoryLeakDetector;
export type { LeakSnapshot, LeakAlert };
```

#### performance-monitor.ts

```typescript
type MetricType = "db_query" | "db_transaction" | "api_call" | "video_generation" | "cache_operation" | "sync";

interface PerformanceMetric {
  type: MetricType;
  name: string;
  durationMs: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface PerformanceThreshold {
  warningMs: number;
  criticalMs: number;
}

class PerformanceMonitor {
  constructor(thresholds?: Partial<Record<MetricType, PerformanceThreshold>>);

  /** 测量同步/异步操作耗时 */
  measure<T>(type: MetricType, name: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T>;
  measure<T>(type: MetricType, name: string, fn: () => T, metadata?: Record<string, unknown>): T;

  /** 订阅性能告警 */
  onAlert(listener: (metric: PerformanceMetric, level: "ok" | "warning" | "critical") => void): () => void;

  /** 获取指标列表 */
  getMetrics(type?: MetricType, limit?: number): PerformanceMetric[];

  /** 获取统计信息 */
  getStats(type?: MetricType): {
    count: number;
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
  };

  /** 清空指标 */
  clear(): void;
}

export const performanceMonitor: PerformanceMonitor;
export type { PerformanceMetric, MetricType, PerformanceThreshold };
```

---

### 2.10 服务端工具 (server/)

#### api-utils.ts

```typescript
/** API 错误 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status?: number);
}

/** 安全解析 JSON 请求体 */
export function safeParseJson(request: Request): Promise<Record<string, unknown>>;

/** 清洗错误消息（移除路径、API Key 等敏感信息） */
export function sanitizeErrorMessage(error: unknown): string;

/** 验证必填字段 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  fields: string[],
): string | null;

/** 检查 URL 是否允许（防止 SSRF） */
export function isUrlAllowed(url: string): boolean;

/** 掩码 API Key */
export function maskApiKey(apiKey: string): string;
```

---

### 2.11 视频工具 (video-utils/)

```typescript
// 从 @/shared/video-utils 代理导出
export type { VideoCodec, AudioCodec, ContainerFormat, VideoCodecInfo } from "@/shared/video-utils/video-codec";
export { detectVideoCodec, getVideoCodecLabel, getContainerLabel } from "@/shared/video-utils/video-codec";
export { isCodecSupportedByProvider } from "@/shared/video-utils/codec-check";
export { extractVideoFrames, dataUrlToFile } from "@/shared/video-utils/video-frame-extractor";
export type { ExtractedFrames } from "@/shared/video-utils/video-frame-extractor";
```

---

### 2.12 其他基础设施文件

#### api-config/provider-templates-data.ts

提供商模板数据代理导出（纯 re-export）。

```typescript
export { PROVIDER_TEMPLATES, type ProviderTemplate } from "../model-registry";
```

#### builtin-model-capabilities.ts

内置模型能力数据代理导出（纯 re-export）。

```typescript
export { BUILTIN_MODEL_CAPABILITIES } from "./model-registry";
```

#### api-config-facade.ts

API 配置统一门面，聚合所有 AI 配置相关导出。

```typescript
export { loadConfig, saveConfig, getDefaultConfig, addProvider, removeProvider, setCapabilityMapping, type ApiConfig, type ApiCapability } from "./ai-providers/api-config";
export type { ProviderConfig, ModelConfig } from "./ai-providers/api-config/types";
export { PROVIDER_TEMPLATES, createProviderFromTemplate, getAllTemplates, getAllTemplatesAsync, loadPluginTemplates, ensurePluginTemplatesLoaded, isPluginTemplatesLoaded, getTemplateWithPlugins } from "./ai-providers/api-config/templates";
export type { PluginProviderTemplate } from "./ai-providers/api-config/templates";
export { detectProvider, detectAllProviders, validateApiKey, loadPluginDetectionRules } from "./ai-providers/api-config/detect";
export type { DetectResult, DetectAllResult } from "./ai-providers/api-config/detect";
export { checkConfigStatus, type ConfigStatus } from "./ai-providers/api-config/init";
```
