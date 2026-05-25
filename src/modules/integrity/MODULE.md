# Integrity Module

## 职责

SQL 注入防护、Schema 注册与验证。

---

## 子域结构

| 子域 | 路径 | 职责 |
|------|------|------|
| `services` | [services/](./services/) | sqlSanitizer、schemaRegistry |

---

## 公共 API (index.ts)

- `ColumnKind` — 列类型枚举 (type)
- `sanitizeIdentifier` — 标识符安全化
- `sanitizeTable` — 表名安全化
- `buildSafeInsert` — 构建安全的 INSERT 语句
- `buildSafeUpdate` — 构建安全的 UPDATE 语句
- `buildSafeDelete` — 构建安全的 DELETE 语句
- `registerColumn` — 注册单列定义
- `registerColumns` — 批量注册列定义
- `getColumnKind` — 获取列类型
- `getAllRegisteredColumns` — 获取所有已注册列
- `isColumnRegistered` — 检查列是否已注册

---

## 依赖

- `@/shared/error-logger` — 日志记录

---

## 约束

- buildSafeUpdate/buildDelete 只允许已注册的列名，防止 SQL 注入
- Schema 重复注册时 console.warn 提示但不阻止（兼容热重载）
- SQL 关键字（SELECT, INSERT, UPDATE, DELETE, WHERE 等）不允许作为列名
