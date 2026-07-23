/**
 * Novel 完整管道集成测试
 *
 * 覆盖链路：
 *   小说文本 → 分段 → 角色/场景提取 → 实体匹配 → 分镜拆解
 *   → handleFinalizeImport → storyService.create → Story 创建
 *
 * 测试策略（无真实 LLM 调用）：
 * - 状态机阶段转换：直接调用 pipeline-machine 纯函数（合法/非法转换、retryStage）
 * - 5 个 agent tool：通过 mock container.textProvider.generateText 返回预设 JSON，
 *   驱动真实 tool 解析逻辑（字符偏移追踪、schema 校验、匹配阈值）
 * - match-entities：mock @/modules/character 与 @/modules/scene 的 getAll 返回 DB 已有实体
 * - handleFinalizeImport：renderHook 执行，mock storyService.create 验证入参
 *   （StoryBeat[] 携带 sourceText/sourceSegmentId/chapterIndex，characterIds 仅含已匹配）
 *
 * 注意：quick 模式的可见阶段子集（getStagesForMode）与底层 VALID_TRANSITIONS 不同——
 * character_manage → generation 在状态机中非合法转换（需经 scene_manage/review/storyboard），
 * 故完整链路的状态机部分走 standard 合法路径，quick 模式仅验证阶段子集与跳过路径。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ToolResult, ToolContext } from "@/domain/types/agent-tools";
import type {
  PipelineState,
  PipelineConfig,
  ShotBreakdown,
  CharacterInPipeline,
  SceneInPipeline,
  NovelSegment,
  PipelineStage,
} from "../domain/types";
import {
  STAGE_ORDER,
  VALID_TRANSITIONS,
  canTransition,
  transition,
  getStagesForMode,
  retryStage,
  getRetryableStages,
} from "../import/services/pipeline-machine";

// ============================================================================
// Mock 声明（vi.hoisted 确保 vi.mock 工厂可引用 mock 对象）
// ============================================================================

const {
  mockGenerateText,
  mockContainer,
  mockStoryServiceCreate,
  mockNovelProjectUpdate,
  mockCharGetAll,
  mockSceneGetAll,
} = vi.hoisted(() => {
  const mockGenerateText = vi.fn();
  const mockStoryServiceCreate = vi.fn();
  const mockNovelProjectUpdate = vi.fn();
  const mockCharGetAll = vi.fn();
  const mockSceneGetAll = vi.fn();
  const mockContainer = {
    textProvider: { generateText: mockGenerateText },
    novelProjectStorage: { updateProject: mockNovelProjectUpdate },
    eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
  };
  return {
    mockGenerateText,
    mockContainer,
    mockStoryServiceCreate,
    mockNovelProjectUpdate,
    mockCharGetAll,
    mockSceneGetAll,
  };
});

vi.mock("@/infrastructure/di", () => ({
  container: mockContainer,
  resolve: vi.fn(),
}));

vi.mock("@/modules/storyboard", () => ({
  storyService: { create: mockStoryServiceCreate },
}));

vi.mock("@/modules/character", () => ({
  characterService: { getAll: () => mockCharGetAll() },
}));

vi.mock("@/modules/scene", () => ({
  sceneService: { getAll: () => mockSceneGetAll() },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

// 被测代码（在 vi.mock 之后导入，确保 mock 生效）
import { segmentNovelTextTool } from "../tools/segment-novel-text";
import { extractCharactersFromTextTool } from "../tools/extract-characters-from-text";
import { extractScenesFromTextTool } from "../tools/extract-scenes-from-text";
import { matchEntitiesTool } from "../tools/match-entities";
import { breakdownTextToShotsTool } from "../tools/breakdown-text-to-shots";
import { useNovelFinalizeImport } from "../hooks/use-novel-finalize-import";

// ============================================================================
// 辅助：构造测试数据
// ============================================================================

const NOVEL_TEXT =
  "林风推开破旧的木门，走进了昏暗的书房。" +
  "书桌上摊开着一本泛黄的古籍，他小心翼翼地翻开第一页。" +
  "窗外，苏婉正站在庭院中，望着满地落叶出神。";

const TOOL_CTX: ToolContext = { sessionId: "novel-pipeline-test" };

function makeConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    mode: "semi",
    aiAssistLevel: "standard",
    projectName: "测试小说",
    style: "modern",
    format: "novel",
    aiModel: "test-model",
    autoCreateEntities: false,
    ...overrides,
    gates: {
      confirmSegments: true,
      confirmEntities: true,
      confirmShots: true,
      confirmPrompts: true,
      ...(overrides.gates ?? {}),
    },
  };
}

function makeState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    stage: "project_init",
    step: 1,
    config: makeConfig(),
    rawText: "",
    segments: [],
    currentSegmentIndex: 0,
    characters: [],
    scenes: [],
    characterImportance: {},
    prompts: [],
    generationResults: [],
    ...overrides,
  };
}

function makeCharacterInPipeline(
  overrides: Partial<CharacterInPipeline> = {},
): CharacterInPipeline {
  return {
    tempId: crypto.randomUUID(),
    name: "未命名",
    gender: "unknown",
    description: "",
    appearance: {
      hairColor: "",
      hairStyle: "",
      eyeColor: "",
      height: "",
      build: "",
      clothing: "",
    },
    personality: [],
    firstAppearance: "",
    status: "new",
    confirmed: false,
    variants: [],
    ...overrides,
  };
}

function makeSceneInPipeline(overrides: Partial<SceneInPipeline> = {}): SceneInPipeline {
  return {
    tempId: crypto.randomUUID(),
    name: "未命名场景",
    type: "",
    description: "",
    atmosphere: "",
    timeOfDay: "",
    location: "",
    status: "new",
    confirmed: false,
    variants: [],
    ...overrides,
  };
}

/** 从 ToolResult 中取出 data（断言成功） */
function unwrap<T>(result: ToolResult): T {
  if (!result.success || !result.data) {
    throw new Error(`tool 执行失败: ${result.error ?? "未知错误"}`);
  }
  return result.data as T;
}

/** 根据 prompt 关键字返回各阶段预设 JSON，驱动真实 tool 解析逻辑 */
function configureStageResponses() {
  mockGenerateText.mockImplementation((prompt: string) => {
    // segment_novel_text
    if (prompt.includes("分成适合视频制作的故事段落")) {
      return Promise.resolve({
        success: true,
        data: {
          text: JSON.stringify([
            {
              title: "书房探秘",
              summary: "林风进入书房发现古籍",
              estimatedDuration: 10,
              keyEvents: ["推门", "翻书"],
              firstSentence: "林风推开破旧的木门",
            },
            {
              title: "庭院落叶",
              summary: "苏婉在庭院中望着落叶",
              estimatedDuration: 8,
              keyEvents: ["望落叶"],
              firstSentence: "窗外，苏婉正站在庭院中",
            },
          ]),
        },
      });
    }
    // extract_characters_from_text
    if (prompt.includes("提取所有有名字或有明确描写的角色")) {
      return Promise.resolve({
        success: true,
        data: {
          text: JSON.stringify([
            {
              name: "林风",
              gender: "male",
              age: 25,
              description: "一位年轻的探索者",
              appearance: {
                hairColor: "黑色",
                hairStyle: "短发",
                eyeColor: "棕色",
                height: "180cm",
                build: "中等",
                clothing: "青色长袍",
              },
              personality: ["勇敢", "好奇"],
              firstAppearance: "林风推开破旧的木门",
            },
            {
              name: "苏婉",
              gender: "female",
              age: 22,
              description: "庭院中的少女",
              appearance: {
                hairColor: "黑色",
                hairStyle: "长发",
                eyeColor: "黑色",
                height: "165cm",
                build: "纤细",
                clothing: "白色长裙",
              },
              personality: ["沉静"],
              firstAppearance: "苏婉正站在庭院中",
            },
          ]),
        },
      });
    }
    // extract_scenes_from_text
    if (prompt.includes("提取所有出现的场景/地点")) {
      return Promise.resolve({
        success: true,
        data: {
          text: JSON.stringify([
            {
              name: "书房",
              type: "室内",
              description: "昏暗的旧书房，堆满古籍",
              atmosphere: "神秘",
              timeOfDay: "白天",
              location: "老宅",
            },
            {
              name: "庭院",
              type: "室外",
              description: "满是落叶的庭院",
              atmosphere: "萧瑟",
              timeOfDay: "白天",
              location: "老宅",
            },
          ]),
        },
      });
    }
    // breakdown_text_to_shots
    if (prompt.includes("你是专业分镜师")) {
      return Promise.resolve({
        success: true,
        data: {
          text: JSON.stringify([
            {
              sequence: 1,
              description: "林风推门进入书房",
              shotType: "中景",
              cameraAngle: "平视",
              cameraMovement: "推",
              action: "推门而入",
              characters: ["林风"],
              estimatedDuration: 5,
            },
            {
              sequence: 2,
              description: "苏婉站在庭院望落叶",
              shotType: "全景",
              cameraAngle: "平视",
              cameraMovement: "固定",
              action: "静立凝视",
              characters: ["苏婉"],
              estimatedDuration: 4,
            },
          ]),
        },
      });
    }
    return Promise.resolve({ success: true, data: { text: "[]" } });
  });
}

// ============================================================================
// 1. 快速模式完整链路：文本 → 分段 → 提取 → 匹配 → 分镜 → Story
// ============================================================================

describe("Novel 完整管道集成测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureStageResponses();
  });

  describe("1. 完整数据链路（5 个 agent tool 顺序执行 + 状态机合法转换）", () => {
    it("文本输入 → project_init → content_import → 分段 → character_manage → 场景提取 → storyboard → 分镜拆解 → done", async () => {
      // ── 阶段 1：project_init → content_import（合法转换）──
      let state = makeState({ stage: "project_init", rawText: NOVEL_TEXT });
      expect(canTransition(state.stage, "content_import")).toBe(true);
      state = transition(state, "content_import");
      expect(state.stage).toBe("content_import");

      // ── 阶段 2：分段（segment_novel_text，驱动真实偏移追踪逻辑）──
      const segResult = await segmentNovelTextTool.execute({ text: NOVEL_TEXT }, TOOL_CTX);
      const segments = unwrap<{ segments: NovelSegment[] }>(segResult).segments;
      expect(segments).toHaveLength(2);
      // Q2-1: 字符偏移单调递增、首尾相连、覆盖全文
      expect(segments[0]!.startChar).toBe(0);
      expect(segments[0]!.endChar).toBe(segments[1]!.startChar);
      expect(segments[segments.length - 1]!.endChar).toBe(NOVEL_TEXT.length);
      // 每个 segment 文本来自原文
      for (const seg of segments) {
        expect(seg.text.length).toBeGreaterThan(0);
        expect(NOVEL_TEXT.includes(seg.text)).toBe(true);
      }

      // ── content_import → character_manage（合法转换，standard/quick 跳过 structure）──
      expect(canTransition(state.stage, "character_manage")).toBe(true);
      state = transition(state, "character_manage");
      expect(state.stage).toBe("character_manage");

      // ── 阶段 3：提取角色（extract_characters_from_text）──
      const charResult = await extractCharactersFromTextTool.execute(
        { text: NOVEL_TEXT },
        TOOL_CTX,
      );
      const extractedCharacters = unwrap<{ characters: CharacterInPipeline[] }>(charResult)
        .characters;
      expect(extractedCharacters).toHaveLength(2);
      expect(extractedCharacters.map((c) => c.name).sort()).toEqual(["林风", "苏婉"]);

      // ── 阶段 4：提取场景（extract_scenes_from_text）──
      const sceneResult = await extractScenesFromTextTool.execute(
        { text: NOVEL_TEXT },
        TOOL_CTX,
      );
      const extractedScenes = unwrap<{ scenes: SceneInPipeline[] }>(sceneResult).scenes;
      expect(extractedScenes).toHaveLength(2);
      expect(extractedScenes.map((s) => s.name).sort()).toEqual(["书房", "庭院"]);

      // ── 阶段 5：实体匹配（DB 已有"林风"+"书房"，无"苏婉"+"庭院"）──
      mockCharGetAll.mockResolvedValue({
        ok: true,
        value: [{ id: "char_db_001", name: "林风" }],
      });
      mockSceneGetAll.mockResolvedValue({
        ok: true,
        value: [{ id: "scene_db_001", name: "书房" }],
      });
      const matchResult = await matchEntitiesTool.execute(
        {
          charactersJson: JSON.stringify(extractedCharacters),
          scenesJson: JSON.stringify(extractedScenes),
        },
        TOOL_CTX,
      );
      const matched = unwrap<{
        characters: CharacterInPipeline[];
        scenes: SceneInPipeline[];
      }>(matchResult);
      // 林风精确匹配
      const linFeng = matched.characters.find((c) => c.name === "林风")!;
      expect(linFeng.status).toBe("matched");
      expect(linFeng.matchedCharacterId).toBe("char_db_001");
      expect(linFeng.matchConfidence).toBe(1.0);
      // 苏婉无匹配
      const suWan = matched.characters.find((c) => c.name === "苏婉")!;
      expect(suWan.status).toBe("new");
      expect(suWan.matchedCharacterId).toBeUndefined();
      // 书房匹配、庭院无匹配
      const study = matched.scenes.find((s) => s.name === "书房")!;
      expect(study.status).toBe("matched");
      expect(study.matchedSceneId).toBe("scene_db_001");
      const yard = matched.scenes.find((s) => s.name === "庭院")!;
      expect(yard.status).toBe("new");
      expect(yard.matchedSceneId).toBeUndefined();

      // ── 走 standard 合法路径到 generation ──
      // character_manage → scene_manage → review → storyboard → generation
      for (const target of [
        "scene_manage",
        "review",
        "storyboard",
        "generation",
      ] as PipelineStage[]) {
        state = transition(state, target);
      }
      expect(state.stage).toBe("generation");

      // ── 阶段 6：分镜拆解（breakdown_text_to_shots，携带原文回溯上下文）──
      const firstSegment = segments[0]!;
      const bdResult = await breakdownTextToShotsTool.execute(
        {
          text: firstSegment.text,
          charactersJson: JSON.stringify(extractedCharacters),
          sceneId: "scene_db_001",
          segmentId: firstSegment.id,
          segmentStartChar: firstSegment.startChar,
          segmentEndChar: firstSegment.endChar,
          chapterIndex: 1,
          chapterTitle: "第一章",
        },
        TOOL_CTX,
      );
      const shots = unwrap<{ shots: ShotBreakdown[] }>(bdResult).shots;
      expect(shots).toHaveLength(2);
      // Q2-1: shots 携带原文回溯字段
      expect(shots[0]!.sourceSegmentId).toBe(firstSegment.id);
      expect(shots[0]!.sourceStartChar).toBe(firstSegment.startChar);
      expect(shots[0]!.sourceEndChar).toBe(firstSegment.endChar);
      expect(shots[0]!.sourceText).toBe(firstSegment.text);
      expect(shots[0]!.chapterIndex).toBe(1);
      expect(shots[0]!.chapterTitle).toBe("第一章");

      // ── generation → done（合法转换）──
      expect(canTransition(state.stage, "done")).toBe(true);
      state = transition(state, "done");
      expect(state.stage).toBe("done");

      // ── 链路产出可组装为 Story 输入 ──
      expect(segments.length).toBeGreaterThan(0);
      expect(extractedCharacters.length).toBeGreaterThan(0);
      expect(shots.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 2. 阶段转换合法性
  // ============================================================================

  describe("2. 阶段转换合法性", () => {
    it("quick 模式阶段子集（getStagesForMode）", () => {
      expect(getStagesForMode("quick")).toEqual([
        "project_init",
        "content_import",
        "character_manage",
        "generation",
        "done",
      ]);
    });

    it("content_import 可跳过 structure_analysis 直达 character_manage", () => {
      // quick/standard 跳过 structure_analysis 的合法路径
      expect(VALID_TRANSITIONS.content_import).toContain("character_manage");
      expect(VALID_TRANSITIONS.content_import).toContain("structure_analysis");
    });

    it("合法转换成功并重置 step 为 1", () => {
      const state = makeState({ stage: "project_init", step: 5 });
      const next = transition(state, "content_import");
      expect(next.stage).toBe("content_import");
      expect(next.step).toBe(1);
    });

    it("合法转换保留原 state 其他字段（不可变性）", () => {
      const state = makeState({
        stage: "content_import",
        rawText: "小说内容",
        segments: [],
      });
      const next = transition(state, "character_manage");
      expect(next.rawText).toBe("小说内容");
      expect(state.stage).toBe("content_import"); // 原 state 未被修改
    });

    it.each([
      ["project_init", "done"],
      ["project_init", "character_manage"],
      ["character_manage", "generation"],
      ["content_import", "review"],
      ["generation", "project_init"],
      ["done", "project_init"],
      ["done", "content_import"],
    ] as [PipelineStage, PipelineStage][])(
      "非法转换 %s → %s 抛出错误",
      (from, to) => {
        const state = makeState({ stage: from });
        expect(() => transition(state, to)).toThrow(/状态转换不合法/);
      },
    );

    it("done 是终态，无合法后继", () => {
      expect(VALID_TRANSITIONS.done).toEqual([]);
    });

    it("STAGE_ORDER 包含 10 个阶段，无重复", () => {
      expect(STAGE_ORDER).toHaveLength(10);
      expect(new Set(STAGE_ORDER).size).toBe(STAGE_ORDER.length);
    });
  });

  // ============================================================================
  // 3. retryStage
  // ============================================================================

  describe("3. retryStage（失败恢复）", () => {
    it("可回退到当前阶段（重做）", () => {
      const state = makeState({ stage: "character_manage", step: 5 });
      const next = retryStage(state, "character_manage");
      expect(next.stage).toBe("character_manage");
      expect(next.step).toBe(1);
    });

    it("可回退到之前的阶段", () => {
      const state = makeState({ stage: "review" });
      const next = retryStage(state, "content_import");
      expect(next.stage).toBe("content_import");
      expect(next.step).toBe(1);
    });

    it("重试时清空该阶段的 stepData", () => {
      const state = makeState({
        stage: "character_manage",
        stepData: {
          content_import: { foo: "bar" },
          character_manage: { baz: "qux" },
        },
      });
      const next = retryStage(state, "content_import");
      expect(next.stepData?.content_import).toBeUndefined();
      // 其他阶段的 stepData 保留
      expect(next.stepData?.character_manage).toEqual({ baz: "qux" });
    });

    it("不能向前重试（目标阶段在当前之后）", () => {
      const state = makeState({ stage: "content_import" });
      expect(() => retryStage(state, "character_manage")).toThrow(/无法重试阶段/);
    });

    it("不能向前重试到 done", () => {
      const state = makeState({ stage: "generation" });
      // generation → done 是合法转换，但 retryStage 语义是"重做"，done 不可重试
      // 实际 retryStage 允许 retryIndex <= currentIndex，done 在 generation 之后，应抛错
      expect(() => retryStage(state, "done")).toThrow(/无法重试阶段/);
    });

    it("重试保留原 state 其他字段（不可变性）", () => {
      const state = makeState({
        stage: "character_manage",
        rawText: "原文本",
      });
      const next = retryStage(state, "content_import");
      expect(next.rawText).toBe("原文本");
      expect(state.stage).toBe("character_manage");
    });

    it("getRetryableStages 排除 done", () => {
      const stages = getRetryableStages("done");
      expect(stages).not.toContain("done");
      expect(stages).toHaveLength(9);
    });
  });

  // ============================================================================
  // 4. handleFinalizeImport 构建 StoryBeat[] 并调用 storyService.create
  // ============================================================================

  describe("4. handleFinalizeImport 构建 StoryBeat[] 携带原文回溯字段", () => {
    it("调用 storyService.create，beats 携带 sourceText/sourceSegmentId/chapterIndex", async () => {
      const matchedCharId = "char_db_001";
      const matchedSceneId = "scene_db_001";
      const characters: CharacterInPipeline[] = [
        makeCharacterInPipeline({
          name: "林风",
          matchedCharacterId: matchedCharId,
          status: "matched",
        }),
        makeCharacterInPipeline({ name: "苏婉", status: "new" }), // 未匹配
      ];
      const scenes: SceneInPipeline[] = [
        makeSceneInPipeline({
          name: "书房",
          matchedSceneId: matchedSceneId,
          status: "matched",
        }),
        makeSceneInPipeline({ name: "庭院", status: "new" }),
      ];
      const shots: ShotBreakdown[] = [
        {
          id: "shot-1",
          sequence: 1,
          description: "林风推门",
          shotType: "中景",
          cameraAngle: "平视",
          cameraMovement: "推",
          action: "推门",
          characters: ["林风"],
          sceneId: matchedSceneId,
          estimatedDuration: 5,
          status: "draft",
          sourceText: "林风推开破旧的木门",
          sourceSegmentId: "seg-1",
          sourceStartChar: 0,
          sourceEndChar: 12,
          chapterIndex: 1,
          chapterTitle: "第一章",
        },
      ];

      const initialState = makeState({
        stage: "generation", // generation → done 合法
        rawText: NOVEL_TEXT,
        characters,
        scenes,
      });

      let latestState = initialState;
      const setState = vi.fn((updater: unknown) => {
        if (typeof updater === "function") {
          latestState = (updater as (prev: PipelineState) => PipelineState)(latestState);
        } else {
          latestState = updater as PipelineState;
        }
      });
      const setIsImporting = vi.fn();
      const setCurrentProjectId = vi.fn();
      const isMountedRef = { current: true };

      mockStoryServiceCreate.mockResolvedValue({
        ok: true,
        value: { id: "story_new_1", title: "测试小说" },
      });
      mockNovelProjectUpdate.mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useNovelFinalizeImport({
          state: initialState,
          setState: setState as React.Dispatch<React.SetStateAction<PipelineState>>,
          setIsImporting: setIsImporting as React.Dispatch<React.SetStateAction<boolean>>,
          shots,
          currentProjectId: "novel-proj-1",
          setCurrentProjectId,
          isMountedRef,
        }),
      );

      await act(async () => {
        await result.current.handleFinalizeImport();
      });

      // storyService.create 被调用一次
      expect(mockStoryServiceCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockStoryServiceCreate.mock.calls[0]![0] as {
        title: string;
        description: string;
        characters: string[];
        scenes: string[];
        beats: Array<Record<string, unknown>>;
        elementIds: string[];
      };

      // characterIds 只含已匹配（林风），不含未匹配（苏婉）
      expect(callArgs.characters).toEqual([matchedCharId]);
      // sceneIds 只含已匹配
      expect(callArgs.scenes).toEqual([matchedSceneId]);
      // elementIds 为空
      expect(callArgs.elementIds).toEqual([]);

      // beats 携带原文回溯字段
      expect(callArgs.beats).toHaveLength(1);
      const beat = callArgs.beats[0]!;
      expect(beat.sourceText).toBe("林风推开破旧的木门");
      expect(beat.sourceSegmentId).toBe("seg-1");
      expect(beat.sourceStartChar).toBe(0);
      expect(beat.sourceEndChar).toBe(12);
      expect(beat.chapterIndex).toBe(1);
      expect(beat.chapterTitle).toBe("第一章");
      // beat.characterIds 仅含已匹配角色
      expect(beat.characterIds).toEqual([matchedCharId]);
      // beat.sequence 从 1 开始
      expect(beat.sequence).toBe(1);
      // beat.description 来自 shot.description
      expect(beat.description).toBe("林风推门");

      // title 来自 projectName
      expect(callArgs.title).toBe("测试小说");
      // description 来自 rawText 切片
      expect(callArgs.description).toBe(NOVEL_TEXT.slice(0, 500));

      // 状态转换到 done
      expect(latestState.stage).toBe("done");
      // setIsImporting 先 true 后 false
      expect(setIsImporting).toHaveBeenNthCalledWith(1, true);
      expect(setIsImporting).toHaveBeenLastCalledWith(false);
      // 软关联：novelProjectStorage.updateProject 被调用
      expect(mockNovelProjectUpdate).toHaveBeenCalledWith("novel-proj-1", {
        storyId: "story_new_1",
      });
      // currentProjectId 被清空
      expect(setCurrentProjectId).toHaveBeenCalledWith(null);
    });

    it("未匹配实体不纳入 characterIds/sceneIds", async () => {
      const characters: CharacterInPipeline[] = [
        makeCharacterInPipeline({ name: "林风", status: "new" }), // 未匹配
        makeCharacterInPipeline({
          name: "苏婉",
          matchedCharacterId: "char_db_002",
          status: "matched",
        }),
      ];
      const scenes: SceneInPipeline[] = [
        makeSceneInPipeline({ name: "书房", status: "new" }), // 未匹配
      ];
      const shots: ShotBreakdown[] = [
        {
          id: "shot-1",
          sequence: 1,
          description: "场景描述",
          shotType: "中景",
          cameraAngle: "平视",
          cameraMovement: "固定",
          action: "",
          characters: ["林风", "苏婉"], // 林风未匹配、苏婉已匹配
          estimatedDuration: 5,
          status: "draft",
        },
      ];
      const initialState = makeState({
        stage: "generation",
        rawText: NOVEL_TEXT,
        characters,
        scenes,
      });

      let latestState = initialState;
      const setState = vi.fn((updater: unknown) => {
        if (typeof updater === "function") {
          latestState = (updater as (prev: PipelineState) => PipelineState)(latestState);
        }
      });

      mockStoryServiceCreate.mockResolvedValue({
        ok: true,
        value: { id: "story_new_2", title: "测试" },
      });

      const { result } = renderHook(() =>
        useNovelFinalizeImport({
          state: initialState,
          setState: setState as React.Dispatch<React.SetStateAction<PipelineState>>,
          setIsImporting: vi.fn() as React.Dispatch<React.SetStateAction<boolean>>,
          shots,
          currentProjectId: null,
          setCurrentProjectId: vi.fn(),
          isMountedRef: { current: true },
        }),
      );

      await act(async () => {
        await result.current.handleFinalizeImport();
      });

      const callArgs = mockStoryServiceCreate.mock.calls[0]![0] as {
        characters: string[];
        scenes: string[];
        beats: Array<Record<string, unknown>>;
      };
      // 顶层 characterIds 仅含苏婉（已匹配）
      expect(callArgs.characters).toEqual(["char_db_002"]);
      // 顶层 sceneIds 为空（书房未匹配）
      expect(callArgs.scenes).toEqual([]);
      // beat.characterIds 仅含苏婉（林风未匹配被过滤）
      expect(callArgs.beats[0]!.characterIds).toEqual(["char_db_002"]);
      // 状态转换到 done
      expect(latestState.stage).toBe("done");
    });

    it("storyService.create 失败时不转换到 done", async () => {
      const initialState = makeState({
        stage: "generation",
        rawText: NOVEL_TEXT,
        characters: [],
        scenes: [],
      });

      let latestState = initialState;
      const setState = vi.fn((updater: unknown) => {
        if (typeof updater === "function") {
          latestState = (updater as (prev: PipelineState) => PipelineState)(latestState);
        }
      });

      mockStoryServiceCreate.mockResolvedValue({
        ok: false,
        error: { message: "DB 写入失败" },
      });

      const { result } = renderHook(() =>
        useNovelFinalizeImport({
          state: initialState,
          setState: setState as React.Dispatch<React.SetStateAction<PipelineState>>,
          setIsImporting: vi.fn() as React.Dispatch<React.SetStateAction<boolean>>,
          shots: [],
          currentProjectId: null,
          setCurrentProjectId: vi.fn(),
          isMountedRef: { current: true },
        }),
      );

      await act(async () => {
        await result.current.handleFinalizeImport();
      });

      expect(mockStoryServiceCreate).toHaveBeenCalledTimes(1);
      // 失败时不转换到 done，仍停留在 generation
      expect(latestState.stage).toBe("generation");
    });
  });

  // ============================================================================
  // 5. 实体匹配（match-entities 三级匹配 + DB 集成）
  // ============================================================================

  describe("5. 实体匹配：只匹配到 DB 中已存在的实体", () => {
    it("精确匹配 → status=matched, confidence=1.0", async () => {
      mockCharGetAll.mockResolvedValue({
        ok: true,
        value: [{ id: "char_db_001", name: "林风" }],
      });
      mockSceneGetAll.mockResolvedValue({ ok: true, value: [] });

      const result = await matchEntitiesTool.execute(
        {
          charactersJson: JSON.stringify([
            { name: "林风", status: "new" },
            { name: "苏婉", status: "new" },
          ]),
          scenesJson: "[]",
        },
        TOOL_CTX,
      );

      const data = unwrap<{
        characters: CharacterInPipeline[];
        scenes: SceneInPipeline[];
      }>(result);
      const linFeng = data.characters.find((c) => c.name === "林风")!;
      expect(linFeng.status).toBe("matched");
      expect(linFeng.matchedCharacterId).toBe("char_db_001");
      expect(linFeng.matchConfidence).toBe(1.0);
      const suWan = data.characters.find((c) => c.name === "苏婉")!;
      expect(suWan.status).toBe("new");
      expect(suWan.matchedCharacterId).toBeUndefined();
    });

    it("未匹配实体不纳入 characterIds（handleFinalizeImport 集成）", async () => {
      // 已在 "未匹配实体不纳入 characterIds/sceneIds" 用例中验证：
      // - 顶层 characterIds 仅含 matched
      // - beat.characterIds 仅含 matched（shot.characters 中未匹配的 name 被过滤）
      // 此处仅断言 match-entities 自身的 status 划分
      mockCharGetAll.mockResolvedValue({
        ok: true,
        value: [{ id: "char_db_001", name: "林风" }],
      });
      mockSceneGetAll.mockResolvedValue({ ok: true, value: [] });

      const result = await matchEntitiesTool.execute(
        {
          charactersJson: JSON.stringify([
            { name: "林风", status: "new" },
            { name: "未知路人", status: "new" },
          ]),
          scenesJson: "[]",
        },
        TOOL_CTX,
      );

      const data = unwrap<{ characters: CharacterInPipeline[] }>(result);
      const matched = data.characters.filter((c) => c.status === "matched");
      const unmatched = data.characters.filter((c) => c.status === "new");
      expect(matched).toHaveLength(1);
      expect(matched[0]!.name).toBe("林风");
      expect(unmatched).toHaveLength(1);
      expect(unmatched[0]!.matchedCharacterId).toBeUndefined();
    });

    it("DB 无任何实体时全部标记为 new", async () => {
      mockCharGetAll.mockResolvedValue({ ok: true, value: [] });
      mockSceneGetAll.mockResolvedValue({ ok: true, value: [] });

      const result = await matchEntitiesTool.execute(
        {
          charactersJson: JSON.stringify([
            { name: "林风", status: "new" },
            { name: "苏婉", status: "new" },
          ]),
          scenesJson: JSON.stringify([{ name: "书房", status: "new" }]),
        },
        TOOL_CTX,
      );

      const data = unwrap<{
        characters: CharacterInPipeline[];
        scenes: SceneInPipeline[];
      }>(result);
      expect(data.characters.every((c) => c.status === "new")).toBe(true);
      expect(data.scenes.every((s) => s.status === "new")).toBe(true);
    });

    it("characterService.getAll 失败时按空库处理（全部 new）", async () => {
      // match-entities 对 charResult.ok=false 时回退为空数组
      mockCharGetAll.mockResolvedValue({ ok: false, error: { message: "DB 锁" } });
      mockSceneGetAll.mockResolvedValue({ ok: true, value: [] });

      const result = await matchEntitiesTool.execute(
        {
          charactersJson: JSON.stringify([{ name: "林风", status: "new" }]),
          scenesJson: "[]",
        },
        TOOL_CTX,
      );

      const data = unwrap<{ characters: CharacterInPipeline[] }>(result);
      expect(data.characters[0]!.status).toBe("new");
    });
  });
});
