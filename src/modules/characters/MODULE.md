# Characters Page Module ✅

> 角色管理页面型模块。提供角色列表浏览、角色详情编辑、AI 生图预览等入口。

## 概述

角色页面是用户管理角色档案的主入口，支持角色列表展示、属性编辑、AI 生图请求预览。本模块为页面型模块，仅暴露 `CharactersPage` 给路由，业务逻辑由 `character` 模块（带子域）提供。

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 公共 API

- `CharactersPage` — 角色页面组件（默认导出，由 router lazy import）

## 子域

| 子域 | 状态 | 文件 | 说明 |
|------|:----:|------|------|
| 页面入口 | ✅ | `page.tsx` | 角色页面主入口 |
| 页面编排 | ✅ | `hooks/use-character-page.ts` | 页面状态编排（列表 + 编辑器） |
| 列表展示 | ✅ | `CharacterList.tsx` | 角色列表组件 |
| 角色编辑 | ✅ | `CharacterEditor.tsx` | 角色属性编辑器 |
| AI 生图预览 | ✅ | `AiRequestPreview.tsx` | AI 生图请求参数预览 |

## 边界约束

- **依赖方向**：可导入 `@/domain/*`, `@/shared/*`, `@/shared-logic/*`, `@/infrastructure/di`
- **禁止导入**：`@/infrastructure/*`（除 DI 容器），`@/modules/*`（其他模块的深层路径），`@/app/*`
- **业务逻辑**：复用 `@/modules/character`（带子域的完整模块）的 `characterService` 等公共 API
- **文件操作**：通过 `@/shared/file-http` 统一层，禁止直接调用 `electronAPI`

## 与 `character` 模块的区别

- `character`（无 s）：带子域的完整业务模块，提供 `characterService`、hooks、domain 类型等
- `characters`（带 s）：页面型模块，仅提供 `CharactersPage` 路由入口，业务能力依赖 `character` 模块

## 测试

- `__tests__/regression-parallel-updates.test.ts` — 并行更新回归
