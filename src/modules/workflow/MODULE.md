# Workflow Module ✅

> Phase 7 节点化工作流 — 可视化节点编辑器，让用户自定义生成管道（类似 ComfyUI，面向 AI 动画场景）。

## 概述

工作流模块提供节点面板 + 画布 + 配置面板 + 执行日志的可视化编排能力。用户通过拖拽节点（输入/处理/输出）与连线定义生成管道，由执行引擎按拓扑排序调度执行，支持暂停/恢复与日志追踪。预设模板（一键成片 / 分镜优先 / 质量优先）可一键创建常见管道。

路由页面：`page.tsx`（`/workflow`，经 `PageErrorBoundary` 包裹渲染 `WorkflowEditor`）。

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 子域

| 子域 | 状态 | 路径 | 说明 |
|------|:----:|------|------|
| domain | ✅ | [domain/](./domain/) | 节点类型定义（node-types）与 Zod schema（workflow-schema） |
| hooks | ✅ | [hooks/](./hooks/) | 工作流状态 Store（节点/连线/执行控制） |
| services | ✅ | [services/](./services/) | 执行引擎（workflow-executor）与连线验证（workflow-validator） |
| templates | ✅ | [templates/](./templates/) | 预设模板（一键成片 / 分镜优先 / 质量优先） |
| presentation | ✅ | [presentation/](./presentation/) | 编辑器、节点、侧边栏、配置面板 UI |

## 公共 API

### ✅ Presentation 子域

| API | 说明 |
|-----|------|
| `WorkflowEditor` | 主编辑器（节点面板 + 画布 + 配置面板 + 日志） |
| `WorkflowNode` | 画布节点组件 |
| `WorkflowSidebar` | 节点面板侧边栏；`PALETTE_DRAG_MIME` 为拖拽 MIME 常量 |
| `NodeConfigPanel` | 节点配置面板 |

### ✅ Hooks 子域

| API | 说明 |
|-----|------|
| `useWorkflowStore` | 工作流状态 Store（节点/连线/执行控制） |

### ✅ Services 子域

| API | 说明 |
|-----|------|
| `WorkflowRunner` | 执行引擎类（拓扑排序 / 并行 / 暂停恢复 / 日志） |
| `workflowRunner` | 执行引擎单例 |
| `registerNodeExecutor` | 注册自定义节点执行器 |
| `registerBuiltinExecutors` | 注册内置节点执行器 |
| `NodeExecutor` / `NodeExecutionContext` | 执行器接口与执行上下文类型 |
| `RunState` / `LogEntry` / `NodeRunState` | 运行状态、日志条目、节点运行状态类型 |
| `WorkflowRunStatus` / `NodeExecutionStatus` | 工作流/节点执行状态枚举类型 |
| `validateWorkflow` | 整图连线规则验证 |
| `validateEdge` | 单条连线验证 |
| `topologicalSort` | 节点拓扑排序 |
| `WorkflowValidation` / `ValidationIssue` | 验证结果与问题项类型 |

### ✅ Templates 子域

| API | 说明 |
|-----|------|
| `WORKFLOW_TEMPLATES` | 预设模板列表 |
| `createOneClickFilmTemplate` | 一键成片模板工厂 |
| `createShotFirstTemplate` | 分镜优先模板工厂 |
| `createQualityFirstTemplate` | 质量优先模板工厂 |

### ✅ Domain 子域

| API | 说明 |
|-----|------|
| `WorkflowNodeData` / `WorkflowNodeKind` / `WorkflowSubtype` | 节点数据与种类类型 |
| `InputSubtype` / `ProcessSubtype` / `OutputSubtype` | 输入/处理/输出子类型 |
| `INPUT_SUBTYPES` / `PROCESS_SUBTYPES` / `OUTPUT_SUBTYPES` | 子类型常量列表 |
| `SUBTYPE_LABELS` / `DEFAULT_SUBTYPE_CONFIG` | 子类型显示名与默认配置 |
| `NODE_KIND_LABELS` / `NODE_KIND_COLOR` | 节点种类显示名与配色 |
| `Workflow` / `WorkflowNodeModel` / `WorkflowEdge` / `CustomWorkflowTemplate` | 工作流实体类型（WorkflowNodeModel 为 domain 节点模型，区别于同名 UI 组件） |
| `workflowNodeSchema` / `workflowEdgeSchema` / `workflowSchema` | Zod schema |
| `toWorkflowNode` / `toWorkflowEdge` / `createNodeId` | 实体转换与 ID 生成 |

## 边界约束

- 节点执行逻辑必须通过 `registerNodeExecutor` 注册，禁止在 UI 组件内直接执行生成逻辑
- 连线合法性统一由 `validateWorkflow` / `validateEdge` 判定，UI 不做重复校验
- domain 层（node-types / workflow-schema）为纯类型与 Zod schema，零运行时依赖

## 不变量（Invariants）

- **INV-1**：执行顺序必须由拓扑排序决定，禁止按节点创建顺序执行
- **INV-2**：工作流执行前必须通过 `validateWorkflow`，存在错误级 issue 时禁止启动
- **INV-3**：执行日志必须通过 LogEntry 追加，禁止直接修改日志数组
- **INV-4**：节点模型的 ID 必须由 `createNodeId` 生成，保证全局唯一

## 测试验证

- 测试命令：`npx vitest run src/modules/workflow`
- 关键测试文件：
  - `hooks/__tests__/use-workflow.test.ts` — 状态 Store
  - `services/__tests__/workflow-executor.test.ts` — 执行引擎
  - `services/__tests__/workflow-builtin-executors.test.ts` — 内置执行器
  - `services/__tests__/workflow-validator.test.ts` — 连线验证

## AI 维护指南

详细 AI 重构规范请参见：[.ai/modules/workflow.md](../../../.ai/modules/workflow.md)
