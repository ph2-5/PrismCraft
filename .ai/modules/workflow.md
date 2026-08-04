# Workflow 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services | 🔴 高 | 执行引擎（拓扑排序/并行/暂停恢复）与连线验证，错误会静默产出错误管道结果 |
| domain | 🟡 中 | 节点类型与 Zod schema，所有子域共享 |
| hooks | 🟡 中 | 工作流状态 Store，编辑器各面板共享 |
| templates | 🟢 低 | 预设模板工厂，纯数据 |
| presentation | 🟢 低 | 编辑器 UI 组件 |

## 子域依赖图

```
domain ← 零运行时依赖（纯类型 + Zod schema）
hooks（use-workflow）← domain
services ← domain
templates ← domain
presentation ← hooks, services, domain, @xyflow/react
page.tsx ← presentation（/workflow 路由，PageErrorBoundary 包裹）
```

## 实际文件结构

```
src/modules/workflow/
  ├── domain/
  │   ├── node-types.ts           — 节点种类/子类型/显示名/配色/默认配置
  │   └── workflow-schema.ts      — Workflow/Node/Edge Zod schema + toWorkflowNode/toWorkflowEdge/createNodeId
  ├── hooks/use-workflow.ts       — useWorkflowStore（节点/连线/执行控制状态）
  ├── services/
  │   ├── workflow-executor.ts    — WorkflowRunner + workflowRunner 单例 + 执行器注册
  │   └── workflow-validator.ts   — validateWorkflow / validateEdge / topologicalSort
  ├── templates/index.ts          — WORKFLOW_TEMPLATES + 三个模板工厂
  ├── presentation/
  │   ├── WorkflowEditor.tsx      — 主编辑器（面板 + 画布 + 配置 + 日志）
  │   ├── WorkflowNode.tsx        — 画布节点组件
  │   ├── WorkflowSidebar.tsx     — 节点面板（PALETTE_DRAG_MIME 拖拽）
  │   └── NodeConfigPanel.tsx     — 节点配置面板
  ├── page.tsx                    — /workflow 路由页面
  └── index.ts                    — barrel
```

⚠️ 注意：barrel 中 `WorkflowNode`（UI 组件）与 `WorkflowNodeModel`（domain 节点模型，domain 原名为 WorkflowNode）是两个不同导出，引用时勿混淆。
⚠️ 注意：本模块目前没有 contract.json；不变量以 MODULE.md「不变量」一节为准。

## 常见修改场景

### 1. 新增节点类型
- 修改文件：`domain/node-types.ts`（子类型 + 标签 + 默认配置）、`services/workflow-executor.ts`（注册对应 NodeExecutor）
- 同步更新：MODULE.md 公共 API、必要时新增模板
- 测试：`npx vitest run src/modules/workflow`

### 2. 修改执行引擎（调度/暂停/日志）
- 修改文件：`services/workflow-executor.ts`
- 检查不变量：INV-1（拓扑排序决定执行顺序）、INV-3（日志只追加）
- 测试：`npx vitest run src/modules/workflow/services/__tests__/workflow-executor.test.ts`

### 3. 修改连线规则
- 修改文件：`services/workflow-validator.ts`
- 检查不变量：INV-2（存在错误级 issue 时禁止启动）
- 测试：`npx vitest run src/modules/workflow/services/__tests__/workflow-validator.test.ts`

### 4. 新增/修改预设模板
- 修改文件：`templates/index.ts`
- 检查：模板产出的图必须通过 validateWorkflow
- 测试：`npx vitest run src/modules/workflow`

### 5. 修改编辑器 UI
- 修改文件：`presentation/` 下对应组件
- 注意：连线合法性统一由 workflow-validator 判定，UI 不做重复校验
- 测试：`npx vitest run src/modules/workflow`

## 测试验证

- 测试命令：`npx vitest run src/modules/workflow`
- 关键测试文件：
  - `hooks/__tests__/use-workflow.test.ts` — 状态 Store
  - `services/__tests__/workflow-executor.test.ts` — 执行引擎
  - `services/__tests__/workflow-builtin-executors.test.ts` — 内置执行器
  - `services/__tests__/workflow-validator.test.ts` — 连线验证
