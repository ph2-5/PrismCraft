# AI Animation Studio 文档索引

## 核心文档

| 文档 | 用途 | 受众 |
|------|------|------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | **单一权威文档**：架构、设计决策、模块、存储、安全、开发指南 | 人 + AI |
| [di-tokens.md](di-tokens.md) | DI 容器 Token 参考（自动生成） | AI |
| [plugin-specification.md](plugin-specification.md) | 插件规范 | 人 |
| [plugin-spec.schema.json](plugin-spec.schema.json) | 插件规范 JSON Schema | AI |
| [bug-audit-report.md](bug-audit-report.md) | Bug 审计报告（R1-R18 来源） | 人 |
| [bug-audit-methodology.md](bug-audit-methodology.md) | 审计方法论 | 人 |

## 架构图

[architecture/diagrams/](architecture/diagrams/) 目录包含架构图（PNG + Mermaid 源文件 + HTML 交互查看器）。

## AI 维护文档

| 文档 | 用途 | 受众 |
|------|------|------|
| [.trae/rules/project_rules.md](../.trae/rules/project_rules.md) | 权威规则：架构、依赖、DI、工作流 | AI |
| [.trae/rules/regression-guards.md](../.trae/rules/regression-guards.md) | 27 条回归防护规则 | AI |
| src/modules/*/MODULE.md | 模块契约（职责、子域、API） | 人 + AI |
| src/modules/**/contract.json | 子域契约（不变量、依赖） | AI |
