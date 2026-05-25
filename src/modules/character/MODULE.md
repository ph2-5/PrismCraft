# Character Module

## 职责

角色管理：角色 CRUD、服装管理、角色图片生成

---

## 子域结构

本模块采用子域架构，包含 2 个内部子域：

| 子域 | 路径 | 职责 |
|------|------|------|
| `services` | [services/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/character/services/) | 角色 CRUD 服务、Result 模式 |
| `hooks` | [hooks/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/character/hooks/) | React Query Hooks 封装 |

---

## 公共 API（index.ts）

### 服务子域
- `characterService` — 角色服务（getAll, getById, create, update, delete, count）

### 常量子域
- `defaultCharacter` — 默认角色值
- `personalitySuggestions` — 性格建议列表
- `styleSuggestions` — 风格建议列表
- `genderSuggestions` — 性别建议列表
- `heightSuggestions` — 身高建议列表
- `buildSuggestions` — 体型建议列表

### Hooks 子域
- `useCharacters` — 获取角色列表 Hook
- `useCharacter` — 获取单个角色 Hook
- `useCharacterCount` — 获取角色数量 Hook
- `useCreateCharacter` — 创建角色 Hook
- `useUpdateCharacter` — 更新角色 Hook
- `useDeleteCharacter` — 删除角色 Hook
- `useCharacterCRUD` — CRUD 组合 Hook
- `useCharacterImage` — 角色图片生成 Hook
- `useOutfitManagement` — 服装管理 Hook（addOutfit, updateOutfit, deleteOutfit）

### 展示子域
- `CharacterListItem` — 角色列表项组件

---

## 依赖

- `@/domain/schemas` - Character, CreateCharacterInput, UpdateCharacterInput 类型
- `@/domain/types` - Result, fromAsyncThrowable, NotFoundError, ValidationError
- `@/infrastructure/di` - 依赖注入容器
- `@/shared/event-types` - 领域事件

---

## 边界约束

⚠️ **重要约束**：
- 子域之间只能通过各自的 `index.ts` 导出的 API 通信
- hooks 子域依赖 services 子域
- 禁止 hooks 直接引用 services 内部的实现细节

---

## AI 维护指南

本模块的详细 AI 重构规范请参见：[.ai/modules/character.md](../../../.ai/modules/character.md)

### 快速参考

- 禁止导入路径：`@/types/*`, `@/lib/*`, `@/modules/*/*/*`
- 类型必须从：`@/domain/schemas` 导入
- 使用 Result 模式处理异步操作
