# Video Module

## 职责

视频任务管理、缓存、恢复、编解码检测、帧提取、模板、追踪、导出

---

## 子域结构

本模块采用子域架构，包含 4 个内部子域：

| 子域 | 路径 | 职责 |
|------|------|------|
| `task-management` | [task-management/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/video/task-management/) | 任务状态管理、UI 展示、任务追踪 |
| `cache` | [cache/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/video/cache/) | 视频 Blob 缓存、内存/IndexedDB 双层缓存 |
| `recovery` | [recovery/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/video/recovery/) | 视频验证、重复检测、智能重试、恢复工作流 |
| `utils` | [utils/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/video/utils/) | 编解码检测、帧提取、文件导出、视频模板 |

---

## 公共 API（index.ts）

### 任务管理子域
- `VideoTask` — 视频任务类型 (type)
- `useVideoTaskManager` — 视频任务管理 Hook
- `useVideoTaskStore` — 视频任务 Store
- `useVideoTasks` — 获取视频任务列表 Hook
- `useFailedVideoTasks` — 获取失败任务 Hook
- `useRecoverVideo` — 恢复视频 Hook
- `useCleanExpiredTasks` — 清理过期任务 Hook
- `useStartBackgroundRecovery` — 启动后台恢复 Hook
- `buildTrackingInfo` — 构建追踪信息
- `VideoTaskManager` — 视频任务管理器组件
- `VideoTaskManagerInitializer` — 任务管理器初始化组件
- `VideoTaskManagerUI` — 任务管理器 UI 组件

### 缓存子域
- `useVideoCacheStats` — 缓存统计 Hook
- `cacheVideoBlob` — 缓存视频 Blob
- `getVideoUrlWithCache` — 带缓存的视频 URL 获取
- `getCacheStats` — 获取缓存统计
- `revokeObjectURL` — 释放 Object URL
- `cacheImageBlob` — 缓存图片 Blob
- `getCachedImagePath` — 获取缓存图片路径
- `getImageUrlWithCache` — 带缓存的图片 URL 获取
- `removeCachedImage` — 移除缓存图片
- `cleanExpiredImageCache` — 清理过期图片缓存
- `getImageCacheStats` — 获取图片缓存统计
- `recoverUncachedImages` — 恢复未缓存的图片

### 恢复子域
- `VideoVerificationResult` — 视频验证结果类型 (type)
- `VideoVerificationDetails` — 视频验证详情类型 (type)
- `RetryDecision` — 重试决策类型 (type)
- `VideoRecoveryLog` — 视频恢复日志类型 (type)
- `VideoTaskRecoveryInfo` — 任务恢复信息类型 (type)
- `DuplicateCheckResult` — 重复检查结果类型 (type)
- `RetryConfig` — 重试配置类型 (type)
- `verifyVideoUrl` — 验证视频 URL
- `verifyMultipleVideos` — 批量验证视频
- `checkForDuplicateVideos` — 检查重复视频
- `findSimilarTasks` — 查找相似任务
- `smartRetryEngine` — 智能重试引擎实例
- `createRetryEngine` — 创建重试引擎
- `getTaskRecoveryInfo` — 获取任务恢复信息
- `performIntelligentRecovery` — 执行智能恢复
- `checkForTokenWaste` — 检查 Token 浪费
- `recoverVideoByTaskId` — 按任务 ID 恢复视频
- `saveVideoTask` — 保存视频任务

### 工具子域
- `detectVideoCodec` — 检测视频编解码器
- `isCodecSupportedByProvider` — 检查编解码器是否被提供商支持
- `extractVideoFrames` — 提取视频帧
- `downloadJSONFile` — 下载 JSON 文件
- `videoTemplates` — 视频模板列表
- `templateCategories` — 模板分类列表
- `getTemplatesByCategory` — 按分类获取模板
- `applyVideoTemplate` — 应用视频模板
- `VideoTemplate` — 视频模板类型 (type)

---

## 依赖

- `@/domain/schemas` - VideoTask 类型
- `@/infrastructure/ai-providers` - 视频生成 API
- `@/infrastructure/storage` - 视频缓存/任务持久化

---

## 边界约束

⚠️ **重要约束**：
- 子域之间只能通过各自的 `index.ts` 导出的 API 通信
- 禁止直接引用其他子域的内部文件（如 `../recovery/services/video-recovery-service.ts`）
- 所有跨子域引用必须通过 `../subdomain` 导入
- `cache` 和 `utils` 子域是最底层，不依赖其他子域

---

## AI 维护指南

本模块的详细 AI 重构规范请参见：[.ai/modules/video.md](../../../.ai/modules/video.md)

### 快速参考

- 禁止导入路径：`@/types/*`, `@/lib/*`, `@/modules/*/*/*`
- 类型必须从：`@/domain/schemas` 导入
- 使用 Result 模式处理异步操作
- 错误处理使用：`@/shared/error-handler`
