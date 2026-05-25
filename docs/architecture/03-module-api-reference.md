# 模块 API 参考

> 更新日期: 2026-05-18

## 1. video 模块

### 1.1 video/task-management 子域

**入口**: `src/modules/video/task-management/index.ts`

| 导出 | 类型 | 说明 |
|------|------|------|
| `VideoTask` | Type | 视频任务完整类型 (Zod 推导) |
| `VideoTaskStatus` | Type | 任务状态枚举类型 (6 种) |
| `TransitionError` | Class | 非法状态转换错误 (AppError 子类) |
| `useVideoTaskManager` | Hook | 核心任务管理 Hook |
| `useVideoTaskStore` | Store | Zustand Store 实例 |
| `useVideoTasks` | Hook | 便捷：获取全部任务 |
| `useFailedVideoTasks` | Hook | 便捷：获取失败任务 |
| `useRecoverVideo` | Hook | 便捷：恢复视频 |
| `useCleanExpiredTasks` | Hook | 便捷：清理过期任务 |
| `useStartBackgroundRecovery` | Hook | 便捷：启动后台恢复 |
| `VideoTaskManager` | Component | 任务管理主组件 |
| `VideoTaskManagerInitializer` | Component | 初始化组件 |
| `VideoTaskManagerUI` | Component | UI 包装组件 |
| `buildTrackingInfo` | Function | 构建云端追踪信息 |
| `copyTrackingInfoToClipboard` | Async Function | 复制追踪信息到剪贴板 |
| `openTaskQueryLink` | Function | 打开云控制台查询链接 |

### 1.2 video/task-management/domain 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `TaskMachine` | Object | 状态机: canTransition, transition, isPollable, isTerminal |
| `TransitionError` | Class | 非法转换错误 (from, to 属性) |
| `TaskEvent` | Type | 领域事件联合类型 (8 种) |
| `pollResultSchema` | Zod Schema | 轮询结果验证 |
| `mapApiStatus` | Function | API 状态→领域状态映射 |
| `checkTimeout` | Function | 超时策略评估 |
| `checkExpiration` | Function | 过期策略评估 |
| `evaluatePolicies` | Function | 策略引擎聚合评估 |

### 1.3 video/cache 子域

| 导出 | 说明 |
|------|------|
| `getVideoUrlWithCache(taskId, url)` | 获取视频 URL (优先本地缓存) |
| `checkCachedVideo(taskId)` | 检查本地缓存状态 |
| `removeCachedVideo(taskId)` | 删除本地缓存 |
| `cacheVideoBlob(taskId, blob)` | 缓存视频 Blob |
| `getCacheStats()` | 获取缓存统计 |

### 1.4 video/recovery 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `recoverVideoByTaskId(taskId)` | Function | 通过任务 ID 恢复视频 |
| `saveVideoTask(task)` | Function | 保存任务记录 |
| `getFailedTasks()` | Function | 获取失败任务列表 |
| `getTaskById(taskId)` | Function | 通过 ID 获取任务 |
| `startBackgroundRecovery()` | Function | 启动后台恢复 |
| `cleanExpiredTasks()` | Function | 清理过期任务 |
| `getAllTaskHistory()` | Function | 获取全部任务历史 |
| `SmartRetryEngine` | Class | 智能重试决策引擎 |
| `smartRetryEngine` | Instance | 默认重试引擎实例 |
| `createRetryEngine(config)` | Function | 创建自定义配置的重试引擎 |

## 2. story 模块

### 2.1 story/planning 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `useStories` | Hook | 故事列表 CRUD |
| `useStoryPlanner` | Hook | 故事规划器 |
| `useStorySaver` | Hook | 故事自动保存 |
| `storyService` | Service | 故事服务 (create, update, delete, list) |
| `planStory` | Function | 故事规划 |
| `checkTextApiConfig` | Function | 检查文本 API 配置 |
| `DEFAULT_STORY` | Const | 默认故事模板 |
| `genres` | Const | 故事类型列表 |
| `tones` | Const | 故事基调列表 |
| `beatTypes` | Const | 分镜类型列表 |

### 2.2 story/beat-editor 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `useStoryState` | Hook | 故事状态管理 |
| `useAssetLoader` | Hook | 资产加载 |
| `BeatDetailEditor` | Component | 分镜详情编辑器 (拆分为 6 个 sections) |
| `BeatOverviewCard` | Component | 分镜概览卡片 (使用 SafeImage) |
| `ElementBindingPanel` | Component | 元素绑定面板 (通过 DI 获取 elementManager) |
| `ProfessionalModeEditor` | Component | 专业模式编辑器 |
| `SortableBeatList` | Component | 可排序分镜列表 |

### 2.3 story/generation 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `useAIGeneratorBase` | Hook | AI 生成器基类 |
| `useBatchGeneration` | Hook | 批量生成 |
| `useFramePairGeneration` | Hook | 帧对生成 |
| `useKeyframeGeneration` | Hook | 关键帧生成 |
| `useVideoGeneration` | Hook | 视频生成 |
| `BatchStrategy` | Const | 批量策略常量 |
| `GenerationLevel` | Const | 生成级别常量 |

### 2.4 story/template 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `createTemplateFromBeats` | Function | 从分镜创建模板 |
| `applyTemplateToBeats` | Function | 模板应用到分镜 |
| `compareVersions` | Function | 版本比较 |
| `formatVersionTime` | Function | 版本时间格式化 |
| `TemplateManagerDialog` | Component | 模板管理对话框 |
| `VersionDialog` | Component | 版本对话框 |
| `AssetPicker` | Component | 资产选择器 |

### 2.5 story/prompt-editor 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `usePromptEditor` | Hook | 提示词编辑器 |
| `PromptEditor` | Component | 提示词编辑器组件 |
| `PromptFloatingBall` | Component | 浮动球组件 |
| `promptEditorService` | Service | 提示词编辑器服务 |

## 3. character 模块

| 导出 | 类型 | 说明 |
|------|------|------|
| `useCharacters` | Hook | 角色 CRUD |
| `useCharacterImage` | Hook | 角色图片生成/上传 |
| `useCharacterCRUD` | Hook | 角色 CRUD 操作 |
| `useOutfitManagement` | Hook | 服装管理 |
| `characterService` | Service | 角色服务层 |
| `normalizeGender` | Function | 性别字段标准化 (从 storage 迁移) |

## 4. scene 模块

| 导出 | 类型 | 说明 |
|------|------|------|
| `useScenes` | Hook | 场景 CRUD |
| `useSceneImage` | Hook | 场景图片生成/上传 |
| `useSceneList` | Hook | 场景列表 |
| `sceneService` | Service | 场景服务层 |

## 5. shot 模块

| 导出 | 类型 | 说明 |
|------|------|------|
| `performConsistencyCheck` | Function | 一致性检查 (API 路由使用) |
| `validateFeatureAnchoringConfigFull` | Function | 特征锚定配置验证 |
| `validateNoFrameBindingParams` | Function | 无帧绑定参数验证 |
| `checkCharacterReferences` | Function | 角色引用检查 (删除前校验) |
| `checkSceneReferences` | Function | 场景引用检查 (删除前校验) |
| `checkElementReferences` | Function | 元素引用检查 (删除前校验) |
| `SHOT_SIZE_OPTIONS` | Const | 镜头尺寸选项 |
| `CAMERA_MOVEMENT_OPTIONS` | Const | 镜头运动选项 |
| `CAMERA_ANGLE_OPTIONS` | Const | 镜头角度选项 |
| `elementManager` | Service | 元素管理器 (通过 DI 获取) |
| `validateReferenceImageQuality` | Function | 参考图片质量验证 |
| `buildFeatureAnchoringConfig` | Function | 构建特征锚定配置 |
| `referenceEngine` | Service | 参考引擎 (通过 DI 获取) |

## 6. prompt 模块

| 导出 | 类型 | 说明 |
|------|------|------|
| `videoPromptService` | Service | 视频提示词服务 |
| `scenePromptService` | Service | 场景提示词服务 |
| `characterPromptService` | Service | 角色提示词服务 |
| `promptBuilder` | Service | 提示词构建器 |
| `quickModeBuilder` | Service | 快速模式构建器 |

## 7. asset 模块

| 导出 | 类型 | 说明 |
|------|------|------|
| `useAssetImportExport` | Hook | 资产导入导出 |
| `useMediaAssets` | Hook | 媒体资产管理 |
| `useProjectExport` | Hook | 项目导出 |
| `asaExportService` | Service | ASA 格式导出 (使用 isAllowedImageUrl 验证) |

## 8. sync 模块

| 导出 | 类型 | 说明 |
|------|------|------|
| `performSync` | Function | 执行同步 |
| `getSyncStatus` | Function | 获取同步状态 |
| `getSyncConfig` | Function | 获取同步配置 |
| `setConflictCallback` | Function | 设置冲突回调 |
| `recordChange` | Function | 记录变更 |
| `incrementVectorClock` | Function | 递增向量时钟 |
| `isVectorClockConflict` | Function | 检测向量时钟冲突 |
| `DEFAULT_SYNC_CONFIG` | Const | 默认同步配置 |
| `SyncConflictPanel` | Component | 冲突解决面板 |
| `SyncSettingsPanel` | Component | 同步设置面板 |
| `SyncStatusIndicator` | Component | 同步状态指示器 |
| `createVectorClock` | Function | 创建向量时钟 |
| `mergeVectorClocks` | Function | 合并向量时钟 |
| `compareVectorClocks` | Function | 比较向量时钟 |
| `initSyncEngine` | Function | 初始化同步引擎 (条件注册 changeTracker) |
| `updateSyncConfig` | Function | 更新同步配置 (动态注册 changeTracker) |

## 9. shared 层

### 9.1 通用 Hooks

| Hook | 说明 |
|------|------|
| `useDirtyState` | 脏状态追踪 |
| `useMemoryMonitor` | 内存监控 |
| `useNetworkMonitor` | 网络监控 |
| `useDebouncedState` | 防抖状态 |
| `useKeyboardShortcuts` | 键盘快捷键 |

### 9.2 通用 UI 组件

| 组件 | 说明 |
|------|------|
| `SafeImage` | 安全图片组件 (Next/Image 封装, 支持 data:/blob:/file:) |
| `Sidebar` | 侧边栏导航 |
| `ErrorBoundary` | 错误边界 |
| `Toast` | 消息提示 |
| `SearchDialog` | 全局搜索 |
| `ModelSelector` | 模型选择器 |
| `VirtualList` | 虚拟滚动列表 |
| `CrashRecoveryDialog` | 崩溃恢复对话框 |
| `DebugOverlay` | 调试覆盖层 |

### 9.3 通用工具

| 工具 | 说明 |
|------|------|
| `validateExternalUrl(url)` | 验证外部 URL 安全性 |
| `isAllowedImageUrl(url)` | 图片 URL 安全检查 (支持本地协议) |
| `isAllowedVideoUrl(url)` | 视频 URL 安全检查 (支持本地协议) |
| `isElectron()` | Electron 环境检测 (结果缓存) |
| `fileDownload` | 文件下载工具 |
| `resolveImageUrl` | 图片 URL 解析 |
| `performance` | 性能工具 |
| `utils` | 通用工具函数 |

### 9.4 全局服务

| 服务 | 说明 |
|------|------|
| `appStore` | 全局 Zustand Store |
| `eventBus` | 事件总线 (发布/订阅) |
| `errorLogger` | 错误日志 (warn/error/info/debug/fatal) |
