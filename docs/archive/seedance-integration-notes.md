# seedance-2.0 借鉴来源与映射

> **目的**：记录从 [Emily2040/seedance-2.0](https://github.com/Emily2040/seedance-2.0) 仓库（MIT 许可）借鉴的工程方法，以及它们在本项目中的整合位置。本文档是开发计划 v5.3 的配套文件，用于追溯每个借鉴点的原始来源与映射关系。
>
> **借鉴原则**：
> - 借鉴**工程方法**（Skill 路由、源日期标记、安全改写、角色化产出），不抄袭 Seedance 专属知识（模型 ID/定价/平台能力）
> - 遵守 MIT 许可：所有借鉴点均标注来源
> - 不破坏现有架构：所有借鉴点整合到现有 DDD 六层 + DI container + 契约驱动架构中

---

## 一、借鉴来源仓库概况

| 项 | 内容 |
|---|---|
| 仓库 | [Emily2040/seedance-2.0](https://github.com/Emily2040/seedance-2.0) |
| 许可证 | MIT |
| 作者 | Iamemily2050（[iamemily2050.com](https://iamemily2050.com/)） |
| 版本 | v5.5.2 "deep-proofread release"（2026-06-13） |
| 性质 | Agent Skill 操作系统（非代码项目，是 Skill 规范库） |
| 核心价值 | 把"如何用 AI 生成视频"这件模糊的事变成可执行规范 |

### 核心可借鉴模式

1. **Skill 路由模式**：14 个独立 Skill + 路由表，而非单一巨型 prompt
2. **源日期标记（source-dated）**：所有平台声明带 `last_verified` 日期，防止 AI 幻觉过期信息
3. **安全改写而非拒绝**：保留创意功能、替换不安全元素
4. **角色化产出**：按角色（导演/DP/剪辑/调色）产出对应工作产物
5. **五等级 retake triage**：智能重试决策（keep/minor_fix/retake_single_var/retake_full/replan）
6. **连续性账本**：跨镜头一致性追踪
7. **treatment → scene beat → shot contract 工作流**：每步产出可编辑结构化对象

---

## 二、借鉴点 → 项目整合位置映射

### 方向 A：提示词优化

| 借鉴来源 | 项目整合位置 | 类型 | 工期 |
|---|---|---|---|
| [skills/seedance-interview/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-interview) | [Task 1.4 v5.3 增强](./development-plan/phase-ui-foundation.md#task-14-v53-增强skill-路由--安全改写3-天) → `src/shared-logic/prompt/skills/interview-skill.ts` | 增强 | +1 天 |
| [skills/seedance-prompt/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-prompt) | Task 1.4 v5.3 增强 → `src/shared-logic/prompt/skills/prompt-skill.ts` | 增强 | +0.5 天 |
| [skills/seedance-prompt-short/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-prompt-short) | Task 1.4 v5.3 增强 → `src/shared-logic/prompt/skills/compress-skill.ts` | 增强 | +0.5 天 |
| [skills/seedance-troubleshoot/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-troubleshoot) | Task 1.4 v5.3 增强 → `src/shared-logic/prompt/skills/troubleshoot-skill.ts` | 增强 | +0.5 天 |
| [skills/seedance-copyright/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-copyright) | Task 1.4 v5.3 增强 → `src/shared-logic/prompt/safety/ip-rewriter.ts` + [Task 4.12](./development-plan/phase-agent.md#task-412ip-安全改写--误报修复v53-新增4-天) 完善 | 增强 + 新增 | +1+4 天 |
| [skills/seedance-antislop/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-antislop) | Task 1.4 v5.3 增强 → `src/shared-logic/prompt/safety/antislop.ts` | 增强 | +0.5 天 |
| [skills/seedance-camera/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-camera) | [Task 4.7 v5.3 增强](./development-plan/phase-agent.md#task-47-v53-增强完整-skill-体系3-天) → `src/shared-logic/prompt/skills/camera-skill.ts` | 增强 | +0.5 天 |
| [skills/seedance-lighting/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-lighting) | Task 4.7 v5.3 增强 → `src/shared-logic/prompt/skills/lighting-skill.ts` | 增强 | +0.5 天 |
| [skills/seedance-characters/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-characters) | Task 4.7 v5.3 增强 → `src/shared-logic/prompt/skills/characters-skill.ts` | 增强 | +0.5 天 |
| [skills/seedance-style/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-style) | Task 4.7 v5.3 增强 → `src/shared-logic/prompt/skills/style-skill.ts` | 增强 | +0.5 天 |
| [skills/seedance-vfx/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-vfx) | Task 4.7 v5.3 增强 → `src/shared-logic/prompt/skills/vfx-skill.ts` | 增强 | +0.5 天 |
| [skills/seedance-audio/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-audio) | Task 4.7 v5.3 增强 → `src/shared-logic/prompt/skills/audio-skill.ts` | 增强 | +0.5 天 |
| [skills/seedance-filter/SKILL.md](https://github.com/Emily2040/seedance-2.0/tree/main/skills/seedance-filter) | [Task 4.12](./development-plan/phase-agent.md#task-412ip-安全改写--误报修复v53-新增4-天) → `src/shared-logic/prompt/safety/filter-repair.ts` | 新增 | +1 天 |
| [references/model-mechanics.md](https://github.com/Emily2040/seedance-2.0/tree/main/references) 中模型 ID 区分 | Task 4.7 v5.3 增强 → `src/shared-logic/prompt/vocabulary/model-name-map.ts` | 增强 | +0.5 天 |
| [references/multilingual-vocabulary.md](https://github.com/Emily2040/seedance-2.0/tree/main/references) 六语言词汇表 | Task 4.7 v5.3 增强 → `src/shared-logic/prompt/vocabulary/multilingual.ts` | 增强 | +1 天 |

### 方向 B：小说导入故事创作

| 借鉴来源 | 项目整合位置 | 类型 | 工期 |
|---|---|---|---|
| [references/pro-filmmaking-standards.md](https://github.com/Emily2040/seedance-2.0/tree/main/references) treatment → shot list 工作流 | [Task 2A.13 v5.3 增强](./development-plan/phase-ui-foundation.md#task-2a13-v53-增强treatment--shot-contract3-天) → `src/modules/novel/structure/domain/treatment.ts` + `shot-contract.ts` | 增强 | +3 天 |
| README "Professional Filmmaker Scope" 角色化产出表 | [Task 2A.14 v5.3 增强](./development-plan/phase-ui-foundation.md#task-2a14-v53-增强角色化产出2-天) → `src/modules/novel/pacing/domain/role-artifacts.ts` | 增强 | +2 天 |
| [references/shot-list-continuity.md](https://github.com/Emily2040/seedance-2.0/tree/main/references) 连续性账本模式 | [Task 2A.18](./development-plan/phase-ui-foundation.md#task-2a18连续性账本v53-新增4-天) → `src/modules/novel/continuity/domain/continuity-ledger.ts` | 新增 | +4 天 |
| [references/retake-protocol.md](https://github.com/Emily2040/seedance-2.0/tree/main/references) 五等级 triage + 单变量 retake | [Task 2A.19](./development-plan/phase-ui-foundation.md#task-2a19半自动全自动工作流增强v53-新增3-天) → `src/modules/novel/workflow/services/retake-protocol.ts` | 新增 | +3 天 |

### 方向 C：AI Agent 助手

| 借鉴来源 | 项目整合位置 | 类型 | 工期 |
|---|---|---|---|
| README "Start Here" 路由表 + Skill Map | [Task 1.12](./development-plan/phase-ui-foundation.md#task-112agent-意图路由表--skill-registryv53-新增4-天) → `electron/src/agent/intent-router.ts` + `skill-registry.ts` + `routes/` | 新增 | +4 天 |
| 整体 Skill 路由模式 | Task 1.1 增强（Agent Loop 集成意图路由）+ Task 1.4 增强（System Prompt Builder 集成 Skill 路由） | 增强 | +2+3 天 |

---

## 三、不整合的部分（边界声明）

以下 seedance-2.0 内容**不整合**到本项目，避免范围蔓延：

| 不整合内容 | 原因 |
|---|---|
| Seedance 专属知识（模型 ID、定价、平台能力、API 端点） | 本项目已有 `src/shared/model-capabilities/` 管理多 provider 能力，且本项目集成 13+ provider，非 Seedance 单一 |
| 六语言完整词汇表（仅取核心电影术语） | 本项目是中文为主，按需补充英文/日文即可，不需要完整六语言 |
| 专业电影工业完整工作流（ACES 色彩交接、M&E 音频分轨、字幕/配音指南、交付 QC 清单） | 超出 1.0 范围，留给 Phase 6+ 模板市场或 Phase 8 团队协作 |
| Codex skill installer（agents/ 目录） | 本项目用 DI container 管理依赖，不需要外部 skill 安装器 |
| 评估脚本（evals/） | 本项目已有 Vitest 覆盖率 + Playwright E2E + Stryker 变异测试，不需要另一套评估体系 |
| 平台矩阵分离（ByteDance/Dreamina/Jimeng/Volcengine Ark/BytePlus/Runway/fal/ComfyUI） | 本项目已有 plugin 系统管理多 provider，不需要为单一 provider 维护平台矩阵 |

---

## 四、MIT 许可声明

本项目从 [Emily2040/seedance-2.0](https://github.com/Emily2040/seedance-2.0) 仓库借鉴了以下工程方法：

- Skill 路由模式（14 个独立 Skill + 路由表）
- 源日期标记模式（last_verified 字段）
- IP 安全改写机制（保留创意功能、替换不安全元素）
- 反空泛词汇过滤（antislop）
- 误报修复（benign context 注释）
- 角色化产出（导演/DP/剪辑/调色各自工作产物）
- treatment → scene beat → shot contract 工作流
- 连续性账本（跨镜头一致性追踪）
- 五等级 retake triage + 单变量 retake

原作者：Iamemily2050（[iamemily2050.com](https://iamemily2050.com/)）
原仓库许可证：MIT

所有借鉴点均在上表"借鉴来源 → 项目整合位置映射"中标注。借鉴的是**工程方法**，非 Seedance 专属知识。

---

## 五、版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-07-06 | 初始版本，对应开发计划 v5.3，整合 14 个借鉴点到 9 个 Task（4 个新增 + 5 个增强） |
