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
