/**
 * 故事建议工具（Story Suggestion Tools）
 *
 * 从 story-tools.ts 拆分而来，包含 AI 建议类工具：
 * - suggest_character_backstory：建议角色背景故事
 * - suggest_scene_description：建议场景描述
 * - check_story_consistency：故事逻辑一致性检查
 *
 * 设计要点：
 * - 调用 characterService / sceneService / storyService 的 public API（Result<T> 模式）
 * - 通过 DI container 获取 textProvider（用于 LLM 文本生成）
 * - 错误处理完善，service 失败时返回友好错误信息
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { container } from "@/infrastructure/di";

// ============= 工具实现 =============

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
          characterId: { type: "string", maxLength: 100, description: "角色 ID（必填）" },
          storyContext: {
            type: "string",
            maxLength: 5000,
            description: "故事上下文（可选，帮助生成更贴合剧情的背景）",
          },
          providerId: { type: "string", maxLength: 100, description: "指定 LLM provider ID（可选，不填用默认）" },
          modelId: { type: "string", maxLength: 100, description: "指定 LLM model ID（可选）" },
        },
        required: ["characterId"],
      },
    },
  },
  domain: "story",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const { characterService } = await import("@/modules/character");
    const characterId = String(args.characterId);
    const storyContext = args.storyContext ? String(args.storyContext) : "";
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

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
      providerId,
      modelId,
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
          sceneId: { type: "string", maxLength: 100, description: "场景 ID（必填）" },
          storyContext: {
            type: "string",
            maxLength: 5000,
            description: "故事上下文（可选，帮助生成更贴合剧情的描述）",
          },
          providerId: { type: "string", maxLength: 100, description: "指定 LLM provider ID（可选，不填用默认）" },
          modelId: { type: "string", maxLength: 100, description: "指定 LLM model ID（可选）" },
        },
        required: ["sceneId"],
      },
    },
  },
  domain: "story",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const { sceneService } = await import("@/modules/scene");
    const sceneId = String(args.sceneId);
    const storyContext = args.storyContext ? String(args.storyContext) : "";
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

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
      providerId,
      modelId,
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
          storyId: { type: "string", maxLength: 100, description: "故事 ID（必填）" },
          providerId: { type: "string", maxLength: 100, description: "指定 LLM provider ID（可选，不填用默认）" },
          modelId: { type: "string", maxLength: 100, description: "指定 LLM model ID（可选）" },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const { storyService } = await import("@/modules/storyboard");
    const storyId = String(args.storyId);
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

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
      providerId,
      modelId,
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
