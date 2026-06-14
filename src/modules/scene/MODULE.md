<!-- AI: Before modifying this module, read contract.json for invariants -->
# Scene Module

## 模块概述

场景管理模块，负责场景的 CRUD 操作、场景图片生成。本模块使用 Result 模式处理所有异步操作错误，通过领域事件与其他模块解耦。场景模块与角色模块结构对称，共享相同的设计模式。

---

## 子域结构

| 子域 | 路径 | 职责 |
|------|------|------|
| `services` | [services/](./services/) | 场景 CRUD 服务，使用 Result 模式处理错误，触发领域事件 |
| `hooks` | [hooks/](./hooks/) | React Query Hooks 封装：CRUD、图片生成 |
| `constants` | [constants.ts](./constants.ts) | 默认场景、类型建议等常量 |
| `presentation` | [presentation/](./presentation/) | 场景列表项 |

---

## 公共 API

### services 子域

| API | 签名 | 说明 |
|-----|------|------|
| `sceneService` | SceneService | 场景服务（getAll, getById, create, update, delete, count） |

### constants 子域

| API | 签名 | 说明 |
|-----|------|------|
| `defaultScene` | Scene（from @/domain/schemas） | 默认场景值 |
| `typeSuggestions` | `string[]` | 类型建议列表 |
| `timeSuggestions` | `string[]` | 时间建议列表 |
| `weatherSuggestions` | `string[]` | 天气建议列表 |
| `moodSuggestions` | `string[]` | 氛围建议列表 |
| `elementSuggestions` | `string[]` | 元素建议列表 |
| `colorSuggestions` | `string[]` | 颜色建议列表 |
| `angleSuggestions` | `string[]` | 角度建议列表 |
| `distanceSuggestions` | `string[]` | 距离建议列表 |
| `movementSuggestions` | `string[]` | 运动建议列表 |

### hooks 子域

| API | 签名 | 说明 |
|-----|------|------|
| `useScenes` | `() → UseQueryResult<Scene[]>` | 获取场景列表 |
| `useScene` | `(id: string) → UseQueryResult<Scene>` | 获取单个场景 |
| `useSceneCount` | `() → UseQueryResult<number>` | 获取场景数量 |
| `useCreateScene` | `() → UseMutationResult<Result<Scene>>` | 创建场景 |
| `useUpdateScene` | `() → UseMutationResult<Result<Scene>>` | 更新场景 |
| `useDeleteScene` | `() → UseMutationResult<Result<void>>` | 删除场景 |
| `useSceneCRUD` | `() → SceneCRUDResult` | CRUD 组合 Hook |
| `useSceneImage` | `() → SceneImageResult` | 场景图片生成 Hook |

### presentation 子域

| API | 签名 | 说明 |
|-----|------|------|
| `SceneListItem` | `React.FC<SceneListItemProps>` | 场景列表项组件 |

---

## 依赖关系

| 依赖 | 用途 |
|------|------|
| `@/domain/schemas` | Scene, CreateSceneInput, UpdateSceneInput 类型定义 |
| `@/domain/types` | Result, fromAsyncThrowable, NotFoundError, ValidationError 类型 |
| `@/infrastructure/di` | 依赖注入容器，获取 sceneStorage 实例 |
| `@/shared/event-types` | 领域事件类型（scene:created, scene:updated, scene:deleted） |
| `@tanstack/react-query` | hooks 子域的数据获取与缓存 |

### 子域内部依赖图

```
services ← @/domain/schemas, @/domain/types, @/infrastructure/di, @/shared/event-types
  │
  ▼
hooks ← services, @/domain/schemas, @/domain/types, @/shared/event-types
```

- `services`：底层服务子域，提供 sceneService 等 CRUD 操作
- `hooks`：上层 React hooks 子域，依赖 services 提供的服务

---

## 边界约束

1. 子域之间只能通过各自的 `index.ts` 导出的 API 通信
2. `hooks` 子域依赖 `services` 子域
3. 禁止 `hooks` 直接引用 `services` 内部的实现细节
4. 禁止导入路径：`@/types/*`、`@/lib/*`、`@/modules/*/*/*`
5. 类型必须从 `@/domain/schemas` 导入
6. 禁止 `@/infrastructure/*` 直接导入（除 `@/infrastructure/di`），必须通过 DI 容器
7. **Dirty 状态管理**：`useSceneCRUD` 中 `markClean("scenes")` 必须在保存成功且 `setCurrentScene` 之后调用；保存失败时 dirty 状态保留，确保用户收到未保存修改警告

---

## 不变量

- **INV-1**：所有服务操作使用 `Result<T>` 类型返回，禁止抛出异常
- **INV-2**：使用 `createSceneInputSchema` 和 `updateSceneInputSchema` 校验输入
- **INV-3**：创建、更新、删除操作触发对应的领域事件（scene:created, scene:updated, scene:deleted）
- **INV-4**：`services` 子域不依赖其他子域
- **INV-5**：场景创建时必须提供 `name` 字段
- **INV-6**：场景删除使用软删除（`is_deleted` 标记）
- **INV-7**：图片操作通过 DI 容器获取 storage 实现
- **INV-8**：使用 React Query 进行数据获取和缓存，mutation 成功后自动 `invalidateQueries`
- **INV-9**：所有 hooks 必须处理 loading/error 状态
- **INV-10**：mutation hooks 必须触发事件通知（通过 `@/shared/event-types`）
- **INV-11**：`markClean("scenes")` 必须在保存成功且 `setCurrentScene` 之后调用，确保 dirty 状态正确清除
- **INV-12**：保存失败时 dirty 状态必须保留，用户离开页面时应收到未保存修改警告

---

## AI 维护指南

详细 AI 重构规范请参见：[.ai/modules/scene.md](../../../.ai/modules/scene.md)

### 修改前必读顺序

1. 本文件（MODULE.md）— 模块概览与公共 API
2. 子域 `contract.json` — 不变量与依赖
3. [.ai/modules/scene.md](../../../.ai/modules/scene.md) — 详细修改规则
4. `index.ts` — 实际桶导出

### 新增公共 API 时

1. 在子域 `index.ts` 中导出
2. 在模块 `index.ts` 中重新导出
3. 更新本文件「公共 API」部分
4. 更新子域 `contract.json` 的 `publicAPI` 字段
5. 运行 `node scripts/check-module-api-consistency.mjs` 验证

### 修改子域内部实现时

1. 检查 `contract.json` 的 `invariants`，确保不违反不变量
2. 不改变公共 API 签名则无需更新文档
3. 运行 `npx eslint .` 和 `node scripts/check-architecture.mjs` 验证

### 回归守卫提醒

- **R2**：删除场景时必须级联清理关联资源（story_scenes, story_beats 引用, storyboard_assets 引用, 本地图片文件）
- **R11**：异步图片生成回调必须验证场景 ID 一致性，防止用户切换后更新错误实体
- **R14**：AI 分析结果必须合并到当前状态，不能整体替换（防止覆盖用户编辑）
- **R29**：异步回调必须验证实体 ID 一致性
- **R30**：级联删除操作必须在单个 `safeTransaction` 中完成

### 测试

- 测试文件位于各子域的 `__tests__/` 目录
- 运行：`npx vitest run src/modules/scene`
- 新增服务必须编写单元测试
