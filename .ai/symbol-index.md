# Symbol Index

Generated: 2026-07-13

> 本文件为目录树 + 模块一句话描述，用于 AI 工具快速定位代码。
> 详细契约见各模块 `MODULE.md` 与 `contract.json`。

---

## src/app/ — 页面层（Next.js App Router 风格）

### 顶层
- `layout.tsx` — 根布局，挂载 ClientProviders / SidebarWithSearch
- `page.tsx` — 首页入口
- `ClientProviders.tsx` — 客户端 Provider 组合（DI、Theme、Toast、Migration）
- `MigrationInitializer.tsx` — 数据库迁移初始化器
- `SidebarWithSearch.tsx` — 带搜索的侧栏
- `globals.css` — 全局样式 + 设计 token + 5 套主题
- `not-found.tsx` — 404 页面
- `favicon.ico` — 站点图标

### asset-library/ — 资产库页面
- `page.tsx` — 资产库主页
- `useAssetLibraryActions.ts` — 资产库动作聚合 hook
- `useAssetLibraryPage.ts`（hooks/）— 页面级状态
- `AssetCardGrid.tsx` / `AssetCards.tsx` — 卡片网格
- `AssetCollectionDialogs.tsx` / `AssetEditDialog.tsx` — 集合与编辑对话框
- `AssetToolbar.tsx` / `AssetUploadSection.tsx` — 工具栏与上传区
- `asset-library-shared.ts` — 共享常量与类型

### characters/ — 角色管理页面
- `page.tsx` — 角色主页
- `hooks/useCharacterPage.ts` — 页面状态
- `CharacterEditor.tsx` — 角色编辑器
- `CharacterList.tsx` — 角色列表

### coming-soon/ — 占位页面（9 个未实现功能）
- `AgentPage.tsx` / `ComposerPage.tsx` / `LoginPage.tsx` / `MobilePage.tsx`
- `PluginsPage.tsx` / `StoryPage.tsx` / `TemplateMarketPage.tsx`
- `WorkflowPage.tsx` / `WorkspacePage.tsx`

### quick-generate/ — 快速生成页面
- `page.tsx` — 快速生成主页
- `hooks/useQuickGeneratePage.ts` — 页面状态
- `QuickGenerateForm.tsx` — 表单
- `QuickGenerateHistory.tsx` — 历史记录
- `QuickGenerateState.ts` / `quick-generate-reducer.ts` — 状态与 reducer
- `TaskResultPanel.tsx` — 任务结果面板
- `AdvancedSettingsCard.tsx` — 高级设置卡片
- `TemplateSelectDialog.tsx` — 模板选择对话框

### scenes/ — 场景管理页面
- `page.tsx` — 场景主页
- `hooks/useScenesPage.ts` — 页面状态
- `components/SceneList.tsx` — 场景列表

### settings/ — 设置页面（插件、API 配置）
- `page.tsx` — 设置主页
- `hooks/useSettingsPage.ts` — 页面状态
- `ApiConfigPanel.tsx` — API 配置面板
- `ProviderCard.tsx` / `ProviderForm.tsx` — Provider 卡片与表单
- `PluginList.tsx` / `PluginDetail.tsx` / `plugin-manager.tsx` — 插件列表/详情/管理
- `plugin-add-form.tsx` / `plugin-creator.tsx` — 插件新增与创建器
- `plugin-api.ts` / `plugin-creator-api.ts` / `plugin-creator-types.ts` — 插件 API 与类型
- `plugin-schema-viewer.tsx` / `plugin-spec-viewer.tsx` — Schema / Spec 查看器
- `PluginBasicInfo.tsx` / `PluginApiConfig.tsx` / `PluginModelDefs.tsx`
- `PluginPreviewExport.tsx` / `PluginRequestFormat.tsx` / `PluginResponseFormat.tsx`
- `PluginUrlRules.tsx` / `ModelMappingSection.tsx` / `ModelParams.tsx`

### story/ — 故事与分镜页面
- `page.tsx` — 故事主页
- `StoryProvider.tsx` — 故事上下文 Provider
- `StoryHeader.tsx` — 故事头部
- `SwitchConfirmDialog.tsx` — 切换确认对话框
- `story-context-types.ts` — 上下文类型
- `hooks/useStoryPage.ts` — 页面状态
- `useStoryActions.ts` — 故事动作
- `useStoryPersistence.ts` — 持久化
- `useStoryVideo.ts` — 视频状态
- `beat/$beatId/` — Beat 详情子路由
  - `page.tsx` — Beat 详情入口
  - `BeatDetailClient.tsx` — 客户端组件
  - `BeatDetailsTab.tsx` / `BeatTechTab.tsx` / `BeatVideoTab.tsx` — 三个 Tab
  - `BeatVideoPreview.tsx` — 视频预览
  - `use-beat-detail.ts` / `use-beat-detail-actions.ts` — Beat 详情 hooks

### video-tasks/ — 视频任务页面
- `page.tsx` — 视频任务主页
- `hooks/useVideoTasksPage.ts` — 页面状态

### hooks/ — 应用级 hooks
- `useHomePage.ts` — 首页状态

---

## src/modules/ — 业务模块层

### asset/ — 资产管理模块
- `MODULE.md` / `index.ts` — 模块契约与导出
- `asset-library/` — 资产库服务（asa-export-service.ts）
- `media-assets/` — 媒体资产
- `import-export/` — 导入导出
- `hooks/` — use-import-export / use-media-assets / use-project-export
- `presentation/` — BatchOperations / BatchProgressDialog / MediaExporter / ProjectExportImport / VariantGenerator

### character/ — 角色模块
- `MODULE.md` / `index.ts` / `constants.ts`
- `hooks/` — use-character-crud / use-character-image / use-characters / use-outfit-management
- `services/` — character-service
- `presentation/` — CharacterListItem / OutfitDialog

### persistence/ — 持久化模块
- `MODULE.md` / `index.ts` / `contract.json`
- `hooks/` — use-auto-save / use-persistence-guard
- `services/` — transactional-delete（级联删除）

### prompt/ — 提示词模块
- `MODULE.md` / `index.ts`
- `base/` — 基础 prompt
- `builder/` — prompt-builder / quick-mode / story-plan
- `beat-image/` — Beat 图像 prompt
- `character/` — 角色提示词服务
- `scene/` — 场景提示词服务
- `server-prompts/` — 服务端 prompt 服务
- `video/` — 视频提示词（enhanced / professional / quick / single-beat）
- `presentation/` — ModelSelector

### scene/ — 场景模块
- `MODULE.md` / `index.ts` / `constants.ts`
- `hooks/` — use-scene-crud / use-scene-image / use-scenes
- `services/` — scene-service
- `presentation/` — SceneListItem

### shot/ — Shot 级能力模块
- `MODULE.md` / `index.ts`
- `consistency-check/` — 一致性检查（config-check / consistency-check / cross-shot-consistency）
- `element-binding/` — 元素绑定（element-manager / useElementBinding）
- `feature-extraction/` — 特征提取（feature-anchoring / feature-extraction）
- `reference-check/` — 引用检查（reference-check-service / reference-engine）
- `shot-generation/` — Shot 生成（dynamic-few-shot / shot-params / shot-validator / story-generation-pipeline / story-plan-parser / story-plan-prompt）
- `shot-instruction/` — 镜头指令（camera-consistency-validator / shot-instruction-service）
- `shot-reference/` — Shot 引用（shot-reference-service / reference-engine）

### story/ — 故事与分镜核心业务模块
- `MODULE.md` / `index.ts`
- `beat-editor/` — Beat 编辑器
  - `presentation/BeatDetailEditor.tsx` — 主编辑器（已拆分）
  - `presentation/BeatDetailView.tsx` / `BeatListView.tsx` / `SortableBeatList.tsx`
  - `presentation/BeatGenerationPanel.tsx` / `BeatPromptPanel.tsx`
  - `presentation/BeatUploadPanel.tsx` / `BeatNavigation.tsx` / `BeatOverviewCard.tsx`
  - `presentation/ElementBindingPanel.tsx` / `ProfessionalModeEditor.tsx`
  - `presentation/sections/` — BasicInfoSection / BeatHeader / BeatFooter / GenerateTabContent / SettingsTabContent / ShotInstructionSection
  - `hooks/` — useAssetLoader / useStoryState
- `generation/` — 生成能力
  - `hooks/` — useAIGeneratorBase / useBatchGenerator / useFramePairGenerator / useKeyframeGenerator / useVideoGenerator / useUploadHandlers / useFrameUploadHandlers
  - `presentation/` — FramePairStepContent / KeyframeChainVisualizer / KeyframePanel / KeyframeStepContent / PromptPreview / ReferenceVideoUploader / ShotGenerationPanel / ShotReferenceConfig / StepIndicator / VideoStepContent
  - `services/` — beat-chain-generator / beat-frame-generator / beat-video-generator / frame-prompt-service / storyboard-generation-service / style-guide-service / video-generation-mode / video-url-sync
- `planning/` — 故事规划
  - `hooks/` — use-stories / useStoryPlanner / useStorySaver
  - `services/` — story-planning-service / story-service
  - `story-constants.ts`
- `prompt-editor/` — 提示词编辑器
  - `hooks/` — use-prompt-editor
  - `presentation/` — PromptEditor / PromptFloatingBall
  - `services/` — prompt-editor-service
- `template/` — 模板与版本
  - `presentation/` — AssetPicker / TemplateCard / TemplateManagerDialog / VersionDialog
  - `services/` — storyboard-template / version-control
  - `story-templates.ts`

### sync/ — 同步模块
- `MODULE.md` / `index.ts`
- `engine/` — 同步引擎核心
  - `engine.ts` / `sync-engine-class.ts` — SyncEngine 类
  - `changelog.ts` — 变更日志
  - `conflict-resolution.ts` — 冲突解决
  - `entity-mapping.ts` / `remote-changes.ts` / `server-store.ts`
  - `sync-protocol.ts` / `types.ts`
- `presentation/` — ConflictResolutionSection / ServerConfigSection / SyncConflictPanel / SyncSettingsPanel / SyncStatusIndicator / SyncStatusSection

### video/ — 视频任务管理模块
- `MODULE.md` / `index.ts`
- `cache/` — 视频缓存（image-cache / video-cache / video-cache-service / use-video-cache）
- `recovery/` — 视频恢复（duplicate-detection-service / smart-retry-engine / video-intelligent-recovery-service / video-recovery-service / video-verification-service）
- `task-management/` — 任务管理 CQRS
  - `domain/` — policies（expiration / policy-engine / timeout）/ task-events / task-machine / task-schema
  - `hooks/` — useVideoTaskState / useVideoTaskQueries / useVideoTaskCommands / useVideoTaskPolling / useVideoTaskManager

---

## src/shared-logic/ — 零依赖逻辑层（纯函数，零外部依赖）

### 顶层
- `index.ts` — 顶层 barrel

### prompt/ — Prompt 生成
- `prompt-engine.ts` — prompt 引擎
- `prompt-service.ts` — prompt 服务

### shot/ — Shot 级逻辑
- `consistency-check.ts` — 一致性检查
- `reference-check.ts` — 引用检查
- `reference-engine.ts` — 引用引擎
- `visual-consistency-check.ts` — 视觉一致性检查

### story/ — Story 级逻辑
- `story-service.ts` — 故事服务
- `storyboard-generation.ts` — 分镜生成

### video/ — Video 级逻辑
- `video-task-params.ts` — 视频任务参数
- `video-tracker.ts` — 视频追踪
- `video-recovery.ts` — 视频恢复

---

## src/domain/ — 领域层（纯类型与契约，零外部依赖）

### ports/ — Port 接口（依赖倒置）
- `ai-provider-port.ts` — AI Provider 端口
- `element-manager-port.ts` / `element-storage-port.ts` — 元素管理
- `file-storage-port.ts` — 文件存储
- `media-asset-repository-port.ts` — 媒体资产仓储
- `reference-engine-port.ts` — 引用引擎
- `storage-port.ts` — 存储端口
- `sync-port.ts` — 同步端口
- `template-storage-port.ts` — 模板存储
- `version-storage-port.ts` — 版本存储
- `index.ts` — barrel

### schemas/ — Zod schema 定义
- `api.ts` — API 请求/响应 schema
- `character.ts` — 角色 schema
- `media.ts` — 媒体 schema
- `scene.ts` — 场景 schema
- `shot-system.ts` — Shot 系统 schema
- `story.ts` — 故事 schema
- `index.ts` — barrel

### services/ — 领域服务
- `beat-workflow-service.ts` — Beat 工作流
- `reference-check.ts` — 引用检查
- `reference-resolver.ts` — 引用解析
- `story-generation-service.ts` — 故事生成
- `index.ts` — barrel

### types/ — 类型定义
- `cloud-provider.ts` — 云 Provider 类型
- `electron-api.ts` — Electron API 类型
- `error-codes.ts` — 错误码（统一大写）
- `result.ts` — Result 类型
- `sync.ts` — 同步类型
- `video-model.ts` — 视频模型
- `index.ts` — barrel

### utils/ — 领域工具
- `beat-prompt-builder.ts` — Beat prompt 构造
- `frame-pair-accessors.ts` — 帧对访问器
- `prompt-vocabulary.ts` — prompt 词汇表
- `shot-prompt.ts` — Shot prompt
- `index.ts` — barrel

### video/ — 视频领域
- `task-state.ts` — 任务状态机

---

## src/shared/ — 共享工具层（代理导出 + 通用 UI）

### 顶层
- `app-store.ts` — 全局 Zustand store
- `error-handler.ts` — 错误处理器
- `error-logger.ts` — 错误日志
- `event-bus.ts` — 事件总线
- `event-types.ts` — 事件类型
- `model-capabilities.ts` — 模型能力（代理导出）

### api-config/ — API 配置代理
- `index.ts`

### constants/ — 常量
- `app-version.ts` — APP_VERSION 统一常量
- `error-codes.ts` — 错误码常量
- `messages.ts` — i18n messages
- `timers.ts` — 定时器魔法数字
- `index.ts` — barrel

### db-core/ — 数据库核心代理
- `index.ts`

### errors/ — 错误类型
- `version-conflict.ts` — 版本冲突错误

### file-http/ — 文件操作统一 HTTP 层（HTTP 优先 + IPC fallback）
- `index.ts` — writeFile / readFile / getFileInfo / getCacheDirectory / getDiskSpace / fileExists / deleteFile

### hooks/ — 自定义 hooks
- `create-crud-hooks.ts` — CRUD hooks 工厂
- `use-current-time.ts` / `use-dirty-state.ts` / `use-entity-crud.ts` / `use-entity-image.ts`
- `use-global-keyboard-actions.ts` — 全局快捷键（Ctrl+Z/S）
- `use-memory-monitor.ts` / `use-network-monitor.ts`
- `use-model-capabilities.ts` / `use-provider-templates.ts` / `use-virtual-list.ts`
- `useDebouncedState.ts` / `useKeyboardShortcuts.ts`

### outfit/ — 服装合成代理
- `index.ts`

### presentation/ — UI 组件
- `Modal.tsx` — 模态框（焦点陷阱）
- `Toast.tsx` — Toast
- `Tabs.tsx` — 可访问 Tabs
- `IconButton.tsx` — 图标按钮（强制 aria-label）
- `Sidebar.tsx` — 侧栏
- `PageLoader.tsx` — 页面加载器（统一 Loading）
- `ComingSoon.tsx` — ComingSoon 占位
- `ErrorBoundary.tsx` / `PageErrorBoundary.tsx` — 错误边界
- `CrashRecoveryDialog.tsx` — 崩溃恢复对话框
- `DeleteConfirmDialog.tsx` — 删除确认
- `BeforeUnloadGuard.tsx` — 离开页面守卫
- `GlobalKeyboardActions.tsx` — 全局键盘动作
- `KeyboardShortcutsDialog.tsx` — 快捷键对话框
- `SearchDialog.tsx` — 搜索对话框
- `ThemeProvider.tsx` / `ThemeSwitcher.tsx` — 主题
- `TitleBar.tsx` — 标题栏
- `VirtualList.tsx` — 虚拟列表
- `SafeImage.tsx` — 安全图片
- `AppCard.tsx` / `AssetSelectorDialog.tsx` / `EmptyState.tsx`
- `DebugOverlay.tsx` / `MemoryMonitorPanel.tsx` / `PerformanceMonitorPanel.tsx`
- `ModelParameterPanel.tsx` / `NetworkStatusAlert.tsx` / `SaveStatusIndicator.tsx`
- `onboarding.tsx` — 引导

### sql-safety/ — SQL 安全代理
- `sql-sanitizer.ts` — SQL 清洗
- `schema-registry.ts` — schema 注册表
- `index.ts`

### types/ — 共享类型
- `api.ts` / `ipc.ts` / `index.ts`

### utils/ — 工具函数
- `confirm.tsx` — 确认对话框
- `error-classifier.ts` — 错误分类
- `file-download.ts` — 文件下载
- `format.ts` — 格式化
- `image-url.ts` — 图片 URL
- `media-error-handler.ts` — 媒体错误处理
- `performance.ts` — 性能
- `platform.ts` — 平台判断
- `preferences.ts` — 偏好
- `safe-json.ts` — 安全 JSON
- `toast-bridge.ts` — Toast 桥接
- `url-validation.ts` — URL 校验
- `user-facing-error.ts` — 用户可见错误
- `utils.ts` — 通用工具

### video-cache/ — 视频缓存代理
- `index.ts`

### video-utils/ — 视频工具
- `codec-check.ts` — 编解码检查
- `provider-codecs.ts` — Provider 编解码
- `video-codec.ts` — 视频编解码
- `video-frame-extractor.ts` — 帧提取
- `index.ts`

---

## src/config/ — 配置层
- `constants.ts` — 全局常量
- `ports.ts` — Port 配置

---

## src/infrastructure/ — 基础设施层

### ai-providers/ — AI Provider 实现
- `core.ts` / `config.ts` / `errors.ts` / `types.ts` / `utils.ts` / `index.ts`
- `image.ts` / `image-normalization.ts` — 图像生成
- `video.ts` / `video-service.ts` / `enhanced-video.ts` — 视频生成
- `text.ts` — 文本生成
- `multi-api.ts` — 多 API 聚合
- `api-cache.ts` — API 缓存
- `model-registry.ts` — 模型注册表
- `model-capabilities.ts` / `model-capabilities-types.ts` / `model-capabilities-utils.ts` / `builtin-model-capabilities.ts` — 模型能力
- `model-parameter-profile.ts` — 模型参数 profile
- `offline-queue.ts` / `offline-queue-ops.ts` / `offline-queue-utils.ts` — 离线队列
- `outfit-synthesis.ts` — 服装合成
- `services.ts` / `config-status.ts`
- `api-config/` — API 配置（detect / init / server / storage / templates / server-config-loader / server-encryption / server-key）
- `api-config/providers/` — 23+ Provider JSON 模板（anthropic / bedrock / byteplus / custom / deepseek / fireworks / google / kuaishou / luma / minimax / moonshot / ollama / openai / openrouter / pika / pixverse / pollinations / qwen / runway / seedance / standalone-model-capabilities / volcengine / zhipu）+ provider-schema.ts
- `model-adapter/` — 模型适配器
- `providers/` — cloud-providers

### api/ — API 客户端
- `client.ts` — HTTP 客户端
- `endpoints.ts` — 端点定义
- `index.ts`

### database/ — 数据库
- `index.ts`
- `media-asset-repository.ts` — 媒体资产仓储实现

### di/ — 依赖注入容器
- `container.ts` — 容器（用 container.xxx 访问 token）
- `registry.ts` — 注册表
- `types.ts` — Token 类型
- `index.ts`

### monitoring/ — 监控
- `memory-leak-detector.ts` — 内存泄漏检测
- `performance-monitor.ts` — 性能监控
- `index.ts`

### network/ — 网络层
- `circuit-breaker.ts` — 断路器
- `download-manager.ts` — 下载管理器
- `network-monitor.ts` — 网络监控
- `network.config.ts` — 网络配置
- `profiles.ts` — Profile
- `request-lifecycle.ts` — 请求生命周期
- `resilient-fetch.ts` — 弹性 fetch
- `retry-executor.ts` — 重试执行器
- `types.ts` / `index.ts`
- `interceptors/` — cache / circuit-breaker / lifecycle / logging / retry

### server/ — 服务端
- `api-utils.ts`
- `index.ts`

### storage/ — 存储实现
- `core.ts` / `db.ts` / `sqlite-core.ts` — 核心
- `auto-save.ts` — 自动保存
- `characters.ts` / `collections.ts` / `elements.ts` / `scenes.ts` / `stories.ts` / `storyboard.ts` / `templates.ts` / `versions.ts` / `video-cache.ts` / `video-tasks.ts` — 实体存储
- `image-cache.ts` — 图片缓存
- `import-export.ts` — 导入导出
- `sessions.ts` — 会话
- `error-logs.ts` — 错误日志
- `sql-sanitizer.ts` / `schema-registry.ts` — SQL 安全
- `file-storage-factory.ts` — 文件存储工厂
- `local-file-storage.ts` / `local-file-storage.browser.ts` — 本地文件存储
- `s3-file-storage.ts` — S3 文件存储
- `index.ts`
- `characters/` — 角色（index / json-schemas / outfit-manager / parser）
- `elements/` — 元素（commands / queries / json-schemas / index）
- `scenes/` — 场景 json-schemas
- `stories/` — 故事（beat-transformer / relations / index）
- `video-tasks/` — 视频任务（bulk-operations / json-schemas / parser / index）

### video-utils/ — 视频工具
- `index.ts`

### 顶层
- `api-config-facade.ts` — API 配置门面

---

## electron/src/ — Electron 主进程

### 顶层
- `main.ts` / `main-common.ts` / `main-dev.ts` — 主进程入口
- `preload.ts` — 预加载脚本
- `menu.ts` — 应用菜单
- `protocol.ts` — 自定义协议
- `app-paths.ts` — 应用路径
- `db-interface.ts` — 数据库接口
- `api-server.ts` — API 服务器
- `api-gateway.ts` / `api-gateway-image.ts` / `api-gateway-retry.ts` / `api-gateway-utils.ts` / `api-gateway-error-codes.ts` — API 网关
- `sync-http-client.ts` — 同步 HTTP 客户端
- `shared-logic-resolve.ts` — shared-logic 解析器

### api/ — HTTP API 路由
- `routes.ts` — 路由注册（合并 7 个 route group）
- `schemas.ts` — Zod schema
- `types.ts` — defineRoute 类型
- `server.ts` — HTTP 服务器
- `middleware.ts` — 中间件
- `route-groups/` — 路由分组
  - `core-routes.ts` — config/get, config/set 等
  - `db-routes.ts` — db/query, db/run, db/transaction
  - `file-routes.ts` — file/*（含 100MB 写入限制）
  - `generation-routes.ts` — 图像/视频/文本/故事生成
  - `plugin-routes.ts` — 插件管理
  - `shot-routes.ts` — Shot 引用 / 一致性 / 视觉一致性
  - `storyboard-routes.ts` — 分镜生成 / 视频恢复 / 批量保存

### config/ — 配置管理
- `config-manager.ts` — 配置管理器
- `ports.ts` / `index.ts`

### database/ — 数据库
- `db-connection.ts` — 连接
- `db-schema.ts` — schema
- `migrations.ts` — 迁移
- `schema-builder.ts` — schema 构建器
- `index.ts`

### handlers/ — IPC handler
- `database.ts` / `config.ts` / `config-storage.ts` / `secure-config.ts`
- `assets.ts` / `export.ts` / `sync.ts` / `test-connection.ts`

### lifecycle/ — 生命周期管理
- `manager.ts` — 生命周期管理器
- `cleanup.ts` — 清理
- `recovery.ts` — 恢复
- `states.ts` — 状态
- `index.ts`

### logging/ — 日志
- `logger.ts` / `types.ts` / `index.ts`
- `transports/` — file.transport / console.transport

### plugins/ — 插件系统
- `registry.ts` — 插件注册表
- `base-provider.ts` — 基础 Provider
- `code-plugin-adapter.ts` / `code-plugin-loader.ts` — 代码插件
- `user-plugin-adapter.ts` / `user-plugin-loader.ts` / `user-plugin-schema.ts` — 用户插件
- `plugin-process-manager.ts` / `plugin-worker.ts` — 进程管理
- `types.ts` / `utils.ts` / `index.ts`
- `providers/` — 14 个 Provider 实现（anthropic / google / kuaishou / luma / minimax / openai-compatible / openai-sora / pika / pixverse / runway / seedance / volcengine / zhipu）

### security/ — 安全模块
- `key-storage/` — 密钥存储（key-storage / types / strategies: plaintext-fallback / safe-storage）
- `ssrf-guard/` — SSRF 防护（R105/R118/R132/R142/R144 等）
- `index.ts`

### shared/ — 共享
- `i18n.ts` — 主进程 i18n

### types/ — 类型
- `api.ts` / `database.ts` / `ipc.ts` / `story.ts`
- `sharp.d.ts` / `sql-modules.d.ts` — 第三方声明

---

## 备注
- 路径别名：`@/`（renderer）、`@shared-logic/`（main process）、`@shared/`（main process）、`@domain/`（main process）
- 模块入口：`src/modules/{name}/index.ts`（barrel），跨模块导入仅通过 barrel
- 测试目录：各模块内 `__tests__/`，mocks 集中在 `src/__tests__/mocks/`
- 回归规则：R1-R151 共 151 条，分布在 `.trae/rules/regression/` 与各模块测试文件中
