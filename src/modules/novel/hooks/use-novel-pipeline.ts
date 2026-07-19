/**
 * Task 2A.6 / 2A.7 — useNovelPipeline Hook
 *
 * 从 NovelImportPage 提取的管道状态管理逻辑，供 StoryPipelineShell 与
 * NovelImportPage 共享，避免代码重复。
 *
 * 负责：
 * - PipelineState 初始化与转换（transition/canTransition）
 * - 段落选中状态管理
 * - 处理中状态（isProcessing/isImporting）
 * - 分镜列表管理（shots）
 * - 所有 handler（导入/确认/编辑/重排/生成提示词/导入到故事板）
 * - 派生标志（showImportStep/showSegmentList/showEntityReview/showShotBreakdown/showFinalize/isDone）
 *
 * Task 2A.7 新增持久化：
 * - 挂载时检测未完成项目，暴露 pendingRecoveryProjects 给 UI 显示恢复对话框
 * - recoverProject(id) 从 DB 加载 pipeline_state_json 恢复状态
 * - 状态变化时 2 秒防抖自动保存到 DB
 * - 到达 done 阶段后清理项目记录
 *
 * 依赖方向：仅依赖 domain/types + import/services/pipeline-machine（同模块内）+
 * @/infrastructure/di（访问 novelProjectStorage token）。
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants/messages";
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
  PipelineStage,
} from "../domain/types";
import {
  getStagesForMode,
  transition,
  canTransition,
  getAutoGates,
} from "../import/services/pipeline-machine";
// Task 2A.6+ 接入 5 个 Novel 工具
import {
  segmentNovelTextTool,
  extractCharactersFromTextTool,
  extractScenesFromTextTool,
  matchEntitiesTool,
  breakdownTextToShotsTool,
} from "../tools";
import type { ToolContext } from "@/domain/types/agent-tools";
import type { StoryBeat } from "@/domain/schemas";
// Task 2A.13 接入 structure 子域
import {
  analyzeStoryStructure,
  extractTreatment,
  buildShotContractsForBeats,
  recalculateStoryStructure,
  type StoryStructure,
  type StoryTreatment,
  type ShotContract,
  type NarrativeBeat,
  type GenerateTextFn,
} from "../structure";
// Task 2A.14 接入 pacing 子域
import {
  planPacing,
  DEFAULT_PACING_CONFIG,
  type PacingConfig,
  type PacingResult,
} from "../pacing";

/** Novel 工具调用时使用的最小 ToolContext（无取消信号、无进度回调） */
const NOVEL_TOOL_CTX: ToolContext = { sessionId: "novel-pipeline" };

/**
 * Task 2A.13：将 container.textProvider.generateText 适配为 structure 子域所需的 GenerateTextFn 签名。
 *
 * GenerateTextFn 期望返回 { success, data?: { text }, error? }，
 * 与 ApiResponse<{ text: string }> 结构兼容，直接透传。
 */
function createGenerateTextFn(): GenerateTextFn {
  return (prompt, options) =>
    container.textProvider.generateText(prompt, {
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    });
}

/** 默认 PipelineConfig */
function makeDefaultConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
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
  // 合并 overrides，gates 单独处理避免浅合并丢失内层字段
  const { gates: overrideGates, ...restOverrides } = overrides;
  return {
    ...base,
    ...restOverrides,
    gates: overrideGates ? { ...base.gates, ...overrideGates } : base.gates,
  };
}

/** 初始 PipelineState */
function makeInitialState(config: PipelineConfig): PipelineState {
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

export interface UseNovelPipelineOptions {
  onComplete: () => void;
  initialConfig?: Partial<PipelineConfig>;
}

export interface UseNovelPipelineResult {
  // 状态
  state: PipelineState;
  selectedSegmentIds: string[];
  isProcessing: boolean;
  isImporting: boolean;
  shots: ShotBreakdown[];
  // Task 2A.13 故事结构分析状态
  /** AI 识别的叙事 beats + 情绪曲线 + 整体节奏（professional 模式） */
  storyStructure: StoryStructure | null;
  /**
   * AI 提取的 StoryTreatment（v5.3 增强）。
   *
   * TODO(Task 2A.16): 当前 treatment 仅作为 buildShotContractsForBeats 的可选输入，
   * 未在 UI 展示。三档模式完整实现时，应新建 TreatmentPanel 组件展示
   * logline/theme/tone/characterArcs/settingDescription，让用户可编辑后回传。
   * StoryPipelineShell 也需解构 treatment 并传递给 MainWorkArea。
   */
  treatment: StoryTreatment | null;
  /** 每个 beat 产出的 ShotContract 列表（v5.3 增强） */
  shotContracts: ShotContract[];
  // Task 2A.14 节奏规划状态
  /** 节奏配置（预设 + 目标总时长 + 4 个 ratio） */
  pacingConfig: PacingConfig;
  /** 节奏规划结果（segmentDurations + emotionCurve + pacingNotes） */
  pacingResult: PacingResult | null;
  // 派生数据
  stagesForMode: PipelineStage[];
  canProceed: boolean;
  // 派生渲染标志
  showImportStep: boolean;
  showSegmentList: boolean;
  /** Task 2A.13：是否显示叙事结构分析面板（professional 模式专属） */
  showStructureAnalysis: boolean;
  showEntityReview: boolean;
  showShotBreakdown: boolean;
  showFinalize: boolean;
  isDone: boolean;
  /** Task 2A.14：是否显示节奏规划面板（professional 模式专属） */
  showPacingPlanning: boolean;
  // Task 2A.7 持久化状态
  /** 待恢复的未完成项目列表（挂载时加载，用户恢复或新建后清空） */
  pendingRecoveryProjects: NovelProject[];
  /** 是否正在加载恢复项目 */
  isLoadingRecovery: boolean;
  /** 当前关联的 DB 项目 ID（null 表示尚未创建项目记录） */
  currentProjectId: string | null;
  /** 上次自动保存时间戳（用于 UI 显示"已保存"状态） */
  lastSavedAt: number | null;
  // Handlers
  handleImport: (text: string) => Promise<void>;
  handleToggle: (id: string) => void;
  handleSelectAll: () => void;
  handleNext: () => Promise<void>;
  handleConfirmCharacter: (id: string) => void;
  handleConfirmScene: (id: string) => void;
  handleEditCharacter: (c: ExtractedCharacter) => void;
  handleEditScene: (s: ExtractedScene) => void;
  handleMatchCharacter: (id: string, existingId: string) => Promise<void>;
  handleEditShot: (shot: ShotBreakdown) => void;
  handleReorderShots: (from: number, to: number) => void;
  handleGeneratePrompts: () => void;
  handleFinalizeImport: () => Promise<void>;
  handleAutoRun: () => void;
  /** 设置当前段落索引（SegmentNavColumn 使用） */
  setCurrentSegmentIndex: (index: number) => void;
  // Task 2A.13 Structure 面板 handlers
  /** 用户在 StructureAnalysisPanel 编辑 beats 后回调 */
  handleBeatsChange: (beats: NarrativeBeat[]) => void;
  /** 用户在 ShotContractPanel 编辑 contracts 后回调 */
  handleShotContractsChange: (contracts: ShotContract[]) => void;
  // Task 2A.14 Pacing 面板 handlers
  /** 用户在 PacingPanel 修改配置后回调 */
  handlePacingConfigChange: (config: PacingConfig) => void;
  /** 用户点击"一键应用建议时长"后回调（将建议时长应用到 segments.estimatedDuration） */
  handleApplyPacing: (result: PacingResult) => void;
  /** 用户点击"恢复默认时长"后回调（重置 pacingConfig 为 DEFAULT_PACING_CONFIG） */
  handleResetPacing: () => void;
  // Task 2A.7 持久化 handlers
  /** 恢复指定项目（从 DB 加载 PipelineState） */
  recoverProject: (id: string) => Promise<void>;
  /** 忽略恢复提示，开始新项目 */
  dismissRecovery: () => void;
  /** 删除指定未完成项目 */
  deletePendingProject: (id: string) => Promise<void>;
}

/**
 * P1-2 拆分：content_import → character_manage 阶段的实体提取与匹配逻辑。
 *
 * 从 handleNext 中提取为独立函数，降低 handleNext 复杂度并便于单元测试。
 * 调用 extractCharactersFromTextTool + extractScenesFromTextTool 并行提取，
 * 再调用 matchEntitiesTool 做三级匹配。任一工具失败时降级使用未匹配的提取结果。
 *
 * @param text 原始小说文本
 * @param isMounted 检查组件是否仍挂载（false 时提前返回 null）
 * @returns 提取并匹配后的角色/场景，或 null（组件已卸载）
 */
async function extractAndMatchEntities(
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
      // P1-3: 匹配失败时保留未匹配的提取结果（用户可手动匹配），记录日志
      errorLogger.warn("[useNovelPipeline] matchEntities 调用失败，保留未匹配的提取结果", err);
    }
  }

  return { characters: matchedCharacters, scenes: matchedScenes };
}

/**
 * P1-2 拆分：review → storyboard 阶段的分镜拆解逻辑。
 *
 * 从 handleNext 中提取为独立函数。对每个选中段落调用 breakdownTextToShotsTool，
 * 单个段落失败不阻塞后续。最终按 sequence 排序并重新分配连续序号。
 *
 * @param segments 选中的段落列表
 * @param charactersJson 角色列表的 JSON 字符串（供拆解工具参考）
 * @param isMounted 检查组件是否仍挂载（false 时提前返回 null）
 * @returns 排序后的分镜列表，或 null（组件已卸载）
 */
async function breakdownShotsForSegments(
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
      // P1-3: 单个段落拆解失败：记录日志，继续处理后续段落
      errorLogger.warn(`[useNovelPipeline] 段落 ${segment.id ?? ""} 拆解失败，跳过`, err);
    }
  }

  if (!isMounted()) return null;

  // 按 sequence 排序，并重新分配序号确保连续
  allShots.sort((a, b) => a.sequence - b.sequence);
  return allShots.map((s, i) => ({ ...s, sequence: i + 1 }));
}

/**
 * 管道状态管理 Hook。
 * 行为与原 NovelImportPage 内联逻辑完全一致，提取为 Hook 以便 StoryPipelineShell 复用。
 */
export function useNovelPipeline({
  onComplete,
  initialConfig,
}: UseNovelPipelineOptions): UseNovelPipelineResult {
  const [state, setState] = useState<PipelineState>(() =>
    makeInitialState(makeDefaultConfig(initialConfig ?? {})),
  );
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [shots, setShots] = useState<ShotBreakdown[]>([]);

  // === Task 2A.13 故事结构分析 state ===
  // storyStructure: AI 识别的叙事 beats + 情绪曲线 + 整体节奏
  // treatment: AI 提取的 StoryTreatment（logline/theme/tone/characterArcs/setting）
  // shotContracts: 每个 beat 产出的 1-3 个 ShotContract（v5.3 增强）
  const [storyStructure, setStoryStructure] = useState<StoryStructure | null>(null);
  const [treatment, setTreatment] = useState<StoryTreatment | null>(null);
  const [shotContracts, setShotContracts] = useState<ShotContract[]>([]);

  // === Task 2A.14 节奏规划 state ===
  // pacingConfig: 用户可调整的节奏配置（预设 + 目标总时长 + 4 个 ratio）
  // pacingResult: 基于 structure + segments + pacingConfig 计算的派生结果（memo）
  const [pacingConfig, setPacingConfig] = useState<PacingConfig>(DEFAULT_PACING_CONFIG);

  // === Task 2A.7 持久化状态 ===
  const [pendingRecoveryProjects, setPendingRecoveryProjects] = useState<NovelProject[]>([]);
  const [isLoadingRecovery, setIsLoadingRecovery] = useState(true);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // hasRecoveredRef：恢复项目时跳过一次自动创建，避免立刻创建新记录覆盖刚恢复的项目
  const hasRecoveredRef = useRef(false);
  // P1-7 修复：isMountedRef 防止 async handler 在组件卸载后 setState
  const isMountedRef = useRef(true);

  // P1-7 修复：组件卸载时标记为已卸载，并清理防抖定时器
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  // 根据当前模式计算阶段子集（用于进度条显示）
  const stagesForMode = useMemo(
    () => getStagesForMode(state.config.aiAssistLevel),
    [state.config.aiAssistLevel],
  );

  // Task 2A.14：pacingResult 派生 — 基于 structure + segments + pacingConfig 计算
  // 仅在 pacing_planning 阶段或需要展示时计算，避免无谓重算
  const pacingResult = useMemo<PacingResult | null>(() => {
    if (!storyStructure || state.segments.length === 0) return null;
    return planPacing(state.segments, storyStructure, pacingConfig);
  }, [storyStructure, state.segments, pacingConfig]);

  // === Handlers ===

  const handleImport = useCallback(async (text: string) => {
    // H-1 修复：新项目导入时清空 structure 子域 state，避免上一次会话残留数据泄漏
    setStoryStructure(null);
    setTreatment(null);
    setShotContracts([]);
    // Task 2A.14：清空 pacing 子域 state（pacingConfig 重置为默认，pacingResult 是 memo 会自动重算）
    setPacingConfig(DEFAULT_PACING_CONFIG);

    setState((prev) => {
      const next = canTransition(prev.stage, "content_import")
        ? transition(prev, "content_import")
        : prev;
      return { ...next, rawText: text };
    });

    // 先用占位分段填充 UI（即使后续工具调用失败也有降级内容）
    const placeholderSegments: NovelSegment[] = text
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0)
      .slice(0, 20)
      .map((para, i) => ({
        id: `seg-${i + 1}`,
        title: `段落 ${i + 1}`,
        summary: para.slice(0, 80) + (para.length > 80 ? "..." : ""),
        startChar: 0,
        endChar: para.length,
        estimatedDuration: Math.max(3, Math.min(15, Math.round(para.length / 50))),
        keyEvents: [],
        text: para,
      }));
    setState((prev) => ({ ...prev, segments: placeholderSegments }));
    setSelectedSegmentIds(placeholderSegments.map((s) => s.id));

    // 接入 segmentNovelTextTool 实际分段（失败时保留上面的占位分段作为降级）
    setIsProcessing(true);
    try {
      const result = await segmentNovelTextTool.execute({ text }, NOVEL_TOOL_CTX);
      // P1-7 修复：组件卸载后不再 setState
      if (!isMountedRef.current) return;
      if (result.success && result.data) {
        const data = result.data as { segments: NovelSegment[] };
        if (Array.isArray(data.segments) && data.segments.length > 0) {
          // 工具返回的 segment.text 为空，需要从原 text 按 startChar/endChar 截取填充
          // 当 startChar=0 且 endChar=text.length 时直接使用原 text
          const filledSegments = data.segments.map((seg) => {
            const startChar = seg.startChar ?? 0;
            const endChar = seg.endChar ?? text.length;
            const segText =
              startChar === 0 && endChar === text.length
                ? text
                : text.slice(startChar, endChar);
            return { ...seg, text: segText };
          });
          setState((prev) => ({ ...prev, segments: filledSegments }));
          setSelectedSegmentIds(filledSegments.map((s) => s.id));
        }
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, []);

  const handleToggle = useCallback((id: string) => {
    setSelectedSegmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedSegmentIds((prev) => {
      const allIds = state.segments.map((s) => s.id);
      const allSelected = allIds.length > 0 && prev.length === allIds.length;
      return allSelected ? [] : allIds;
    });
  }, [state.segments]);

  const canProceed = useMemo((): boolean => {
    if (isProcessing) return false;
    switch (state.stage) {
      case "project_init":
        return state.rawText.trim().length > 0;
      case "content_import":
        return selectedSegmentIds.length > 0;
      case "structure_analysis":
        // Task 2A.13：professional 模式经过此阶段，AI 识别 beats 后允许下一步
        // 失败时 storyStructure 为 null，但仍允许跳过到 character_manage（不阻塞流程）
        return true;
      case "pacing_planning":
        // Task 2A.14：professional 模式经过此阶段，用户调整节奏配置后允许下一步
        return true;
      case "character_manage":
      case "scene_manage":
        return (
          state.characters.length > 0 &&
          state.characters.every((c) => c.confirmed) &&
          state.scenes.every((s) => s.confirmed)
        );
      case "review":
      case "storyboard":
        return shots.length > 0;
      case "generation":
        return true;
      case "done":
        return false;
      default:
        return false;
    }
  }, [state, selectedSegmentIds, isProcessing, shots]);

  const handleNext = useCallback(async () => {
    if (!canProceed) return;

    // 特殊处理：content_import → structure_analysis（professional）或 character_manage（quick/standard）
    if (state.stage === "content_import") {
      setIsProcessing(true);
      try {
        // Task 2A.13：professional 模式先进入 structure_analysis
        // 调用 analyzeStoryStructure 识别叙事 beats；失败时不阻塞，storyStructure 保持 null
        if (state.config.aiAssistLevel === "professional") {
          const generateTextFn = createGenerateTextFn();
          // M-3 修复：进入 structure_analysis 前清空 treatment/shotContracts
          // 避免用户从 structure_analysis 回退到 content_import 重试时残留旧数据
          setTreatment(null);
          setShotContracts([]);
          // Task 2A.14：进入 structure_analysis 前重置 pacingConfig
          setPacingConfig(DEFAULT_PACING_CONFIG);
          try {
            const result = await analyzeStoryStructure(
              state.segments,
              generateTextFn,
            );
            if (!isMountedRef.current) return;
            // analyzeStoryStructure 返回 { success, data? | error? }，提取 data
            setStoryStructure(result.success ? result.data : null);
            if (!result.success) {
              errorLogger.warn(
                "[useNovelPipeline] analyzeStoryStructure 返回失败，storyStructure 设为 null",
                new Error(result.error),
              );
            }
          } catch (err) {
            // P1-3: 结构分析失败不阻塞流程，记录日志，storyStructure 保持 null
            errorLogger.warn("[useNovelPipeline] analyzeStoryStructure 失败，跳过结构分析阶段", err);
            setStoryStructure(null);
          }

          setState((prev) =>
            canTransition(prev.stage, "structure_analysis")
              ? transition(prev, "structure_analysis")
              : prev,
          );
          return;
        }

        // quick/standard 模式：直接提取角色/场景并进入 character_manage（原行为）
        const result = await extractAndMatchEntities(
          state.rawText,
          () => isMountedRef.current,
        );
        if (!result) return; // 组件已卸载

        // 转换为管道内的 CharacterInPipeline / SceneInPipeline（带空 variants）
        const newCharacters: CharacterInPipeline[] = result.characters.map((c) => ({
          ...c,
          variants: [],
        }));
        const newScenes: SceneInPipeline[] = result.scenes.map((s) => ({ ...s, variants: [] }));

        setState((prev) =>
          canTransition(prev.stage, "character_manage")
            ? {
                ...transition(prev, "character_manage"),
                characters: newCharacters,
                scenes: newScenes,
              }
            : prev,
        );
      } finally {
        if (isMountedRef.current) setIsProcessing(false);
      }
      return;
    }

    // 特殊处理：structure_analysis → character_manage（Task 2A.13）
    // professional 模式专属：先生成 Treatment + ShotContract（v5.3 增强），再提取角色/场景
    if (state.stage === "structure_analysis") {
      setIsProcessing(true);
      try {
        const generateTextFn = createGenerateTextFn();

        // 并行：1) 提取 Treatment（v5.3） 2) 提取角色/场景（与 content_import → character_manage 一致）
        // extractTreatment 签名：(segments, generateTextFn, characters?)
        const [treatmentResult, entityResult] = await Promise.allSettled([
          extractTreatment(state.segments, generateTextFn, state.characters),
          extractAndMatchEntities(state.rawText, () => isMountedRef.current),
        ]);

        if (!isMountedRef.current) return;

        // 处理 Treatment 结果
        // extractTreatment 返回 { success, data? | error? }，提取 data
        let treatmentData: StoryTreatment | null = null;
        if (treatmentResult.status === "fulfilled" && treatmentResult.value.success) {
          treatmentData = treatmentResult.value.data;
          setTreatment(treatmentData);
        } else {
          // Treatment 失败或被 reject：保持 null，不阻塞流程
          setTreatment(null);
        }

        // Treatment 成功后，尝试为每个 beat 构建 ShotContract（v5.3 增强）
        // buildShotContractsForBeats 签名：(beats, segments, generateTextFn, treatment?)
        // 单个 beat 失败不阻塞，buildShotContractsForBeats 内部已容错
        if (treatmentData && storyStructure && storyStructure.beats.length > 0) {
          try {
            const contractsResult = await buildShotContractsForBeats(
              storyStructure.beats,
              state.segments,
              generateTextFn,
              treatmentData,
            );
            if (!isMountedRef.current) return;
            // buildShotContractsForBeats 返回 { success, data, errors }，提取 data
            // data 始终是数组（即使所有 beat 失败也是空数组），直接 set 安全
            setShotContracts(contractsResult.data);
            // L-2 修复：部分 beat 构建失败时记录日志，便于排查 AI 调用问题
            if (contractsResult.errors.length > 0) {
              errorLogger.warn(
                "[useNovelPipeline] buildShotContractsForBeats 部分 beat 失败",
                new Error(contractsResult.errors.join("; ")),
              );
            }
          } catch (err) {
            // P1-3: ShotContract 构建失败不阻塞流程，记录日志
            errorLogger.warn("[useNovelPipeline] buildShotContractsForBeats 失败，跳过镜头契约生成", err);
            setShotContracts([]);
          }
        }

        // 处理角色/场景提取结果
        if (entityResult.status === "fulfilled" && entityResult.value) {
          const newCharacters: CharacterInPipeline[] = entityResult.value.characters.map((c) => ({
            ...c,
            variants: [],
          }));
          const newScenes: SceneInPipeline[] = entityResult.value.scenes.map((s) => ({ ...s, variants: [] }));

          setState((prev) =>
            canTransition(prev.stage, "pacing_planning")
              ? {
                  ...transition(prev, "pacing_planning"),
                  characters: newCharacters,
                  scenes: newScenes,
                }
              : prev,
          );
        } else {
          // 提取失败：仅转换 stage，保留空 characters/scenes（用户可手动添加）
          setState((prev) =>
            canTransition(prev.stage, "pacing_planning")
              ? transition(prev, "pacing_planning")
              : prev,
          );
        }
      } finally {
        if (isMountedRef.current) setIsProcessing(false);
      }
      return;
    }

    // 特殊处理：pacing_planning → character_manage（Task 2A.14）
    // professional 模式专属：用户在 PacingPanel 调整节奏配置后，进入角色管理
    if (state.stage === "pacing_planning") {
      // 同步转换：无 AI 调用，直接 transition
      setState((prev) =>
        canTransition(prev.stage, "character_manage")
          ? transition(prev, "character_manage")
          : prev,
      );
      return;
    }

    // 特殊处理：review → storyboard 需要先调用 breakdownTextToShotsTool 生成分镜
    if (state.stage === "review") {
      setIsProcessing(true);
      try {
        const selectedSegments = state.segments.filter((s) =>
          selectedSegmentIds.includes(s.id),
        );
        const charactersJson = JSON.stringify(state.characters);
        const orderedShots = await breakdownShotsForSegments(
          selectedSegments,
          charactersJson,
          () => isMountedRef.current,
        );
        if (!orderedShots) return; // 组件已卸载

        setShots(orderedShots);

        setState((prev) =>
          canTransition(prev.stage, "storyboard")
            ? transition(prev, "storyboard")
            : prev,
        );
      } finally {
        if (isMountedRef.current) setIsProcessing(false);
      }
      return;
    }

    // 其他阶段转换：保留原同步逻辑
    setState((prev) => {
      switch (prev.stage) {
        case "project_init":
          return canTransition(prev.stage, "content_import")
            ? transition(prev, "content_import")
            : prev;
        case "character_manage":
          return canTransition(prev.stage, "scene_manage")
            ? transition(prev, "scene_manage")
            : prev;
        case "scene_manage":
          return canTransition(prev.stage, "review")
            ? transition(prev, "review")
            : prev;
        case "storyboard":
          return canTransition(prev.stage, "generation")
            ? transition(prev, "generation")
            : prev;
        case "generation":
          return canTransition(prev.stage, "done")
            ? transition(prev, "done")
            : prev;
        default:
          return prev;
      }
    });
  }, [canProceed, state.stage, state.rawText, state.segments, state.characters, state.config.aiAssistLevel, selectedSegmentIds, storyStructure]);

  // === EntityReviewPanel handlers ===

  const handleConfirmCharacter = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.tempId === id ? { ...c, confirmed: true } : c,
      ),
    }));
  }, []);

  const handleConfirmScene = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s) =>
        s.tempId === id ? { ...s, confirmed: true } : s,
      ),
    }));
  }, []);

  const handleEditCharacter = useCallback((c: ExtractedCharacter) => {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((ch) =>
        ch.tempId === c.tempId ? ({ ...ch, ...c } as CharacterInPipeline) : ch,
      ),
    }));
  }, []);

  const handleEditScene = useCallback((s: ExtractedScene) => {
    setState((prev) => ({
      ...prev,
      scenes: prev.scenes.map((sc) =>
        sc.tempId === s.tempId ? ({ ...sc, ...s } as SceneInPipeline) : sc,
      ),
    }));
  }, []);

  const handleMatchCharacter = useCallback(async (id: string, existingId: string) => {
    // 简化实现：对该角色调用 matchEntitiesTool（传入单个角色的 JSON）
    // 工具会自动与 DB 中的现有角色做匹配，返回 status/matchedCharacterId/matchConfidence
    // 用户手动选择的 existingId 优先级最高（覆盖工具返回的 matchedCharacterId）
    const character = state.characters.find((c) => c.tempId === id);
    if (!character) return;

    setIsProcessing(true);
    try {
      let updatedCharacter: CharacterInPipeline = {
        ...character,
        matchedCharacterId: existingId,
        matchConfidence: 1.0,
        status: "matched",
      };

      try {
        const result = await matchEntitiesTool.execute(
          { charactersJson: JSON.stringify([character]) },
          NOVEL_TOOL_CTX,
        );
        // P1-7 修复：组件卸载后不再 setState
        if (!isMountedRef.current) return;
        if (result.success && result.data) {
          const data = result.data as { characters: ExtractedCharacter[] };
          const matchedChar = data.characters?.[0];
          if (matchedChar) {
            // 用工具返回的状态/confidence 覆盖，但保留用户手动选择的 existingId
            updatedCharacter = {
              ...character,
              ...matchedChar,
              // 工具若返回 new（无匹配），仍按用户手动选择标记为 matched
              status: matchedChar.status === "new" ? "matched" : matchedChar.status,
              matchedCharacterId: existingId,
              matchConfidence: matchedChar.matchConfidence ?? 1.0,
            };
          }
        }
      } catch (err) {
        // P1-3: 工具调用失败时使用默认值（直接标记为 matched），记录日志
        errorLogger.warn(`[useNovelPipeline] 角色 ${id} 匹配工具调用失败，使用默认值 matched`, err);
      }

      // 保留 confirmed 状态和 variants 字段
      setState((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.tempId === id
            ? {
                ...updatedCharacter,
                confirmed: c.confirmed,
                variants: c.variants,
              }
            : c,
        ),
      }));
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [state.characters]);

  // === ShotBreakdownList handlers ===

  const handleEditShot = useCallback((shot: ShotBreakdown) => {
    setShots((prev) => prev.map((s) => (s.id === shot.id ? { ...shot, status: "edited" } : s)));
  }, []);

  const handleReorderShots = useCallback((from: number, to: number) => {
    setShots((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return prev;
      next.splice(to, 0, moved);
      return next.map((s, i) => ({ ...s, sequence: i + 1 }));
    });
  }, []);

  const handleGeneratePrompts = useCallback(() => {
    // generate_prompt 工具位于 agent-tools-story（不在 novelTools 中），
    // 这里采用合理的本地实现：基于 shot.description + shot.action + 角色名拼接 prompt 字符串
    setShots((prev) =>
      prev.map((shot) => {
        const charNames = shot.characters.join(", ");
        const promptText = [
          shot.description,
          shot.action ? `动作: ${shot.action}` : "",
          charNames ? `角色: ${charNames}` : "",
          shot.shotType ? `景别: ${shot.shotType}` : "",
          shot.cameraAngle ? `机位: ${shot.cameraAngle}` : "",
          shot.cameraMovement ? `运镜: ${shot.cameraMovement}` : "",
        ]
          .filter(Boolean)
          .join("; ");
        return {
          ...shot,
          prompt: {
            en: promptText,
            zh: promptText,
          },
          status: "final" as const,
        };
      }),
    );
  }, []);

  // === Task 2A.13 Structure 面板 handlers ===

  /**
   * 用户在 StructureAnalysisPanel 编辑 beats 后回调。
   *
   * 接收新的 beats 数组，使用 recalculateStoryStructure 重新计算
   * position/emotionCurve/overallPacing/climaxPosition（保持衍生数据一致性），
   * 然后整体替换 storyStructure state。
   *
   * 前置条件：StructureAnalysisPanel 仅在 structure !== null && beats.length > 0
   * 时才允许编辑（空状态显示 EmptyState），因此本回调被调用时 structure 必然非空。
   */
  const handleBeatsChange = useCallback(
    (beats: NarrativeBeat[]) => {
      // 重新计算衍生字段，确保 emotionCurve / climaxPosition / overallPacing 与新 beats 一致
      const recalculated = recalculateStoryStructure(beats, state.segments);
      setStoryStructure(recalculated);
    },
    [state.segments],
  );

  /**
   * 用户在 ShotContractPanel 编辑 contracts 后回调。
   *
   * 整体替换 shotContracts state（ShotContractPanel 内部已处理单行更新逻辑，
   * 传入的 contracts 数组是用户编辑后的完整新数组）。
   */
  const handleShotContractsChange = useCallback(
    (contracts: ShotContract[]) => {
      setShotContracts(contracts);
    },
    [],
  );

  // === Task 2A.14 Pacing handlers ===

  const handlePacingConfigChange = useCallback(
    (config: PacingConfig) => {
      setPacingConfig(config);
    },
    [],
  );

  /**
   * 一键应用建议时长：将 pacingResult.segmentDurations 应用到 segments.estimatedDuration。
   *
   * 不修改 storyStructure.beats.estimatedDuration（beats 时长是 AI 识别的，用户编辑 beats
   * 通过 handleBeatsChange）。仅更新 segments，影响后续分镜拆解的时长参考。
   */
  const handleApplyPacing = useCallback(
    (result: PacingResult) => {
      setState((prev) => ({
        ...prev,
        segments: prev.segments.map((seg) => {
          const newDuration = result.segmentDurations.get(seg.id);
          return newDuration !== undefined ? { ...seg, estimatedDuration: newDuration } : seg;
        }),
      }));
    },
    [],
  );

  const handleResetPacing = useCallback(() => {
    setPacingConfig(DEFAULT_PACING_CONFIG);
  }, []);

  // === FinalizePanel handlers ===

  const handleFinalizeImport = useCallback(async () => {
    setIsImporting(true);
    try {
      // 动态导入 storyService（避免在 novel 模块顶层依赖 storyboard 模块）
      // 注：不存在独立的 createBeat 服务 — beats 数组作为 CreateStoryInput 的一部分
      // 通过 storyService.create 一次性持久化
      const { storyService } = await import("@/modules/storyboard");

      // P1-7 修复：组件卸载后不再继续处理
      if (!isMountedRef.current) return;

      // 构建角色 ID 数组：仅匹配到现有 DB 角色的（新角色不会自动创建，留待用户在故事板中处理）
      const characterIds = state.characters
        .map((c) => c.matchedCharacterId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      // 构建场景 ID 数组：仅匹配到现有 DB 场景的
      const sceneIds = state.scenes
        .map((s) => s.matchedSceneId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      // 构建 StoryBeat[]：每个 shot 对应一个 beat
      // characterIds 通过 shot.characters 名字反查 matchedCharacterId
      const beats: StoryBeat[] = shots.map((shot, index) => {
        const beatCharacterIds = shot.characters
          .map((name) => state.characters.find((c) => c.name === name)?.matchedCharacterId)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        return {
          id: `beat_${crypto.randomUUID()}`,
          sequence: index + 1,
          description: shot.description,
          duration: shot.estimatedDuration,
          characterIds: beatCharacterIds,
          sceneId: shot.sceneId,
          elementIds: [],
        } as StoryBeat;
      });

      const title = state.config.projectName || state.rawText.slice(0, 40) || "未命名项目";
      const description = state.rawText.slice(0, 500);

      const result = await storyService.create({
        title,
        description,
        characters: characterIds,
        scenes: sceneIds,
        beats,
        elementIds: [],
      });

      // P1-7 修复：组件卸载后不再 setState
      if (!isMountedRef.current) return;

      if (!result.ok) {
        // 创建失败：记录错误，保留当前状态允许用户重试
        errorLogger.error(
          {
            code: "NovelPipelineFinalizeFailed",
            message: result.error.message,
          },
          "useNovelPipeline",
        );
        return;
      }

      // 转换到 done 阶段
      setState((prev) =>
        canTransition(prev.stage, "done") ? transition(prev, "done") : prev,
      );

      // Task 2A.7: 导入完成后清理 DB 项目记录（物理删除，因为已转换为正式 Story）
      if (currentProjectId !== null) {
        container.novelProjectStorage
          .hardDeleteProject(currentProjectId)
          .catch((err) => {
            // P1-3: 清理失败不阻塞 UI，后续 cleanExpiredProjects 会兜底，记录日志
            errorLogger.warn(`[useNovelPipeline] 清理已完成项目 ${currentProjectId} 失败，后续 cleanExpiredProjects 会兜底`, err);
          });
        setCurrentProjectId(null);
      }
    } catch (err) {
      // 异常路径：记录错误，不阻塞 UI（允许用户重试）
      errorLogger.error(
        {
          code: "NovelPipelineFinalizeError",
          message: err instanceof Error ? err.message : String(err),
          cause: err,
        },
        "useNovelPipeline",
      );
    } finally {
      if (isMountedRef.current) setIsImporting(false);
    }
  }, [state.config.projectName, state.rawText, state.characters, state.scenes, shots, currentProjectId]);

  // === Task 2A.7 持久化 handlers ===

  /**
   * 将 storage 返回的 NovelProjectRecord（state: unknown）转换为
   * NovelProject 域对象（state: PipelineState）。
   * 如果 state 损坏或缺少必要字段，回退到 makeInitialState。
   */
  const recordToProject = useCallback(
    (record: {
      id: string;
      title: string;
      rawText: string;
      state: unknown;
      createdAt: number;
      updatedAt: number;
    }): NovelProject => {
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
    },
    [],
  );

  /** 挂载时加载未完成项目列表（仅一次），用于 UI 显示恢复对话框 */
  useEffect(() => {
    let cancelled = false;
    const storage = container.novelProjectStorage;
    storage
      .getAllProjects()
      .then((records) => {
        if (cancelled) return;
        const projects = records.map(recordToProject);
        setPendingRecoveryProjects(projects);
        setIsLoadingRecovery(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // P1-3: 加载未完成项目失败时记录日志，仅标记加载完成
        errorLogger.warn("[useNovelPipeline] 挂载时加载未完成项目列表失败", err);
        setIsLoadingRecovery(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recordToProject]);

  /** 自动保存：state 变化时 2 秒防抖保存到 DB（仅当用户输入了文本或已关联项目时） */
  useEffect(() => {
    // 跳过：项目刚恢复（避免立刻覆盖）、用户未输入任何内容、正在加载恢复列表
    if (hasRecoveredRef.current) {
      hasRecoveredRef.current = false;
      return;
    }
    // 只在有 rawText 或已有 currentProjectId 时才自动保存（避免空项目污染 DB）
    const hasContent = state.rawText.trim().length > 0 || currentProjectId !== null;
    if (!hasContent || isLoadingRecovery) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(async () => {
      // L-1 修复：组件卸载后不再 setState（与 isMountedRef 模式保持一致）
      if (!isMountedRef.current) return;
      try {
        const storage = container.novelProjectStorage;
        const title =
          state.config.projectName ||
          (state.rawText ? state.rawText.slice(0, 40) : "未命名项目");
        if (currentProjectId === null) {
          // 新项目：创建记录
          const id = `np-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await storage.createProject({
            id,
            title,
            rawText: state.rawText,
            state,
          });
          if (!isMountedRef.current) return;
          setCurrentProjectId(id);
        } else {
          // 已有项目：更新
          await storage.updateProject(currentProjectId, {
            title,
            rawText: state.rawText,
            state,
          });
        }
        if (!isMountedRef.current) return;
        setLastSavedAt(Date.now());
      } catch (err) {
        // P1-3: 自动保存失败不阻塞 UI，下次 state 变化时会重试，记录日志
        if (isMountedRef.current) {
          errorLogger.warn("[useNovelPipeline] 自动保存失败，下次 state 变化时会重试", err);
        }
      }
    }, 2000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [state, currentProjectId, isLoadingRecovery]);

  /** 恢复指定项目（从 DB 加载 pipeline_state_json） */
  const recoverProject = useCallback(async (id: string) => {
    try {
      const storage = container.novelProjectStorage;
      const record = await storage.getProjectById(id);
      if (!record) return;
      const project = recordToProject(record);
      hasRecoveredRef.current = true;
      setState(project.state);
      setSelectedSegmentIds(project.state.segments.map((s) => s.id));
      setCurrentProjectId(project.id);
      setPendingRecoveryProjects([]);
      setLastSavedAt(project.updatedAt);
      // H-1 修复：恢复项目时清空 structure 子域 state
      // 当前这些 state 不在 PipelineState.stepData 中持久化，恢复后必然为空
      // 清空以避免恢复前残留的旧数据污染恢复后的会话
      // TODO(Task 2A.16): 将 storyStructure/treatment/shotContracts 持久化到 stepData["structure_analysis"]
      setStoryStructure(null);
      setTreatment(null);
      setShotContracts([]);
      // Task 2A.14：清空 pacing 子域 state
      setPacingConfig(DEFAULT_PACING_CONFIG);
    } catch (err) {
      // P1-3: 恢复失败：保留当前状态，不阻塞 UI，记录日志
      errorLogger.warn(`[useNovelPipeline] 恢复项目 ${id} 失败，保留当前状态`, err);
    }
  }, [recordToProject]);

  /** 忽略恢复提示，开始新项目（清空恢复列表） */
  const dismissRecovery = useCallback(() => {
    setPendingRecoveryProjects([]);
    // H-1 修复：忽略恢复提示意味着用户要开始新项目，清空 structure 子域 state
    setStoryStructure(null);
    setTreatment(null);
    setShotContracts([]);
    // Task 2A.14：清空 pacing 子域 state
    setPacingConfig(DEFAULT_PACING_CONFIG);
  }, []);

  /** 删除指定未完成项目（从 DB 物理删除） */
  const deletePendingProject = useCallback(async (id: string) => {
    // P1-6: 不可逆操作二次确认（项目数据将永久丢失）
    const ok = await confirm({
      title: t("novel.project.deleteConfirmTitle"),
      description: t("novel.project.deleteConfirmDesc"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      const storage = container.novelProjectStorage;
      await storage.hardDeleteProject(id);
      setPendingRecoveryProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      // P1-3: 删除失败：UI 列表保持不变，记录日志
      errorLogger.warn(`[useNovelPipeline] 删除未完成项目 ${id} 失败，UI 列表保持不变`, err);
    }
  }, []);

  const handleAutoRun = useCallback(() => {
    if (isProcessing) return;
    setIsProcessing(true);
    setState((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        mode: "auto",
        gates: getAutoGates({ ...prev.config, mode: "auto" }),
      },
    }));
    window.setTimeout(() => setIsProcessing(false), 500);
  }, [isProcessing]);

  const setCurrentSegmentIndex = useCallback((index: number) => {
    setState((prev) => ({ ...prev, currentSegmentIndex: index }));
  }, []);

  // === done 阶段调用 onComplete ===
  useEffect(() => {
    if (state.stage === "done") {
      onComplete();
    }
  }, [state.stage, onComplete]);

  // === 派生渲染标志 ===
  const showImportStep =
    state.stage === "project_init" ||
    (state.stage === "content_import" && state.rawText.length === 0);
  const showSegmentList = state.stage === "content_import" && state.rawText.length > 0;
  // Task 2A.13：professional 模式专属 — 显示叙事结构分析面板
  const showStructureAnalysis = state.stage === "structure_analysis";
  // Task 2A.14：professional 模式专属 — 显示节奏规划面板
  const showPacingPlanning = state.stage === "pacing_planning";
  const showEntityReview =
    state.stage === "character_manage" || state.stage === "scene_manage";
  const showShotBreakdown = state.stage === "review" || state.stage === "storyboard";
  const showFinalize = state.stage === "generation";
  const isDone = state.stage === "done";

  return {
    state,
    selectedSegmentIds,
    isProcessing,
    isImporting,
    shots,
    // Task 2A.13 故事结构分析状态
    storyStructure,
    treatment,
    shotContracts,
    // Task 2A.14 节奏规划状态
    pacingConfig,
    pacingResult,
    stagesForMode,
    canProceed,
    showImportStep,
    showSegmentList,
    showStructureAnalysis,
    showPacingPlanning,
    showEntityReview,
    showShotBreakdown,
    showFinalize,
    isDone,
    // Task 2A.7 持久化
    pendingRecoveryProjects,
    isLoadingRecovery,
    currentProjectId,
    lastSavedAt,
    handleImport,
    handleToggle,
    handleSelectAll,
    handleNext,
    handleConfirmCharacter,
    handleConfirmScene,
    handleEditCharacter,
    handleEditScene,
    handleMatchCharacter,
    handleEditShot,
    handleReorderShots,
    handleGeneratePrompts,
    handleFinalizeImport,
    handleAutoRun,
    setCurrentSegmentIndex,
    // Task 2A.13 Structure handlers
    handleBeatsChange,
    handleShotContractsChange,
    // Task 2A.14 Pacing handlers
    handlePacingConfigChange,
    handleApplyPacing,
    handleResetPacing,
    // Task 2A.7 持久化 handlers
    recoverProject,
    dismissRecovery,
    deletePendingProject,
  };
}
