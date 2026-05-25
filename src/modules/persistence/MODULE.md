# Persistence Module

## 职责

自动保存、持久化守护、事务性删除。

---

## 子域结构

| 子域 | 路径 | 职责 |
|------|------|------|
| `hooks` | [hooks/](./hooks/) | useAutoSave、usePersistenceGuard |
| `services` | [services/](./services/) | transactionalDelete（级联删除+文件清理） |

---

## 公共 API (index.ts)

- `useAutoSave` — 自动保存 hook，带重试限制和最小间隔
- `usePersistenceGuard` — 持久化守护，防止数据丢失
- `deleteCharacterWithRefs` — 删除角色及其关联数据（级联删除+本地文件清理）
- `deleteSceneWithRefs` — 删除场景及其关联数据（级联删除+本地文件清理）

---

## 依赖

- `@/infrastructure/di` — 获取 storage 实例、safeQuery/safeRun/safeTransaction/sanitizeTable/sanitizeIdentifier
- `@/shared/error-logger` — 日志记录
- `@/domain/types/result` — Result 类型

---

## 约束

- 自动保存有 MAX_RETRY 限制（3 次），超过后停止重试
- 自动保存有 MIN_INTERVAL 限制（1 秒），防止过于频繁
- usePersistenceGuard 的 cancelledRef 防止组件卸载后继续保存
- transactionalDelete 在删除角色/场景时同步清理本地图片文件
