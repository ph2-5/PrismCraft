# Character Module

## 模块概述

角色管理模块，负责角色的 CRUD 操作、服装管理、角色图片生成。本模块使用 Result 模式处理所有异步操作错误，通过领域事件与其他模块解耦。

---

## 子域结构

| 子域 | 路径 | 职责 |
|------|------|------|
| `services` | [services/](./services/) | 角色 CRUD 服务，使用 Result 模式处理错误，触发领域事件 |
| `hooks` | [hooks/](./hooks/) | React Query Hooks 封装：CRUD、图片生成、服装管理 |
| `constants` | [constants.ts](./constants.ts) | 默认角色、性格建议等常量 |
| `presentation` | [presentation/](./presentation/) | 角色列表项、服装对话框 |

---

## 公共 API

### services 子域

| API | 签名 | 说明 |
|-----|------|------|
| `characterService` | CharacterService | 角色服务（getAll, getById, create, update, delete, count） |

### constants 子域

| API | 签名 | 说明 |
|-----|------|------|
| `defaultCharacter` | Character | 默认角色值 |
| `personalitySuggestions` | `string[]` | 性格建议列表 |
| `styleSuggestions` | `string[]` | 风格建议列表 |
| `genderSuggestions` | `string[]` | 性别建议列表 |
| `heightSuggestions` | `string[]` | 身高建议列表 |
| `buildSuggestions` | `string[]` | 体型建议列表 |

### hooks 子域

| API | 签名 | 说明 |
|-----|------|------|
| `useCharacters` | `() → UseQueryResult<Character[]>` | 获取角色列表 |
| `useCharacter` | `(id: string) → UseQueryResult<Character>` | 获取单个角色 |
| `useCharacterCount` | `() → UseQueryResult<number>` | 获取角色数量 |
| `useCreateCharacter` | `() → UseMutationResult<Result<Character>>` | 创建角色 |
| `useUpdateCharacter` | `() → UseMutationResult<Result<Character>>` | 更新角色 |
| `useDeleteCharacter` | `() → UseMutationResult<Result<void>>` | 删除角色 |
| `useCharacterCRUD` | `() → CharacterCRUDResult` | CRUD 组合 Hook |
| `useCharacterImage` | `() → CharacterImageResult` | 角色图片生成 Hook |
| `useOutfitManagement` | `() → OutfitManagementResult` | 服装管理 Hook（addOutfit, updateOutfit, deleteOutfit） |

### presentation 子域

| API | 签名 | 说明 |
|-----|------|------|
| `CharacterListItem` | `React.FC<CharacterListItemProps>` | 角色列表项组件 |
| `OutfitDialog` | `React.FC<OutfitDialogProps>` | 服装编辑对话框组件 |

---

## 依赖关系

| 依赖 | 用途 |
|------|------|
| `@/domain/schemas` | Character, CreateCharacterInput, UpdateCharacterInput 类型定义 |
| `@/domain/types` | Result, fromAsyncThrowable, NotFoundError, ValidationError 类型 |
| `@/infrastructure/di` | 依赖注入容器，获取 characterStorage 实例 |
| `@/shared/event-types` | 领域事件类型（character:created, character:updated, character:deleted） |
| `@tanstack/react-query` | hooks 子域的数据获取与缓存 |

### 子域内部依赖图

```
services ← @/domain/schemas, @/domain/types, @/infrastructure/di, @/shared/event-types
  │
  ▼
hooks ← services, @/domain/schemas, @/domain/types, @/shared/event-types
```

- `services`：底层服务子域，提供 characterService 等 CRUD 操作
- `hooks`：上层 React hooks 子域，依赖 services 提供的服务

---

## 边界约束

1. 子域之间只能通过各自的 `index.ts` 导出的 API 通信
2. `hooks` 子域依赖 `services` 子域
3. 禁止 `hooks` 直接引用 `services` 内部的实现细节
4. 禁止导入路径：`@/types/*`、`@/lib/*`、`@/modules/*/*/*`
5. 类型必须从 `@/domain/schemas` 导入
6. 禁止 `@/infrastructure/*` 直接导入（除 `@/infrastructure/di`），必须通过 DI 容器

---

## 不变量

- **INV-1**：所有服务操作使用 `Result<T>` 类型返回，禁止抛出异常
- **INV-2**：使用 `createCharacterInputSchema` 和 `updateCharacterInputSchema` 校验输入
- **INV-3**：创建、更新、删除操作触发对应的领域事件（character:created, character:updated, character:deleted）
- **INV-4**：`services` 子域不依赖其他子域
- **INV-5**：角色创建时必须提供 `name` 字段
- **INV-6**：角色删除使用软删除（`is_deleted` 标记）
- **INV-7**：图片操作通过 DI 容器获取 storage 实现
- **INV-8**：使用 React Query 进行数据获取和缓存，mutation 成功后自动 `invalidateQueries`
- **INV-9**：所有 hooks 必须处理 loading/error 状态
- **INV-10**：mutation hooks 必须触发事件通知（通过 `@/shared/event-types`）

---

## AI 维护指南

详细 AI 重构规范请参见：[.ai/modules/character.md](../../../.ai/modules/character.md)

### 修改前必读顺序

1. 本文件（MODULE.md）— 模块概览与公共 API
2. 子域 `contract.json` — 不变量与依赖
3. [.ai/modules/character.md](../../../.ai/modules/character.md) — 详细修改规则
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

- **R2**：删除角色时必须级联清理关联资源（story_characters, character_outfits, 本地图片文件）
- **R11**：异步图片生成回调必须验证角色 ID 一致性，防止用户切换后更新错误实体
- **R14**：AI 分析结果必须合并到当前状态，不能整体替换（防止覆盖用户编辑）
- **R29**：异步回调必须验证实体 ID 一致性
- **R30**：级联删除操作必须在单个 `safeTransaction` 中完成

### 测试

- 测试文件位于各子域的 `__tests__/` 目录
- 运行：`npx vitest run src/modules/character`
- 新增服务必须编写单元测试
