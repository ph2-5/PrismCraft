# Scene Module

## 职责

场景管理：场景 CRUD、图片生成

---

## 子域结构

本模块采用子域架构，包含 2 个内部子域：

| 子域 | 路径 | 职责 |
|------|------|------|
| `services` | [services/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/scene/services/) | 场景 CRUD 服务、Result 模式 |
| `hooks` | [hooks/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/scene/hooks/) | React Query Hooks 封装 |

---

## 公共 API（index.ts）

### 服务子域
- `sceneService` — 场景服务（getAll, getById, create, update, delete, count）

### 常量子域
- `defaultScene` — 默认场景值
- `typeSuggestions` — 类型建议列表
- `timeSuggestions` — 时间建议列表
- `weatherSuggestions` — 天气建议列表
- `moodSuggestions` — 氛围建议列表
- `elementSuggestions` — 元素建议列表
- `colorSuggestions` — 颜色建议列表
- `angleSuggestions` — 角度建议列表
- `distanceSuggestions` — 距离建议列表
- `movementSuggestions` — 运动建议列表

### Hooks 子域
- `useScenes` — 获取场景列表 Hook
- `useScene` — 获取单个场景 Hook
- `useSceneCount` — 获取场景数量 Hook
- `useCreateScene` — 创建场景 Hook
- `useUpdateScene` — 更新场景 Hook
- `useDeleteScene` — 删除场景 Hook
- `useSceneCRUD` — CRUD 组合 Hook
- `useSceneImage` — 场景图片生成 Hook

### 展示子域
- `SceneListItem` — 场景列表项组件

---

## 依赖

- `@/domain/schemas` - Scene, CreateSceneInput, UpdateSceneInput 类型
- `@/domain/types` - Result, fromAsyncThrowable, NotFoundError, ValidationError
- `@/infrastructure/di` - 依赖注入容器
- `@/shared/event-types` - 领域事件

---

## 边界约束

⚠️ **重要约束**：
- 子域之间只能通过各自的 `index.ts` 导出的 API 通信
- hooks 子域依赖 services 子域
- 禁止 hooks 直接引用 services 内部的实现细节
- **Dirty 状态管理**：`useSceneCRUD` 中 `markClean("scenes")` 必须在保存成功且 `setCurrentScene` 之后调用；保存失败时 dirty 状态保留，确保用户收到未保存修改警告

---

## AI 维护指南

本模块的详细 AI 重构规范请参见：[.ai/modules/scene.md](../../../.ai/modules/scene.md)

### 快速参考

- 禁止导入路径：`@/types/*`, `@/lib/*`, `@/modules/*/*/*`
- 类型必须从：`@/domain/schemas` 导入
- 使用 Result 模式处理异步操作
