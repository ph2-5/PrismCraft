# Scenes Page Module

> 场景管理页面型模块。提供场景列表浏览、场景详情编辑入口。

## 概述

场景页面是用户管理场景档案的主入口，支持场景列表展示、属性编辑。本模块为页面型模块，仅暴露 `ScenesPage` 给路由，业务逻辑由 `scene` 模块（带子域）提供。

## 公共 API

- `ScenesPage` — 场景页面组件（默认导出，由 router lazy import）

## 子域

| 子域 | 文件 | 说明 |
|------|------|------|
| 页面入口 | `page.tsx` | 场景页面主入口 |
| 页面编排 | `hooks/use-scenes-page.ts` | 页面状态编排（列表 + 编辑器） |
| 列表展示 | `components/SceneList.tsx` | 场景列表组件 |
| 场景编辑 | `SceneEditorParts.tsx` | 场景属性编辑器部件 |

## 边界约束

- **依赖方向**：可导入 `@/domain/*`, `@/shared/*`, `@/shared-logic/*`, `@/infrastructure/di`
- **禁止导入**：`@/infrastructure/*`（除 DI 容器），`@/modules/*`（其他模块的深层路径），`@/app/*`
- **业务逻辑**：复用 `@/modules/scene`（带子域的完整模块）的 `sceneService` 等公共 API
- **文件操作**：通过 `@/shared/file-http` 统一层，禁止直接调用 `electronAPI`

## 与 `scene` 模块的区别

- `scene`（无 s）：带子域的完整业务模块，提供 `sceneService`、hooks、domain 类型等
- `scenes`（带 s）：页面型模块，仅提供 `ScenesPage` 路由入口，业务能力依赖 `scene` 模块

## 测试

当前无 `__tests__/` 目录，建议补充页面级回归测试。
