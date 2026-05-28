# AI Animation Studio 文档索引

## 必要性文档（AI 维护必读）

AI 修改代码时必须阅读的文档，按优先级排列：

| 优先级 | 文档 | 内容 | 何时读 |
|--------|------|------|--------|
| ★★★ | [ARCHITECTURE.md](ARCHITECTURE.md) | 全局架构、依赖方向、状态机、数据流、Schema、IPC 安全 | 每次修改前 |
| ★★★ | [AI-MAINTENANCE-GUIDE.md](AI-MAINTENANCE-GUIDE.md) | 修改流程、验证步骤、常见陷阱、文档更新清单 | 每次修改前 |
| ★★☆ | `src/modules/{target}/MODULE.md` | 目标模块公共 API、不变量、依赖 | 修改特定模块时 |
| ★★☆ | `src/modules/{target}/{subdomain}/contract.json` | 子域合约、invariants | 修改特定子域时 |
| ★☆☆ | [di-tokens.md](di-tokens.md) | DI 容器 Token 参考（自动生成，`npm run di-docs`） | 新增/修改 DI Token 时 |
| ★☆☆ | [bug-audit-methodology.md](bug-audit-methodology.md) | 审计方法论（3 阶段工作流） | 执行 Bug 审计时 |

## 参考文档（按需阅读）

| 文档 | 内容 | 何时读 |
|------|------|--------|
| [bug-audit-report.md](bug-audit-report.md) | Bug 审计报告（R1-R18 来源） | 了解历史 Bug 模式 |
| [plugin-specification.md](plugin-specification.md) | 插件系统规范 | 开发插件时 |
| [plugin-spec.schema.json](plugin-spec.schema.json) | 插件规范 JSON Schema | 验证插件配置时 |

## 架构图

[architecture/diagrams/](architecture/diagrams/) 目录包含架构图（PNG + Mermaid 源文件 + HTML 交互查看器）。

## 项目规则（.trae/rules/，仅本地）

| 文档 | 内容 | 受众 |
|------|------|------|
| `project_rules.md` | 架构规则、依赖方向、DI 工作流、33 条回归守则索引 | AI |
| `regression-guards.md` | R1-R33 回归守则完整定义 | AI |

## 历史文档（archive/）

[archive/](archive/) 目录存放历史过程文档，仅供追溯参考，不作为维护依据。
