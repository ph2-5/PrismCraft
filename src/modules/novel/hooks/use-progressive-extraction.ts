/**
 * v5.2 角色管理重构 — 渐进式提取 Hook
 *
 * 三种提取模式的实现：
 * 1. 手动预填：用户输入 → 直接创建到 DB 角色库
 * 2. 渐进式提取：选片段 → AI 提取 → 创建到 DB 角色库
 * 3. 全文提取：AI 提取全文 → 创建到 DB 角色库
 *
 * 额外方法：
 * 4. handleAddToLibrary：将单个 ExtractedCharacter 创建到 DB（CharacterExtractCard 用）
 *
 * 所有提取的角色都自动创建到 DB（通过 useCreateCharacter），
 * 不再维护独立的 ExtractedCharacter 列表。
 *
 * 与项目角色库的关系：
 * - 角色"始终来自 DB"（useCharacters 读取）
 * - AI 提取只是"自动创建到 DB"的入口
 * - 用户可在角色管理中直接编辑 DB 角色（通过 CharacterEditor）
 *
 * v5.2.1：内部调用 useCharacters() 获取 DB 角色名列表，
 * 由 useNovelPipeline 顶层调用并向下传递，避免 EntityReviewPanel 自身耦合 hook。
 */

import { useCallback, useState } from "react";
import { useCreateCharacter, useCharacters, defaultCharacter } from "@/modules/character";
import type { Character } from "@/domain/schemas";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { errorLogger } from "@/shared/error-logger";
import { extractCharactersFromTextTool } from "../tools";
import type { ToolContext } from "@/domain/types/agent-tools";
import type { Segment, ExtractedCharacter } from "../domain/types";

/** Novel 工具调用时使用的最小 ToolContext */
const TOOL_CTX: ToolContext = { sessionId: "novel-pipeline" };

export interface UseProgressiveExtractionOptions {
  /** 全部片段列表（渐进提取用） */
  segments: Segment[];
  /** 全文文本（全文提取用） */
  rawText: string;
}

export interface UseProgressiveExtractionResult {
  /** 处理中状态 */
  isExtracting: boolean;
  /** 进度提示（如"正在提取第 2/5 段..."） */
  progressHint: string;
  /** DB 角色名列表（去重判断 + UI 显示已存在角色） */
  dbCharacterNames: string[];
  /** 手动预填：创建一个新角色到 DB */
  handleManualAdd: (input: {
    name: string;
    gender: string;
    age?: number;
    description: string;
  }) => Promise<void>;
  /** 渐进式提取：对选中片段循环 AI 提取 + 创建到 DB */
  handleProgressiveExtract: (selectedSegmentIds: string[]) => Promise<void>;
  /** 全文提取：AI 提取全文 + 创建到 DB */
  handleFullExtract: () => Promise<void>;
  /** 单个 ExtractedCharacter 添加到 DB 角色库（CharacterExtractCard 用） */
  handleAddToLibrary: (c: ExtractedCharacter) => Promise<void>;
}

/**
 * v5.2.2 Phase 2: 来源信息（用于填充 DB Character 的 source/tags/traits 字段）
 */
export interface SourceInfo {
  segmentId: string;
  segmentTitle: string;
  chapterIndex?: number;
  chapterTitle?: string;
}

/**
 * 将 ExtractedCharacter 转换为 CreateCharacterInput
 * v5.2.2: 填充 source/tags/traits 字段（Phase 2 来源与外观标签）
 */
function extractedToCreateInput(
  c: ExtractedCharacter,
  sourceInfo?: SourceInfo,
): Omit<Character, "id"> {
  // v5.2.2: 构造来源标签
  const tags: string[] = [];
  if (sourceInfo?.chapterIndex !== undefined) {
    tags.push(`chapter:${sourceInfo.chapterIndex}`);
  }
  if (sourceInfo?.chapterTitle) {
    tags.push(`chapterTitle:${sourceInfo.chapterTitle}`);
  }
  if (sourceInfo?.segmentId) {
    tags.push(`segment:${sourceInfo.segmentId}`);
  }
  // 合并 ExtractedCharacter 自带的 chapterIndices
  if (c.chapterIndices && c.chapterIndices.length > 0) {
    for (const idx of c.chapterIndices) {
      const tag = `chapter:${idx}`;
      if (!tags.includes(tag)) tags.push(tag);
    }
  }

  return {
    ...defaultCharacter,
    name: c.name,
    gender: c.gender || "unknown",
    age: c.age,
    description: c.description,
    personality: c.personality,
    appearance: {
      hairColor: c.appearance.hairColor ?? "",
      hairStyle: c.appearance.hairStyle ?? "",
      eyeColor: c.appearance.eyeColor ?? "",
      height: c.appearance.height ?? "",
      build: c.appearance.build ?? "",
      clothing: c.appearance.clothing ?? "",
    },
    style: "",
    prompt: "",
    // v5.2.2 Phase 2: 来源与外观标签
    source: "novel-extraction",
    tags: tags.length > 0 ? tags : undefined,
    traits: c.appearanceTags && c.appearanceTags.length > 0 ? c.appearanceTags : undefined,
  };
}

/**
 * 提取单个片段的角色并批量创建到 DB。
 * 提取自 handleProgressiveExtract 以降低嵌套深度。
 *
 * v5.2.2: 接收 sourceInfo，为 ExtractedCharacter 填充来源字段，并传给 batchCreateToDb
 *
 * @returns 实际创建到 DB 的角色数
 */
async function extractSegmentCharacters(
  seg: Segment,
  existingNames: Set<string>,
  batchCreateToDb: (
    extracted: ExtractedCharacter[],
    existingNames: Set<string>,
    sourceInfo?: SourceInfo,
  ) => Promise<number>,
): Promise<number> {
  try {
    const result = await extractCharactersFromTextTool.execute(
      {
        text: seg.text,
        existingNamesJson: JSON.stringify(Array.from(existingNames)),
      },
      TOOL_CTX,
    );

    if (!result.success || !result.data) return 0;
    const data = result.data as { characters: ExtractedCharacter[] };
    if (!Array.isArray(data.characters)) return 0;

    // v5.2.2: 为每个 ExtractedCharacter 填充来源信息
    const sourceInfo: SourceInfo = {
      segmentId: seg.id,
      segmentTitle: seg.title,
      chapterIndex: seg.chapterIndex,
      chapterTitle: seg.chapterTitle,
    };
    const enriched = data.characters.map((c) => ({
      ...c,
      sourceSegmentIds: [...(c.sourceSegmentIds ?? []), seg.id],
      chapterIndices: seg.chapterIndex !== undefined
        ? [...(c.chapterIndices ?? []), seg.chapterIndex]
        : c.chapterIndices,
    }));

    return await batchCreateToDb(enriched, existingNames, sourceInfo);
  } catch (err) {
    errorLogger.error(
      `[useProgressiveExtraction] 提取片段 ${seg.title} 失败:`,
      err,
    );
    return 0;
  }
}

export function useProgressiveExtraction({
  segments,
  rawText,
}: UseProgressiveExtractionOptions): UseProgressiveExtractionResult {
  const createCharacter = useCreateCharacter();
  // v5.2.1：内部读取 DB 角色库，避免调用方传入 existingCharacterNames
  const { data: dbCharacters = [] } = useCharacters();
  const dbCharacterNames = dbCharacters.map((c) => c.name);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progressHint, setProgressHint] = useState("");

  /**
   * 批量创建角色到 DB（去重 + 跳过已存在的同名角色）
   * v5.2.2: 接收 sourceInfo，填充 DB Character 的 source/tags/traits
   * @returns 实际创建的角色数
   */
  const batchCreateToDb = useCallback(
    async (
      extracted: ExtractedCharacter[],
      existingNames: Set<string>,
      sourceInfo?: SourceInfo,
    ): Promise<number> => {
      let created = 0;
      for (const c of extracted) {
        const name = c.name.trim();
        if (!name || existingNames.has(name)) continue;
        try {
          await createCharacter.mutateAsync(extractedToCreateInput(c, sourceInfo));
          existingNames.add(name);
          created++;
        } catch (err) {
          // 单个角色创建失败不阻塞整体流程
          errorLogger.error(`[useProgressiveExtraction] 创建角色 ${name} 失败:`, err);
        }
      }
      return created;
    },
    [createCharacter],
  );

  /** 手动预填：直接创建到 DB */
  const handleManualAdd = useCallback(
    async (input: {
      name: string;
      gender: string;
      age?: number;
      description: string;
    }) => {
      try {
        const newChar = {
          ...defaultCharacter,
          name: input.name,
          gender: input.gender,
          age: input.age,
          description: input.description,
          style: "",
          prompt: "",
        };
        await createCharacter.mutateAsync(newChar);
        emitToast("success", t("novel.character.manual.added", { name: input.name }));
      } catch (err) {
        emitToast("error", t("novel.character.manual.addFailed"));
        errorLogger.error("[useProgressiveExtraction] 手动预填失败:", err);
      }
    },
    [createCharacter],
  );

  /** 渐进式提取：对选中片段循环 AI 提取 + 创建到 DB */
  const handleProgressiveExtract = useCallback(
    async (selectedSegmentIds: string[]) => {
      if (selectedSegmentIds.length === 0) return;
      setIsExtracting(true);
      try {
        const existingNames = new Set(dbCharacterNames);
        let totalCreated = 0;

        for (let i = 0; i < selectedSegmentIds.length; i++) {
          const segId = selectedSegmentIds[i]!;
          const seg = segments.find((s) => s.id === segId);
          if (!seg) continue;

          setProgressHint(
            t("novel.character.progressive.progress", {
              current: i + 1,
              total: selectedSegmentIds.length,
              title: seg.title,
            }),
          );

          totalCreated += await extractSegmentCharacters(seg, existingNames, batchCreateToDb);
        }

        setProgressHint("");
        if (totalCreated > 0) {
          emitToast(
            "success",
            t("novel.character.progressive.done", { count: totalCreated }),
          );
        } else {
          emitToast("info", t("novel.character.progressive.noNew"));
        }
      } finally {
        setIsExtracting(false);
        setProgressHint("");
      }
    },
    [segments, dbCharacterNames, batchCreateToDb],
  );

  /** 全文提取：AI 提取全文 + 创建到 DB */
  const handleFullExtract = useCallback(async () => {
    if (!rawText.trim()) {
      emitToast("warning", t("novel.character.fullExtract.empty"));
      return;
    }
    setIsExtracting(true);
    setProgressHint(t("novel.character.fullExtract.progress"));
    try {
      const existingNames = new Set(dbCharacterNames);
      const result = await extractCharactersFromTextTool.execute(
        {
          text: rawText,
          existingNamesJson: JSON.stringify(Array.from(existingNames)),
        },
        TOOL_CTX,
      );

      if (result.success && result.data) {
        const data = result.data as { characters: ExtractedCharacter[] };
        if (Array.isArray(data.characters)) {
          const created = await batchCreateToDb(data.characters, existingNames);
          if (created > 0) {
            emitToast(
              "success",
              t("novel.character.fullExtract.done", { count: created }),
            );
          } else {
            emitToast("info", t("novel.character.fullExtract.noNew"));
          }
        }
      } else {
        emitToast("error", t("novel.character.fullExtract.failed"));
      }
    } catch (err) {
      errorLogger.error("[useProgressiveExtraction] 全文提取失败:", err);
      emitToast("error", t("novel.character.fullExtract.failed"));
    } finally {
      setIsExtracting(false);
      setProgressHint("");
    }
  }, [rawText, dbCharacterNames, batchCreateToDb]);

  /** 单个 ExtractedCharacter 添加到 DB 角色库（CharacterExtractCard 用） */
  const handleAddToLibrary = useCallback(
    async (c: ExtractedCharacter) => {
      const name = c.name.trim();
      if (!name) {
        emitToast("warning", t("novel.character.addToLibrary.nameEmpty"));
        return;
      }
      if (dbCharacterNames.includes(name)) {
        emitToast("info", t("novel.character.addToLibrary.exists", { name }));
        return;
      }
      try {
        await createCharacter.mutateAsync(extractedToCreateInput(c));
        emitToast(
          "success",
          t("novel.character.addToLibrary.added", { name }),
        );
      } catch (err) {
        emitToast("error", t("novel.character.addToLibrary.failed", { name }));
        errorLogger.error(`[useProgressiveExtraction] 添加角色 ${name} 到库失败:`, err);
      }
    },
    [createCharacter, dbCharacterNames],
  );

  return {
    isExtracting,
    progressHint,
    dbCharacterNames,
    handleManualAdd,
    handleProgressiveExtract,
    handleFullExtract,
    handleAddToLibrary,
  };
}
