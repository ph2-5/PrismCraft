# Regression Guards — 分类索引

> 这些规则是**回归防护**（regression guards）——防止已知 bug 模式再次出现。
> 它们**不是**未来审计的发现工具。未来审计必须从使用场景出发，而非从此列表出发。

**⚠️ 关键隔离原则**：规则是回归防护，NOT 发现工具。不要用此列表作为未来审计的起点。

**总计：142 条规则 | 8 个分类**

| 分类 | 规则编号 | 规则数 | 文件 |
|------|---------|--------|------|
| 一、数据一致性 | R1, R2, R8, R9, R13, R14, R30, R36, R37, R42, R45, R64, R65, R66, R68, R69, R72, R109, R116, R125, R141 | 21 | [data-consistency.md](data-consistency.md) |
| 二、异步安全 | R4, R10, R11, R12, R29, R31, R32, R34, R38, R46, R48, R62, R67, R85, R106, R110, R115, R117, R122, R127, R140 | 21 | [async-safety.md](async-safety.md) |
| 三、错误处理 | R5, R6, R15, R17, R18, R44, R47, R50, R53, R56, R63, R86, R108, R129, R134, R136 | 16 | [error-handling.md](error-handling.md) |
| 四、UI 健壮性 | R7, R16, R19, R20, R22, R23, R24, R25, R35 | 9 | [ui-robustness.md](ui-robustness.md) |
| 五、工程质量 | R3, R26, R27, R28, R33, R39, R40, R41, R54, R55, R57, R58, R59, R60, R87, R88, R92, R107, R135 | 19 | [engineering.md](engineering.md) |
| 六、平台兼容 | R21, R43, R49, R51, R52, R61 | 6 | [platform.md](platform.md) |
| 七、用户安全防护 | R70, R71, R73, R74, R75, R76, R77, R89, R90, R91, R93, R94, R95, R96, R97, R98, R99 | 17 | [user-safety.md](user-safety.md) |
| 八、系统安全 | R78, R79, R80, R81, R82, R83, R84, R100, R101, R102, R103, R104, R105, R111, R112, R113, R114, R118, R119, R120, R121, R123, R124, R126, R128, R130, R131, R132, R133, R137, R138, R139, R142 | 33 | [system-security.md](system-security.md) |

## 使用方式

- AI 上下文加载时，按需加载相关分类文件，而非加载全部 142 条规则
- 每个分类文件包含该分类下所有规则的完整文本（BAD/GOOD 示例、验证方法、发现来源）
- 完整原始文件见 [../regression-guards.md](../regression-guards.md)

## R131-R142 新增规则速览

> 以下规则为后续安全审计与一致性补强新增，详细 BAD/GOOD 示例见对应分类文件与测试文件。

| 规则 | 主题 | 分类 | 测试文件 |
|------|------|------|---------|
| R131 | SQLite 外键约束必须启用（PRAGMA foreign_keys = ON） | 系统安全 | `electron/src/database/__tests__/regression-r131-foreign-keys-enabled.test.ts` |
| R132 | sync-http-client 发起 HTTP 请求前必须调用 SSRF 校验 | 系统安全 | `electron/src/__tests__/regression-r132-sync-http-client-ssrf.test.ts` |
| R133 | SSRF 校验异常时必须 fail-close（视为私有 URL） | 系统安全 | `electron/src/__tests__/regression-r133-ssrf-fail-close.test.ts` |
| R134 | handler 返回 `{ success: false }` 时必须使用 HTTP 400 状态码 | 错误处理 | `electron/src/api/__tests__/regression-r134-http-status-code.test.ts` |
| R135 | secureConfigRouteSchema 必须使用 `operation` 字段（与 handler 一致） | 工程质量 | `electron/src/api/__tests__/regression-r135-secure-config-schema.test.ts` |
| R136 | bulk-save 路由必须收集失败任务信息并在响应中返回 `failures` | 错误处理 | `electron/src/api/route-groups/__tests__/regression-r136-bulk-save-failures.test.ts` |
| R137 | db-interface 错误消息中的 params 必须经 `sanitizeParams` 脱敏 | 系统安全 | `electron/src/database/__tests__/regression-r137-param-sanitization.test.ts` |
| R138 | schema-builder 生成的 SQL 中表名/列名必须用双引号包裹 | 系统安全 | `electron/src/database/__tests__/regression-r138-schema-builder-quotes.test.ts` |
| R139 | `validateSqlIdentifier` 必须使用 `^[a-zA-Z_][a-zA-Z0-9_]*$` 正则 | 系统安全 | `electron/src/database/__tests__/regression-r139-identifier-validation.test.ts` |
| R140 | polling-engine 必须通过 `initPollingEngine()` 惰性初始化，禁止模块级副作用 | 异步安全 | `src/modules/video/task-management/hooks/internals/__tests__/regression-r140-polling-engine-lazy-init.test.ts` |
| R141 | db/run HTTP 路由在写操作成功后必须调用 `scheduleSave()` | 数据一致性 | `electron/src/api/__tests__/regression-r141-db-run-schedule-save.test.ts` |
| R142 | api-gateway-utils `isPrivateUrl` 异常时必须 fail-close（返回 true） | 系统安全 | `electron/src/__tests__/regression-r142-api-gateway-ssrf-fail-close.test.ts` |
