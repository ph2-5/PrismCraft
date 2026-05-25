# Feedback Module

> ⚠️ **DEPRECATED**: 此模块当前无外部消费者（0 consumers）。计划在 v2.0 合并到 `@/shared/hooks/`。在此之前保持现有导出不变。

## 职责

用户操作反馈、脏数据追踪、撤销操作。

---

## 子域结构

| 子域 | 路径 | 职责 |
|------|------|------|
| `hooks` | [hooks/](./hooks/) | useDirtyTracker、useUndoAction |
| `presentation` | [presentation/](./presentation/) | DirtyIndicator 组件 |

---

## 公共 API (index.ts)

- `useDirtyTracker` — 追踪表单/数据脏状态，支持 safeDeepEqual 比较
- `useUndoAction` — 撤销操作栈，支持多步撤销
- `useUndoHistory` — 撤销历史 Hook
- `DirtyIndicator` — 脏状态指示器 UI 组件（aria-live 无障碍）

---

## 依赖

- `@/domain/types/result` — AppError 类型
- `@/shared/error-logger` — 日志记录

---

## 约束

- 撤销栈有最大深度限制，防止内存泄漏
- DirtyTracker 使用 safeDeepEqual 避免误报
