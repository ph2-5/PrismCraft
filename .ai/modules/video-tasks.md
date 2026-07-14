# Video Tasks 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| 任务列表展示 | 🟡 中 | stats memo 性能优化、状态过滤、刷新逻辑 |
| 页面组合 | 🟢 低 | `page.tsx` 组合列表，无业务逻辑 |

## 子域依赖图

```
page.tsx（组合入口）
  └→ hooks/use-video-tasks-page（业务逻辑）
       ← @/modules/video/task-management（通过 barrel 导入 useVideoTasks 等）
       ← @/shared/*（UI 工具）
```

> 本模块是 `video/task-management` 的 UI 视图层，不直接管理任务状态，仅通过 `useVideoTasks` 等 hook 读取数据。

## 公共 API

- `VideoTasksPage`（默认导出，由 router lazy import）— 唯一对外暴露的入口

> 本模块无 contract.json。所有内部文件不对外导出，仅由 `page.tsx` 内部组合使用。

## 常见修改场景

### 1. 修改任务列表展示
- 修改文件：`page.tsx`、`hooks/use-video-tasks-page.ts`
- 检查不变量：R156（stats memo 性能优化）、R184（状态过滤与刷新）
- 测试：`npx vitest run src/modules/video-tasks/hooks/__tests__/regression-r156-tasks-stats-memo.test.ts`、`regression-r184-status-filter-and-refresh.test.ts`

### 2. 修改任务过滤逻辑
- 修改文件：`hooks/use-video-tasks-page.ts`
- 注意：过滤逻辑必须使用 `useMemo` 缓存，避免每次渲染重新计算
- 测试：`npx vitest run src/modules/video-tasks/hooks/__tests__/regression-r184-status-filter-and-refresh.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`、`@/shared-logic/*`、`@/infrastructure/di`、`@/modules/video/task-management`（通过 barrel）
- **禁止导入**：`@/infrastructure/*`（除 DI 容器）、`@/modules/*`（除 video/task-management barrel）、`@/app/*`
- **状态访问**：通过 `useVideoTasks` / `useFailedVideoTasks` 等 hook 读取，禁止直接访问 `useVideoTaskStore`

## 测试验证

- 测试命令：`npx vitest run src/modules/video-tasks`
- 关键测试文件：
  - `hooks/__tests__/regression-r156-tasks-stats-memo.test.ts` — stats memo 性能
  - `hooks/__tests__/regression-r184-status-filter-and-refresh.test.ts` — 状态过滤与刷新
