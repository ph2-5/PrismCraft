# Story Module

## 职责

故事创作与分镜管理、提示词生成与编排、批量视频生成。

---

## 子域结构

本模块采用子域架构，包含 4 个内部子域：

| 子域 | 路径 | 职责 |
|------|------|------|
| `planning` | [planning/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/story/planning/) | 故事规划、分镜列表、大纲编辑 |
| `beat-editor` | [beat-editor/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/story/beat-editor/) | 分镜编辑器、镜头配置、元素绑定、镜头指令 |
| `generation` | [generation/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/story/generation/) | 分镜生成、提示词构建、批量任务编排、进度展示 |
| `template` | [template/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/story/template/) | 模板管理、版本控制、样式预设 |

---

## 公共 API (index.ts)

### 规划子域
- `storyService` — 故事服务
- `useStoryPlanner` — 故事规划 Hook
- `useStories` — 获取故事列表 Hook
- `useStory` — 获取单个故事 Hook
- `useStoryCount` — 获取故事数量 Hook
- `useCreateStory` — 创建故事 Hook
- `useUpdateStory` — 更新故事 Hook
- `useDeleteStory` — 删除故事 Hook
- `DEFAULT_STORY` — 默认故事值
- `genres` — 题材列表
- `tones` — 基调列表
- `beatTypes` — 节拍类型列表
- `useStorySaver` — 故事保存 Hook
- `CreationMode` — 创作模式类型 (type)
- `QuickInputMode` — 快速输入模式类型 (type)
- `PlaceholderBinding` — 占位符绑定类型 (type)
- `QuickStoryData` — 快速故事数据类型 (type)

### 引用解析
- `resolveCharacterRef` — 解析角色引用
- `resolveSceneRef` — 解析场景引用

### 生成子域
- `useAIGeneratorBase` — AI 生成基础 Hook
- `useKeyframeGenerator` — 关键帧生成 Hook
- `useFramePairGenerator` — 帧对生成 Hook
- `useVideoGenerator` — 视频生成 Hook
- `useBatchGenerator` — 批量生成 Hook
- `useUploadHandlers` — 上传处理 Hook
- `ShotGenerationPanel` — 分镜生成面板组件
- `KeyframePanel` — 关键帧面板组件
- `KeyframeChainVisualizer` — 关键帧链可视化组件
- `PromptPreview` — 提示词预览组件
- `ShotReferenceConfig` — 分镜引用配置组件
- `ReferenceVideoUploader` — 引用视频上传组件
- `generateBeatKeyframe` — 生成分镜关键帧
- `generateBeatFramePair` — 生成分镜帧对
- `generateBeatVideo` — 生成分镜视频
- `generateBeatFullWorkflow` — 生成分镜完整工作流
- `generateKeyframeChain` — 生成关键帧链
- `generateFramePairChain` — 生成帧对链
- `determineVideoGenerationMode` — 确定视频生成模式
- `generateFramePrompts` — 生成帧提示词
- `batchGenerateFramePrompts` — 批量生成帧提示词
- `generateStyleGuide` — 生成风格指南
- `generateStylePromptOnly` — 仅生成风格提示词
- `AIGeneratorBaseProps` — AI 生成基础属性类型 (type)
- `ResolvedRefs` — 已解析引用类型 (type)
- `VideoGenerationMode` — 视频生成模式类型 (type)
- `BatchStrategy` — 批量策略
- `GenerationLevel` — 生成级别
- `BatchOptions` — 批量选项类型 (type)
- `BatchResult` — 批量结果类型 (type)

### 分镜编辑子域
- `useStoryState` — 故事状态 Hook
- `useAssetLoader` — 资产加载 Hook
- `BeatDetailEditor` — 分镜详情编辑器组件
- `BeatOverviewCard` — 分镜概览卡片组件
- `SortableBeatList` — 可排序分镜列表组件
- `ElementBindingPanel` — 元素绑定面板组件
- `ProfessionalModeEditor` — 专业模式编辑器组件

### 模板子域
- `TemplateManagerDialog` — 模板管理对话框组件
- `VersionDialog` — 版本对话框组件
- `AssetPicker` — 资产选择器组件
- `StoryboardTemplate` — 分镜模板类型 (type)
- `StoryboardTemplateBeat` — 分镜模板节拍类型 (type)
- `createTemplateFromBeats` — 从节拍创建模板
- `applyTemplateToBeats` — 将模板应用到节拍
- `exportTemplateToFile` — 导出模板到文件
- `importTemplateFromFile` — 从文件导入模板
- `restoreVersion` — 恢复版本
- `formatVersionTime` — 格式化版本时间
- `saveVersion` — 保存版本
- `getVersions` — 获取版本列表
- `deleteVersion` — 删除版本
- `cleanupVersions` — 清理版本
- `getVersionStats` — 获取版本统计
- `compareVersions` — 比较版本
- `StoryVersion` — 故事版本类型 (type)
- `getRecommendedTemplates` — 获取推荐模板
- `applyTemplate` — 应用模板
- `StoryTemplate` — 故事模板类型 (type)

### 提示词编辑子域
- `generatePromptWithAI` — AI 生成提示词
- `buildDefaultPrompt` — 构建默认提示词
- `usePromptEditor` — 提示词编辑器 Hook
- `PromptEditor` — 提示词编辑器组件
- `PromptFloatingBall` — 提示词浮动球组件
- `PromptEditorContext` — 提示词编辑器上下文类型 (type)
- `PromptEditorRequest` — 提示词编辑器请求类型 (type)
- `PromptEditorResult` — 提示词编辑器结果类型 (type)

---

## 依赖

- `@/domain/types` - Result 类型、错误类型
- `@/domain/schemas` - Story, StoryBeat, ElementBinding 等
- `@/infrastructure/storage` - 数据存储
- `@/infrastructure/di` - 依赖注入容器
- `@/modules/prompt` - 提示词生成
- `@/modules/shot` - 分镜功能
- `@/modules/element` - 元素管理
- `@/modules/shot-elements` - 元素绑定

---

## 边界约束

⚠️ **重要约束**：
- 子域之间只能通过各自的 `index.ts` 导出的 API 通信
- 禁止直接引用其他子域的内部文件（如 `planning/utils.ts`）
- **Dirty 状态抑制**：`useStoryState` 使用 `suppressDirtyCountRef`（计数器）而非布尔值，确保保存后多次 beats 变更都能被正确抑制，避免 dirty 状态残留导致页面无法跳转

---

## AI 维护指南

本模块的详细 AI 重构规范请参见：[.ai/modules/story.md](../../../.ai/modules/story.md)

### 快速参考

- 禁止导入路径：`@/types/*`, `@/lib/*`, `@/modules/*/*/*`
- 类型必须从：`@/domain/types` 或 `@/domain/schemas` 导入
- 使用 Result 模式处理异步操作
- 错误类型从 `@/domain/types` 导入：`NotFoundError`, `ValidationError`, `BusinessRuleError`

