# Session Notes

> 本文件采用**追加式**设计：只追加，不修改。每个会话在文件末尾添加新条目。
> 超过 30 条记录时，旧条目自动移到 `.ai/session-archive/`。

---

## 批次 1-3：UI 重构 + shadcn 清理 + i18n/a11y 优化
- 7 个主页面 UI/业务逻辑分层
- 删除 16 个无引用 shadcn 组件
- globals.css 设计系统 + 5 套主题
- Toast 重写、Modal 统一、Tabs 可访问组件
- 210+ i18n key 补充、IconButton aria-label 强制
- 深度审计 P0+P1+P2 全量修复（R167-R180）
- 性能优化 P0（R154-R157）+ i18n/UX 优化（R158-R166）
- 验证：typecheck ✅、lint ✅、test ✅

## 批次 4：架构重构
- StoryProvider 清理：删除死代码 + 移除 8 字段
- React.lazy 首屏优化：4 个首屏组件 lazy 化
- saveVideoTask 提取：新建 persist-task.ts
- useAssetLibraryActions 重构：22 扁平参数打包为 6 语义对象
- 项目切换功能 + 懒加载导航
- 验证：typecheck ✅、lint ✅

## 批次 5：UI 颜色系统清理
- 188 处硬编码 Tailwind 颜色 → 0 残留
- 新增 R181 回归规则
- 修正回归规则计数为 167（R181 added）
- 验证：lint ✅、color-grep ✅

## 批次 6：StoryBeat schema 清理
- 移除 scene + generationPrompt deprecated 字段
- shared/ui 目录删除，迁移到 shared/presentation
- route as 断言部分消除
- 验证：typecheck ✅

## 批次 7：全面 UI/UX 打磨
- 移除侧栏伪造 AI 进度
- 修复版本号不一致（统一 APP_VERSION 常量）
- 修复"故事模式"入口指向 ComingSoon
- 移除伪造团队协作头像
- 修复默认 Tab（video → details）
- 修复 useStoryPersistence 状态卡死
- 统一 Loading 组件（新建 PageLoader）
- Modal 焦点陷阱
- emoji → Lucide 图标
- 验证：typecheck ✅、lint ✅、test ✅

## 批次 8：快捷键 + 表单校验 + eslint
- 接入 useGlobalKeyboardActions（Ctrl+Z/S）
- 3 个表单名称必填校验
- setTimeout 魔法数字提取（14 处）
- eslint max-lines/max-params/complexity 规则
- error-codes 命名统一大写
- 验证：lint ✅、typecheck ✅

## 批次 9：历史遗留问题全面清理
- BeatDetailEditor 拆分（834 行 → 280 行 + 4 子组件：BasicInfoSection / ShotInstructionSection / GenerateTabContent / SettingsTabContent）
- 路由 as 断言消除（24 处）
- shared-logic 中文清理
- useAssetLibraryActions DRY 修复
- file-routes i18n 化
- PluginsPage 标准化
- tsconfig 严格选项
- docs/废弃/ 清理
- commit: 0155100 (refactor(arch): batch 9 - eliminate all historical technical debt)
- 验证：typecheck ✅、lint ✅

## 当前回归规则计数
- R1-R181（181 条规则）

## 后续待办
- shotType/camera deprecated 字段迁移（需重构 LLM 管线）
- imageGenerationPrompt 语义决策
- 9 个 ComingSoon 占位页面（产品功能未实现）

## 批次 10：Phase 0.5 v1.0 发布前全面打磨（Task 0.5.1-0.5.6）

### Task 0.5.1：分镜页面布局修复
- 删除 ProfessionalModeEditor 底部面板（ShotReferenceConfig + ReferenceVideoUploader 容器）
- ShotReferenceConfig 移入 BeatDetailEditor 第二列（ElementBindingPanel 之后）
- ReferenceVideoUploader 改为可折叠面板（默认收起，展开 maxHeight: 320，全宽显示）
- BeatPromptPanel 编辑区 flex:1 minHeight:180，预览区 maxHeight:240（上下结构优化）
- PromptPreview 样式微调（padding 10, fontSize 11, flex+overflow）

### Task 0.5.2：P0 隐患修复（3 项）
- SearchDialog 加入 250ms debounce（useEffect + setTimeout + cleanup）
- SidebarWithSearch 修复"先 slice(0,50) 再 filter"为"先 filter 再 slice(0,20)"
- useScenesPage / useCharacterPage highlight useEffect 加 useRef + isDirty 守卫
- video-tasks handleRefresh 从 window.location.reload() 改为 useVideoTaskStore.getState().initialize()
- R132 回归测试更新（验证 mockInitialize 被调用）

### Task 0.5.3：P1 反人类设计修复（9 项）
- P1-1：首页"故事模式"跳转 /story（不再和"分镜模式"同 URL）
- P1-2：Story 页面仅保留 storyboard tab（移除 4 个 ComingSoon tab）
- P1-3：侧栏移除 futurePreviewItems 数组和渲染
- P1-4：场景元素 badge 改为 badge + 独立 × 按钮（hover 变红）
- P1-5：场景图片 1:1 → 16:9，maxWidth 200 → 320
- P1-6：video-tasks 统计卡片 repeat(6,1fr) → repeat(auto-fit, minmax(160px, 1fr))
- P1-7：Beat 删除清理失败加入 showError toast（新增 i18n key error.cleanupFailed/Desc）
- P1-8：handleTestAllConnections 改为 Promise.allSettled 并行 + handleTestCapability 用 useCallback
- P1-9：搜索先 slice 再 filter（已在 P0-1 修复）

### Task 0.5.4：ComingSoon 清理
- 首页移除 2 个 ComingSoon 快速入口（模板市场、工作流编辑器），改为 4 列布局
- Story 页面移除 ComingSoon 死代码和未使用 import

### Task 0.5.5：novel 模块占位处理
- 删除 src/modules/novel/ 目录（domain/contract.json, domain/types.ts, MODULE.md, index.ts）
- 无外部依赖、无测试依赖、无 vite 配置引用

### Task 0.5.6：版本号统一到 v1.0
- src/shared/constants/app-version.ts: v0.12.2 → v1.0
- package.json: 0.12.2 → 1.0.0
- package-lock.json: 0.12.2 → 1.0.0
- 7 个文档文件同步：README.md, API_REFERENCE.md, TECHNICAL_REFERENCE.md, PROJECT-GUIDE.md, DEPLOYMENT.md, CODE_CATALOG.md

### 验证结果
- typecheck ✅（0 errors）
- lint ✅（0 errors, 264 warnings — 已存在的 max-lines/complexity 警告）
- lint:arch ✅（无架构违规）
- 测试：729 + 152 + 235 + 21 = 1137 个测试全部通过

### 修改文件清单
- src/modules/story/beat-editor/presentation/ProfessionalModeEditor.tsx
- src/modules/story/beat-editor/presentation/BeatDetailEditor.tsx
- src/modules/story/beat-editor/presentation/BeatPromptPanel.tsx
- src/modules/story/generation/presentation/PromptPreview.tsx
- src/shared/presentation/SearchDialog.tsx
- src/app/SidebarWithSearch.tsx
- src/app/scenes/hooks/useScenesPage.ts
- src/app/characters/hooks/useCharacterPage.ts
- src/app/video-tasks/hooks/useVideoTasksPage.ts
- src/app/video-tasks/hooks/__tests__/regression-r132-status-filter-and-refresh.test.ts
- src/app/page.tsx
- src/app/story/page.tsx
- src/shared/presentation/Sidebar.tsx
- src/app/scenes/page.tsx
- src/app/video-tasks/page.tsx
- src/app/story/useStoryActions.ts
- src/app/settings/ApiConfigPanel.tsx
- src/shared/constants/messages.ts
- src/shared/constants/app-version.ts
- package.json, package-lock.json
- 7 个文档文件
- 删除 src/modules/novel/ 目录（4 文件）
