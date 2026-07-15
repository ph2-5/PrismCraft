/**
 * Prompt 配方库模块 barrel（Task 4.7）
 *
 * 包含配方 ↔ Skill 映射器 + 配方面板组件。
 * 配方库从静态数据升级为"Skill 调用"（Task 4.7 v5.3 增强）。
 */

export {
  getRecipe,
  listRecipes,
  applyRecipe,
  getRecipeSkillIds,
  registerCustomRecipe,
  unregisterCustomRecipe,
} from "./recipe-skill-mapper";
export type {
  RecipeId,
  SkillCombination,
  RecipeSkillParams,
  Recipe,
} from "./recipe-skill-mapper";

export { PromptRecipePanel } from "./PromptRecipePanel";
export type { PromptRecipePanelProps } from "./PromptRecipePanel";
