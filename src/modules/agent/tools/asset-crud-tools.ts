/**
 * 素材 CRUD 工具（Asset CRUD Tools）
 *
 * 包含工具：
 * - create_character：创建角色
 * - update_character：更新角色
 * - delete_character：删除角色（含引用检查）
 * - create_scene：创建场景
 * - update_scene：更新场景
 * - delete_scene：删除场景（含引用检查）
 * - tag_asset：给素材打标签
 * - organize_assets：批量整理素材
 * - deduplicate_assets：去重检测
 *
 * 设计要点：
 * - 调用 characterService / sceneService 的 public API（Result<T> 模式）
 * - 删除操作先检查引用（checkCharacterReferences / checkSceneReferences）
 * - 动态 import 避免循环依赖
 * - 参数类型转换：args 字段为 unknown，需 String()/Number()/Boolean() 转换
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../domain/constants";
import type {
  CreateCharacterInput,
  UpdateCharacterInput,
  CreateSceneInput,
  UpdateSceneInput,
} from "@/domain/schemas";

// ============= 辅助函数 =============

/**
 * 将未知值转为字符串数组
 * 支持字符串（按 、，, 分隔）或字符串数组
 */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  if (value === undefined || value === null) {
    return [];
  }
  return String(value)
    .split(/[、，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 将未知值转为 lighting 字符串
 * sceneSchema 中 lighting 为 string 类型，支持传入对象自动拼接
 */
function toLightingString(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    if (obj.type) parts.push(String(obj.type));
    if (obj.intensity) parts.push(String(obj.intensity));
    if (obj.color) parts.push(String(obj.color));
    return parts.join(", ");
  }
  return String(value);
}

/** appearance 对象类型 */
interface AppearanceInput {
  hairColor: string;
  hairStyle: string;
  eyeColor: string;
  height: string;
  build: string;
  clothing: string;
}

/** 将未知值转为 appearance 对象（匹配 CharacterAppearance schema） */
function toAppearance(value: unknown): AppearanceInput {
  const empty: AppearanceInput = {
    hairColor: "",
    hairStyle: "",
    eyeColor: "",
    height: "",
    build: "",
    clothing: "",
  };
  if (!value || typeof value !== "object") {
    return empty;
  }
  const obj = value as Record<string, unknown>;
  return {
    hairColor: obj.hairColor !== undefined ? String(obj.hairColor) : "",
    hairStyle: obj.hairStyle !== undefined ? String(obj.hairStyle) : "",
    eyeColor: obj.eyeColor !== undefined ? String(obj.eyeColor) : "",
    height: obj.height !== undefined ? String(obj.height) : "",
    build: obj.build !== undefined ? String(obj.build) : "",
    clothing: obj.clothing !== undefined ? String(obj.clothing) : "",
  };
}

/** camera 对象类型（匹配 SceneCamera schema） */
interface CameraInput {
  position?: string;
  angle?: string;
  zoom?: number;
  distance?: string;
  movement?: string;
}

/** 将未知值转为 camera 对象 */
function toCamera(value: unknown): CameraInput | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  const camera: CameraInput = {};
  if (obj.angle !== undefined) camera.angle = String(obj.angle);
  if (obj.movement !== undefined) camera.movement = String(obj.movement);
  if (obj.position !== undefined) camera.position = String(obj.position);
  if (obj.zoom !== undefined) camera.zoom = Number(obj.zoom);
  if (obj.distance !== undefined) camera.distance = String(obj.distance);
  return camera;
}

/** 计算两个字符串的 Levenshtein 距离（滚动数组优化） */
function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  let prev = new Array<number>(len2 + 1).fill(0);
  let curr = new Array<number>(len2 + 1).fill(0);
  for (let j = 0; j <= len2; j++) prev[j] = j;

  for (let i = 1; i <= len1; i++) {
    curr[0] = i;
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[len2] ?? 0;
}

/** 计算两个字符串的相似度（0-1，1 表示完全相同） */
function stringSimilarity(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(s1, s2) / maxLen;
}

// ============= 工具实现 =============

/** 创建角色 */
export const createCharacterTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "create_character",
      description:
        "创建一个新角色。需提供名称（必填），可选提供风格、性别、年龄、描述、标签、外观（hairColor/hairStyle/eyeColor/height/build/clothing）、性格特征、自定义提示词等。创建后返回角色精简信息。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "角色名称（必填）", maxLength: 200 },
          style: { type: "string", description: "艺术风格（如：日式动漫、写实、赛博朋克）", maxLength: 200 },
          gender: { type: "string", description: "性别（男性/女性/中性/无性别）", maxLength: 200 },
          age: { type: "number", description: "年龄", minimum: 0, maximum: 1000 },
          description: { type: "string", description: "角色描述", maxLength: 1000 },
          tags: { type: "array", items: { type: "string" }, description: "标签列表" },
          appearance: {
            type: "object",
            properties: {
              hairColor: { type: "string", description: "发色" },
              hairStyle: { type: "string", description: "发型" },
              eyeColor: { type: "string", description: "瞳色" },
              height: { type: "string", description: "身高" },
              build: { type: "string", description: "体型" },
              clothing: { type: "string", description: "服装" },
            },
            description: "外观信息对象",
          },
          personality: {
            type: "string",
            description: "性格描述，可用 、 分隔多个特征（如：勇敢、善良、坚强）",
            maxLength: 1000,
          },
          customPrompt: { type: "string", description: "自定义生成提示词", maxLength: 5000 },
        },
        required: ["name"],
      },
    },
  },
  domain: "asset",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { characterService } = await import("@/modules/character");

    const input: CreateCharacterInput = {
      name: String(args.name),
      description: args.description !== undefined ? String(args.description) : "",
      gender: args.gender !== undefined ? String(args.gender) : "",
      style: args.style !== undefined ? String(args.style) : "",
      personality: toStringArray(args.personality),
      appearance: toAppearance(args.appearance),
      prompt: args.customPrompt !== undefined ? String(args.customPrompt) : "",
      age: args.age !== undefined ? Number(args.age) : undefined,
      tags: args.tags !== undefined ? toStringArray(args.tags) : undefined,
    };

    const result = await characterService.create(input);
    if (!result.ok) {
      return { success: false, error: `创建角色失败：${result.error.message}` };
    }

    const c = result.value;
    return {
      success: true,
      data: {
        id: c.id,
        name: c.name,
        style: c.style,
        gender: c.gender,
        age: c.age,
        description: c.description,
        tags: c.tags,
      },
    };
  },
};

/** 更新角色 */
export const updateCharacterTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "update_character",
      description:
        "更新已有角色的信息。只需传入需要修改的字段（未传的字段保持不变）。characterId 为必填。",
      parameters: {
        type: "object",
        properties: {
          characterId: { type: "string", description: "要更新的角色 ID（必填）", maxLength: 100 },
          name: { type: "string", description: "新名称", maxLength: 200 },
          style: { type: "string", description: "新风格", maxLength: 200 },
          gender: { type: "string", description: "新性别", maxLength: 200 },
          age: { type: "number", description: "新年龄", minimum: 0, maximum: 1000 },
          description: { type: "string", description: "新描述", maxLength: 1000 },
          tags: { type: "array", items: { type: "string" }, description: "新标签列表" },
          appearance: {
            type: "object",
            properties: {
              hairColor: { type: "string" },
              hairStyle: { type: "string" },
              eyeColor: { type: "string" },
              height: { type: "string" },
              build: { type: "string" },
              clothing: { type: "string" },
            },
            description: "新外观信息",
          },
          personality: { type: "string", description: "新性格描述（可用 、 分隔）", maxLength: 1000 },
          customPrompt: { type: "string", description: "新自定义提示词", maxLength: 5000 },
        },
        required: ["characterId"],
      },
    },
  },
  domain: "asset",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { characterService } = await import("@/modules/character");
    const id = String(args.characterId);

    const input: UpdateCharacterInput = { id };
    if (args.name !== undefined) input.name = String(args.name);
    if (args.style !== undefined) input.style = String(args.style);
    if (args.gender !== undefined) input.gender = String(args.gender);
    if (args.description !== undefined) input.description = String(args.description);
    if (args.age !== undefined) input.age = Number(args.age);
    if (args.tags !== undefined) input.tags = toStringArray(args.tags);
    if (args.appearance !== undefined) input.appearance = toAppearance(args.appearance);
    if (args.personality !== undefined) input.personality = toStringArray(args.personality);
    if (args.customPrompt !== undefined) input.prompt = String(args.customPrompt);

    const result = await characterService.update(id, input);
    if (!result.ok) {
      return { success: false, error: `更新角色失败：${result.error.message}` };
    }

    return { success: true, data: { updated: true, characterId: id } };
  },
};

/** 删除角色（含引用检查） */
export const deleteCharacterTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "delete_character",
      description:
        "删除角色。删除前会检查该角色是否被故事/分镜引用，如有引用且未设置 force=true 则拒绝删除并返回引用详情。设置 force=true 可跳过引用检查强制删除。",
      parameters: {
        type: "object",
        properties: {
          characterId: { type: "string", description: "要删除的角色 ID（必填）", maxLength: 100 },
          force: {
            type: "boolean",
            description: "是否跳过引用检查强制删除，默认 false",
            default: false,
          },
        },
        required: ["characterId"],
      },
    },
  },
  domain: "asset",
  requiresConfirmation: true,
  dangerLevel: "destructive",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { characterService } = await import("@/modules/character");
    const id = String(args.characterId);
    const force = Boolean(args.force);

    // 先获取角色（确认存在 + 拿到名称用于引用检查）
    const getRes = await characterService.getById(id);
    if (!getRes.ok) {
      return { success: false, error: `角色不存在：${getRes.error.message}` };
    }
    const character = getRes.value;

    // 引用检查
    if (!force) {
      const { checkCharacterReferences } = await import("@/modules/shot");
      const { storyService } = await import("@/modules/storyboard");
      const storiesRes = await storyService.getAll();
      const stories = storiesRes.ok ? storiesRes.value : [];
      const checkResult = checkCharacterReferences(id, character.name, stories);

      if (!checkResult.canDelete) {
        const refList = checkResult.references
          .map((r) => `故事"${r.usedInStories.join("/")}"中的 ${r.usedInBeats.length} 个分镜`)
          .join("、");
        return {
          success: false,
          error: `该角色被 ${checkResult.references.length} 处引用，无法删除。引用列表：${refList}。如需强制删除，请设置 force=true`,
        };
      }
    }

    const result = await characterService.delete(id);
    if (!result.ok) {
      return { success: false, error: `删除角色失败：${result.error.message}` };
    }

    return { success: true, data: { deleted: true, characterId: id } };
  },
};

/** 创建场景 */
export const createSceneTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "create_scene",
      description:
        "创建一个新场景。需提供名称（必填），可选提供类型、时间、天气、情绪、描述、标签、灯光、相机、自定义提示词等。创建后返回场景精简信息。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "场景名称（必填）", maxLength: 200 },
          type: { type: "string", description: "场景类型（如：室内、室外、城市、自然）", maxLength: 200 },
          timeOfDay: { type: "string", description: "时间（如：白天、黄昏、夜晚）", maxLength: 200 },
          weather: { type: "string", description: "天气（如：晴天、雨天、雪天）", maxLength: 200 },
          mood: { type: "string", description: "情绪氛围（如：温馨、紧张、神秘）", maxLength: 200 },
          description: { type: "string", description: "场景描述", maxLength: 1000 },
          tags: { type: "array", items: { type: "string" }, description: "标签列表" },
          lighting: {
            type: "object",
            properties: {
              type: { type: "string", description: "灯光类型" },
              intensity: { type: "string", description: "灯光强度" },
              color: { type: "string", description: "灯光颜色" },
            },
            description: "灯光信息（会自动拼接为描述字符串）",
          },
          camera: {
            type: "object",
            properties: {
              angle: { type: "string", description: "镜头角度" },
              movement: { type: "string", description: "镜头运动" },
            },
            description: "相机信息",
          },
          customPrompt: { type: "string", description: "自定义生成提示词", maxLength: 5000 },
        },
        required: ["name"],
      },
    },
  },
  domain: "asset",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { sceneService } = await import("@/modules/scene");

    const input: CreateSceneInput = {
      name: String(args.name),
      description: args.description !== undefined ? String(args.description) : "",
      type: args.type !== undefined ? String(args.type) : "",
      timeOfDay: args.timeOfDay !== undefined ? String(args.timeOfDay) : "",
      weather: args.weather !== undefined ? String(args.weather) : "",
      mood: args.mood !== undefined ? String(args.mood) : "",
      lighting: toLightingString(args.lighting),
      prompt: args.customPrompt !== undefined ? String(args.customPrompt) : "",
      elements: [],
      colors: [],
      camera: toCamera(args.camera),
      tags: args.tags !== undefined ? toStringArray(args.tags) : undefined,
    };

    const result = await sceneService.create(input);
    if (!result.ok) {
      return { success: false, error: `创建场景失败：${result.error.message}` };
    }

    const s = result.value;
    return {
      success: true,
      data: {
        id: s.id,
        name: s.name,
        type: s.type,
        timeOfDay: s.timeOfDay,
        weather: s.weather,
        mood: s.mood,
        tags: s.tags,
      },
    };
  },
};

/** 更新场景 */
export const updateSceneTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "update_scene",
      description:
        "更新已有场景的信息。只需传入需要修改的字段（未传的字段保持不变）。sceneId 为必填。",
      parameters: {
        type: "object",
        properties: {
          sceneId: { type: "string", description: "要更新的场景 ID（必填）", maxLength: 100 },
          name: { type: "string", description: "新名称", maxLength: 200 },
          type: { type: "string", description: "新类型", maxLength: 200 },
          timeOfDay: { type: "string", description: "新时间", maxLength: 200 },
          weather: { type: "string", description: "新天气", maxLength: 200 },
          mood: { type: "string", description: "新情绪", maxLength: 200 },
          description: { type: "string", description: "新描述", maxLength: 1000 },
          tags: { type: "array", items: { type: "string" }, description: "新标签列表" },
          lighting: {
            type: "object",
            properties: {
              type: { type: "string" },
              intensity: { type: "string" },
              color: { type: "string" },
            },
            description: "新灯光信息",
          },
          camera: {
            type: "object",
            properties: {
              angle: { type: "string" },
              movement: { type: "string" },
            },
            description: "新相机信息",
          },
          customPrompt: { type: "string", description: "新自定义提示词", maxLength: 5000 },
        },
        required: ["sceneId"],
      },
    },
  },
  domain: "asset",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { sceneService } = await import("@/modules/scene");
    const id = String(args.sceneId);

    const input: UpdateSceneInput = { id };
    if (args.name !== undefined) input.name = String(args.name);
    if (args.type !== undefined) input.type = String(args.type);
    if (args.timeOfDay !== undefined) input.timeOfDay = String(args.timeOfDay);
    if (args.weather !== undefined) input.weather = String(args.weather);
    if (args.mood !== undefined) input.mood = String(args.mood);
    if (args.description !== undefined) input.description = String(args.description);
    if (args.tags !== undefined) input.tags = toStringArray(args.tags);
    if (args.lighting !== undefined) input.lighting = toLightingString(args.lighting);
    if (args.camera !== undefined) input.camera = toCamera(args.camera);
    if (args.customPrompt !== undefined) input.prompt = String(args.customPrompt);

    const result = await sceneService.update(id, input);
    if (!result.ok) {
      return { success: false, error: `更新场景失败：${result.error.message}` };
    }

    return { success: true, data: { updated: true, sceneId: id } };
  },
};

/** 删除场景（含引用检查） */
export const deleteSceneTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "delete_scene",
      description:
        "删除场景。删除前会检查该场景是否被故事/分镜引用，如有引用且未设置 force=true 则拒绝删除并返回引用详情。设置 force=true 可跳过引用检查强制删除。",
      parameters: {
        type: "object",
        properties: {
          sceneId: { type: "string", description: "要删除的场景 ID（必填）", maxLength: 100 },
          force: {
            type: "boolean",
            description: "是否跳过引用检查强制删除，默认 false",
            default: false,
          },
        },
        required: ["sceneId"],
      },
    },
  },
  domain: "asset",
  requiresConfirmation: true,
  dangerLevel: "destructive",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { sceneService } = await import("@/modules/scene");
    const id = String(args.sceneId);
    const force = Boolean(args.force);

    // 先获取场景（确认存在 + 拿到名称用于引用检查）
    const getRes = await sceneService.getById(id);
    if (!getRes.ok) {
      return { success: false, error: `场景不存在：${getRes.error.message}` };
    }
    const scene = getRes.value;

    // 引用检查
    if (!force) {
      const { checkSceneReferences } = await import("@/modules/shot");
      const { storyService } = await import("@/modules/storyboard");
      const storiesRes = await storyService.getAll();
      const stories = storiesRes.ok ? storiesRes.value : [];
      const checkResult = checkSceneReferences(id, scene.name, stories);

      if (!checkResult.canDelete) {
        const refList = checkResult.references
          .map((r) => `故事"${r.usedInStories.join("/")}"中的 ${r.usedInBeats.length} 个分镜`)
          .join("、");
        return {
          success: false,
          error: `该场景被 ${checkResult.references.length} 处引用，无法删除。引用列表：${refList}。如需强制删除，请设置 force=true`,
        };
      }
    }

    const result = await sceneService.delete(id);
    if (!result.ok) {
      return { success: false, error: `删除场景失败：${result.error.message}` };
    }

    return { success: true, data: { deleted: true, sceneId: id } };
  },
};

/** 给素材打标签 */
export const tagAssetTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "tag_asset",
      description:
        "给角色或场景打标签。支持三种模式：add（追加，自动去重）、remove（移除指定标签）、replace（直接替换全部标签）。",
      parameters: {
        type: "object",
        properties: {
          assetType: {
            type: "string",
            enum: ["character", "scene"],
            description: "素材类型（必填）",
          },
          assetId: { type: "string", description: "素材 ID（必填）", maxLength: 100 },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "标签列表（必填）",
          },
          mode: {
            type: "string",
            enum: ["add", "remove", "replace"],
            description: "操作模式：add=追加、remove=移除、replace=替换。默认 add",
            default: "add",
          },
        },
        required: ["assetType", "assetId", "tags"],
      },
    },
  },
  domain: "asset",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const assetType = String(args.assetType);
    const assetId = String(args.assetId);
    const newTags = toStringArray(args.tags);
    const mode = String(args.mode || "add") as "add" | "remove" | "replace";

    /** 计算更新后的标签 */
    function computeTags(currentTags: string[]): string[] {
      if (mode === "add") {
        return [...new Set([...currentTags, ...newTags])];
      }
      if (mode === "remove") {
        const removeSet = new Set(newTags);
        return currentTags.filter((t) => !removeSet.has(t));
      }
      return newTags;
    }

    if (assetType === "character") {
      const { characterService } = await import("@/modules/character");
      const getRes = await characterService.getById(assetId);
      if (!getRes.ok) {
        return { success: false, error: `角色不存在：${getRes.error.message}` };
      }
      const updatedTags = computeTags(getRes.value.tags ?? []);
      const updateRes = await characterService.update(assetId, {
        id: assetId,
        tags: updatedTags,
      });
      if (!updateRes.ok) {
        return { success: false, error: `更新标签失败：${updateRes.error.message}` };
      }
      return { success: true, data: { assetId, assetType, tags: updatedTags } };
    }

    if (assetType === "scene") {
      const { sceneService } = await import("@/modules/scene");
      const getRes = await sceneService.getById(assetId);
      if (!getRes.ok) {
        return { success: false, error: `场景不存在：${getRes.error.message}` };
      }
      const updatedTags = computeTags(getRes.value.tags ?? []);
      const updateRes = await sceneService.update(assetId, {
        id: assetId,
        tags: updatedTags,
      });
      if (!updateRes.ok) {
        return { success: false, error: `更新标签失败：${updateRes.error.message}` };
      }
      return { success: true, data: { assetId, assetType, tags: updatedTags } };
    }

    return {
      success: false,
      error: `无效的素材类型：${assetType}，仅支持 character 或 scene`,
    };
  },
};

/** 批量整理素材（排序 + 可选重命名） */
export const organizeAssetsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "organize_assets",
      description:
        "批量整理素材：按名称/风格/类型/创建时间/使用次数排序，并可统一命名格式为「风格-名称-序号」。dryRun=true 仅返回整理建议（不修改数据），dryRun=false 实际更新名称。",
      parameters: {
        type: "object",
        properties: {
          assetType: {
            type: "string",
            enum: ["character", "scene", "all"],
            description: "素材类型，默认 all",
            default: "all",
          },
          sortBy: {
            type: "string",
            enum: ["name", "style", "type", "createdAt", "useCount"],
            description: "排序字段，默认 name",
            default: "name",
          },
          dryRun: {
            type: "boolean",
            description: "是否仅预览不执行，默认 true",
            default: true,
          },
        },
      },
    },
  },
  domain: "asset",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const assetType = String(args.assetType);
    const sortBy = String(args.sortBy || "name");
    const dryRun = args.dryRun === undefined ? true : Boolean(args.dryRun);

    type Sortable = {
      name: string;
      style?: string;
      type?: string;
      createdAt?: string;
      useCount?: number;
    };

    const sortFn = (a: Sortable, b: Sortable): number => {
      switch (sortBy) {
        case "style":
          return (
            String(a.style ?? "").localeCompare(String(b.style ?? "")) ||
            a.name.localeCompare(b.name)
          );
        case "type":
          return (
            String(a.type ?? "").localeCompare(String(b.type ?? "")) ||
            a.name.localeCompare(b.name)
          );
        case "createdAt":
          return (
            String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) ||
            a.name.localeCompare(b.name)
          );
        case "useCount":
          return (b.useCount ?? 0) - (a.useCount ?? 0) || a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name);
      }
    };

    const sorted: Array<{
      id: string;
      oldName: string;
      newName?: string;
      assetType: string;
    }> = [];

    if (assetType === "all" || assetType === "character") {
      const { characterService } = await import("@/modules/character");
      const res = await characterService.getAll();
      if (res.ok) {
        const chars = [...res.value].sort(sortFn);
        for (let i = 0; i < chars.length; i++) {
          const c = chars[i];
          if (!c) continue;
          const newName = `${c.style}-${c.name}-${String(i + 1).padStart(2, "0")}`;
          if (!dryRun && newName !== c.name) {
            await characterService.update(c.id, { id: c.id, name: newName });
          }
          sorted.push({
            id: c.id,
            oldName: c.name,
            newName,
            assetType: "character",
          });
        }
      }
    }

    if (assetType === "all" || assetType === "scene") {
      const { sceneService } = await import("@/modules/scene");
      const res = await sceneService.getAll();
      if (res.ok) {
        const scenes = [...res.value].sort(sortFn);
        for (let i = 0; i < scenes.length; i++) {
          const s = scenes[i];
          if (!s) continue;
          const newName = `${s.type}-${s.name}-${String(i + 1).padStart(2, "0")}`;
          if (!dryRun && newName !== s.name) {
            await sceneService.update(s.id, { id: s.id, name: newName });
          }
          sorted.push({
            id: s.id,
            oldName: s.name,
            newName,
            assetType: "scene",
          });
        }
      }
    }

    return {
      success: true,
      data: {
        sorted,
        total: sorted.length,
        dryRun,
      },
    };
  },
};

/** 去重检测（检测名称相似度高的素材） */
export const deduplicateAssetsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "deduplicate_assets",
      description:
        "检测名称相似度高的素材（可能重复）。使用 Levenshtein 距离归一化算法计算名称相似度，返回超过阈值的素材对。仅做检测，不自动删除。",
      parameters: {
        type: "object",
        properties: {
          assetType: {
            type: "string",
            enum: ["character", "scene", "all"],
            description: "素材类型，默认 all",
            default: "all",
          },
          threshold: {
            type: "number",
            description: "相似度阈值（0-1），默认 0.85。越高越严格",
            default: 0.85,
            minimum: 0,
            maximum: 1,
          },
          dryRun: {
            type: "boolean",
            description: "是否仅预览（默认 true，当前仅支持预览检测）",
            default: true,
          },
        },
      },
    },
  },
  domain: "asset",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const assetType = String(args.assetType);
    const threshold = Math.min(Math.max(Number(args.threshold) || 0.85, 0), 1);

    type DuplicatePair = {
      asset1: { id: string; name: string; type: string };
      asset2: { id: string; name: string; type: string };
      similarity: number;
    };

    const duplicates: DuplicatePair[] = [];

    /** 在同类素材中两两比对名称相似度 */
    function findDuplicates(
      items: Array<{ id: string; name: string }>,
      typeLabel: string,
    ): void {
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        if (!a) continue;
        for (let j = i + 1; j < items.length; j++) {
          const b = items[j];
          if (!b) continue;
          const sim = stringSimilarity(
            a.name.toLowerCase(),
            b.name.toLowerCase(),
          );
          if (sim >= threshold) {
            duplicates.push({
              asset1: { id: a.id, name: a.name, type: typeLabel },
              asset2: { id: b.id, name: b.name, type: typeLabel },
              similarity: Math.round(sim * 100) / 100,
            });
          }
        }
      }
    }

    if (assetType === "all" || assetType === "character") {
      const { characterService } = await import("@/modules/character");
      const res = await characterService.getAll();
      if (res.ok) {
        findDuplicates(
          res.value.map((c) => ({ id: c.id, name: c.name })),
          "character",
        );
      }
    }

    if (assetType === "all" || assetType === "scene") {
      const { sceneService } = await import("@/modules/scene");
      const res = await sceneService.getAll();
      if (res.ok) {
        findDuplicates(
          res.value.map((s) => ({ id: s.id, name: s.name })),
          "scene",
        );
      }
    }

    return {
      success: true,
      data: {
        duplicates,
        total: duplicates.length,
      },
    };
  },
};

/** 导出所有素材 CRUD 工具 */
export const assetCrudTools: ToolImpl[] = [
  createCharacterTool,
  updateCharacterTool,
  deleteCharacterTool,
  createSceneTool,
  updateSceneTool,
  deleteSceneTool,
  tagAssetTool,
  organizeAssetsTool,
  deduplicateAssetsTool,
];