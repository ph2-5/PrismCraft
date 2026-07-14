<!-- AI: Before modifying this module, read contract.json for invariants -->

# Agent Specialist Module

> Specialist 专家注册表模块 — 管理 Agent 多编排（P4）中的专家配置预设。

## 模块概览

- **定位**：从 agent 模块拆分出的独立模块，管理 Specialist 注册表与类型定义
- **核心**：SpecialistRegistry 单例，统一管理所有内置与用户自定义 Specialist
- **依赖**：零外部依赖（仅模块内 domain + services）

## 背景

Specialist 是针对特定领域优化的 Agent 配置预设（system prompt + 工具白名单）。主 Agent 通过 `delegate_to_specialist` 工具委派任务时，SubAgentRunner（仍位于 agent 模块）会用 Specialist 配置创建子 AgentLoop。

本模块从 `@/modules/agent` 拆分而来，因为 specialist-registry 完全自包含、不依赖任何 agent service。

## 子域

| 子域 | 路径 | 职责 |
|------|------|------|
| domain | `domain/` | SpecialistAgent 类型定义、BUILTIN_SPECIALISTS 内置专家列表 |
| services | `services/` | SpecialistRegistry 注册表（单例） |

## Public API

### 注册表服务
- `specialistRegistry` — 专家注册表单例
- `SpecialistRegistry` — 专家注册表类

### 领域类型
- `SpecialistAgent` — 专家 Agent 类型
- `BUILTIN_SPECIALISTS` — 内置专家列表（5 个：character-creator / video-producer / story-writer / api-configurator / asset-finder）

## 边界约束

- **禁止**：本模块导入 `@/modules/agent/*`（agent 模块依赖本模块，避免循环）
- **禁止**：本模块导入 `@/infrastructure/*`（除 `@/infrastructure/di`）
- **必须**：保持零外部依赖，仅使用模块内 domain 类型

## 依赖方向

```
agent-specialist → domain（类型）
```

## 内置 Specialist

| ID | 名称 | 职责 |
|----|------|------|
| character-creator | 角色创建专家 | 角色创建和图片生成 |
| video-producer | 视频制作专家 | 视频生成和后期处理 |
| story-writer | 故事编剧专家 | 故事创作和分镜规划 |
| api-configurator | API 配置专家 | API provider 配置和诊断 |
| asset-finder | 素材搜索专家 | 网络素材搜索和导入 |
