# Agent Specialist 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services/specialist-registry | 🟡 中 | SpecialistRegistry 单例、内置与自定义 Specialist 统一管理、SubAgentRunner 通过 delegate_to_specialist 委派 |
| domain | 🟢 低 | SpecialistAgent 类型定义、BUILTIN_SPECIALISTS 内置专家列表（5 个） |

## 子域依赖图

```
domain/specialist-types.ts（SpecialistAgent + BUILTIN_SPECIALISTS，零外部依赖）
  ↑
services/specialist-registry.ts ← domain/specialist-types
  ↑
@/modules/agent/services/sub-agent-runner.ts（用 Specialist 配置创建子 AgentLoop）
@/modules/agent-tools-specialist/specialist-tools.ts（list_specialists 工具读取 registry）
```

- `domain` 是底层类型子域，零外部依赖
- `services` 仅 SpecialistRegistry 单例，完全自包含、不依赖任何 agent service
- agent 模块依赖本模块（SubAgentRunner 使用 Specialist 配置），反向不依赖

## 公共 API

### 注册表服务
- `specialistRegistry` — 专家注册表单例
- `SpecialistRegistry` — 专家注册表类

### 领域类型与常量
- `SpecialistAgent` — 专家 Agent 类型
- `BUILTIN_SPECIALISTS` — 内置专家列表（5 个：character-creator / video-producer / story-writer / api-configurator / asset-finder）

## 常见修改场景

### 1. 新增或修改内置 Specialist
- 修改文件：`domain/specialist-types.ts`（`BUILTIN_SPECIALISTS` 数组）
- 检查不变量：每个 Specialist 包含 system prompt + 工具白名单；5 个内置专家覆盖角色创建/视频制作/故事创作/API 配置/素材搜索
- 测试：`npx vitest run src/modules/agent/services/__tests__/specialist-registry.test.ts`

### 2. 修改注册表逻辑（注册/查询/列举）
- 修改文件：`services/specialist-registry.ts`
- 检查不变量：SpecialistRegistry 单例，统一管理内置与用户自定义 Specialist
- 测试：`npx vitest run src/modules/agent/services/__tests__/specialist-registry.test.ts`

### 3. 修改 Specialist 委派交互
- 修改文件：`domain/specialist-types.ts`（SpecialistAgent 类型）、`@/modules/agent-tools-specialist/specialist-tools.ts`（delegate_to_specialist / list_specialists）
- 检查不变量：主 Agent 通过 `delegate_to_specialist` 工具委派任务；SubAgentRunner（仍位于 agent 模块）用 Specialist 配置创建子 AgentLoop
- 测试：`npx vitest run src/modules/agent/services/__tests__/specialist-registry.test.ts`

## 边界约束

- **依赖方向**：仅 `domain`（类型），零外部依赖
- **禁止导入**：`@/modules/agent/*`（agent 模块依赖本模块，避免循环）
- **禁止导入**：`@/infrastructure/*`（除 `@/infrastructure/di`）、其他 `@/modules/*`
- **必须**：保持零外部依赖，仅使用模块内 domain 类型

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-specialist`
- 关键测试：本模块无独立测试目录，由 `src/modules/agent/services/__tests__/specialist-registry.test.ts` 覆盖集成场景
