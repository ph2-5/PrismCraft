/**
 * 子流程工具 — 小说转分镜（Subworkflow Novel Tools）
 *
 * 包含工具：
 * - auto_create_from_novel：小说一键转分镜（读取 → 分析 → 创建角色/场景 → 创建故事 → 规划分镜 → 生成关键帧）
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import type { StoryBeat, Story } from "@/domain/schemas";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";
import {
  generateJsonWithAI,
  generateJsonArrayWithAI,
  toStringArray,
  NOVEL_TEXT_MAX_CHARS,
} from "./subworkflow-helpers";
import { errorLogger } from "@/shared/error-logger";
import { buildShotInstructionFromLegacy } from "@/shared-logic/prompt";

// ============= 辅助函数（内部使用，不导出） =============

/** 读取小说文本（从参数或文件） */
async function readNovelText(
  args: Record<string, unknown>,
  onProgress?: (msg: string) => void,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (args.novelText) {
    return { ok: true, text: String(args.novelText) };
  }
  if (args.novelFilePath) {
    onProgress?.("正在读取小说文件…");
    try {
      const { readFile } = await import("@/shared/file-http");
      const fileResult = await readFile(String(args.novelFilePath));
      if (!fileResult?.success || !fileResult.data) {
        return { ok: false, error: `读取小说文件失败：${fileResult?.error ?? "未知错误"}` };
      }
      return { ok: true, text: new TextDecoder().decode(fileResult.data) };
    } catch (e) {
      return { ok: false, error: `读取小说文件异常：${e instanceof Error ? e.message : String(e)}` };
    }
  }
  return { ok: false, error: "必须提供 novelText 或 novelFilePath 之一" };
}

/** 用 AI 分析小说，提取角色、场景、情节点 */
async function analyzeNovel(
  truncatedText: string,
  onProgress?: (msg: string) => void,
): Promise<Record<string, unknown> | null> {
  onProgress?.("正在用 AI 分析小说内容…");
  const prompt = `你是一位剧本改编专家。请分析以下小说文本，提取角色、场景和故事信息。

小说文本：
${truncatedText}

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "title": "故事标题（中文，简洁有特色）",
  "description": "故事简介（100-200字）",
  "genre": "故事类型（如：剧情、喜剧、悬疑、奇幻）",
  "characters": [
    {
      "name": "角色姓名",
      "gender": "性别",
      "age": 25,
      "description": "角色描述",
      "personality": "性格特征",
      "appearance": {
        "hairColor": "发色",
        "hairStyle": "发型",
        "eyeColor": "瞳色",
        "height": "身高",
        "build": "体型",
        "clothing": "服装"
      },
      "customPrompt": "用于 AI 图片生成的英文提示词"
    }
  ],
  "scenes": [
    {
      "name": "场景名称",
      "type": "场景类型",
      "timeOfDay": "时间",
      "weather": "天气",
      "mood": "情绪",
      "lighting": "光照",
      "description": "场景描述",
      "customPrompt": "用于 AI 图片生成的英文提示词"
    }
  ],
  "plotPoints": [
    "情节点1",
    "情节点2",
    "情节点3"
  ]
}

要求：
1. 提取 1-5 个主要角色
2. 提取 1-5 个主要场景
3. plotPoints 提供 3-8 个关键情节节点
4. customPrompt 用英文，便于图片生成`;
  return await generateJsonWithAI(prompt);
}

/** 创建角色和场景记录 */
async function createCharactersAndScenes(
  extractedCharacters: Record<string, unknown>[],
  extractedScenes: Record<string, unknown>[],
  genre: string | undefined,
  onProgress?: (msg: string) => void,
): Promise<{
  characterIds: string[];
  characters: Array<{ id: string; name: string }>;
  sceneIds: string[];
  scenes: Array<{ id: string; name: string }>;
}> {
  onProgress?.(`正在创建 ${extractedCharacters.length} 个角色和 ${extractedScenes.length} 个场景…`);
  const { characterService } = await import("@/modules/character");
  const { sceneService } = await import("@/modules/scene");

  const characterIds: string[] = [];
  const characters: Array<{ id: string; name: string }> = [];
  for (const charData of extractedCharacters) {
    try {
      const appearance = (charData.appearance as Record<string, unknown> | undefined) ?? {};
      const r = await characterService.create({
        name: String(charData.name ?? `角色_${Date.now()}`),
        description: String(charData.description ?? ""),
        gender: String(charData.gender ?? ""),
        style: genre ?? "",
        age: charData.age != null ? Number(charData.age) : undefined,
        personality: toStringArray(charData.personality),
        appearance: {
          hairColor: String(appearance.hairColor ?? ""),
          hairStyle: String(appearance.hairStyle ?? ""),
          eyeColor: String(appearance.eyeColor ?? ""),
          height: String(appearance.height ?? ""),
          build: String(appearance.build ?? ""),
          clothing: String(appearance.clothing ?? ""),
        },
        prompt: String(charData.customPrompt ?? ""),
      });
      if (r.ok) {
        characterIds.push(r.value.id);
        characters.push({ id: r.value.id, name: r.value.name });
      }
    } catch (err) {
      errorLogger.warn("[SubworkflowNovel] 创建角色失败", err);
    }
  }

  const sceneIds: string[] = [];
  const scenes: Array<{ id: string; name: string }> = [];
  for (const sceneData of extractedScenes) {
    try {
      const r = await sceneService.create({
        name: String(sceneData.name ?? `场景_${Date.now()}`),
        description: String(sceneData.description ?? ""),
        type: String(sceneData.type ?? ""),
        timeOfDay: String(sceneData.timeOfDay ?? ""),
        weather: String(sceneData.weather ?? ""),
        mood: String(sceneData.mood ?? ""),
        lighting: String(sceneData.lighting ?? ""),
        elements: [],
        colors: [],
        prompt: String(sceneData.customPrompt ?? ""),
      });
      if (r.ok) {
        sceneIds.push(r.value.id);
        scenes.push({ id: r.value.id, name: r.value.name });
      }
    } catch {
      // 单个场景创建失败不影响其他
    }
  }

  return { characterIds, characters, sceneIds, scenes };
}

/** 用 AI 规划分镜，返回原始 beatsData 或 null（需回退） */
async function planBeatsWithAI(
  title: string,
  description: string,
  createdCharacters: Array<{ id: string; name: string }>,
  createdScenes: Array<{ id: string; name: string }>,
  plotPoints: string[],
  maxBeats: number,
  onProgress?: (msg: string) => void,
): Promise<unknown[] | null> {
  onProgress?.("正在用 AI 规划分镜…");
  const prompt = `你是一位分镜设计师。请根据以下小说情节和角色/场景信息，规划 ${maxBeats} 个分镜。

故事标题：${title}
故事简介：${description}

角色列表：
${createdCharacters.map((c, i) => `${i + 1}. ID: ${c.id}, 姓名: ${c.name}`).join("\n")}

场景列表：
${createdScenes.map((s, i) => `${i + 1}. ID: ${s.id}, 名称: ${s.name}`).join("\n")}

情节点：
${plotPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

请严格按照以下 JSON 数组格式输出 ${maxBeats} 个分镜，不要输出任何其他内容：
[
  {
    "title": "分镜标题",
    "description": "分镜描述（详细描述这一镜的画面内容）",
    "duration": 8,
    "characterIds": ["角色ID"],
    "sceneId": "场景ID",
    "shotSize": "景别（wide/medium/close/extreme_close/extreme_wide）",
    "cameraAngle": "镜头角度",
    "cameraMovement": "镜头运动"
  }
]

要求：
1. 生成 ${maxBeats} 个分镜
2. 每个分镜的 duration 在 3-15 秒之间
3. characterIds 和 sceneId 必须使用上面提供的真实 ID
4. 分镜要覆盖所有情节点，节奏合理`;
  const beatsData = await generateJsonArrayWithAI(prompt);
  return beatsData && beatsData.length > 0 ? beatsData : null;
}

/** 回退到 planStory 规划分镜 */
async function planBeatsWithFallback(
  story: Story,
  maxBeats: number,
  onProgress?: (msg: string) => void,
): Promise<StoryBeat[] | null> {
  onProgress?.("AI 分镜规划失败，回退到 planStory…");
  const { planStory } = await import("@/modules/storyboard");
  const { characterService } = await import("@/modules/character");
  const { sceneService } = await import("@/modules/scene");
  const [charResult, sceneResult] = await Promise.all([
    characterService.getAll(),
    sceneService.getAll(),
  ]);
  const allCharacters = charResult.ok ? charResult.value : [];
  const allScenes = sceneResult.ok ? sceneResult.value : [];
  const planResult = await planStory(story, allCharacters, allScenes, {});
  if (!planResult.ok) return null;
  return planResult.value.beats.slice(0, maxBeats);
}

/** 从 AI 返回的原始数据构造 StoryBeat 数组 */
function buildStoryBeats(beatsData: unknown[], maxBeats: number): StoryBeat[] {
  return beatsData.slice(0, maxBeats).map((raw, i) => {
    const b = raw as Record<string, unknown>;
    // PR 2b：优先读取 shotSize（新字段），fallback shotType（旧字段，向后兼容）
    const shotSize = b.shotSize ? String(b.shotSize) : undefined;
    const shotType = shotSize ?? (b.shotType ? String(b.shotType) : undefined);
    const cameraAngle = b.cameraAngle ? String(b.cameraAngle) : undefined;
    const cameraMovement = b.cameraMovement ? String(b.cameraMovement) : undefined;
    // PR 2a dual-write：同时构造 shotInstruction，让读取端优先读到新字段
    const shotInstruction = buildShotInstructionFromLegacy({
      shotSize,
      shotType,
      cameraAngle,
      cameraMovement,
    });
    return {
      id: `beat_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      sequence: i,
      order: i,
      description: String(b.description ?? ""),
      content: String(b.description ?? ""),
      title: b.title ? String(b.title) : undefined,
      duration: b.duration != null ? Number(b.duration) : 8,
      type: "scene" as const,
      characterIds: Array.isArray(b.characterIds)
        ? (b.characterIds as unknown[]).map(String)
        : [],
      sceneId: b.sceneId ? String(b.sceneId) : undefined,
      elementIds: [],
      shotType,
      camera: {
        angle: cameraAngle,
        movement: cameraMovement,
      },
      shotInstruction,
    } as StoryBeat;
  });
}

/** 用 storyBeatSchema 校验 beats，过滤掉非法项 */
async function validateBeats(beats: StoryBeat[]): Promise<StoryBeat[]> {
  const { storyBeatSchema } = await import("@/domain/schemas");
  return beats
    .map((b) => {
      const parsed = storyBeatSchema.safeParse(b);
      return parsed.success ? parsed.data : null;
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);
}

/** 为分镜批量生成关键帧（best-effort，失败的不影响其他） */
async function generateKeyframesForBeats(
  validBeats: StoryBeat[],
  story: Story,
  onProgress?: (msg: string) => void,
): Promise<number> {
  if (validBeats.length === 0) return 0;
  onProgress?.("正在生成关键帧…");
  const { generateBeatKeyframe } = await import("@/modules/storyboard");
  const providers = {
    videoProvider: container.videoProvider,
    imageProvider: container.imageProvider,
    textProvider: container.textProvider,
  };
  let generated = 0;
  for (let i = 0; i < validBeats.length; i++) {
    const beat = validBeats[i]!;
    onProgress?.(`生成关键帧 ${i + 1}/${validBeats.length}…`);
    try {
      const kfResult = await generateBeatKeyframe(
        beat,
        i > 0 ? validBeats[i - 1]! : null,
        {
          characters: [],
          scenes: [],
          styleGuide: story.styleGuide,
        },
        providers,
      );
      if (kfResult.ok) {
        validBeats[i] = { ...beat, keyframe: kfResult.value };
        generated++;
      }
    } catch (err) {
      errorLogger.warn("[SubworkflowNovel] 生成关键帧失败", err);
    }
  }
  return generated;
}

// ============= 工具实现 =============

/** 8. 小说一键转分镜 */
export const autoCreateFromNovelTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_create_from_novel",
      description:
        "一站式工具：小说一键转分镜。内部流程：1) 读取小说文本（从参数或文件）；2) 用 AI 分析小说，提取角色、场景、情节点；3) 创建故事；4) 根据提取的角色/场景创建记录；5) 用 AI 规划分镜（基于小说情节）；6) 保存分镜到故事；7) 如 autoGenerate=true，生成关键帧。" +
        "适用于：用户要求「把这段小说转成分镜」、「小说转动画」等场景。" +
        "注意：此工具会多次调用 LLM，执行时间较长（通常 1-5 分钟）。",
      parameters: {
        type: "object",
        properties: {
          novelText: {
            type: "string",
            maxLength: 8000,
            description: "小说文本（与 novelFilePath 二选一）",
          },
          novelFilePath: {
            type: "string",
            maxLength: 1024,
            description: "小说文件路径（与 novelText 二选一）",
          },
          title: {
            type: "string",
            maxLength: 200,
            description: "故事标题（可选，不提供则由 AI 推断）",
          },
          maxBeats: {
            type: "number",
            minimum: 1,
            maximum: 50,
            description: "最大分镜数，默认 6",
            default: 6,
          },
          autoGenerate: {
            type: "boolean",
            description: "是否自动生成关键帧图片，默认 false",
            default: false,
          },
        },
      },
    },
  },
  domain: "workflow",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args, ctx) {
    const titleOverride = args.title ? String(args.title) : undefined;
    const maxBeats = args.maxBeats != null ? Number(args.maxBeats) : 6;
    const autoGenerate = args.autoGenerate === true;
    const steps: string[] = [];

    // Step 1: 读取小说文本
    const readResult = await readNovelText(args, ctx.onProgress);
    if (!readResult.ok) {
      return { success: false, error: readResult.error };
    }
    const novelText = readResult.text;

    // 截断过长的小说文本（避免 token 超限）
    const truncatedText = novelText.length > NOVEL_TEXT_MAX_CHARS ? novelText.slice(0, NOVEL_TEXT_MAX_CHARS) + "…" : novelText;
    if (novelText.length > NOVEL_TEXT_MAX_CHARS) {
      ctx.onProgress?.(`警告：小说文本过长（${novelText.length} 字符），已截断到 ${NOVEL_TEXT_MAX_CHARS} 字符`);
    }

    // Step 2: 用 AI 分析小说
    const analysis = await analyzeNovel(truncatedText, ctx.onProgress);
    if (!analysis) {
      return { success: false, error: "AI 分析小说失败：无法解析返回的 JSON" };
    }
    steps.push("分析小说");

    const title = titleOverride ?? String(analysis.title ?? `小说改编_${Date.now()}`);
    const description = String(analysis.description ?? "");
    const genre = analysis.genre ? String(analysis.genre) : undefined;
    const extractedCharacters = Array.isArray(analysis.characters)
      ? (analysis.characters as Record<string, unknown>[])
      : [];
    const extractedScenes = Array.isArray(analysis.scenes)
      ? (analysis.scenes as Record<string, unknown>[])
      : [];
    const plotPoints = Array.isArray(analysis.plotPoints)
      ? (analysis.plotPoints as string[]).map(String)
      : [];

    // Step 3: 创建角色和场景记录
    const { characterIds, characters, sceneIds, scenes } = await createCharactersAndScenes(
      extractedCharacters,
      extractedScenes,
      genre,
      ctx.onProgress,
    );
    steps.push(`创建 ${characterIds.length} 角色 + ${sceneIds.length} 场景`);

    // Step 4: 创建故事
    ctx.onProgress?.("正在创建故事…");
    const { storyService } = await import("@/modules/storyboard");
    const createStoryResult = await storyService.create({
      title,
      description,
      genre,
      targetDuration: 60,
      characters: characterIds,
      scenes: sceneIds,
      beats: [],
      elementIds: [],
    });
    if (!createStoryResult.ok) {
      return {
        success: false,
        error: `创建故事失败：${createStoryResult.error.message}`,
        data: { createdCharacters: characters, createdScenes: scenes, steps },
      };
    }
    const story = createStoryResult.value;

    // Step 5: 用 AI 规划分镜
    const beatsData = await planBeatsWithAI(
      title,
      description,
      characters,
      scenes,
      plotPoints,
      maxBeats,
      ctx.onProgress,
    );

    // 回退到 planStory
    if (!beatsData) {
      const fallbackBeats = await planBeatsWithFallback(
        story,
        maxBeats,
        ctx.onProgress,
      );
      if (fallbackBeats) {
        await storyService.update(story.id, { id: story.id, beats: fallbackBeats });
        steps.push("规划分镜（planStory 回退）");
        return {
          success: true,
          data: {
            storyId: story.id,
            createdCharacters: characters,
            createdScenes: scenes,
            beatCount: fallbackBeats.length,
            steps,
          },
        };
      }
      return {
        success: false,
        error: "AI 分镜规划失败且 planStory 回退也失败",
        data: { storyId: story.id, createdCharacters: characters, createdScenes: scenes, steps },
      };
    }

    // Step 6: 构造、校验并保存分镜
    const rawBeats = buildStoryBeats(beatsData, maxBeats);
    const validBeats = await validateBeats(rawBeats);
    ctx.onProgress?.("正在保存分镜到故事…");
    const saveResult = await storyService.update(story.id, { id: story.id, beats: validBeats });
    if (!saveResult.ok) {
      ctx.onProgress?.(`警告：分镜已生成但保存失败：${saveResult.error.message}`);
    }
    steps.push(`规划 ${validBeats.length} 个分镜`);

    // Step 7: 自动生成关键帧（可选）
    let generatedKeyframes = 0;
    if (autoGenerate && validBeats.length > 0) {
      generatedKeyframes = await generateKeyframesForBeats(validBeats, story, ctx.onProgress);
      if (generatedKeyframes > 0) {
        await storyService.update(story.id, { id: story.id, beats: validBeats });
        steps.push(`生成 ${generatedKeyframes} 个关键帧`);
      }
    }

    return {
      success: true,
      data: {
        storyId: story.id,
        createdCharacters: characters,
        createdScenes: scenes,
        beatCount: validBeats.length,
        generatedKeyframes,
        steps,
      },
    };
  },
};
