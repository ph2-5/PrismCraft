/**
 * 配方 ↔ Skill 组合映射器（Task 4.7 v5.3 增强）
 *
 * 将预设配方映射到对应的 Skill 组合，配方应用时调用对应 Skill 构建指令片段。
 *
 * 配方库从静态数据升级为"Skill 调用"：
 * - 赛博朋克配方 → style-skill(cyberpunk) + lighting-skill(neon) + vfx-skill(粒子)
 * - 日系动画配方 → style-skill(anime) + lighting-skill(high_key) + characters-skill
 * - 写实风景配方 → style-skill(realistic) + lighting-skill(golden_hour) + camera-skill(wide)
 * - 水墨风格配方 → style-skill(ink_wash) + camera-skill(static) + lighting-skill(natural)
 * - 电影质感配方 → style-skill(cinematic) + camera-skill(dolly) + lighting-skill(low_key)
 *
 * 本文件属于 modules 层，可导入 shared-logic 的 Skill 模块。
 */

import {
  buildStyleInstruction,
  buildLightingInstruction,
  buildCameraInstruction,
  buildParticleEffect,
  type VisualStyle,
  type LightingType,
} from "@/shared-logic/prompt";
import type {
  ShotSize,
  CameraMovement,
  VfxParticle,
} from "@/shared-logic/prompt/skills/extended-types";

// === 配方类型定义 ===

export type RecipeId =
  | "cyberpunk"
  | "anime"
  | "realistic_landscape"
  | "ink_wash"
  | "cinematic";

export interface SkillCombination {
  /** 涉及的 Skill id 列表 */
  skillIds: string[];
  /** 各 Skill 的具体参数 */
  params: RecipeSkillParams;
  /** 配方说明 */
  description: string;
}

export interface RecipeSkillParams {
  style?: {
    type: VisualStyle;
    supplement?: string;
  };
  lighting?: {
    type: LightingType;
    supplement?: string;
  };
  camera?: {
    shotSize: ShotSize;
    movement: CameraMovement;
    lens?: "35mm" | "85mm" | "zoom" | "macro";
  };
  vfx?: {
    particle?: VfxParticle;
    density?: string;
  };
  /** 角色一致性强化（true 表示配方强调角色一致性） */
  characters?: boolean;
  /** 音频建议 */
  audio?: {
    bgmStyle: string;
    emotion: string;
  };
}

export interface Recipe {
  id: RecipeId;
  name: string;
  nameEn: string;
  /** 配方对应的 Skill 组合 */
  skillCombination: SkillCombination;
  /** 配方预览文本（用于 UI 展示） */
  preview: string;
}

// === 预设配方表 ===
const RECIPES: Record<RecipeId, Recipe> = {
  cyberpunk: {
    id: "cyberpunk",
    name: "赛博朋克",
    nameEn: "Cyberpunk",
    skillCombination: {
      skillIds: ["style", "lighting", "vfx"],
      params: {
        style: { type: "cyberpunk", supplement: "未来都市，霓虹色彩" },
        lighting: { type: "neon", supplement: "紫蓝色霓虹光" },
        vfx: { particle: "magic", density: "密集蓝紫色粒子" },
        characters: true,
        audio: {
          bgmStyle: "电子",
          emotion: "紧张未来感",
        },
      },
      description: "赛博朋克配方：霓虹光 + 紫蓝粒子 + 电子BGM，营造未来都市感",
    },
    preview: "霓虹色彩，未来都市，紫蓝色光污染",
  },

  anime: {
    id: "anime",
    name: "日系动画",
    nameEn: "Anime",
    skillCombination: {
      skillIds: ["style", "lighting", "characters"],
      params: {
        style: { type: "anime", supplement: "赛璐珞画风，明亮色彩" },
        lighting: { type: "high_key", supplement: "明亮柔和" },
        characters: true,
        audio: {
          bgmStyle: "温馨",
          emotion: "青春活力",
        },
      },
      description: "日系动画配方：高调光 + 赛璐珞画风 + 角色一致性强化",
    },
    preview: "赛璐珞画风，明亮色彩，简化阴影",
  },

  realistic_landscape: {
    id: "realistic_landscape",
    name: "写实风景",
    nameEn: "Realistic Landscape",
    skillCombination: {
      skillIds: ["style", "lighting", "camera"],
      params: {
        style: { type: "realistic", supplement: "照片级真实感" },
        lighting: { type: "golden_hour", supplement: "暖橙色日出日落" },
        camera: { shotSize: "wide", movement: "static", lens: "35mm" },
        audio: {
          bgmStyle: "氛围",
          emotion: "宁静壮阔",
        },
      },
      description: "写实风景配方：黄金时刻 + 远景固定 + 氛围BGM",
    },
    preview: "照片级真实感，黄金时刻光线，远景构图",
  },

  ink_wash: {
    id: "ink_wash",
    name: "水墨风格",
    nameEn: "Ink Wash",
    skillCombination: {
      skillIds: ["style", "camera", "lighting"],
      params: {
        style: { type: "ink_wash", supplement: "黑白灰层次，留白意境" },
        lighting: { type: "natural", supplement: "柔和均匀" },
        camera: { shotSize: "wide", movement: "static", lens: "35mm" },
        audio: {
          bgmStyle: "古风",
          emotion: "淡雅意境",
        },
      },
      description: "水墨风格配方：自然光 + 远景固定 + 古风BGM",
    },
    preview: "中国传统画风，黑白灰层次，留白意境",
  },

  cinematic: {
    id: "cinematic",
    name: "电影质感",
    nameEn: "Cinematic",
    skillCombination: {
      skillIds: ["style", "camera", "lighting"],
      params: {
        style: { type: "cinematic", supplement: "宽屏构图，胶片色彩" },
        lighting: { type: "low_key", supplement: "强对比，戏剧氛围" },
        camera: { shotSize: "medium", movement: "dolly", lens: "85mm" },
        characters: true,
        audio: {
          bgmStyle: "史诗",
          emotion: "宏大叙事",
        },
      },
      description: "电影质感配方：低调光 + 中景推拉 + 史诗交响BGM",
    },
    preview: "宽屏构图，胶片色彩，景深虚化",
  },
};

// === 索引 ===
const RECIPE_INDEX: Map<string, Recipe> = new Map(
  Object.entries(RECIPES).map(([id, r]) => [id as RecipeId, r]),
);

// 内置配方 id 集合（用于区分内置与自定义，注销时只移除自定义）
const BUILTIN_RECIPE_IDS: Set<string> = new Set(Object.keys(RECIPES));

// 自定义配方存储（用于注销判断）—— key 为 string 以支持自定义配方 id
const customRecipes = new Map<string, Recipe>();

/**
 * 按 id 获取配方。
 *
 * 注意：参数类型为 string 而非 RecipeId，以支持自定义配方（registerCustomRecipe
 * 允许任意 string 作为 id）。内置配方的 id 仍然是 RecipeId 字面量联合类型。
 */
export function getRecipe(id: string): Recipe | null {
  return RECIPE_INDEX.get(id) ?? null;
}

/**
 * 列出所有预设配方。
 */
export function listRecipes(): Recipe[] {
  return Array.from(RECIPE_INDEX.values());
}

/**
 * 应用配方：根据配方的 Skill 组合，构建完整的 prompt 指令片段。
 *
 * 返回的字符串可直接拼入最终 prompt。
 */
export function applyRecipe(id: string): string {
  const recipe = getRecipe(id);
  if (!recipe) {
    throw new Error(`[applyRecipe] unknown recipe: ${id}`);
  }

  const parts: string[] = [];
  const { params } = recipe.skillCombination;

  // Style Skill
  if (params.style) {
    parts.push(buildStyleInstruction(params.style.type, params.style.supplement));
  }

  // Lighting Skill
  if (params.lighting) {
    parts.push(buildLightingInstruction(params.lighting.type, params.lighting.supplement));
  }

  // Camera Skill
  if (params.camera) {
    parts.push(
      buildCameraInstruction(
        params.camera.shotSize,
        params.camera.movement,
        params.camera.lens,
      ),
    );
  }

  // VFX Skill
  if (params.vfx?.particle) {
    parts.push(buildParticleEffect(params.vfx.particle, params.vfx.density));
  }

  // Characters Skill（强化角色一致性）
  if (params.characters) {
    parts.push("角色一致性强化：明确身份特征（发型/服饰/体型），确保跨镜头一致");
  }

  // Audio Skill
  if (params.audio) {
    parts.push(`BGM：${params.audio.bgmStyle}风格，${params.audio.emotion}`);
  }

  return parts.join("；");
}

/**
 * 获取配方涉及的 Skill id 列表（用于 UI 展示哪些 Skill 被激活）。
 */
export function getRecipeSkillIds(id: string): string[] {
  const recipe = getRecipe(id);
  return recipe ? recipe.skillCombination.skillIds : [];
}

/**
 * 自定义配方注册（用户可在 UI 创建自定义配方）。
 * 注意：自定义配方不会持久化到本文件，由调用方负责持久化。
 *
 * 类型设计：recipe.id 为 string 而非 RecipeId，允许用户使用任意字符串作为 id。
 * RecipeId 字面量联合类型仅用于内置配方的类型保护。
 */
export function registerCustomRecipe(recipe: { id: string } & Omit<Recipe, "id">): void {
  customRecipes.set(recipe.id, recipe as Recipe);
  RECIPE_INDEX.set(recipe.id, recipe as Recipe);
}

export function unregisterCustomRecipe(id: string): void {
  // 仅当该配方是自定义配方时才从索引移除（避免移除内置配方）
  if (customRecipes.has(id) && !BUILTIN_RECIPE_IDS.has(id)) {
    customRecipes.delete(id);
    RECIPE_INDEX.delete(id);
  }
}
