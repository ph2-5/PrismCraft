# Agentic Engineering 方法论

> 一套让 AI 写出生产级代码的工程化基础设施。
> 从 PrismCraft 项目的 89K 行代码实践中提炼。

---

## 核心理念

**AI 不是"写代码的工具"，而是"执行工程纪律的智能体"。**
问题不在于 AI 能力不够，而在于你没有给 AI 足够的工程约束。

```
传统开发：人写代码 → 人检查 → 人修复
Vibe Coding：AI写代码 → 人不检查 → 能跑就上线 → 一改就崩
Agentic Engineering：人定义规则+约束+质量门 → AI在框架内写代码 → 自动验证 → 可维护
```

---

## 六大支柱

```
┌─────────────────────────────────────────────────────────┐
│                   Agentic Engineering                    │
├───────────────┬───────────────┬─────────────────────────┤
│  支柱一        │  支柱二        │  支柱三                 │
│  分层规则加载   │  防幻觉检查点   │  回归防护分类体系       │
│  Layer 0/1/2  │  强制读取      │  8类151条 + Q1-Q5决策   │
├───────────────┼───────────────┼─────────────────────────┤
│  支柱四        │  支柱五        │  支柱六                 │
│  会话状态管理   │  契约驱动开发   │  任务决策树             │
│  日志+声明+快照 │  contract+MDULE│  新功能/修bug/审查流程  │
└───────────────┴───────────────┴─────────────────────────┘
```

---

## 支柱一：分层规则加载

**问题**：AI 上下文有限。把所有规则塞给 AI，它只会用 5%。

**方案**：三级加载，按需供给。

```
Layer 0 (始终加载，~1,500 tokens)
  核心命令 + 关键路径 + 10条核心规则
  文件：quick-start.md

Layer 1 (任务触发加载，~3,000 tokens)
  新功能开发 → architecture-rules.md
  Bug 修复 → regression-guard-automation.md
  测试编写 → testing-rules.md

Layer 2 (按需搜索，不预加载)
  按 bug 类别加载对应回归防护文件
  按模块加载 MODULE.md
  按子域加载 contract.json
```

**关键原则**：AI 不需要知道所有规则，只需要知道当前任务相关的规则。

---

## 支柱二：防幻觉检查点

**问题**：AI 会幻觉不存在的 API、函数、token、i18n key。

**方案**：AI 在执行特定操作前，**必须先读取对应的源文件**。

| 操作 | 必须先读 | 原因 |
|------|---------|------|
| 调用 DI container 的 token | `container.ts` | 防止幻觉不存在的 token |
| 使用 `@/shared-logic/` 的函数 | 对应 shared-logic 文件 | 防止幻觉不存在的函数 |
| 添加 API 路由 | `schemas.ts` + `types.ts` | 防止幻觉不存在的 schema |
| 修改 Zustand Store | 现有 Store 文件 | 防止幻觉不存在的 state/method |
| 使用 `t()` 国际化 | `messages.ts` | 防止幻觉不存在的 i18n key |
| 修改数据库 Schema | `db-schema.ts` | 防止幻觉不存在的表/列 |
| 文件操作/配置读写 | `@/shared/file-http` | 防止直接调用 electronAPI |

**关键原则**：不读源码不写代码。搜索优先于新建。

---

## 支柱三：回归防护分类体系

**问题**：修了一个 bug，过段时间又复现了。AI 不知道这个 bug 以前出现过。

**方案**：每个 bug 修复后，写入结构化规则。按类别分类，按需加载。

```
回归防护结构：
  regression/
    index.md              → 分类索引（151条规则，8个类别）
    data-consistency.md   → 20条，数据一致性
    async-safety.md       → 20条，异步安全
    error-handling.md     → 14条，错误处理
    ui-robustness.md      → 9条，UI 健壮性
    engineering.md        → 18条，工程质量
    platform.md           → 6条，平台兼容
    user-safety.md        → 17条，用户安全
    system-security.md    → 26条，系统安全
```

**每条规则包含**：
- BAD 示例（错误写法）
- GOOD 示例（正确写法）
- 触发条件（什么情况下会触发这个 bug）
- 验证方法（如何确认修复有效）
- 发现来源（哪个 bug 导致了这条规则）

**Q1-Q5 决策框架**：修完 bug 后，判断是否加入回归防护：

```
Q1: 可复现吗？    → 否 → 只加监控日志
Q2: 会回归吗？    → 否 → 结构修复，不需要
Q3: 风险高吗？    → 否 → 低优先级
Q4: 可测试吗？    → 否 → 只写规则，不写测试
Q5: 成本合理吗？  → 否 → 简化规则

全部为"是" → 加入回归防护（规则 + 测试）
```

---

## 支柱四：会话状态管理

**问题**：AI 会话无状态。每次新对话，AI 不知道上次做了什么。多会话同时修改同一文件会冲突。

**方案**：三个文件解决。

### 4.1 追加式会话日志 `session-notes.md`

```
### [2026-06-14] 架构重构 — 已完成
- 创建 shared-logic 层
- defineRoute 泛型化
- 遗留：theme 组件需要迁移

### [2026-06-15] 修复视频轮询 bug — 已完成
- 修复轮询不停止的问题
- 添加回归测试 R105
```

**规则**：只追加，不修改。超过 30 条自动归档。

### 4.2 工作声明 `work-claims.md`

```
### [进行中] 修复视频轮询 bug
- 文件: src/modules/video/.../use-video-task-polling.ts
- 开始: 2026-06-15 10:00
- 交接: 修改 pollTask 函数中的清理逻辑

### [已完成] 修复视频轮询 bug
- 文件: src/modules/video/.../use-video-task-polling.ts
- 结束: 2026-06-15 10:30
```

**规则**：修改文件前先声明。已被声明的文件不碰。超过 2 小时未更新视为过期。

### 4.3 上下文快照 `context-snapshot.mjs`

新会话开始时运行，一键恢复：
```
=== AI Context Snapshot ===
Branch: main
Modified files: 52
Recent commits: ...
Recent session entries: ...
Active work claims: None
Typecheck: ✅ Clean
```

---

## 支柱五：契约驱动开发

**问题**：AI 不知道模块的边界在哪，什么可以改，什么不能改。

**方案**：每个模块有契约，每次修改前 AI 先读契约。

### 5.1 模块契约 `MODULE.md`

```markdown
<!-- AI: Before modifying, read contract.json for invariants -->
# Video Module

## 子域结构
| 子域 | 路径 | 职责 |
|------|------|------|
| task-management | ... | 状态机、Store、轮询 |
| cache | ... | 磁盘缓存、清理 |
| recovery | ... | 验证、去重、重试 |

## 公共 API
- useVideoTaskManager
- useVideoTaskStore
- cacheVideoBlob
- ...

## 边界约束
- 禁止直接调用 electronAPI.dbQuery
- 文件操作必须走 @/shared/file-http
```

### 5.2 子域契约 `contract.json`

```json
{
  "publicAPI": ["useVideoTaskManager", "useVideoTaskStore"],
  "invariants": [
    "setAllTasks 不自动触发同步",
    "stableActions 引用不变"
  ]
}
```

**规则**：AI 修改模块前，必须先读 MODULE.md 和 contract.json。不能违反 invariants。

---

## 支柱六：任务决策树

**问题**：AI 收到任务后不知道从哪开始，容易跳过关键步骤。

**方案**：按任务类型走标准流程。

### 新功能开发

```
1. 定位模块 → 读 MODULE.md
2. 定位子域 → 读 contract.json
3. 检查依赖 → 读 DI container
4. 搜索现有实现 → Grep 优先
5. 先写类型 → 再写服务 → 再写 hook → 最后写组件
6. 验证 → typecheck + lint:arch + test
```

### Bug 修复

```
1. 定位 → 找到 bug 文件和触发条件
2. 修复 → 最小修改原则
3. 回归防护评估 → Q1-Q5 决策
4. 验证 → 原有测试不回归 + 新增测试通过
```

### 代码审查

```
1. 读变更 → git diff
2. 架构合规 → 检查 import 语句
3. 回归防护 → 检查是否触发已知 bug 模式
4. 输出 → 通过/需修改/需讨论
```

---

## 实施清单

如果你要在自己的项目中应用这套方法论：

```
立即可做（1天）：
☑ 创建 .trae/rules/quick-start.md（核心命令 + 10条规则）
☑ 在代码头部添加 AI 指令注释
☑ 建立搜索优先原则（Grep 在新建之前）

本周可做（1周）：
☑ 建立分层规则加载（Layer 0/1/2）
☑ 建立防幻觉检查点（强制读取表）
☑ 建立追加式会话日志

本月可做（1月）：
☑ 建立回归防护分类体系
☑ 建立 MODULE.md 契约
☑ 建立任务决策树

持续迭代：
☑ 每次修 bug 后评估是否加入回归防护
☑ 每次新模块建立 contract.json
☑ 定期审计规则有效性
```

---

## 与其他方法的对比

| 方法 | 描述 | 适合 | 不足 |
|------|------|------|------|
| Vibe Coding | 自然语言 → AI 生成代码 | 原型验证 | 不可维护 |
| Vibe Engineering | 结构化 prompts + 单文件 rules | 小型项目 | 上下文爆炸 |
| Agentic Engineering（本方法） | 分层规则 + 防幻觉 + 回归防护 + 契约 + 会话管理 | 中大型项目 | 初期投入大 |
| SDD (Spec-Driven) | Spec 文档驱动 | 需求明确的项目 | 不适合快速迭代 |

---

## 核心哲学

> **AI 的能力上限，不取决于模型，而取决于你给它的工程约束。**
>
> 给 AI 一个混乱的代码库，最好的模型也写不出好代码。
> 给 AI 一套清晰的规则和约束，普通的模型也能写出生产级代码。
>
> **知识工程（Knowledge Engineering）是 AI 时代真正的护城河。**