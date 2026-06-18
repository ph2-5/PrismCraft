# AI Coding Tool Integration Guide

> 本文档针对 AI 编程工具（Trae, Cursor, Copilot 等）的实际工作模式，
> 优化项目的 AI 可维护性。核心原则：**让 AI 用最少的上下文做最正确的决策**。

---

## 一、AI 编程工具的实际工作模式

### 1.1 上下文预算

| 规则文件 | 大小 | Token 估算 | 实际任务所需 |
|----------|------|-----------|-------------|
| project_rules.md | 57KB | ~14,300 | 5-10% |
| regression-guards.md | 122KB | ~30,600 | 2-5% |
| quick-start.md | 6.5KB | ~1,600 | 30-50% |
| regression-guard-automation.md | 5KB | ~1,300 | 仅修 bug 时 |

**问题**: 规则文件总计 ~47,700 tokens，但 AI 工具每次会话的可用上下文有限。大部分规则对当前任务无用，但 AI 无法预判哪些有用。

### 1.2 AI 工具的典型失败模式

| 失败模式 | 表现 | 根因 |
|----------|------|------|
| **幻觉 API** | 调用不存在的函数或使用错误的参数 | AI 没读源码就写代码 |
| **跨层违规** | shared 导入 modules，domain 导入 infrastructure | AI 不知道依赖方向 |
| **重复造轮子** | 写了一个已存在的工具函数 | AI 没搜索就实现 |
| **遗漏副作用** | 修改 Store 忘记更新相关组件 | AI 只看了直接影响的文件 |
| **忘记国际化** | 硬编码中文字符串 | AI 不知道 t() 规则 |
| **过度工程** | 添加不必要的抽象或配置 | AI 倾向于"完整"而非"最小" |

---

## 二、分层规则加载策略

### 2.1 规则分层

将规则分为三层，AI 工具按需加载：

```
Layer 0: 始终加载（~1,500 tokens）— quick-start.md
  └── 命令、关键路径、核心规则（10 条以内）

Layer 1: 任务触发加载（~3,000 tokens）— 按任务类型加载
  ├── 新功能开发 → architecture-rules.md
  ├── Bug 修复 → regression-guard-automation.md + 相关 R{N} 规则
  ├── 重构 → architecture-rules.md + affected MODULE.md
  └── 测试编写 → testing-rules.md

Layer 2: 按需查找（不预加载）— 搜索时加载
  ├── regression-guards.md — 仅加载相关编号的规则
  ├── MODULE.md — 仅加载相关模块
  └── contract.json — 仅加载相关子域
```

### 2.2 实施方式

**quick-start.md 作为 Layer 0**，已经是最精简的。需要确保它包含"下一步去哪找"的指引。

**新建 Layer 1 文件**，从 project_rules.md 中提取高频规则：

---

## 三、任务驱动的决策树

AI 工具收到任务后，应按决策树逐步执行，而非一次性加载所有规则。

### 3.1 新功能开发

```
收到任务："添加 X 功能"
  │
  ├── Step 1: 定位模块
  │   ├── 这个功能属于哪个模块？→ 读 MODULE.md
  │   ├── 需要新模块？→ 读 "Add new module" 场景
  │   └── 跨模块？→ 读两个模块的 MODULE.md
  │
  ├── Step 2: 定位子域
  │   ├── 读 contract.json → 找到 publicAPI 和 invariants
  │   └── 确认新功能不违反 invariants
  │
  ├── Step 3: 检查依赖
  │   ├── 需要基础设施？→ 检查 DI container 有无现成 token
  │   │   └── getTokenRegistry() → 找到或新增
  │   ├── 需要 shared-logic？→ 检查 @/shared-logic/ 有无现成函数
  │   └── 需要新 API 路由？→ defineRoute + Zod schema
  │
  ├── Step 4: 编写代码
  │   ├── 先写类型 → domain/schemas/ 或模块内 domain/
  │   ├── 再写服务 → modules/{module}/{subdomain}/services/
  │   ├── 再写 hook → modules/{module}/{subdomain}/hooks/
  │   └── 最后写组件 → modules/{module}/presentation/
  │
  └── Step 5: 验证
      ├── typecheck + typecheck:electron
      ├── lint + lint:arch
      └── test（新增测试）
```

### 3.2 Bug 修复

```
收到任务："修复 X bug"
  │
  ├── Step 1: 复现与定位
  │   ├── 找到 bug 所在文件和函数
  │   └── 确认触发条件
  │
  ├── Step 2: 修复
  │   └── 最小修改原则 — 只改必要的代码
  │
  ├── Step 3: 回归防护评估（Q1-Q5）
  │   ├── 不需要 → 结束
  │   └── 需要 → 编写测试 + 规则
  │
  └── Step 4: 验证
      ├── 原有测试不回归
      └── 新增回归测试通过
```

### 3.3 代码审查

```
收到任务："审查 X 文件的变更"
  │
  ├── Step 1: 读取变更
  │   └── git diff 或读取修改后的文件
  │
  ├── Step 2: 架构合规检查
  │   ├── 依赖方向正确？→ 检查 import 语句
  │   ├── 没有跨层违规？→ 对照 Import Rules 表
  │   └── 没有违反 invariants？→ 对照 contract.json
  │
  ├── Step 3: 回归防护检查
  │   ├── 变更是否可能触发已知 bug 模式？
  │   │   └── 搜索 regression-guards.md 中的相关规则
  │   └── 变更是否需要新增回归测试？
  │
  └── Step 4: 输出审查结果
      ├── 通过 / 需修改 / 需讨论
      └── 具体问题和建议
```

---

## 四、防幻觉机制

### 4.1 强制读取检查点

AI 在执行以下操作前，**必须先读取对应文件**：

| 操作 | 必须先读 | 原因 |
|------|---------|------|
| 调用 DI container 的任何 token | `container.ts` 或 `getTokenRegistry()` | 防止幻觉不存在的 token |
| 使用 `@/shared-logic/` 的函数 | 对应的 shared-logic 文件 | 防止幻觉不存在的函数 |
| 添加 API 路由 | `schemas.ts` + `types.ts` | 防止幻觉不存在的 schema |
| 修改 Zustand Store | 现有 Store 文件 | 防止幻觉不存在的 state/method |
| 使用 `t()` 国际化 | `messages.ts` 搜索相关键 | 防止幻觉不存在的 i18n key |
| 修改数据库 Schema | `db-schema.ts` | 防止幻觉不存在的表/列 |
| 文件操作或配置读写 | `src/shared/file-http/index.ts` | 防止幻觉不存在的 file-http 函数，防止直接调用 electronAPI |

### 4.2 搜索优先原则

AI 在实现任何功能前，必须先搜索是否已有实现：

```
搜索顺序：
1. Grep 关键词 → 找到现有实现
2. Glob 模式 → 找到相关文件
3. SearchCodebase → 语义搜索
4. 都没找到 → 才新建
```

**规则**: 如果 Grep 找到了现有实现，必须复用而非重写。

### 4.3 类型驱动开发

AI 必须先确认类型再写实现：

```
1. 找到或定义类型 → domain/schemas/ 或 shared-logic/
2. 确认类型在 TypeScript 中编译通过 → typecheck
3. 基于类型写实现
4. 实现后再次 typecheck 确认
```

---

## 五、会话状态传递

### 5.1 问题：AI 会话是无状态的

每次新会话，AI 不知道上次做了什么。这导致：
- 重复分析相同的问题
- 不了解当前的进行中工作
- 可能覆盖之前的决策

### 5.2 解决方案：追加式会话日志

`.ai/session-notes.md` 采用**追加式**设计：

- **只追加，不修改** — 每个会话在文件末尾添加新条目，不修改已有内容
- **防止覆盖** — 多个会话同时写入时，各自追加各自的，不会互相覆盖
- **自动归档** — 超过 30 条记录时，旧条目移到 `.ai/session-archive/`

```markdown
### [2026-06-14] 架构重构 — 已完成
- 创建 shared-logic 层
- defineRoute 泛型化
- ...

### [2026-06-15] 修复视频轮询 bug — 已完成
- 修复轮询不停止的问题
- 添加回归测试 R105
```

### 5.3 工作声明机制（防会话冲突）

`.ai/work-claims.md` 防止多个 AI 会话同时修改同一文件：

**声明工作**:
```
### [进行中] 修复视频轮询 bug
- 会话: Trae-session-abc123
- 文件: src/modules/video/task-management/hooks/use-video-task-polling.ts
- 开始: 2026-06-15 10:00
- 交接: 修改 pollTask 函数中的清理逻辑
```

**释放工作**:
```
### [已完成] 修复视频轮询 bug
- 会话: Trae-session-abc123
- 文件: src/modules/video/task-management/hooks/use-video-task-polling.ts
- 开始: 2026-06-15 10:00
- 结束: 2026-06-15 10:30
- 交接: 无
```

**冲突规则**:
- 要修改的文件已被声明 → 等待或协商
- 声明超过 2 小时未更新 → 视为过期，可接手
- 声明标记为 `[进行中-阻塞]` → 需要人工介入

### 5.4 上下文快照脚本

新会话开始时运行 `node .ai/context-snapshot.mjs`，自动获取：

```
=== AI Context Snapshot ===

Branch: main
Modified files (52): ...
Change summary: 39 files changed, 589 insertions(+), 3407 deletions(-)
Recent commits: ...
Recent session entries: ...
Active work claims: None
Typecheck: ✅ Clean

=== End of Snapshot ===
```

**AI 无需逐个读取文件，一条命令即可恢复上下文。**

### 5.5 频繁切换对话的标准流程

```
新对话开始
  │
  ├── Step 1: 快速恢复上下文
  │   ├── 运行 node .ai/context-snapshot.mjs
  │   ├── 读取 .ai/session-notes.md 最后 5 条
  │   └── 读取 .ai/work-claims.md 活跃声明
  │
  ├── Step 2: 检查冲突
  │   ├── 要修改的文件是否已被声明？
  │   │   ├── 是 → 等待或协商
  │   │   └── 否 → 继续
  │   └── 声明自己的工作
  │
  ├── Step 3: 执行任务
  │   └── 按决策树执行（第三节）
  │
  └── Step 4: 交接
      ├── 追加 session-notes.md 条目
      ├── 释放 work-claims.md 声明
      └── 如果未完成，在声明中标注进度和下一步
```

### 5.6 对话中断恢复

当对话意外中断（超时、工具崩溃、手动切换）时：

```
恢复对话
  │
  ├── Step 1: 运行 node .ai/context-snapshot.mjs
  │   └── 看到当前修改状态
  │
  ├── Step 2: 检查 work-claims.md
  │   ├── 有自己的未完成声明 → 继续工作
  │   └── 无声明 → 检查 session-notes.md 确认上次做了什么
  │
  └── Step 3: 继续或重新开始
      ├── 如果修改还在 → 继续
      └── 如果修改丢失 → 从 session-notes.md 的描述重新开始
```

### 5.7 多工具协作场景

当同时使用多个 AI 工具（如 Trae + Cursor）时：

```
工具 A (Trae)                    工具 B (Cursor)
    │                                 │
    ├── 声明: 修改 video 模块          │
    │                                 ├── 检查 work-claims.md
    │                                 │   → video 模块已被声明
    │                                 │   → 选择其他任务
    │                                 ├── 声明: 修改 character 模块
    │                                 │
    ├── 完成, 释放声明                 │
    │                                 ├── 完成, 释放声明
    │                                 │
    └── 追加 session-notes            └── 追加 session-notes
```

**关键规则**: 每个工具在修改文件前必须检查 work-claims.md，避免冲突。

---

## 六、防幻觉机制

### 6.1 强制读取检查点

AI 在执行以下操作前，**必须先读取对应文件**：

| 操作 | 必须先读 | 原因 |
|------|---------|------|
| 调用 DI container 的任何 token | `container.ts` 或 `getTokenRegistry()` | 防止幻觉不存在的 token |
| 使用 `@/shared-logic/` 的函数 | 对应的 shared-logic 文件 | 防止幻觉不存在的函数 |
| 添加 API 路由 | `schemas.ts` + `types.ts` | 防止幻觉不存在的 schema |
| 修改 Zustand Store | 现有 Store 文件 | 防止幻觉不存在的 state/method |
| 使用 `t()` 国际化 | `messages.ts` 搜索相关键 | 防止幻觉不存在的 i18n key |
| 修改数据库 Schema | `db-schema.ts` | 防止幻觉不存在的表/列 |
| 文件操作或配置读写 | `src/shared/file-http/index.ts` | 防止幻觉不存在的 file-http 函数，防止直接调用 electronAPI |

### 6.2 搜索优先原则

AI 在实现任何功能前，必须先搜索是否已有实现：

```
搜索顺序：
1. Grep 关键词 → 找到现有实现
2. Glob 模式 → 找到相关文件
3. SearchCodebase → 语义搜索
4. 都没找到 → 才新建
```

**规则**: 如果 Grep 找到了现有实现，必须复用而非重写。

### 6.3 类型驱动开发

AI 必须先确认类型再写实现：

```
1. 找到或定义类型 → domain/schemas/ 或 shared-logic/
2. 确认类型在 TypeScript 中编译通过 → typecheck
3. 基于类型写实现
4. 实现后再次 typecheck 确认
```

---

## 七、AI 工具专用提示词

### 7.1 在 quick-start.md 顶部的 AI 指令

```markdown
<!-- AI TOOL INSTRUCTIONS -->
<!--
BEFORE writing ANY code, you MUST:
1. Read .ai/session-notes.md for recent context
2. Search for existing implementations (Grep/Glob) before creating new ones
3. Read the target file before editing it
4. Run typecheck after changes

FORBIDDEN patterns (will cause bugs):
- Never import from @/infrastructure/* in modules/ (use DI container or @/shared/ proxy)
- Never use electronAPI.dbQuery/dbRun in modules/ (use HTTP API)
- Never hardcode user-facing strings (use t() from @/shared/constants)
- Never use localStorage in useState (use usePreference)
- Never use any type in production code
- Never call electronAPI.writeFile/readFile/getConfig/setConfig directly in modules/ (use @/shared/file-http unified layer)
-->
```

### 7.2 模块级 AI 指令

在每个 MODULE.md 顶部添加：

```markdown
<!-- AI: Before modifying this module, read contract.json for invariants -->
```

### 7.3 关键文件头部指令

在 container.ts、schemas.ts、preload.ts 等关键文件头部添加：

```typescript
// AI: Use TOKEN_IDS or getTokenRegistry() to discover available tokens.
// AI: Do NOT guess token names — always verify before using.
```

`file-http/index.ts` 头部应添加：

```typescript
// AI: Use writeFile/readFile/getFileInfo/getCacheDirectory/getDiskSpace/fileExists/deleteFile from this module.
// AI: Do NOT call electronAPI.writeFile/getConfig directly.
```

---

## 八、实施优先级

| 优先级 | 改进项 | AI 收益 | 工作量 | 状态 |
|--------|--------|---------|--------|------|
| P0 | 拆分 regression-guards.md 为按类别文件 | 节省 ~28,000 tokens 上下文 | 中 | ✅ 已完成 |
| P0 | 创建 .ai/session-notes.md | 会话间状态传递 | 低 | ✅ 已完成 |
| P0 | 创建 .ai/work-claims.md | 防止多会话冲突 | 低 | ✅ 已完成 |
| P0 | 创建 .ai/context-snapshot.mjs | 新会话上下文恢复 | 低 | ✅ 已完成 |
| P1 | 添加 AI TOOL INSTRUCTIONS 到 quick-start.md | 防幻觉、防违规 | 低 | ✅ 已完成 |
| P1 | 添加文件头部 AI 指令 | 关键文件防幻觉 | 低 | ✅ 已完成 |
| P2 | project_rules.md 瘦身 | 节省 ~9,000 tokens 上下文 | 中 | ✅ 已完成 |
| P2 | 创建 architecture-rules.md (Layer 1) | 任务触发加载 | 中 | ✅ 已完成 |
| P2 | 创建 testing-rules.md (Layer 1) | 任务触发加载 | 中 | ✅ 已完成 |
| P3 | 决策树自动化脚本 | 引导 AI 执行流程 | 高 | 待执行 |
