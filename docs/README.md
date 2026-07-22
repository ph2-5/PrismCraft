# PrismCraft 文档索引

## 核心文档（必读）

| 优先级 | 文档 | 内容 | 何时读 |
|--------|------|------|--------|
| ★★★ | [ARCHITECTURE.md](ARCHITECTURE.md) | 全局架构、依赖方向、状态机、数据流、Schema、IPC 安全 | 每次修改前 |
| ★★★ | [DEVELOPMENT.md](DEVELOPMENT.md) | 开发环境搭建、项目结构、工作流、状态管理、测试指南 | 首次接触项目 |
| ★★☆ | [DEPLOYMENT.md](DEPLOYMENT.md) | 构建、打包、CI/CD、运维监控、故障排查 | 部署/打包时 |
| ★★☆ | [TECHNICAL_REFERENCE.md](TECHNICAL_REFERENCE.md) | 技术栈详解、各层设计、数据流、设计决策、术语表 | 深入了解系统 |
| ★★☆ | [PROJECT-GUIDE.md](PROJECT-GUIDE.md) | 项目总览、设计哲学、契约体系、功能清单 | 了解项目全貌 |
| ★★☆ | [USER-GUIDE.md](USER-GUIDE.md) | 面向终端用户的使用指南、配置教程、FAQ | 终端用户上手 |
| ★★☆ | [HTTP-API.md](HTTP-API.md) | HTTP API 文档（85 条路由、9 个路由组） | 查阅主进程 API 时 |
| ★★☆ | `src/modules/{target}/MODULE.md` | 目标模块公共 API、不变量、依赖 | 修改特定模块时 |
| ★★☆ | `src/modules/{target}/{subdomain}/contract.json` | 子域合约、invariants | 修改特定子域时 |
| ★★☆ | [MODULES.md](MODULES.md) | 模块全景图（42 模块、56 子域） | 了解模块全貌时 |
| ★☆☆ | [ports.md](ports.md) | Port 接口清单（20 个 Port） | 新增/修改 Port 时 |
| ★☆☆ | [di-tokens.md](di-tokens.md) | DI 容器 Token 参考（46 个 Token，6 类 A-F） | 新增/修改 DI Token 时 |
| ★☆☆ | [CODE_CATALOG.md](CODE_CATALOG.md) | 完整代码目录与文件说明 | 定位文件时 |
| ★☆☆ | [API_REFERENCE.md](API_REFERENCE.md)（含 [PART1](API_REFERENCE_PART1.md)~[PART4](API_REFERENCE_PART4.md)） | React Hooks/组件/Store/服务 API 参考（分 5 部分） | 查阅模块 API 时 |

## AI 维护规则（.trae/rules/，仅本地）

| 文档 | 内容 | 何时读 |
|------|------|--------|
| `quick-start.md` | 命令速查、关键路径、禁止模式 | 每次 AI 会话 |
| `architecture-rules.md` | 依赖方向、模块结构、DI 容器、API 路由、CQRS | 新功能/重构 |
| `testing-rules.md` | 测试位置、模板、Mock 策略、覆盖率要求 | 编写测试时 |
| `regression-guard-automation.md` | Q1-Q5 回归防护决策框架 | Bug 修复时 |
| `regression/`: `async-safety.md`, `data-consistency.md`, `engineering.md`, `error-handling.md`, `platform.md`, `system-security.md`, `ui-robustness.md`, `user-safety.md` | 151 条回归守则（R1-R151），8 大类 | Bug 修复/代码审查 |
| `ai-tool-integration.md` | AI 工具集成指南（防幻觉、会话管理） | 优化 AI 工作流 |

## 专项文档

| 文档 | 内容 | 何时读 |
|------|------|--------|
| [novel-pipeline-guide.md](novel-pipeline-guide.md) | Novel 故事创作流水线指南（10 阶段状态机、结构/节奏/连续性） | 故事创作功能开发 |
| [timeline-implementation.md](timeline-implementation.md) | 时间线变体系统实施指南（8 维变体参数系统） | 时间线编辑功能开发 |
| [agent-tools-architecture.md](agent-tools-architecture.md) | Agent Tools 架构（154 工具、20 域、14 模块） | Agent 工具开发时 |
| [plugin-specification.md](plugin-specification.md) | 插件系统规范 | 开发插件时 |
| [plugin-spec.schema.json](plugin-spec.schema.json) | 插件规范 JSON Schema | 验证插件配置时 |
| [bug-audit-methodology.md](bug-audit-methodology.md) | Bug 审计方法论（3 阶段工作流） | 执行 Bug 审计时 |
| [archive/bug-audit-report.md](archive/bug-audit-report.md) | Bug 审计报告（R1-R18 来源） | 了解历史 Bug 模式 |
| [development-plan.md](development-plan.md) | 项目开发计划 | 规划阶段 |
| [archive/ui-migration-plan.md](archive/ui-migration-plan.md) | UI 迁移计划（4 阶段） | UI 重构时 |
| [AI-MAINTENANCE-GUIDE.md](AI-MAINTENANCE-GUIDE.md) | 修改流程、验证步骤、常见陷阱 | AI 维护参考 |

## 项目文件

| 文件 | 内容 |
|------|------|
| [README.md](../README.md) | 项目首页，快速开始和功能概览 |
| [README_FOR_BUYER.md](../README_FOR_BUYER.md) | 面向买家/投资者的产品说明 |
| [CODE_WIKI.md](../CODE_WIKI.md) | 代码维基（历史文档） |

## 历史文档（archive/）

[archive/](archive/) 目录存放历史过程文档，仅供追溯参考，不作为维护依据。
