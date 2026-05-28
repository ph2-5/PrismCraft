# AI 维护操作手册

本文档是 AI 修改本项目代码时的操作指南。修改前必读，修改后必验。

---

## 1. 修改前必读顺序

```
1. docs/ARCHITECTURE.md          → 全局架构、依赖方向、状态机、数据流
2. src/modules/{target}/MODULE.md → 目标模块公共 API、不变量、依赖
3. src/modules/{target}/{subdomain}/contract.json → 子域合约、invariants
4. .trae/rules/regression-guards.md → 33 条回归守则
5. 本文档                         → 修改流程、验证步骤
```

**总阅读量**：~10,500 字（全局 + 目标模块 + 本文档），2 分钟内可完成。

---

## 2. 常见修改模式

### 2.1 新增 Storage 方法

```
1. 在 src/infrastructure/storage/{entity}.ts 添加方法
2. 使用 safeQuery/safeRun/safeTransaction（从 @/shared/db-core 导入）
3. 参数化查询，禁止字符串拼接
4. JSON 容器更新用 json_set(COALESCE(container, '{}'), '$.key', ?)
5. 变更后调用 trackChange()（从 @/infrastructure/storage/core 导入）
6. 在 @/shared/ 创建代理导出（如果模块需要访问）
7. 更新 MODULE.md 公共 API
8. 添加 __tests__/ 单元测试
```

### 2.2 新增 React Hook

```
1. 在 src/modules/{module}/{subdomain}/hooks/ 创建文件
2. 异步操作返回 Result<T>，使用 fromAsyncThrowable 包装
3. useEffect 中的异步操作必须有取消守卫（cancelledRef 或 AbortController）
4. 组件卸载时清理：setInterval → clearInterval, AbortController → abort()
5. 使用 useRef 存储稳定引用，避免闭包陷阱
6. 在 subdomain/index.ts 导出
7. 在 module/index.ts re-export
8. 更新 MODULE.md 公共 API
```

### 2.3 新增数据库表

```
1. 在 electron/src/database/db-schema.ts 添加 TableDef
2. 设置 featureGroup（core/video/sync/templates/assets）
3. 包含 BASE_COLUMNS（owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id）
4. 易变字段用 JSON 容器列（config, provider, media_refs 等）
5. 递增 CURRENT_SCHEMA_VERSION
6. 在 MIGRATIONS 数组添加迁移函数
7. 迁移函数使用 db.transaction() 包装
8. 在 electron/src/database/json-schemas.ts 添加对应 parse 函数
9. 运行 npm run typecheck:electron 验证
```

### 2.4 新增 DI Token

```
1. 确定类别（A-E）：
   A: Domain Port 实现（如 xxxProvider, xxxStorage）
   B: 有状态服务（如 eventBus, apiClient）
   C: Storage 实例（如 xxxStorage）
   D: Repository 实例（Drizzle ORM）
   E: 懒加载模块（避免循环依赖，必须注释说明原因）
2. 在 src/infrastructure/di/container.ts 的 tokens 对象中添加
3. 如果是纯函数 → 不注册 DI，改用 @/shared/ 代理导出
4. 更新 docs/di-tokens.md（运行 npm run di-docs）
```

### 2.5 修改模块公共 API

```
1. 在 subdomain/index.ts 添加/删除导出
2. 在 module/index.ts re-export
3. 更新 MODULE.md 公共 API 部分
4. 更新 contract.json 的 publicAPI 字段
5. 运行 node scripts/check-module-api-consistency.mjs 验证
```

---

## 3. 修改后必验步骤

```bash
# 完整验证（推荐每次修改后运行）
npm run validate:full

# 等价于以下命令的组合：
npx tsc --noEmit                                     # 类型安全
npx tsc -p electron/tsconfig.json --noEmit           # Electron 类型安全
npx eslint src/                                      # 导入限制 + 代码风格
node scripts/check-architecture.mjs                  # DDD 违规检测
node scripts/check-module-api-consistency.mjs         # MODULE.md ↔ index.ts 同步
node scripts/validate-contracts.mjs                  # 合约结构 + 不变量
npx vitest run                                       # 单元测试
```

### 快速验证（小改动）

```bash
npx tsc --noEmit && npx vitest run src/modules/{target}
```

---

## 4. 构建 & 部署

### 本地开发

```bash
npm run dev                    # Next.js 开发服务器（仅渲染进程）
npm run build:electron         # 完整 Electron 构建
npm run build:win              # 构建 Windows NSIS 安装包
```

### CI/CD

- **CI**（.github/workflows/ci.yml）：lint → typecheck → 架构检查 → 模块 API 一致性 → 单元测试 → Electron 构建
- **Release**（.github/workflows/release.yml）：`v*` 标签触发 → 构建 → electron-builder 发布
- **Pre-commit**（.husky/pre-commit）：typecheck → 架构检查 → lint-staged

### 关键构建注意事项

- Next.js 使用 `output: "export"`，不支持服务端特性
- `build-electron.ps1` 临时移除 `src/app/api/` 以兼容静态导出
- `better-sqlite3` 原生模块通过 `asarUnpack` 解包
- CI 中 `.npmrc` 仅保留 `registry=https://registry.npmjs.org/`（不包含 electron_mirror）
- `package-lock.json` 的 resolved URL 必须与 CI 使用的 registry 一致

---

## 5. 常见陷阱

| 陷阱 | 正确做法 | 回归守则 |
|------|---------|---------|
| 先更新 React 状态再写数据库 | 先写数据库，再更新状态 | R1 |
| 删除实体不清理关联数据 | 级联删除所有引用和缓存 | R2 |
| 用 React state 做并发守卫 | 用 useRef（避免闭包陷阱） | R10 |
| 静默吞掉错误返回"成功" | 错误路径必须返回失败指示 | R5 |
| 用 `message.includes("timeout")` 分类错误 | 用结构化错误码 + regex fallback | 反模式 #2 |
| 纯函数注册到 DI 容器 | 移到 @/shared/ 代理导出 | 反模式 #3 |
| 不必要的 `await import()` | 使用顶层静态导入 | R26 |
| 嵌套点击不 stopPropagation | 内层按钮调用 e.stopPropagation() | 反模式 #5 |
| Result<T> 不解包直接赋值 | 先检查 ok，再使用 value | 反模式 #6 |
| fetch("/api/...") 在 Electron 中 | 使用 DI/IPC/代理导出 | R21 |
| 删除前先 DELETE 再 INSERT | 先 INSERT 再 DELETE NOT IN | R13 |
| 级联删除拆成多个事务 | 合并为单个 safeTransaction | R30 |
| 保存后不验证实体上下文 | 快照 ID + 完成后验证 | R31 |
| 批量循环不检查卸载 | cancelledRef + useEffect cleanup | R32 |
| 写操作前做存在性检查 | UPDATE WHERE 自然处理 | R33 |

---

## 6. 文档更新清单

| 修改类型 | 需要更新的文档 |
|---------|--------------|
| 新增/修改模块公共 API | MODULE.md + contract.json + index.ts |
| 新增 DI Token | container.ts（添加类别注释）+ docs/di-tokens.md |
| 新增数据库表/列 | db-schema.ts + json-schemas.ts + MIGRATIONS |
| 新增回归守则 | regression-guards.md + project_rules.md |
| 架构变更 | ARCHITECTURE.md |
| 新增共享代理导出 | 对应 @/shared/ 模块 + ARCHITECTURE.md 5.4 节 |
