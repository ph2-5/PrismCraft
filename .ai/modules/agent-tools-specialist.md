# Agent Tools Specialist 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| specialist-tools | 🔴 高 | P4 多 Agent 编排、delegate_to_specialist 委派子 Agent（超时控制）、动态 import @/modules/agent 获取 runSpecialist |

## 子域依赖图

```
specialist-tools.ts（2 个工具）
  ← @/domain/types/agent-tools（ToolImpl 类型）
  ← @/modules/agent-specialist（静态导入 specialistRegistry）
  ← @/modules/agent（动态 import 获取 runSpecialist / listAvailableSpecialists）
  ↑
index.ts（barrel + allSpecialistTools 聚合）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- 单一工具文件，结构简单
- 静态导入 `@/modules/agent-specialist` 的 `specialistRegistry`
- 通过动态 `import("@/modules/agent")` 获取 `runSpecialist` / `listAvailableSpecialists`（避免静态循环）
- 工具聚合数组 `allSpecialistTools` 与 `specialistTools` 等价

## 公共 API

### 工具实现
- `delegateToSpecialistTool` — 委派任务给专家 Agent 工具（delegate_to_specialist）
- `listSpecialistsTool` — 列出可用专家工具（list_specialists）

### 工具聚合数组
- `specialistTools` — 2 个专家委派工具的聚合数组
- `allSpecialistTools` — 全量工具聚合（与 specialistTools 等价，便于统一注册）

## 常见修改场景

### 1. 修改专家委派逻辑
- 修改文件：`specialist-tools.ts`（delegateToSpecialistTool 的 execute 函数）
- 检查不变量：通过动态 `import("@/modules/agent")` 获取 `runSpecialist`；子 Agent 超时控制；静态导入 `@/modules/agent-specialist` 的 `specialistRegistry`
- 测试：手动验证 SubAgentRunner 创建子 AgentLoop

### 2. 修改专家列表展示
- 修改文件：`specialist-tools.ts`（listSpecialistsTool 的 execute 函数）
- 检查不变量：通过 `specialistRegistry` 读取所有可用专家（内置 5 个 + 用户自定义）
- 测试：手动验证 list_specialists 工具返回

### 3. 新增专家委派相关工具
- 修改文件：`specialist-tools.ts`，在 `index.ts` 追加 export，更新 `specialistTools` 数组
- 检查不变量：工具命名唯一、所有工具声明 `dangerLevel`
- 测试：`npx vitest run src/modules/agent-tools-specialist`（本模块无独立测试目录，由 agent 集成测试覆盖）

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/modules/agent-specialist`
- **禁止导入**：`@/modules/agent/*`（通过动态 `import("@/modules/agent")` 异步获取 agent 服务）、`@/infrastructure/*`（除 `@/infrastructure/di`）、`@/modules/*/*/*`（深路径）
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：`runSpecialist` / `listAvailableSpecialists` 通过动态 import 获取，避免静态循环依赖

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-specialist`
- 关键测试：本模块无独立测试目录，由 `src/modules/agent/services/__tests__/` 集成测试覆盖
