/**
 * P1.5 拆分：从 use-novel-pipeline.ts 提取的模块级辅助函数。
 *
 * 这些函数不依赖 React，是纯逻辑函数，便于单元测试与复用。
 * 包含：
 * - NOVEL_TOOL_CTX：Novel 工具调用的最小 ToolContext
 * - createGenerateTextFn：适配 container.textProvider 为 structure 子域所需的 GenerateTextFn
 * - makeDefaultConfig / makeInitialState：构造默认配置与初始状态
 * - extractAndMatchEntities：content_import → character_manage 阶段的实体提取与匹配
 * - breakdownShotsForSegments：review → storyboard 阶段的分镜拆解
 * - recordToProject：将 storage record 转换为 NovelProject 域对象
 */

import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import type { ToolContext } from "@/domain/types/agent-tools";
import type {
  PipelineState,
  PipelineConfig,
  NovelSegment,
  NovelProject,
  CharacterInPipeline,
  SceneInPipeline,
  ShotBreakdown,
  ExtractedCharacter,
  ExtractedScene,
} from "../domain/types";
import {
  extractCharactersFromTextTool,
  extractScenesFromTextTool,
  matchEntitiesTool,
  breakdownTextToShotsTool,
} from "../tools";
import type { GenerateTextFn } from "../structure";

/** Novel 工具调用时使用的最小 ToolContext（无取消信号、无进度回调） */
export const NOVEL_TOOL_CTX: ToolContext = { sessionId: "novel-pipeline" };

/**
 * 将 container.textProvider.generateText 适配为 structure 子域所需的 GenerateTextFn 签名。
 *
 * GenerateTextFn 期望返回 { success, data?: { text }, error? }，
 * 与 ApiResponse<{ text: string }> 结构兼容，直接透传。
 */
export function createGenerateTextFn(): GenerateTextFn {
  return (prompt, options) =>
    container.textProvider.generateText(prompt, {
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    });
}

/** 默认 PipelineConfig（gates 单独处理避免浅合并丢失内层字段） */
export function makeDefaultConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  const base: PipelineConfig = {
    mode: "semi",
    aiAssistLevel: "professional",
    projectName: "",
    style: "",
    format: "novel",
    aiModel: "",
    autoCreateEntities: false,
    gates: {
      confirmSegments: true,
      confirmEntities: true,
      confirmShots: true,
      confirmPrompts: true,
    },
  };
  const { gates: overrideGates, ...restOverrides } = overrides;
  return {
    ...base,
    ...restOverrides,
    gates: overrideGates ? { ...base.gates, ...overrideGates } : base.gates,
  };
}

/** 初始 PipelineState */
export function makeInitialState(config: PipelineConfig): PipelineState {
  return {
    stage: "project_init",
    step: 1,
    config,
    rawText: "",
    segments: [],
    currentSegmentIndex: 0,
    characters: [],
    scenes: [],
    characterImportance: {},
    prompts: [],
    generationResults: [],
  };
}

/**
 * content_import → character_manage 阶段的实体提取与匹配逻辑。
 *
 * 调用 extractCharactersFromTextTool + extractScenesFromTextTool 并行提取，
 * 再调用 matchEntitiesTool 做三级匹配。任一工具失败时降级使用未匹配的提取结果。
 *
 * @param text 原始小说文本
 * @param isMounted 检查组件是否仍挂载（false 时提前返回 null）
 * @returns 提取并匹配后的角色/场景，或 null（组件已卸载）
 */
export async function extractAndMatchEntities(
  text: string,
  isMounted: () => boolean,
): Promise<{ characters: ExtractedCharacter[]; scenes: ExtractedScene[] } | null> {
  // 并行调用两个提取工具（任一失败不影响另一个）
  const [charResult, sceneResult] = await Promise.allSettled([
    extractCharactersFromTextTool.execute({ text }, NOVEL_TOOL_CTX),
    extractScenesFromTextTool.execute({ text }, NOVEL_TOOL_CTX),
  ]);

  if (!isMounted()) return null;

  const extractedCharacters: ExtractedCharacter[] = [];
  const extractedScenes: ExtractedScene[] = [];

  if (
    charResult.status === "fulfilled" &&
    charResult.value.success &&
    charResult.value.data
  ) {
    const data = charResult.value.data as { characters: ExtractedCharacter[] };
    if (Array.isArray(data.characters)) {
      extractedCharacters.push(...data.characters);
    }
  }
  if (
    sceneResult.status === "fulfilled" &&
    sceneResult.value.success &&
    sceneResult.value.data
  ) {
    const data = sceneResult.value.data as { scenes: ExtractedScene[] };
    if (Array.isArray(data.scenes)) {
      extractedScenes.push(...data.scenes);
    }
  }

  // 至少一个提取有结果时，调用 matchEntitiesTool 做匹配
  let matchedCharacters = extractedCharacters;
  let matchedScenes = extractedScenes;
  if (extractedCharacters.length > 0 || extractedScenes.length > 0) {
    try {
      const matchResult = await matchEntitiesTool.execute(
        {
          charactersJson: JSON.stringify(extractedCharacters),
          scenesJson: JSON.stringify(extractedScenes),
        },
        NOVEL_TOOL_CTX,
      );
      if (!isMounted()) return null;
      if (matchResult.success && matchResult.data) {
        const data = matchResult.data as {
          characters: ExtractedCharacter[];
          scenes: ExtractedScene[];
        };
        if (Array.isArray(data.characters)) {
          matchedCharacters = data.characters;
        }
        if (Array.isArray(data.scenes)) {
          matchedScenes = data.scenes;
        }
      }
    } catch (err) {
      // 匹配失败时保留未匹配的提取结果（用户可手动匹配），记录日志
      errorLogger.warn("[useNovelPipeline] matchEntities 调用失败，保留未匹配的提取结果", err);
    }
  }

  return { characters: matchedCharacters, scenes: matchedScenes };
}

/**
 * review → storyboard 阶段的分镜拆解逻辑。
 *
 * 对每个选中段落调用 breakdownTextToShotsTool，单个段落失败不阻塞后续。
 * 最终按 sequence 排序并重新分配连续序号。
 *
 * @param segments 选中的段落列表
 * @param charactersJson 角色列表的 JSON 字符串（供拆解工具参考）
 * @param isMounted 检查组件是否仍挂载（false 时提前返回 null）
 * @returns 排序后的分镜列表，或 null（组件已卸载）
 */
export async function breakdownShotsForSegments(
  segments: NovelSegment[],
  charactersJson: string,
  isMounted: () => boolean,
): Promise<ShotBreakdown[] | null> {
  const allShots: ShotBreakdown[] = [];

  for (const segment of segments) {
    try {
      const result = await breakdownTextToShotsTool.execute(
        {
          text: segment.text,
          charactersJson,
        },
        NOVEL_TOOL_CTX,
      );
      if (!isMounted()) return null;
      if (result.success && result.data) {
        const data = result.data as { shots: ShotBreakdown[] };
        if (Array.isArray(data.shots)) {
          allShots.push(...data.shots);
        }
      }
    } catch (err) {
      // 单个段落拆解失败：记录日志，继续处理后续段落
      errorLogger.warn(`[useNovelPipeline] 段落 ${segment.id ?? ""} 拆解失败，跳过`, err);
    }
  }

  if (!isMounted()) return null;

  // 按 sequence 排序，并重新分配序号确保连续
  allShots.sort((a, b) => a.sequence - b.sequence);
  return allShots.map((s, i) => ({ ...s, sequence: i + 1 }));
}

/**
 * 将 storage 返回的 NovelProjectRecord（state: unknown）转换为
 * NovelProject 域对象（state: PipelineState）。
 *
 * 如果 state 损坏或缺少必要字段，回退到 makeInitialState。
 */
export function recordToProject(record: {
  id: string;
  title: string;
  rawText: string;
  state: unknown;
  createdAt: number;
  updatedAt: number;
}): NovelProject {
  const pipelineState =
    record.state && typeof record.state === "object" && "stage" in record.state
      ? (record.state as PipelineState)
      : makeInitialState(makeDefaultConfig({ projectName: record.title }));
  return {
    id: record.id,
    title: record.title,
    rawText: record.rawText,
    state: pipelineState,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** 将 ExtractedCharacter[] 转换为 CharacterInPipeline[]（带空 variants） */
export function toCharactersInPipeline(
  characters: ExtractedCharacter[],
): CharacterInPipeline[] {
  return characters.map((c) => ({ ...c, variants: [] }));
}

/** 将 ExtractedScene[] 转换为 SceneInPipeline[]（带空 variants） */
export function toScenesInPipeline(scenes: ExtractedScene[]): SceneInPipeline[] {
  return scenes.map((s) => ({ ...s, variants: [] }));
}
