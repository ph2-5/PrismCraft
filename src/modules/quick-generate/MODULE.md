# Quick Generate Module ✅

> 快速生成页面型模块。提供单图/单视频的快速生成入口，包含表单、历史记录、模板选择、任务结果展示。

## 概述

快速生成是用户进行单次 AI 生成（图片/视频）的轻量入口，不需要创建完整项目或分镜。支持模板预设、参数高级配置、历史记录回看。本模块为页面型模块，仅暴露 `QuickGeneratePage` 给路由。

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 公共 API

- `QuickGeneratePage` — 快速生成页面组件（默认导出，由 router lazy import）

## 子域

| 子域 | 状态 | 文件 | 说明 |
|------|:----:|------|------|
| 页面入口 | ✅ | `page.tsx` | 快速生成页面主入口 |
| 页面编排 | ✅ | `hooks/use-quick-generate-page.ts` | 页面状态编排 |
| 表单 | ✅ | `QuickGenerateForm.tsx`, `QuickGenerateFormParts.tsx` | 生成参数表单 |
| 高级设置 | ✅ | `AdvancedSettingsCard.tsx` | 高级参数配置卡片 |
| 状态管理 | ✅ | `QuickGenerateState.ts`, `quick-generate-reducer.ts` | reducer 状态机 |
| 历史记录 | ✅ | `QuickGenerateHistory.tsx` | 历史任务列表 |
| 任务结果 | ✅ | `TaskResultPanel.tsx` | 任务结果展示面板 |
| 模板选择 | ✅ | `TemplateSelectDialog.tsx` | 模板预设选择对话框 |

## 边界约束

- **依赖方向**：可导入 `@/domain/*`, `@/shared/*`, `@/shared-logic/*`, `@/infrastructure/di`
- **禁止导入**：`@/infrastructure/*`（除 DI 容器），`@/modules/*`（其他模块的深层路径），`@/app/*`
- **任务创建**：通过 `@/modules/video` 的 `useVideoTaskManager` 等 hook 创建任务，不直接访问 store
- **文件操作**：通过 `@/shared/file-http` 统一层，禁止直接调用 `electronAPI`

## 测试

- `__tests__/regression-blob-url.test.ts` — Blob URL 回归
- `__tests__/regression-r177-dom-use-ref.test.tsx` — R177 DOM useRef 回归
