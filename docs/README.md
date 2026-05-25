# AI Animation Studio 文档索引

## 核心文档

| 文档 | 用途 | 受众 |
|------|------|------|
| [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) | 项目总文档：架构、技术栈、模块、数据库、安全 | 人 |
| [CHANGELOG.md](CHANGELOG.md) | 修改记录 | 人 |
| [FIX_RECORDS.md](FIX_RECORDS.md) | 修复记录（3 轮，含代码级详情） | 人 |
| [TESTING.md](TESTING.md) | 测试指南 | 人 |

## 设计文档

| 文档 | 用途 |
|------|------|
| [task-management-v2-design.md](task-management-v2-design.md) | 视频任务管理 V2 设计 |
| [plugin-specification.md](plugin-specification.md) | 插件规范 |
| [plugin-spec.schema.json](plugin-spec.schema.json) | 插件规范 JSON Schema |

## 架构详细文档

[architecture/](architecture/) 目录包含 8 个专题文档和图表：

| 文档 | 内容 |
|------|------|
| 01-architecture-overview.md | 架构总览 |
| 02-task-management-v2.md | 任务管理 V2 |
| 03-module-api-reference.md | 模块 API 参考 |
| 04-testing-guide.md | 测试指南 |
| 05-development-guide.md | 开发指南 |
| 06-changelog.md | 变更日志 |
| 07-storage-layer.md | 存储层 |
| 08-error-handling.md | 错误处理 |
| diagrams/ | 架构图（PNG + Mermaid 源文件） |

## AI 维护文档

| 文档 | 用途 | 受众 |
|------|------|------|
| [.trae/rules/project_rules.md](../.trae/rules/project_rules.md) | **权威规则**：架构、依赖、DI、工作流 | AI |
| [.ai/README.md](../.ai/README.md) | AI 维护入口 | AI |
| [.ai/modules/*.md](../.ai/modules/) | 12 个模块的详细维护指南 | AI |
| src/modules/*/MODULE.md | 模块契约（职责、子域、API） | 人 + AI |
| src/modules/**/contract.json | 子域契约（不变量、依赖） | AI |

## 历史文档

[废弃/](废弃/) 目录包含已过时的历史文档，仅供参考。
