# 模块全景图

> 自动生成于 2026-07-23。基于 `src/modules/` 目录实际代码扫描。
> 模块总数：**42 个**（核心业务 25 / 基础设施 4 / 工具 13）
> 子域总数：**56 个**（含子域 `index.ts` 的嵌套模块）

---

## 模块分类

模块按功能职责分为三大类，不按字母顺序排列。分类依据为模块 `MODULE.md` 契约与 `index.ts` 公共 API 的实际职责。

### 1. 核心业务模块（25 个）

承载 PrismCraft 的核心创作流程：智能体编排、资产管理、角色/场景/分镜/视频生成、小说导入、镜头编辑、合成与时间线。

| 序号 | 模块 | 子域数 | 一句话职责 |
|------|------|--------|-----------|
| 1 | `agent` | 1 | 智能体主入口：会话编排、工具执行、专家调度、记忆服务 |
| 2 | `agent-memory` | 0 | 三层记忆架构（core/archival/working）核心实现 |
| 3 | `agent-session` | 0 | 智能体会话持久化与检查点服务 |
| 4 | `agent-specialist` | 0 | 专家注册表与内置专家定义 |
| 5 | `agent-fewshot` | 0 | Few-shot 示例库与提示构建 |
| 6 | `asset` | 8 | 资产总库：角色/场景/媒体/道具/集合/导入导出/编辑/生成资产 |
| 7 | `asset-library` | 0 | 资产库页面型模块（路由入口） |
| 8 | `audit-log` | 0 | 审计日志记录与查询 |
| 9 | `blockout-3d` | 0 | 3D 场景布局预演（Blockout） |
| 10 | `character` | 4 | 角色领域：服务 + 变体 + 展示 + hooks |
| 11 | `characters` | 0 | 角色页面型模块（路由入口） |
| 12 | `compositor` | 0 | 图像合成器：组合角色/场景/资产生成新图 |
| 13 | `novel` | 6 | 小说导入流水线（10 阶段状态机）+ 结构/节奏/连续性 |
| 14 | `prompt` | 10 | 提示词引擎：角色/场景/视频/节拍图/配方/模板 |
| 15 | `quick-generate` | 0 | 快速生成页面型模块（图/视频一键生成） |
| 16 | `scene` | 4 | 场景领域：服务 + 变体 + 展示 + hooks |
| 17 | `scenes` | 0 | 场景页面型模块（路由入口） |
| 18 | `search` | 0 | 全局搜索与快速搜索 |
| 19 | `settings` | 0 | 设置页面型模块（路由入口） |
| 20 | `shot` | 10 | 镜头领域：一致性检查/元素绑定/特征提取/生成/编辑/比较/参考 |
| 21 | `storyboard` | 5 | 分镜：规划/生成/节拍编辑/提示词编辑/模板 |
| 22 | `timeline` | 0 | 时间线编辑（8 维变体参数系统） |
| 23 | `video` | 6 | 视频任务 CQRS + 缓存 + 恢复 + 一致性 QC + 局部编辑 |
| 24 | `video-compose` | 0 | 视频片段合成（15 种转场） |
| 25 | `video-tasks` | 0 | 视频任务列表页面型模块（路由入口） |

### 2. 基础设施模块（4 个）

为业务模块提供横切能力：持久化、同步、向量检索、ffmpeg 执行。

| 序号 | 模块 | 子域数 | 一句话职责 |
|------|------|--------|-----------|
| 1 | `persistence` | 0 | 自动保存 + 角色/场景引用删除保护 |
| 2 | `sync` | 2 | 同步引擎（SyncEngine 类）+ 设置面板 |
| 3 | `vector-search` | 0 | 向量检索（API > 本地 ONNX > 关键词 三策略链） |
| 4 | `ffmpeg-runner` | 0 | ffmpeg 服务封装（probe/transcode/merge/extract-frames） |

### 3. 工具模块（13 个）

均为 `agent` 模块拆分出的工具子集，按业务领域归类，供 `toolRegistry` / `toolExecutor` 调度。

| 序号 | 模块 | 工具数 | 一句话职责 |
|------|------|--------|-----------|
| 1 | `agent-tools-asset` | 14 | 资产查询（5）+ 资产 CRUD（9） |
| 2 | `agent-tools-generation` | 19 | 图像/视频生成（9）+ 图像编辑（10） |
| 3 | `agent-tools-media` | 23 | 音频（5）+ 视频（7）+ 视频后期（9）+ QC（2） |
| 4 | `agent-tools-memory` | 6 | 记忆读写工具 |
| 5 | `agent-tools-meta` | 21 | 配置 + 诊断 + 监控 + 帮助 |
| 6 | `agent-tools-project-io` | 4 | 项目导入导出 |
| 7 | `agent-tools-shot` | 5 | 镜头操作工具 |
| 8 | `agent-tools-specialist` | 2 | 专家调度工具 |
| 9 | `agent-tools-story` | 13 | 故事/分镜工具 |
| 10 | `agent-tools-system` | 3 | 系统级工具 |
| 11 | `agent-tools-template` | 9 | 模板工具 |
| 12 | `agent-tools-web-file` | 14 | Web（8）+ 文件管理（6） |
| 13 | `agent-tools-workflow` | 14 | 工作流编排（5）+ 子流程（9） |

---

## 模块详情表

| 模块名 | 路径 | 职责 | 子域数 | 关键 public API | 依赖模块 |
|--------|------|------|--------|----------------|----------|
| agent | `src/modules/agent/` | 智能体主入口 | 1 | `AgentPage`, `toolRegistry`, `toolExecutor`, `conversationManager`, `memoryService`, `runSpecialist`, `listSessions` | `agent-memory`, `agent-session`, `agent-specialist`, `agent-fewshot`, 各 `agent-tools-*` |
| agent-memory | `src/modules/agent-memory/` | 三层记忆架构 | 0 | `memoryService`, `getCoreMemory`, `addArchivalMemory`, `searchArchivalMemory` | 无 |
| agent-session | `src/modules/agent-session/` | 会话持久化 | 0 | `saveSession`, `loadSession`, `listSessions`, checkpoint 服务 | 无 |
| agent-specialist | `src/modules/agent-specialist/` | 专家注册表 | 0 | `specialistRegistry`, `SpecialistRegistry`, `BUILTIN_SPECIALISTS` | 无 |
| agent-fewshot | `src/modules/agent-fewshot/` | Few-shot 示例 | 0 | `FewShotEntry`, `recordFewShot`, `getFewShots`, `buildFewShotPrompt`, `BUILTIN_FEWSHOT_EXAMPLES` | 无 |
| asset | `src/modules/asset/` | 资产总库 | 8 | `characterService`, `sceneService`, `mediaAssetService`, `collectionService`, `assetExportService`, props CRUD, generation-assets | 无 |
| asset-library | `src/modules/asset-library/` | 资产库页面 | 0 | `AssetLibraryPage` | `asset` |
| audit-log | `src/modules/audit-log/` | 审计日志 | 0 | `recordAudit`, `queryAuditLogs`, `clearAuditLogs`, `AuditEntry` | 无 |
| blockout-3d | `src/modules/blockout-3d/` | 3D 场景布局预演 | 0 | `Blockout3DPanel`, schemas, services, presentation | `ffmpeg-runner` |
| character | `src/modules/character/` | 角色领域 | 4 | `characterService`, character variants 子域 | 无 |
| characters | `src/modules/characters/` | 角色页面 | 0 | `CharactersPage` | `character` |
| compositor | `src/modules/compositor/` | 图像合成器 | 0 | `CompositorPanel`, `composeImage`, `useCompositor` | `character`, `scene`, `asset` |
| novel | `src/modules/novel/` | 小说导入流水线 | 6 | novel pipeline, structure, presentation | 无 |
| prompt | `src/modules/prompt/` | 提示词引擎 | 10 | 提示词生成器、模板、配方 | 无 |
| quick-generate | `src/modules/quick-generate/` | 快速生成页面 | 0 | `QuickGeneratePage` | `video`, `prompt`, `character`, `scene`, `asset` |
| scene | `src/modules/scene/` | 场景领域 | 4 | `sceneService`, scene variants 子域 | 无 |
| scenes | `src/modules/scenes/` | 场景页面 | 0 | `ScenesPage` | `scene` |
| search | `src/modules/search/` | 全局搜索 | 0 | `globalSearch`, `quickSearch`, `SearchBar` | `vector-search` |
| settings | `src/modules/settings/` | 设置页面 | 0 | `SettingsPage` | 无 |
| shot | `src/modules/shot/` | 镜头领域 | 10 | consistency-check, element-binding, feature-extraction 等 | 无 |
| storyboard | `src/modules/storyboard/` | 分镜 | 5 | `storyService`, `planStory`, generators, hooks, template 子域 | `novel`, `shot`, `video` |
| timeline | `src/modules/timeline/` | 时间线编辑 | 0 | schemas, types, hooks, presentation | `video`, `storyboard` |
| video | `src/modules/video/` | 视频任务管理 | 6 | 视频任务 CQRS, cache, recovery, consistency-qc, partial-edit | `sync` |
| video-compose | `src/modules/video-compose/` | 视频片段合成 | 0 | `VideoComposePanel`, `composeVideoSegments`, `useVideoCompose` | `ffmpeg-runner`, `video` |
| video-tasks | `src/modules/video-tasks/` | 视频任务列表页面 | 0 | `VideoTasksPage` | `video` |
| persistence | `src/modules/persistence/` | 自动保存与引用保护 | 0 | `useAutoSave`, `deleteCharacterWithRefs`, `deleteSceneWithRefs` | 无 |
| sync | `src/modules/sync/` | 同步引擎 | 2 | `initSyncEngine`, `performSync`, `SyncSettingsPanel` | 无 |
| vector-search | `src/modules/vector-search/` | 向量检索 | 0 | `VectorSearchEngine`, strategies, store | 无 |
| ffmpeg-runner | `src/modules/ffmpeg-runner/` | ffmpeg 服务封装 | 0 | `ffmpeg-service` 全量导出 | 无 |
| agent-tools-asset | `src/modules/agent-tools-asset/` | 资产工具 | 0 | 5 query + 9 CRUD 工具 | `asset` |
| agent-tools-generation | `src/modules/agent-tools-generation/` | 生成工具 | 0 | 9 生成 + 10 图像编辑工具 | `video`, `prompt` |
| agent-tools-media | `src/modules/agent-tools-media/` | 媒体工具 | 0 | 5 音频 + 7 视频 + 9 后期 + 2 QC | `video`, `ffmpeg-runner` |
| agent-tools-memory | `src/modules/agent-tools-memory/` | 记忆工具 | 0 | 6 记忆工具 | `agent-memory` |
| agent-tools-meta | `src/modules/agent-tools-meta/` | 元工具 | 0 | 21 工具（config/diagnostic/monitor/help） | 无 |
| agent-tools-project-io | `src/modules/agent-tools-project-io/` | 项目 IO 工具 | 0 | 4 项目 IO 工具 | `persistence` |
| agent-tools-shot | `src/modules/agent-tools-shot/` | 镜头工具 | 0 | 5 镜头工具 | `shot` |
| agent-tools-specialist | `src/modules/agent-tools-specialist/` | 专家工具 | 0 | 2 专家工具 | `agent-specialist` |
| agent-tools-story | `src/modules/agent-tools-story/` | 故事工具 | 0 | 13 故事工具 | `storyboard`, `novel` |
| agent-tools-system | `src/modules/agent-tools-system/` | 系统工具 | 0 | 3 系统工具 | 无 |
| agent-tools-template | `src/modules/agent-tools-template/` | 模板工具 | 0 | 9 模板工具 | `storyboard/template` |
| agent-tools-web-file | `src/modules/agent-tools-web-file/` | Web/文件工具 | 0 | 8 web + 6 文件管理 | `@/shared/file-http` |
| agent-tools-workflow | `src/modules/agent-tools-workflow/` | 工作流工具 | 0 | 5 工作流 + 9 子流程（共 14） | `agent`（经 DI 异步获取） |

---

## 各模块详情

### 1. agent

- **路径**: `src/modules/agent/`
- **职责**: 智能体主入口，统一编排会话、工具执行、专家调度、记忆服务
- **子域**:
  - `tools/` — 工具聚合（聚合各 `agent-tools-*` 子模块）
- **Public API**: `AgentPage`, `toolRegistry`, `toolExecutor`, `conversationManager`, `memoryService`, `runSpecialist`, `listSessions` 及相关类型导出
- **MODULE.md**: 智能体主入口模块，会话编排与工具调度核心
- **依赖**: `agent-memory`, `agent-session`, `agent-specialist`, `agent-fewshot`, 全部 `agent-tools-*` 子模块（经 DI container 异步获取 `toolExecutor` / `toolRegistry`，避免静态依赖）

### 2. agent-memory

- **路径**: `src/modules/agent-memory/`
- **职责**: 三层记忆架构（core/archival/working）核心实现
- **子域**: 无
- **Public API**: `memoryService`, `getCoreMemory`, `addArchivalMemory`, `searchArchivalMemory` 等
- **MODULE.md**: 三层记忆架构实现，支持核心/归档/工作记忆读写
- **依赖**: 无跨模块依赖

### 3. agent-session

- **路径**: `src/modules/agent-session/`
- **职责**: 智能体会话持久化与检查点服务
- **子域**: 无
- **Public API**: `saveSession`, `loadSession`, `listSessions`, checkpoint 服务
- **MODULE.md**: 会话持久化模块，支持保存/加载/列出会话与检查点
- **依赖**: 无跨模块依赖

### 4. agent-specialist

- **路径**: `src/modules/agent-specialist/`
- **职责**: 专家注册表与内置专家定义
- **子域**: 无
- **Public API**: `specialistRegistry`, `SpecialistRegistry`, `BUILTIN_SPECIALISTS`
- **MODULE.md**: 专家注册表模块，提供内置专家与注册机制
- **依赖**: 无跨模块依赖

### 5. agent-fewshot

- **路径**: `src/modules/agent-fewshot/`
- **职责**: Few-shot 示例库与提示构建
- **子域**: 无
- **Public API**: `FewShotEntry`, `recordFewShot`, `getFewShots`, `buildFewShotPrompt`, `BUILTIN_FEWSHOT_EXAMPLES`
- **MODULE.md**: Few-shot 示例库，支持记录/查询/构建提示
- **依赖**: 无跨模块依赖

### 6. asset

- **路径**: `src/modules/asset/`
- **职责**: 资产总库，统一管理角色/场景/媒体/道具/集合/导入导出/编辑/生成资产
- **子域**（8 个）:
  - `import-export/` — 资产导入导出
  - `props/` — 道具 CRUD
  - `generation-assets/` — 生成资产
  - `editor/` — 资产编辑器
  - `asset-library/` — 资产库子域
  - `presentation/` — 展示组件
  - `media-assets/` — 媒体资产
  - `hooks/` — React hooks
- **Public API**: `characterService`, `sceneService`, `mediaAssetService`, `collectionService`, `assetExportService`, props CRUD, generation-assets
- **MODULE.md**: 资产总库模块，承载所有资产的统一管理与子域划分
- **依赖**: 无跨模块依赖（基础领域模块）

### 7. asset-library

- **路径**: `src/modules/asset-library/`
- **职责**: 资产库页面型模块（路由入口）
- **子域**: 无
- **Public API**: `AssetLibraryPage`
- **MODULE.md**: 资产库页面型模块，仅暴露页面组件给路由
- **依赖**: `asset`

### 8. audit-log

- **路径**: `src/modules/audit-log/`
- **职责**: 审计日志记录与查询
- **子域**: 无
- **Public API**: `recordAudit`, `queryAuditLogs`, `clearAuditLogs`, `AuditEntry`
- **MODULE.md**: 审计日志模块，支持记录/查询/清除审计条目
- **依赖**: 无跨模块依赖

### 9. blockout-3d

- **路径**: `src/modules/blockout-3d/`
- **职责**: 3D 场景布局预演（Blockout）
- **子域**: 无
- **Public API**: `Blockout3DPanel`, schemas, services, presentation 全量导出
- **MODULE.md**: 3D 场景布局预演模块，提供 Blockout 面板与服务
- **依赖**: `ffmpeg-runner`

### 10. character

- **路径**: `src/modules/character/`
- **职责**: 角色领域，提供角色服务 + 变体 + 展示 + hooks
- **子域**（4 个）:
  - `variants/` — 角色变体
  - `services/` — 角色服务
  - `presentation/` — 展示组件
  - `hooks/` — React hooks
- **Public API**: `characterService`, character variants 子域导出
- **MODULE.md**: 角色领域模块，提供服务/变体/展示/hooks 子域
- **依赖**: 无跨模块依赖（基础领域模块）

### 11. characters

- **路径**: `src/modules/characters/`
- **职责**: 角色页面型模块（路由入口）
- **子域**: 无
- **Public API**: `CharactersPage`
- **MODULE.md**: 角色页面型模块，仅暴露页面组件给路由
- **依赖**: `character`

### 12. compositor

- **路径**: `src/modules/compositor/`
- **职责**: 图像合成器，组合角色/场景/资产生成新图
- **子域**: 无
- **Public API**: `CompositorPanel`, `composeImage`, `useCompositor`
- **MODULE.md**: 图像合成器模块，UI 面板 + 服务层组合多源图像
- **依赖**: `character`, `scene`, `asset`

### 13. novel

- **路径**: `src/modules/novel/`
- **职责**: 小说导入流水线（10 阶段状态机）+ 结构/节奏/连续性分析
- **子域**（6 个）:
  - `tools/` — 小说工具
  - `workflow/` — 工作流编排
  - `continuity/` — 连续性分析
  - `integration/` — 集成层
  - `pacing/` — 节奏分析
  - `structure/` — 结构分析
- **Public API**: novel pipeline, structure, presentation 全量导出
- **MODULE.md**: 小说导入流水线模块，10 阶段状态机驱动从导入到分镜的全流程
- **依赖**: 无跨模块依赖（流水线自包含）

### 14. prompt

- **路径**: `src/modules/prompt/`
- **职责**: 提示词引擎，覆盖角色/场景/视频/节拍图/配方/模板
- **子域**（10 个）:
  - `prompt-recipes/` — 提示词配方
  - `templates/` — 模板
  - `presentation/` — 展示组件
  - `video/` — 视频提示词
  - `server-prompts/` — 服务端提示词
  - `scene/` — 场景提示词
  - `character/` — 角色提示词
  - `builder/` — 提示词构建器
  - `beat-image/` — 节拍图提示词
  - `base/` — 基础提示词
- **Public API**: 提示词生成器、模板、配方全量导出
- **MODULE.md**: 提示词引擎模块，多子域覆盖各类提示词生成
- **依赖**: 无跨模块依赖（纯逻辑模块）

### 15. quick-generate

- **路径**: `src/modules/quick-generate/`
- **职责**: 快速生成页面型模块（图/视频一键生成）
- **子域**: 无
- **Public API**: `QuickGeneratePage`
- **MODULE.md**: 快速生成页面型模块，聚合多模块能力的一键生成入口
- **依赖**: `video`, `prompt`, `character`, `scene`, `asset`

### 16. scene

- **路径**: `src/modules/scene/`
- **职责**: 场景领域，提供服务 + 变体 + 展示 + hooks
- **子域**（4 个）:
  - `variants/` — 场景变体
  - `services/` — 场景服务
  - `presentation/` — 展示组件
  - `hooks/` — React hooks
- **Public API**: `sceneService`, scene variants 子域导出
- **MODULE.md**: 场景领域模块，提供服务/变体/展示/hooks 子域
- **依赖**: 无跨模块依赖（基础领域模块）

### 17. scenes

- **路径**: `src/modules/scenes/`
- **职责**: 场景页面型模块（路由入口）
- **子域**: 无
- **Public API**: `ScenesPage`
- **MODULE.md**: 场景页面型模块，仅暴露页面组件给路由
- **依赖**: `scene`

### 18. search

- **路径**: `src/modules/search/`
- **职责**: 全局搜索与快速搜索
- **子域**: 无
- **Public API**: `globalSearch`, `quickSearch`, `SearchBar`
- **MODULE.md**: 全局搜索模块，提供全局/快速搜索与搜索栏组件
- **依赖**: `vector-search`

### 19. settings

- **路径**: `src/modules/settings/`
- **职责**: 设置页面型模块（路由入口）
- **子域**: 无
- **Public API**: `SettingsPage`
- **MODULE.md**: 设置页面型模块，仅暴露页面组件给路由
- **依赖**: 无跨模块依赖

### 20. shot

- **路径**: `src/modules/shot/`
- **职责**: 镜头领域，覆盖一致性检查/元素绑定/特征提取/生成/编辑/比较/参考
- **子域**（10 个）:
  - `consistency-check/` — 一致性检查
  - `sub-shot/` — 子镜头
  - `shot-comparison/` — 镜头比较
  - `shot-generation/` — 镜头生成
  - `shot-instruction/` — 镜头指令
  - `shot-editor/` — 镜头编辑器
  - `element-binding/` — 元素绑定
  - `shot-reference/` — 镜头参考
  - `reference-check/` — 参考检查
  - `feature-extraction/` — 特征提取
- **Public API**: consistency-check, element-binding, feature-extraction 等子域全量导出
- **MODULE.md**: 镜头领域模块，10 个子域覆盖镜头全生命周期
- **依赖**: 无跨模块依赖（基础领域模块）

### 21. storyboard

- **路径**: `src/modules/storyboard/`
- **职责**: 分镜，提供规划/生成/节拍编辑/提示词编辑/模板
- **子域**（5 个）:
  - `planning/` — 分镜规划
  - `template/` — 模板
  - `beat-editor/` — 节拍编辑器
  - `prompt-editor/` — 提示词编辑器
  - `generation/` — 分镜生成
- **Public API**: `storyService`, `planStory`, generators, hooks, template 子域导出
- **MODULE.md**: 分镜模块，从规划到生成的完整分镜工作流
- **依赖**: `novel`, `shot`, `video`

### 22. timeline

- **路径**: `src/modules/timeline/`
- **职责**: 时间线编辑（8 维变体参数系统）
- **子域**: 无
- **Public API**: schemas, types, hooks, presentation 全量导出
- **MODULE.md**: 时间线编辑模块，支持 8 维变体参数系统
- **依赖**: `video`, `storyboard`

### 23. video

- **路径**: `src/modules/video/`
- **职责**: 视频任务 CQRS + 缓存 + 恢复 + 一致性 QC + 局部编辑
- **子域**（6 个）:
  - `partial-edit/` — 局部编辑
  - `consistency-qc/` — 一致性 QC
  - `task-management/` — 任务管理（CQRS 模式）
  - `cache/` — 缓存
  - `utils/` — 工具
  - `recovery/` — 恢复
- **Public API**: 视频任务管理（`useVideoTaskState`/`useVideoTaskQueries`/`useVideoTaskCommands`/`useVideoTaskPolling`/`useVideoTaskManager`）, cache, recovery, consistency-qc, partial-edit
- **MODULE.md**: 视频模块，CQRS 模式管理视频任务全生命周期
- **依赖**: `sync`

### 24. video-compose

- **路径**: `src/modules/video-compose/`
- **职责**: 视频片段合成（15 种转场效果）
- **子域**: 无
- **Public API**: `VideoComposePanel`, `composeVideoSegments`, `checkComposerAvailable`, `pickLocalVideoFiles`, `useVideoCompose`, `TRANSITION_OPTIONS`
- **MODULE.md**: 视频片段合成模块（Task 4.3），复用 `ffmpeg-runner.mergeVideos`，支持 15 种转场
- **依赖**: `ffmpeg-runner`, `video`（经 `container.videoTaskStorage` 获取已完成任务）

### 25. video-tasks

- **路径**: `src/modules/video-tasks/`
- **职责**: 视频任务列表页面型模块（路由入口）
- **子域**: 无
- **Public API**: `VideoTasksPage`
- **MODULE.md**: 视频任务页面型模块，提供任务统一查看/状态筛选/批量管理入口；业务逻辑由 `video/task-management` 子域提供
- **依赖**: `video`（通过 `useVideoTaskState`/`useVideoTaskQueries` 等 hook 读取任务状态）

### 26. persistence

- **路径**: `src/modules/persistence/`
- **职责**: 自动保存 + 角色/场景引用删除保护
- **子域**: 无
- **Public API**: `useAutoSave`, `deleteCharacterWithRefs`, `deleteSceneWithRefs`
- **MODULE.md**: 持久化模块，自动保存与引用计数删除保护
- **依赖**: 无跨模块依赖

### 27. sync

- **路径**: `src/modules/sync/`
- **职责**: 同步引擎（SyncEngine 类）+ 设置面板
- **子域**（2 个）:
  - `engine/` — 同步引擎实现
  - `presentation/` — 设置面板展示
- **Public API**: `initSyncEngine`, `performSync`, `startAutoSync`, `SyncSettingsPanel`
- **MODULE.md**: 同步引擎模块，提供 SyncEngine 类与函数式 API
- **依赖**: 无跨模块依赖

### 28. vector-search

- **路径**: `src/modules/vector-search/`
- **职责**: 向量检索（API > 本地 ONNX > 关键词 三策略链）
- **子域**: 无
- **Public API**: `VectorSearchEngine`, strategies, store
- **MODULE.md**: 向量检索模块，三策略链（API > 本地 ONNX > 关键词）降级检索
- **依赖**: 无跨模块依赖

### 29. ffmpeg-runner

- **路径**: `src/modules/ffmpeg-runner/`
- **职责**: ffmpeg 服务封装（probe/transcode/merge/extract-frames）
- **子域**: 无
- **Public API**: `export * from "./services/ffmpeg-service"`（全量导出 ffmpeg 服务）
- **MODULE.md**: ffmpeg 服务封装模块，提供 probe/transcode/merge/extract-frames 能力
- **依赖**: 无跨模块依赖

### 30. agent-tools-asset

- **路径**: `src/modules/agent-tools-asset/`
- **职责**: 资产工具集（5 查询 + 9 CRUD，共 14 个工具）
- **子域**: 无
- **Public API**: 5 个查询工具 + 9 个 CRUD 工具
- **MODULE.md**: 资产工具模块，从 agent 拆分而来
- **依赖**: `asset`

### 31. agent-tools-generation

- **路径**: `src/modules/agent-tools-generation/`
- **职责**: 生成工具集（9 生成 + 10 图像编辑，共 19 个工具）
- **子域**: 无
- **Public API**: 9 个生成工具 + 10 个图像编辑工具
- **MODULE.md**: 生成工具模块，从 agent 拆分而来
- **依赖**: `video`, `prompt`

### 32. agent-tools-media

- **路径**: `src/modules/agent-tools-media/`
- **职责**: 媒体工具集（5 音频 + 7 视频 + 9 后期 + 2 QC，共 23 个工具）
- **子域**: 无
- **Public API**: 5 个音频工具 + 7 个视频工具 + 9 个视频后期工具 + 2 个 QC 工具
- **MODULE.md**: 媒体工具模块，从 agent 拆分而来
- **依赖**: `video`, `ffmpeg-runner`

### 33. agent-tools-memory

- **路径**: `src/modules/agent-tools-memory/`
- **职责**: 记忆工具集（6 个工具）
- **子域**: 无
- **Public API**: 6 个记忆工具
- **MODULE.md**: 记忆工具模块，从 agent 拆分而来
- **依赖**: `agent-memory`

### 34. agent-tools-meta

- **路径**: `src/modules/agent-tools-meta/`
- **职责**: 元工具集（21 个工具：config + diagnostic + monitor + help）
- **子域**: 无
- **Public API**: 21 个工具（配置/诊断/监控/帮助）
- **MODULE.md**: 元工具模块，从 agent 拆分而来
- **依赖**: 无跨模块依赖

### 35. agent-tools-project-io

- **路径**: `src/modules/agent-tools-project-io/`
- **职责**: 项目 IO 工具集（4 个工具）
- **子域**: 无
- **Public API**: 4 个项目 IO 工具
- **MODULE.md**: 项目 IO 工具模块，从 agent 拆分而来
- **依赖**: `persistence`

### 36. agent-tools-shot

- **路径**: `src/modules/agent-tools-shot/`
- **职责**: 镜头工具集（5 个工具）
- **子域**: 无
- **Public API**: 5 个镜头工具
- **MODULE.md**: 镜头工具模块，从 agent 拆分而来
- **依赖**: `shot`

### 37. agent-tools-specialist

- **路径**: `src/modules/agent-tools-specialist/`
- **职责**: 专家工具集（2 个工具）
- **子域**: 无
- **Public API**: 2 个专家工具
- **MODULE.md**: 专家工具模块，从 agent 拆分而来
- **依赖**: `agent-specialist`

### 38. agent-tools-story

- **路径**: `src/modules/agent-tools-story/`
- **职责**: 故事工具集（13 个工具）
- **子域**: 无
- **Public API**: 13 个故事工具
- **MODULE.md**: 故事工具模块，从 agent 拆分而来
- **依赖**: `storyboard`, `novel`

### 39. agent-tools-system

- **路径**: `src/modules/agent-tools-system/`
- **职责**: 系统工具集（3 个工具）
- **子域**: 无
- **Public API**: 3 个系统工具
- **MODULE.md**: 系统工具模块，从 agent 拆分而来
- **依赖**: 无跨模块依赖

### 40. agent-tools-template

- **路径**: `src/modules/agent-tools-template/`
- **职责**: 模板工具集（9 个工具）
- **子域**: 无
- **Public API**: 9 个模板工具
- **MODULE.md**: 模板工具模块，从 agent 拆分而来
- **依赖**: `storyboard/template`

### 41. agent-tools-web-file

- **路径**: `src/modules/agent-tools-web-file/`
- **职责**: Web/文件管理工具集（8 web + 6 文件管理，共 14 个工具）
- **子域**: 无
- **Public API**: 8 个 web 工具 + 6 个文件管理工具
- **MODULE.md**: Web/文件工具模块，从 agent 拆分而来
- **依赖**: `@/shared/file-http`

### 42. agent-tools-workflow

- **路径**: `src/modules/agent-tools-workflow/`
- **职责**: 工作流编排工具集（5 工作流 + 9 子流程，共 14 个工具）
- **子域**: 无
- **Public API**: `createWorkflowTool`, `executeWorkflowTool`, `batchProcessTool`, `chainOperationsTool`, `scheduleTaskTool`（5 工作流）+ `autoCreateCharacterTool`, `autoCreateSceneTool`, `autoPlanStoryboardTool`, `autoCreateFromNovelTool`, `autoGenerateBeatFullTool`, `autoGenerateVideoFullTool`, `autoPolishVideoTool`, `autoFindAndImportAssetTool`, `autoFixCommonErrorsTool`（9 子流程）+ `allWorkflowTools` 聚合导出 + `subworkflow-helpers` 共享辅助函数
- **MODULE.md**: 工作流工具模块，从 agent 拆分而来；通过 DI container 异步获取 `toolExecutor`/`toolRegistry` 避免静态依赖
- **依赖**: `agent`（经 DI container 异步获取，无静态导入）

---

## 统计摘要

| 类别 | 模块数 | 子域数 | 工具数 |
|------|--------|--------|--------|
| 核心业务模块 | 25 | 54 | — |
| 基础设施模块 | 4 | 2 | — |
| 工具模块 | 13 | 0 | 153 |
| **合计** | **42** | **56** | **153** |

> 子域数说明：核心业务模块中含子域的模块为 `agent`(1) + `asset`(8) + `character`(4) + `novel`(6) + `prompt`(10) + `scene`(4) + `shot`(10) + `storyboard`(5) + `video`(6) = 54 个子域 index.ts；基础设施 `sync`(2)；合计 56 个子域 `index.ts` 文件。部分子域（如 `presentation`、`hooks`、`services`）为模块内分层而非独立业务子域。

---

## 验证

- 模块总数：42 个（与 `src/modules/*/index.ts` 实际文件数一致）
- MODULE.md 覆盖：42 个模块均有 `MODULE.md`（100% 覆盖）
- 子域 index.ts：56 个（与 `src/modules/*/*/index.ts` 实际文件数一致）
- 文档生成日期：2026-07-23
- 数据来源：实际扫描 `src/modules/` 目录下 `index.ts`、`MODULE.md`、`contract.json` 及 `import` 语句
