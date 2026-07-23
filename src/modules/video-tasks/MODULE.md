# Video Tasks Page Module ✅

> 视频任务列表页面型模块。提供视频生成任务的统一查看、状态筛选、批量管理入口。

## 概述

视频任务页面是用户查看所有视频生成任务（pending/generating/completed/failed 等）的主入口，支持状态筛选、刷新、统计。本模块为页面型模块，仅暴露 `VideoTasksPage` 给路由，业务逻辑由 `video/task-management` 子域提供。

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 公共 API

- `VideoTasksPage` — 视频任务页面组件（默认导出，由 router lazy import）

## 子域

| 子域 | 状态 | 文件 | 说明 |
|------|:----:|------|------|
| 页面入口 | ✅ | `page.tsx` | 视频任务页面主入口 |
| 页面编排 | ✅ | `hooks/use-video-tasks-page.ts` | 页面状态编排（列表 + 筛选 + 统计） |

## 边界约束

- **依赖方向**：可导入 `@/domain/*`, `@/shared/*`, `@/shared-logic/*`, `@/infrastructure/di`
- **禁止导入**：`@/infrastructure/*`（除 DI 容器），`@/modules/*`（其他模块的深层路径），`@/app/*`
- **任务访问**：通过 `@/modules/video` 的 `useVideoTaskState`/`useVideoTaskQueries` 等 hook 读取任务状态，不直接访问 store
- **文件操作**：通过 `@/shared/file-http` 统一层，禁止直接调用 `electronAPI`

## 测试

- `hooks/__tests__/regression-r156-tasks-stats-memo.test.ts` — R156 任务统计 memo 回归
- `hooks/__tests__/regression-r184-status-filter-and-refresh.test.ts` — R184 状态筛选 + 刷新回归
