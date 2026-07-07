/**
 * 故事创作工具（Story Tools）
 *
 * 包含工具：
 * - list_stories：列出所有故事（支持过滤/分页）
 * - get_story：获取故事详情（含所有分镜）
 * - create_story：创建故事
 * - update_story：更新故事
 * - delete_story：删除故事（需确认）
 * - plan_story：AI 规划故事分镜
 * - validate_story_plan：校验分镜计划
 * - generate_style_guide：生成风格指南
 * - generate_frame_prompts：生成分镜首尾帧提示词
 * - generate_story_ideas：生成故事创意
 * - suggest_character_backstory：建议角色背景故事
 * - suggest_scene_description：建议场景描述
 * - check_story_consistency：故事逻辑一致性检查
 *
 * 设计要点：
 * - 调用 storyService / characterService / sceneService 的 public API（Result<T> 模式）
 * - 调用 planStory / generateStyleGuide / generateFramePrompts 等 story 模块生成函数
 * - 通过 DI container 获取 textProvider / imageProvider（用于 LLM 文本与图片生成）
 * - Result 模式：{ ok: true, value } | { ok: false, error: Error }
 * - ApiResponse 模式：{ success: true, data } | { success: false, error: string }
 * - 错误处理完善，service 失败时返回友好错误信息
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { container } from "@/infrastructure/di";

// ============= 工具实现 =============

/** 列出所有故事（支持过滤/分页） */
export const listStoriesTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_stories",
      description:
        "列出所有故事。支持按标题模糊匹配，可限制返回数量和分页。返回精简字段（id/title/beatCount/createdAt/updatedAt），" +
        "适用于：用户要求「列出故事」、「查看所有故事」、「我有几个故事」等场景。",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "返回数量上限，默认 20，最大 100", default: 20 },
          offset: { type: "number", description: "偏移量（分页），默认 0", default: 0 },
          title: { type: "string", description: "按标题模糊匹配（包含该字符串）" },
        },
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const { storyService } = await import("@/modules/story");
    const result = await storyService.getAll();
    if (!result.ok) {
      return { success: false, error: `获取故事列表失败：${result.error.message}` };
    }

    let filtered = result.value;
    if (args.title) {
      const kw = String(args.title).toLowerCase();
      filtered = filtered.filter((s) => s.title.toLowerCase().includes(kw));
    }

    const offset = Number(args.offset) || 0;
    const limit = Math.min(Number(args.limit) || 20, 100);
    const paged = filtered.slice(offset, offset + limit);

    return {
      success: true,
      data: {
        total: filtered.length,
        offset,
        limit,
        items: paged.map((s) => ({
          id: s.id,
          title: s.title,
          beatCount: s.beats?.length ?? 0,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      },
    };
  },
};

/** 获取故事详情（含所有分镜） */
export const getStoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_story",
      description:
        "获取故事完整详情（含所有分镜 beats 数组、风格指南 styleGuide、角色/场景引用等所有字段）。" +
        "适用于：用户要求「查看故事详情」、「打开故事」、「故事分镜有哪些」等场景。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID（必填）" },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const { storyService } = await import("@/modules/story");
    const id = String(args.storyId);
    const result = await storyService.getById(id);
    if (!result.ok) {
      return { success: false, error: `获取故事失败：${result.error.message}` };
    }
    return { success: true, data: result.value };
  },
};

/** 创建故事 */
export const createStoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "create_story",
      description:
        "创建一个新故事。需要提供标题和描述，可指定目标时长、风格主题、角色 ID 数组和场景 ID 数组。" +
        "创建后故事为空（无分镜），可后续调用 plan_story 生成分镜。" +
        "适用于：用户要求「创建一个故事」、「新建故事」、「开始一个新动画项目」等场景。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "故事标题（必填，不能为空）" },
          description: { type: "string", description: "故事描述/简介（必填）" },
          targetDuration: {
            type: "number",
            description: "目标时长（秒），默认 60",
            default: 60,
          },
          style: {
            type: "string",
            description: "风格主题（如：剧情、喜剧、悬疑、奇幻），映射到故事的 genre 字段",
          },
          characters: {
            type: "array",
            items: { type: "string" },
            description: "角色 ID 数组（关联已有角色）",
          },
          scenes: {
            type: "array",
            items: { type: "string" },
            description: "场景 ID 数组（关联已有场景）",
          },
        },
        required: ["title", "description"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { storyService } = await import("@/modules/story");
    const title = String(args.title);
    const description = String(args.description);
    const targetDuration = args.targetDuration != null ? Number(args.targetDuration) : 60;
    const style = args.style ? String(args.style) : undefined;
    const characters = Array.isArray(args.characters) ? args.characters.map(String) : [];
    const scenes = Array.isArray(args.scenes) ? args.scenes.map(String) : [];

    const result = await storyService.create({
      title,
      description,
      genre: style,
      targetDuration,
      characters,
      scenes,
      beats: [],
      elementIds: [],
    });
    if (!result.ok) {
      return { success: false, error: `创建故事失败：${result.error.message}` };
    }

    return {
      success: true,
      data: {
        id: result.value.id,
        title: result.value.title,
        description: result.value.description,
        genre: result.value.genre,
        targetDuration: result.value.targetDuration,
        characters: result.value.characters,
        scenes: result.value.scenes,
        createdAt: result.value.createdAt,
      },
    };
  },
};

/** 更新故事 */
export const updateStoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "update_story",
      description:
        "更新故事信息（标题、描述、目标时长、风格主题）。仅更新提供的字段，未提供的字段保持不变。" +
        "适用于：用户要求「修改故事标题」、「更新故事描述」、「改一下故事风格」等场景。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID（必填）" },
          title: { type: "string", description: "新标题" },
          description: { type: "string", description: "新描述" },
          targetDuration: { type: "number", description: "新目标时长（秒）" },
          style: {
            type: "string",
            description: "新风格主题（映射到 genre 字段）",
          },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { storyService } = await import("@/modules/story");
    const storyId = String(args.storyId);

    const result = await storyService.update(storyId, {
      id: storyId,
      ...(args.title != null ? { title: String(args.title) } : {}),
      ...(args.description != null ? { description: String(args.description) } : {}),
      ...(args.targetDuration != null ? { targetDuration: Number(args.targetDuration) } : {}),
      ...(args.style != null ? { genre: String(args.style) } : {}),
    });
    if (!result.ok) {
      return { success: false, error: `更新故事失败：${result.error.message}` };
    }
    return { success: true, data: { updated: true, storyId } };
  },
};

/** 删除故事（需确认） */
export const deleteStoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "delete_story",
      description:
        "删除故事及其所有分镜。删除前会自动保存一份版本备份。此操作不可逆，需要用户确认。" +
        "适用于：用户要求「删除故事」、「移除这个动画项目」等场景。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID（必填）" },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  requiresConfirmation: true,
  async execute(args) {
    const { storyService } = await import("@/modules/story");
    const id = String(args.storyId);
    const result = await storyService.delete(id);
    if (!result.ok) {
      return { success: false, error: `删除故事失败：${result.error.message}` };
    }
    return { success: true, data: { deleted: true, storyId: id } };
  },
};

/** AI 规划故事分镜 */
export const planStoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "plan_story",
      description:
        "调用 AI 根据故事标题、描述、关联的角色和场景自动规划分镜（story beats）。" +
        "生成后会自动更新故事的 beats 字段。支持增强生成模式和严格模式。" +
        "适用于：用户要求「规划分镜」、「生成故事分镜」、「AI 帮我分镜」等场景。" +
        "注意：此工具会调用 LLM，执行时间较长（通常 30 秒到 2 分钟）。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID（必填）" },
          maxBeats: {
            type: "number",
            description: "最大分镜数，默认 6。生成的分镜超过此数量时会被裁剪。",
            default: 6,
          },
          enhancedGeneration: {
            type: "boolean",
            description: "是否启用增强生成模式（更详细的分镜描述），默认 false",
          },
          strictMode: {
            type: "boolean",
            description: "是否启用严格模式（更严格的校验规则），默认 false",
          },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const { storyService } = await import("@/modules/story");
    const { planStory } = await import("@/modules/story/planning");
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const storyId = String(args.storyId);
    const maxBeats = args.maxBeats != null ? Number(args.maxBeats) : 6;
    const enhancedGeneration = args.enhancedGeneration === true;
    const strictMode = args.strictMode === true;

    // 1. 获取故事
    const storyResult = await storyService.getById(storyId);
    if (!storyResult.ok) {
      return { success: false, error: `获取故事失败：${storyResult.error.message}` };
    }

    // 2. 获取角色和场景
    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);
    const characters = charResult.ok ? charResult.value : [];
    const scenes = sceneResult.ok ? sceneResult.value : [];

    // 3. 调用 AI 规划分镜
    const planResult = await planStory(storyResult.value, characters, scenes, {
      enhancedGeneration,
      strictMode,
    });
    if (!planResult.ok) {
      return { success: false, error: `规划故事分镜失败：${planResult.error.message}` };
    }

    // 4. 按 maxBeats 裁剪
    const allBeats = planResult.value.beats;
    const beats = allBeats.length > maxBeats ? allBeats.slice(0, maxBeats) : allBeats;

    // 5. 更新故事的 beats
    const updateResult = await storyService.update(storyId, { id: storyId, beats });
    if (!updateResult.ok) {
      return {
        success: true,
        data: {
          beats,
          autoFixedCount: planResult.value.autoFixedCount,
          retryCount: planResult.value.retryCount,
          fixDetails: planResult.value.fixDetails,
          warning: `分镜已生成但保存到故事失败：${updateResult.error.message}`,
        },
      };
    }

    return {
      success: true,
      data: {
        beats,
        autoFixedCount: planResult.value.autoFixedCount,
        retryCount: planResult.value.retryCount,
        fixDetails: planResult.value.fixDetails,
      },
    };
  },
};

/** 校验分镜计划 */
export const validateStoryPlanTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "validate_story_plan",
      description:
        "校验故事分镜计划的完整性。检查每个分镜是否有描述、时长是否有效、角色和场景引用是否存在。" +
        "返回校验结果和问题列表（含严重级别：error/warning）。" +
        "适用于：用户要求「检查分镜」、「校验故事」、「分镜有没有问题」等场景。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID（必填）" },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const { storyService } = await import("@/modules/story");
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const storyId = String(args.storyId);
    const storyResult = await storyService.getById(storyId);
    if (!storyResult.ok) {
      return { success: false, error: `获取故事失败：${storyResult.error.message}` };
    }

    const story = storyResult.value;
    const beats = story.beats || [];

    if (beats.length === 0) {
      return {
        success: true,
        data: {
          valid: false,
          issues: [{ beatId: "", issue: "故事没有任何分镜", severity: "error" }],
        },
      };
    }

    // 获取有效的角色和场景 ID
    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);
    const charIds = new Set(charResult.ok ? charResult.value.map((c) => c.id) : []);
    const sceneIds = new Set(sceneResult.ok ? sceneResult.value.map((s) => s.id) : []);

    const issues: Array<{ beatId: string; issue: string; severity: string }> = [];

    for (const beat of beats) {
      const desc = beat.content || beat.description;
      if (!desc || !desc.trim()) {
        issues.push({ beatId: beat.id, issue: "分镜缺少描述（content/description 均为空）", severity: "error" });
      }
      if (beat.duration == null || beat.duration <= 0) {
        issues.push({ beatId: beat.id, issue: "分镜时长无效（未设置或小于等于 0）", severity: "warning" });
      }
      for (const charId of beat.characterIds || []) {
        if (!charIds.has(charId)) {
          issues.push({ beatId: beat.id, issue: `角色引用无效：${charId}`, severity: "warning" });
        }
      }
      if (beat.sceneId && !sceneIds.has(beat.sceneId)) {
        issues.push({ beatId: beat.id, issue: `场景引用无效：${beat.sceneId}`, severity: "warning" });
      }
    }

    return {
      success: true,
      data: {
        valid: issues.filter((i) => i.severity === "error").length === 0,
        issues,
      },
    };
  },
};

/** 生成风格指南 */
export const generateStyleGuideTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_style_guide",
      description:
        "为故事生成风格指南（包含美术风格、氛围、配色方案和风格参考图）。" +
        "基于故事标题、描述、类型和关联的角色/场景，调用 LLM 推断合适的美术风格并生成风格参考图。" +
        "适用于：用户要求「生成风格指南」、「确定动画风格」、「生成风格参考图」等场景。" +
        "注意：此工具会调用 LLM 和图片生成 API，执行时间较长。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID（必填）" },
          styleDescription: {
            type: "string",
            description: "自定义风格描述（如：日式赛璐珞、水彩绘本风、写实3D）。如不提供则由 AI 自动推断。",
          },
          referenceImageUrl: {
            type: "string",
            description: "参考图 URL（可选，当前版本暂未直接使用，保留供后续支持参考图风格迁移）",
          },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const { storyService } = await import("@/modules/story");
    const { generateStyleGuide } = await import("@/modules/story");
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const storyId = String(args.storyId);
    const storyResult = await storyService.getById(storyId);
    if (!storyResult.ok) {
      return { success: false, error: `获取故事失败：${storyResult.error.message}` };
    }
    const story = storyResult.value;

    // 获取故事关联的角色和场景
    const storyCharIds = story.characters || [];
    const storySceneIds = story.scenes || [];
    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);
    const characters = charResult.ok
      ? charResult.value.filter((c) => storyCharIds.includes(c.id))
      : [];
    const scenes = sceneResult.ok
      ? sceneResult.value.filter((s) => storySceneIds.includes(s.id))
      : [];

    const styleDescription = args.styleDescription ? String(args.styleDescription) : undefined;

    const result = await generateStyleGuide({
      storyTitle: story.title,
      storyDescription: story.description || "",
      genre: story.genre,
      tone: story.tone,
      characters,
      scenes,
      customArtStyle: styleDescription,
      textProvider: container.textProvider,
      imageProvider: container.imageProvider,
    });

    if (!result.ok) {
      return { success: false, error: `生成风格指南失败：${result.error.message}` };
    }

    return { success: true, data: result.value };
  },
};

/** 生成分镜首尾帧提示词 */
export const generateFramePromptsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_frame_prompts",
      description:
        "为故事分镜生成首帧和尾帧的视觉描述提示词（适合 AI 图片生成模型理解）。" +
        "可指定单个分镜（beatId），不指定则批量生成所有分镜的帧提示词。" +
        "提示词包含角色外观、场景布局、镜头信息、风格氛围等。" +
        "适用于：用户要求「生成帧提示词」、「首尾帧描述」、「批量生成帧 prompt」等场景。" +
        "注意：批量生成会逐个调用 LLM，执行时间随分镜数量线性增长。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID（必填）" },
          beatId: {
            type: "string",
            description: "指定分镜 ID。如不提供则为故事的所有分镜批量生成。",
          },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const { storyService } = await import("@/modules/story");
    const { generateFramePrompts, batchGenerateFramePrompts } = await import("@/modules/story");
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const storyId = String(args.storyId);
    const beatId = args.beatId ? String(args.beatId) : undefined;

    const storyResult = await storyService.getById(storyId);
    if (!storyResult.ok) {
      return { success: false, error: `获取故事失败：${storyResult.error.message}` };
    }
    const story = storyResult.value;
    const beats = story.beats || [];

    if (beats.length === 0) {
      return { success: false, error: "故事没有分镜，请先使用 plan_story 生成分镜" };
    }

    // 获取故事关联的角色和场景
    const storyCharIds = story.characters || [];
    const storySceneIds = story.scenes || [];
    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);
    const characters = charResult.ok
      ? charResult.value.filter((c) => storyCharIds.includes(c.id))
      : [];
    const scenes = sceneResult.ok
      ? sceneResult.value.filter((s) => storySceneIds.includes(s.id))
      : [];

    const styleGuide = story.styleGuide;
    const textProvider = container.textProvider;

    if (beatId) {
      const beatIndex = beats.findIndex((b) => b.id === beatId);
      if (beatIndex < 0) {
        return { success: false, error: `未找到分镜：${beatId}` };
      }
      const beat = beats[beatIndex]!;
      const prevBeat = beatIndex > 0 ? beats[beatIndex - 1] : null;
      const nextBeat = beatIndex < beats.length - 1 ? beats[beatIndex + 1] : null;
      const prevBeatDescription = prevBeat ? prevBeat.content || prevBeat.description : undefined;
      const nextBeatDescription = nextBeat ? nextBeat.content || nextBeat.description : undefined;

      const result = await generateFramePrompts({
        beat,
        index: beatIndex,
        characters,
        scenes,
        styleGuide,
        prevBeatDescription,
        nextBeatDescription,
        textProvider,
      });
      if (!result.ok) {
        return { success: false, error: `生成帧提示词失败：${result.error.message}` };
      }
      return {
        success: true,
        data: {
          prompts: [
            {
              beatId: beat.id,
              firstFramePrompt: result.value.firstFramePrompt,
              lastFramePrompt: result.value.lastFramePrompt,
            },
          ],
        },
      };
    }

    const result = await batchGenerateFramePrompts(beats, {
      characters,
      scenes,
      styleGuide,
      textProvider,
    });
    if (!result.ok) {
      return { success: false, error: `批量生成帧提示词失败：${result.error.message}` };
    }

    const prompts = beats.map((beat) => {
      const output = result.value.get(beat.id);
      return {
        beatId: beat.id,
        firstFramePrompt: output?.firstFramePrompt ?? "",
        lastFramePrompt: output?.lastFramePrompt ?? "",
      };
    });

    return { success: true, data: { prompts } };
  },
};

/** 生成故事创意 */
export const generateStoryIdeasTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_story_ideas",
      description:
        "根据用户提供的主题，使用 AI 生成多套故事创意方案。每个方案包含标题、简介、关键场景和建议时长。" +
        "适用于：用户要求「给我一些故事创意」、「推荐几个动画故事」、「围绕这个主题想想故事」等场景。" +
        "注意：此工具调用 LLM 生成文本，执行时间约 10-30 秒。",
      parameters: {
        type: "object",
        properties: {
          theme: { type: "string", description: "故事主题（必填，如：友情、冒险、成长）" },
          count: {
            type: "number",
            description: "生成的方案数量，默认 3，最大 10",
            default: 3,
          },
          style: {
            type: "string",
            description: "风格偏好（如：温馨、热血、悬疑）",
          },
        },
        required: ["theme"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const theme = String(args.theme);
    const count = args.count != null ? Math.min(Math.max(Number(args.count), 1), 10) : 3;
    const style = args.style ? String(args.style) : undefined;

    const prompt = `你是一位创意编剧。请根据以下主题生成 ${count} 个动画故事创意。

主题：${theme}
${style ? `风格偏好：${style}` : ""}

请严格按照以下 JSON 数组格式输出，不要输出任何其他内容：
[
  {
    "title": "故事标题",
    "description": "故事简介（100-200字）",
    "keyScenes": ["关键场景1", "关键场景2", "关键场景3"],
    "suggestedDuration": 60
  }
]

要求：
1. 生成 ${count} 个不同的故事创意，每个有独特的视角和情节
2. keyScenes 提供 2-4 个关键场景描述
3. suggestedDuration 是建议的动画时长（秒），通常 30-120
4. 直接输出 JSON 数组，不要添加 markdown 标记或额外说明`;

    const result = await container.textProvider.generateText(prompt, {
      maxTokens: 2048,
      temperature: 0.8,
    });
    if (!result.success) {
      return { success: false, error: result.error || "故事创意生成失败" };
    }

    const text = result.data?.text?.trim() ?? "";
    let ideas: unknown[];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return { success: false, error: "AI 返回格式错误：未找到 JSON 数组" };
      }
      ideas = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return { success: false, error: `解析故事创意失败：${e instanceof Error ? e.message : String(e)}` };
    }

    return { success: true, data: { ideas } };
  },
};

/** 建议角色背景故事 */
export const suggestCharacterBackstoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "suggest_character_backstory",
      description:
        "为指定角色生成背景故事建议。基于角色的设定（姓名、性别、年龄、风格、描述、外观）调用 LLM 生成。" +
        "可提供故事上下文以使背景故事更贴合剧情。" +
        "适用于：用户要求「帮这个角色写背景故事」、「丰富角色设定」、「角色有什么背景」等场景。",
      parameters: {
        type: "object",
        properties: {
          characterId: { type: "string", description: "角色 ID（必填）" },
          storyContext: {
            type: "string",
            description: "故事上下文（可选，帮助生成更贴合剧情的背景）",
          },
        },
        required: ["characterId"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const { characterService } = await import("@/modules/character");
    const characterId = String(args.characterId);
    const storyContext = args.storyContext ? String(args.storyContext) : "";

    const charResult = await characterService.getById(characterId);
    if (!charResult.ok) {
      return { success: false, error: `获取角色失败：${charResult.error.message}` };
    }
    const character = charResult.value;

    const prompt = `你是一位角色设计师。请为以下角色生成一段背景故事。

角色信息：
- 姓名：${character.name}
- 性别：${character.gender || "未指定"}
- 年龄：${character.age || "未指定"}
- 风格：${character.style || "未指定"}
- 描述：${character.description || "未指定"}
${storyContext ? `\n故事上下文：${storyContext}` : ""}

请生成一段 200-400 字的背景故事，包含：
1. 角色的出身和成长经历
2. 性格形成的关键事件
3. 动机和目标
4. 与其他角色的潜在关系

直接输出背景故事文本，不要添加标题或额外标记。`;

    const result = await container.textProvider.generateText(prompt, {
      maxTokens: 1024,
      temperature: 0.7,
    });
    if (!result.success) {
      return { success: false, error: result.error || "角色背景故事生成失败" };
    }

    return { success: true, data: { backstory: (result.data?.text ?? "").trim() } };
  },
};

/** 建议场景描述 */
export const suggestSceneDescriptionTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "suggest_scene_description",
      description:
        "为指定场景生成更详细的描述建议。基于场景的设定（名称、类型、时间、天气、情绪、光照）调用 LLM 生成。" +
        "可提供故事上下文以使描述更贴合剧情。" +
        "适用于：用户要求「丰富场景描述」、「帮这个场景写详细描述」、「场景细节」等场景。",
      parameters: {
        type: "object",
        properties: {
          sceneId: { type: "string", description: "场景 ID（必填）" },
          storyContext: {
            type: "string",
            description: "故事上下文（可选，帮助生成更贴合剧情的描述）",
          },
        },
        required: ["sceneId"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const { sceneService } = await import("@/modules/scene");
    const sceneId = String(args.sceneId);
    const storyContext = args.storyContext ? String(args.storyContext) : "";

    const sceneResult = await sceneService.getById(sceneId);
    if (!sceneResult.ok) {
      return { success: false, error: `获取场景失败：${sceneResult.error.message}` };
    }
    const scene = sceneResult.value;

    const prompt = `你是一位场景设计师。请为以下场景生成一段详细的描述。

场景信息：
- 名称：${scene.name}
- 类型：${scene.type || "未指定"}
- 时间：${scene.timeOfDay || "未指定"}
- 天气：${scene.weather || "未指定"}
- 情绪：${scene.mood || "未指定"}
- 光照：${scene.lighting || "未指定"}
- 现有描述：${scene.description || "未指定"}
${storyContext ? `\n故事上下文：${storyContext}` : ""}

请生成一段 150-300 字的详细场景描述，包含：
1. 视觉元素（建筑、自然、物品等）
2. 氛围和光影效果
3. 声音和气味等感官细节
4. 适合的镜头运动建议

直接输出场景描述文本，不要添加标题或额外标记。`;

    const result = await container.textProvider.generateText(prompt, {
      maxTokens: 768,
      temperature: 0.7,
    });
    if (!result.success) {
      return { success: false, error: result.error || "场景描述生成失败" };
    }

    return { success: true, data: { description: (result.data?.text ?? "").trim() } };
  },
};

/** 故事逻辑一致性检查 */
export const checkStoryConsistencyTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "check_story_consistency",
      description:
        "使用 AI 分析故事分镜的逻辑一致性，检查角色出场顺序、场景转换、时间线和剧情逻辑。" +
        "返回一致性判定和问题列表（含分镜索引、问题描述和改进建议）。" +
        "适用于：用户要求「检查故事逻辑」、「分镜合不合理」、「故事有没有逻辑问题」等场景。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", description: "故事 ID（必填）" },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const { storyService } = await import("@/modules/story");
    const storyId = String(args.storyId);

    const storyResult = await storyService.getById(storyId);
    if (!storyResult.ok) {
      return { success: false, error: `获取故事失败：${storyResult.error.message}` };
    }
    const story = storyResult.value;
    const beats = story.beats || [];

    if (beats.length === 0) {
      return { success: false, error: "故事没有分镜，无法进行一致性检查" };
    }

    const beatsSummary = beats
      .map((b, i) => {
        const desc = b.content || b.description || "无描述";
        return `第${i + 1}镜：${b.title || "未命名"} - ${desc}（时长：${b.duration ?? 0}秒，角色：${b.characterIds?.length ?? 0}个，场景：${b.sceneId || "无"}）`;
      })
      .join("\n");

    const prompt = `你是一位剧本编辑。请分析以下故事分镜的逻辑一致性。

故事标题：${story.title}
故事简介：${story.description || "未提供"}

分镜列表：
${beatsSummary}

请检查以下方面：
1. 角色出场顺序是否合理
2. 场景转换是否连贯
3. 时间线是否一致
4. 剧情逻辑是否通顺
5. 分镜节奏是否合理

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "consistent": true或false,
  "issues": [
    {
      "beatIndex": 0,
      "issue": "问题描述",
      "suggestion": "改进建议"
    }
  ]
}

如果没有问题，issues 为空数组，consistent 为 true。beatIndex 是分镜的索引（从 0 开始）。`;

    const result = await container.textProvider.generateText(prompt, {
      maxTokens: 1024,
      temperature: 0.3,
    });
    if (!result.success) {
      return { success: false, error: result.error || "一致性分析失败" };
    }

    const text = (result.data?.text ?? "").trim();
    let analysis: { consistent: boolean; issues: Array<{ beatIndex: number; issue: string; suggestion: string }> };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { success: false, error: "AI 返回格式错误：未找到 JSON" };
      }
      analysis = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return { success: false, error: `解析一致性分析结果失败：${e instanceof Error ? e.message : String(e)}` };
    }

    return { success: true, data: analysis };
  },
};

/** 导出所有故事工具 */
export const storyTools: ToolImpl[] = [
  listStoriesTool,
  getStoryTool,
  createStoryTool,
  updateStoryTool,
  deleteStoryTool,
  planStoryTool,
  validateStoryPlanTool,
  generateStyleGuideTool,
  generateFramePromptsTool,
  generateStoryIdeasTool,
  suggestCharacterBackstoryTool,
  suggestSceneDescriptionTool,
  checkStoryConsistencyTool,
];
