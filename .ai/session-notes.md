# Session Log

> **追加式日志** — AI 每次会话只追加新条目，不修改或删除已有条目。
> 防止多会话同时写入时互相覆盖。
> 超过 30 条时，旧条目归档到 `.ai/session-archive/`。

---

## 如何使用

### 会话开始时
1. 读取本文件最后 5 条记录 → 了解最近变更
2. 读取 `.ai/work-claims.md` → 了解哪些工作正在进行
3. 运行 `node .ai/context-snapshot.mjs` → 获取当前代码状态摘要

### 会话结束时
1. 在本文件末尾**追加**一条记录（不修改已有内容）
2. 在 `.ai/work-claims.md` 中更新或释放工作声明
3. 如果有未完成的工作，在声明中标注进度和下一步

---

## 日志记录

### [2026-06-14] 架构重构 — 已完成
- 创建 `src/shared-logic/` 层（16 文件），消除主进程/渲染进程逻辑重复
- `defineRoute` 泛型化 + Zod `z.infer` 类型推导（30+ Request 类型）
- `ApiResponse<T>` 泛型化 + `ApiError` 类型
- Zustand Store CQRS 拆分（state/queries/commands/polling 四层）
- SyncEngine 类化（6 个模块级 let → 类属性）
- 视觉一致性结构化（JSON 优先 + 正则降级解析）
- DI 容器内省（`TOKEN_IDS` + `getTokenRegistry()`）
- ESLint `no-direct-db-ipc` 规则
- 删除 15 个废弃文件
- 拆分 regression-guards.md 为 9 个按类别文件
- 回归防护自动化协议（Q1-Q5 决策框架）
- AI 工具集成指南 + 追加式会话日志 + 工作声明机制 + 上下文快照脚本

### [2026-06-14] AI 协作机制 — 已完成
- 改造 session-notes.md 为追加式日志（防多会话覆盖）
- 创建工作声明机制 `.ai/work-claims.md`（防会话冲突）
- 创建上下文快照脚本 `.ai/context-snapshot.mjs`（新会话快速恢复上下文）
- 更新 ai-tool-integration.md（频繁切换对话场景）

---

## 已知风险
- shared-logic 中 logger 被移除，路由处理器需自行记录日志
- Route.handler 方法语法双变，理论上允许不匹配的 body 类型（defineRoute 输入端仍严格）

## 架构速查
```
依赖方向: app → modules → shared-logic → domain
                    ↓           ↓
                  shared    infrastructure/di

新增层: src/shared-logic/ — 纯业务逻辑，零外部依赖
新增路径别名: @/shared-logic/* (renderer), @shared-logic/* (main process)
新增 API 模式: defineRoute({ schema, handler, methods }) — handler body 自动推导类型
新增 DI: syncEngine token (E 类懒加载)
新增 ESLint: no-direct-db-ipc (modules 层禁止 IPC 数据库操作)
```

### [2026-06-20] 全项目底层代码逻辑问题审计与修复 — 已完成

**审计范围**：全项目底层代码逻辑问题（安全、数据完整性、状态同步、资源生命周期、IPC/API、业务逻辑、中危问题）

**修复阶段**：
1. **阶段1-3（致命问题）**：安全漏洞、数据完整性、数据持久化（前序会话已完成）
2. **阶段4（状态同步高危）**：commands 委托 store action、sync push-pull 原子性、useStoryPersistence debounce
3. **阶段5（资源生命周期高危）**：FileTransport flush 失败回队列、closeAllTransports、setup 函数幂等
4. **阶段6（IPC/API 安全高危）**：重定向 SSRF、openPath 白名单、token 不返回、解密不回退明文、base64 回退移除、providerId 校验、sync Zod schema
5. **阶段7（业务逻辑高危）**：pending→completed 转换、批量取消通知服务端、沙箱 constructor 锁定、apiKey header 传递、INSERT OR REPLACE → ON CONFLICT
6. **阶段8（中危问题）**：输入验证（config-storage/secure-config）、边界条件 NaN 检查（scenes/changelog/queries/s3-file-storage/error-logger/database/ssrf-guard）、资源释放（db-connection 定时器）、错误处理（plugin-worker catch 日志）、并发（download-manager 重复调度）、日志可观测性、SQL 注释剥离、shared-logic-resolve 运行时检查

**回归防护**：
- 新增 R110-R130 共 21 条回归规则（R110-R114 为补全已有测试的规则文档，R115-R130 为本次新增）
- 创建 15 个回归测试文件，全部通过验证
- 更新 regression-guards.md（总计 130 条规则）和 regression/index.md 分类索引

**修改文件清单**（阶段4-8）：
- `src/modules/video/task-management/hooks/use-video-task-commands.ts` — 委托 store action
- `src/domain/types/sync.ts` — SyncPushResult.syncedIds 字段
- `src/modules/sync/engine/sync-protocol.ts` — 移除提前 markChangesSynced
- `src/modules/sync/engine/sync-engine-class.ts` — 原子化 markChangesSynced
- `src/app/story/useStoryPersistence.ts` — 500ms debounce
- `electron/src/logging/transports/file.transport.ts` — flush 失败回队列
- `electron/src/logging/logger.ts` — closeAllTransports
- `electron/src/lifecycle/cleanup.ts` — 关闭 logger transport
- `src/modules/video/task-management/hooks/internals/task-initializer.ts` — 4个 setup 幂等
- `electron/src/api-gateway-utils.ts` — 重定向 SSRF 校验
- `electron/src/main-common.ts` — openPath 路径白名单
- `electron/src/handlers/sync.ts` — 移除 token 返回
- `electron/src/security/key-storage/strategies/safe-storage.strategy.ts` — 不回退明文
- `electron/src/handlers/config.ts` — 移除 base64 回退
- `electron/src/handlers/secure-config.ts` — providerId + apiKey 校验
- `electron/src/api/schemas.ts` — syncTestSchema/syncProxySchema
- `electron/src/api/route-groups/core-routes.ts` — 绑定 sync schema
- `src/modules/video/task-management/domain/task-machine.ts` — pending→completed
- `src/modules/video/task-management/hooks/use-video-task-manager.ts` — 批量取消通知
- `electron/src/plugins/plugin-worker.ts` — constructor 锁定 + catch 日志
- `electron/src/plugins/providers/google.ts` — apiKey header
- `src/modules/asset/asset-library/asa-export-service.ts` — ON CONFLICT DO UPDATE
- `electron/src/handlers/config-storage.ts` — 输入校验 + 审计日志
- `src/infrastructure/ai-providers/offline-queue-ops.ts` — JSON.parse try/catch + 日志
- `src/infrastructure/storage/scenes.ts` — parseInt NaN 检查
- `src/modules/sync/engine/changelog.ts` — lastSyncAt NaN 检查
- `src/infrastructure/storage/elements/queries.ts` — nextCode NaN 检查
- `src/infrastructure/storage/s3-file-storage.ts` — size/timestamp NaN 检查
- `src/shared/error-logger.ts` — 移除非空断言
- `electron/src/handlers/database.ts` — SQL 注释剥离 + 空检查
- `electron/src/security/ssrf-guard/ssrf-guard.ts` — IPv6 NaN 检查
- `electron/src/database/db-connection.ts` — 定时器清理 + 启动日志
- `electron/src/plugins/plugin-process-manager.ts` — kill 错误日志
- `src/infrastructure/network/download-manager.ts` — 重复调度防护
- `electron/src/shared-logic-resolve.ts` — _resolveFilename 运行时检查

**验证结果**：typecheck + typecheck:electron + lint + lint:arch 全部通过，222 测试文件 4201 测试通过（含新增 15 个回归测试）
