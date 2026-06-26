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
