# 贡献指南

感谢您考虑为 PrismCraft 贡献代码！PrismCraft 是一款本地优先的 AI 动画创作桌面应用（Electron + React + TypeScript），采用双协议模式（AGPL-3.0-only + 商业授权，详见 [LICENSE](./LICENSE) 与 [COMMERCIAL_LICENSE.md](./COMMERCIAL_LICENSE.md)）。本文档说明了参与贡献的流程与规范。

> ⚠️ **贡献者许可**：提交 PR 即表示您同意将贡献的代码以 AGPL-3.0-only 协议开源，并授予项目维护者在商业授权版本中使用您贡献代码的权利。请勿提交与 AGPL-3.0 不兼容的代码。

## 贡献流程概要

```
fork 仓库 → 创建分支 → 编写代码 → 本地验证 → 提交 PR → 代码审查 → 合并
```

1. Fork 本仓库到您的 GitHub 账号；
2. 基于 `main` 创建特性分支，命名建议 `feat/<功能名>`、`fix/<问题名>` 或 `refactor/<范围>`；
3. 按本文档规范编写代码与测试；
4. 在本地完成全部验证（见「验证」一节）；
5. 提交 Pull Request，并在描述中说明改动目的与影响范围；
6. 等待代码审查，根据反馈迭代。

## 开发环境设置

### 环境要求

- **Node.js 20+**（推荐使用 LTS 版本）
- **npm**（随 Node.js 安装）
- Windows / macOS / Linux 桌面环境

### 初始化

```bash
git clone <您的 fork 地址>
cd PrismCraft
npm install
npm run dev
```

应用启动后即可在开发模式下进行调试。

## 代码规范要求

### TypeScript

- 启用 **strict 模式**；
- **禁止使用 `any`**（生产代码中零容忍）；
- 类型先行：先确认 / 定义类型再编写实现；
- 公共 API 必须导出明确的类型。

### 代码风格

- 使用项目配置的 **ESLint + Prettier** 进行格式化与静态检查；
- 提交前请运行 `npm run lint` 确保无 lint 错误。

### 架构分层规则（关键）

PrismCraft 采用严格的分层架构，依赖方向如下：

```
app → modules → domain
              → shared-logic
              → shared
              → infrastructure/di（仅通过 container）
infrastructure → domain, shared
shared-logic → 无（纯逻辑，零外部依赖）
shared → domain, infrastructure（仅代理导出）
domain → 无（纯类型）
```

核心约束：

- `domain/` 与 `shared-logic/` **零外部依赖**，不得导入任何项目层；
- `modules/` **不得直接 import `@/infrastructure/*`**，仅允许 `@/infrastructure/di`；
- 跨模块导入使用 barrel `@/modules/xxx`，禁止深路径 `@/modules/xxx/hooks/yyy`；
- 文件操作与配置读写必须经 `@/shared/file-http` 统一层，禁止在 modules 中直接调用 `electronAPI`；
- 数据库操作必须走 HTTP API，禁止在 modules 中直接使用 `dbQuery` / `dbRun` 等 IPC。

### 国际化（i18n）

- 所有**用户可见字符串**必须使用 `t()` 国际化，禁止硬编码中文；
- 新增文案请同步在 `messages.ts` 中补充对应键值；
- 涉及密钥请先在 `messages.ts` 中搜索是否已有同类键，避免重复。

### 错误处理

- `catch` 块必须使用 `errorLogger` 记录错误，**禁止空 catch**；
- 不要静默吞掉异常；
- 对用户可见的错误请给出友好提示（通过事件总线或 toast）。

## 测试要求

- **新增功能必须附带测试**；
- Bug 修复建议补充回归测试；
- 提交前运行 `npm run validate` 完成全套验证（包含 typecheck、lint、测试等）。

```bash
npm run validate
```

## 提交信息规范

采用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 规范：

```
<type>: <描述>
```

常用 type：

| type | 用途 |
| ---- | ---- |
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变行为） |
| `docs` | 文档变更 |
| `chore` | 构建 / 工程化杂项 |
| `test` | 测试相关 |

示例：

```
feat: Agent 助手支持切换大模型
fix: 修复 useVideoTasksPage statusFilter 不一致 bug
refactor: 引入 MINUTE_MS/HOUR_MS/DAY_MS 时间常量
```

## PR 流程

1. PR 标题遵循 Conventional Commits 规范；
2. PR 描述包含：
   - 改动目的；
   - 涉及的模块 / 层；
   - 是否包含破坏性变更；
   - 关联的 Issue（如有）；
3. 确保 CI 全部通过；
4. 至少一位维护者 Review 后方可合并；
5. 涉及架构变更的 PR 可能需要更长时间审查，请耐心配合。

## 回归守卫规则

项目在 `.trae/rules/regression-guards.md` 中维护了 **151 条回归守卫规则**（R1 ~ R151），记录了历史上出现过的 Bug 模式及其防护要求。

- 修复 Bug 时，请检索该文件确认是否已有对应规则；
- 若修复的是新类型的 Bug 模式，请按编号规范补充新规则（避免与现有编号冲突）；
- 规则编号一旦分配不可复用，删除规则时保留编号占位以防止冲突；
- 涉及已有规则覆盖范围的改动，请在 PR 中说明是否触发了相应规则。

感谢您的贡献！
