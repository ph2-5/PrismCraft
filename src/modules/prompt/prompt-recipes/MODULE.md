# prompt/prompt-recipes 子域

> Prompt 配方库（Task 4.7）：预设配方 ↔ Skill 组合映射器，将风格化配方（赛博朋克 / 日系动画 / 写实风景 / 水墨 / 电影质感）转换为完整的 prompt 指令片段。

## 模块概述

配方库从静态数据升级为"Skill 调用"模式（Task 4.7 v5.3 增强）。每个配方对应一组 Skill 组合（style / lighting / camera / vfx / characters / audio），`applyRecipe` 时按组合调用对应 Skill 的构建函数（来自 `@/shared-logic/prompt`）生成指令片段，可直接拼入最终 prompt。同时提供配方面板 UI（`PromptRecipePanel`），用户点击"应用"后通过回调将指令片段应用到分镜提示词。

## 子域

本子域为 `prompt` 模块下的叶子子域。

| 文件 | 说明 |
|------|------|
| `recipe-skill-mapper.ts` | 配方 ↔ Skill 映射器：预设配方表、获取/列出/应用配方、自定义配方注册 |
| `PromptRecipePanel.tsx` | 配方面板 UI 组件 |
| `__tests__/recipe-skill-mapper.test.ts` | 映射器单元测试 |

## 公共 API

通过 `@/modules/prompt` 导入（在 `prompt/index.ts` 的 "Task 4.7" 分组中），也可通过 `@/modules/prompt/prompt-recipes` 直接导入。

### 服务函数
- `getRecipe(id)` — 按 id 获取配方，返回 `Recipe | null`
- `listRecipes()` — 列出所有预设配方（内置 + 自定义），返回 `Recipe[]`
- `applyRecipe(id)` — 应用配方，按 Skill 组合构建完整 prompt 指令片段字符串
- `getRecipeSkillIds(id)` — 获取配方涉及的 Skill id 列表（用于 UI 展示哪些 Skill 被激活）
- `registerCustomRecipe(recipe)` — 注册自定义配方（不持久化到本文件，由调用方负责持久化）
- `unregisterCustomRecipe(id)` — 注销自定义配方（仅移除自定义配方，不影响内置配方）

### UI 组件
- `PromptRecipePanel` — 配方面板组件
  - Props: `PromptRecipePanelProps`
    - `onApply?: (instruction: string, recipeId: RecipeId) => void` — 应用配方时回调，参数为生成的指令片段
    - `appliedRecipeId?: RecipeId | null` — 当前已应用的配方 id（用于高亮）
    - `compact?: boolean` — 紧凑模式（在侧边栏使用），默认 `false`

### 类型
- `RecipeId` — 配方 id 联合（`"cyberpunk" | "anime" | "realistic_landscape" | "ink_wash" | "cinematic"`）
- `Recipe` — 配方（id / name / nameEn / skillCombination / preview）
- `SkillCombination` — Skill 组合（skillIds / params / description）
- `RecipeSkillParams` — Skill 参数（style? / lighting? / camera? / vfx? / characters? / audio?）

## 预设配方表

| RecipeId | 名称 | Skill 组合 | 说明 |
|----------|------|-----------|------|
| `cyberpunk` | 赛博朋克 | style + lighting + vfx | 霓虹光 + 紫蓝粒子 + 电子 BGM，营造未来都市感 |
| `anime` | 日系动画 | style + lighting + characters | 高调光 + 赛璐珞画风 + 角色一致性强化 |
| `realistic_landscape` | 写实风景 | style + lighting + camera | 黄金时刻 + 远景固定 + 氛围 BGM |
| `ink_wash` | 水墨风格 | style + camera + lighting | 自然光 + 远景固定 + 古风 BGM |
| `cinematic` | 电影质感 | style + camera + lighting | 低调光 + 中景推拉 + 史诗交响 BGM |

## 依赖

| 依赖 | 用途 |
|------|------|
| `@/shared-logic/prompt` | `buildStyleInstruction` / `buildLightingInstruction` / `buildCameraInstruction` / `buildParticleEffect`，以及 `VisualStyle` / `LightingType` 类型 |
| `@/shared-logic/prompt/skills/extended-types` | `ShotSize` / `CameraMovement` / `VfxParticle` 类型 |
| `@/shared/constants` | `t()` 国际化（UI 文案） |

## 边界约束

- 本子域属于 `modules` 层，可导入 `shared-logic` 的 Skill 模块（架构允许 `modules → shared-logic`）
- 自定义配方不持久化到 `recipe-skill-mapper.ts`，由调用方负责持久化（`registerCustomRecipe` 仅更新内存索引）
- `unregisterCustomRecipe` 仅移除自定义配方，内置配方受 `BUILTIN_RECIPE_IDS` 保护不可移除
- `applyRecipe` 遇到未知 `id` 时抛错（`unknown recipe`），UI 层应仅使用 `listRecipes` 返回的 id
- 配方应用结果为字符串（指令片段），由调用方决定如何拼入最终 prompt
- 不调用 IPC、不调用 electronAPI、不调用 HTTP API
