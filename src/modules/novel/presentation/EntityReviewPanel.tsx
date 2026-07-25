/**
 * Task 2A.5 — Step 4-5: 角色/场景审查面板
 *
 * v5.2 角色管理重构：
 * - 角色列顶部增加三种提取模式入口（手动预填/渐进提取/全文提取）
 * - 所有提取的角色自动创建到 DB 角色库
 * - 同时保留原 ExtractedCharacter 列表（向后兼容，新角色会同步显示在 DB 列表中）
 *
 * v5.2.1 重构：
 * - 移除内部 useProgressiveExtraction 调用，改为从 props 接收 handlers
 * - 移除内部 useCharacters 调用，改为从 props 接收 dbCharacterNames/dbCharacterCount
 * - 现在是纯渲染组件，符合 MainWorkArea 的设计原则
 *
 * 左右双列表布局：
 * - 左侧：角色列表（CharacterExtractCard[]）+ 三种提取模式按钮
 * - 右侧：场景列表（SceneExtractCard[]）
 *
 * 冲突实体在卡片层高亮（CharacterExtractCard/SceneExtractCard 内部处理）。
 * 顶部显示统计：总数 / 已确认 / 冲突。
 * 底部显示"全部确认"按钮（所有实体已 confirmed 时可继续）。
 */

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Users, MapPin, UserPlus, Layers, FileText, Loader2, Filter } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type { ExtractedCharacter, ExtractedScene, Segment } from "../domain/types";
import { CharacterExtractCard } from "./CharacterExtractCard";
import { SceneExtractCard } from "./SceneExtractCard";
import { ManualCharacterInputDialog } from "./ManualCharacterInputDialog";
import { SegmentSelectorDialog } from "./SegmentSelectorDialog";

/** v5.2.2 筛选选项类型 */
type CharacterFilter = "all" | "unconfirmed" | "confirmed" | `chapter:${number}`;

/** 从 DB Character 的 tags 中提取章节序号列表 */
function extractChapterIndices(tags: string[] | undefined): number[] {
  if (!tags) return [];
  const indices: number[] = [];
  for (const tag of tags) {
    const match = /^chapter:(\d+)$/.exec(tag);
    if (match) {
      indices.push(Number(match[1]));
    }
  }
  return indices;
}

export interface EntityReviewPanelProps {
  characters: ExtractedCharacter[];
  scenes: ExtractedScene[];
  /** 全部片段（渐进提取用） */
  segments: Segment[];
  /** 全文文本（全文提取用） */
  rawText: string;
  onConfirmCharacter: (id: string) => void;
  onConfirmScene: (id: string) => void;
  onEditCharacter: (c: ExtractedCharacter) => void;
  onEditScene: (s: ExtractedScene) => void;
  onMatchCharacter: (id: string, existingId: string) => void;
  isProcessing: boolean;
  // v5.2.1 角色管理重构：从 props 接收提取 handlers（由 useNovelPipeline 顶层提供）
  /** 提取处理中状态 */
  isExtracting: boolean;
  /** 提取进度提示 */
  progressHint: string;
  /** DB 角色名列表（用于 CharacterExtractCard 判断角色是否已在库中） */
  dbCharacterNames: string[];
  /** DB 角色总数（用于显示角色库计数） */
  dbCharacterCount: number;
  /** v5.2.2: DB 角色完整列表（用于筛选 — 提取章节信息） */
  dbCharacters?: Array<{ name: string; tags?: string[]; traits?: string[]; source?: string }>;
  /** 手动预填 */
  onManualAdd: (input: {
    name: string;
    gender: string;
    age?: number;
    description: string;
  }) => Promise<void>;
  /** 渐进式提取 */
  onProgressiveExtract: (selectedSegmentIds: string[]) => Promise<void>;
  /** 全文提取 */
  onFullExtract: () => Promise<void>;
  /** 单个 ExtractedCharacter 添加到 DB 角色库 */
  onAddToLibrary: (c: ExtractedCharacter) => Promise<void>;
}

export function EntityReviewPanel({
  characters,
  scenes,
  segments,
  rawText,
  onConfirmCharacter,
  onConfirmScene,
  onEditCharacter,
  onEditScene,
  onMatchCharacter,
  isProcessing,
  // v5.2.1 提取 handlers
  isExtracting,
  progressHint,
  dbCharacterNames,
  dbCharacterCount,
  dbCharacters,
  onManualAdd,
  onProgressiveExtract,
  onFullExtract,
  onAddToLibrary,
}: EntityReviewPanelProps) {
  // 弹窗状态
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [showSegmentSelector, setShowSegmentSelector] = useState(false);
  // v5.2.2: 筛选状态
  const [characterFilter, setCharacterFilter] = useState<CharacterFilter>("all");

  // v5.2.2: 从 DB Characters 提取所有章节选项（用于筛选下拉框）
  const chapterOptions = useMemo(() => {
    const chapterSet = new Set<number>();
    if (dbCharacters) {
      for (const c of dbCharacters) {
        const indices = extractChapterIndices(c.tags);
        for (const idx of indices) chapterSet.add(idx);
      }
    }
    return Array.from(chapterSet).sort((a, b) => a - b);
  }, [dbCharacters]);

  // v5.2.2: 按筛选条件过滤 characters
  const filteredCharacters = useMemo(() => {
    if (characterFilter === "all") return characters;
    if (characterFilter === "unconfirmed") {
      return characters.filter((c) => !c.confirmed);
    }
    if (characterFilter === "confirmed") {
      return characters.filter((c) => c.confirmed);
    }
    // chapter:N 筛选：基于 ExtractedCharacter 的 chapterIndices 或 DB Character 的 tags
    const match = /^chapter:(\d+)$/.exec(characterFilter);
    if (!match) return characters;
    const chapterIdx = Number(match[1]);
    return characters.filter((c) => {
      // 优先用 ExtractedCharacter 自带的 chapterIndices
      if (c.chapterIndices && c.chapterIndices.includes(chapterIdx)) return true;
      // 否则查 DB Character 的 tags
      const dbChar = dbCharacters?.find((dc) => dc.name === c.name);
      if (dbChar) {
        const indices = extractChapterIndices(dbChar.tags);
        return indices.includes(chapterIdx);
      }
      return false;
    });
  }, [characters, characterFilter, dbCharacters]);

  // 统计
  const stats = useMemo(() => {
    const charConfirmed = characters.filter((c) => c.confirmed).length;
    const charConflict = characters.filter((c) => c.status === "conflict" && !c.confirmed).length;
    const sceneConfirmed = scenes.filter((s) => s.confirmed).length;
    const sceneConflict = scenes.filter((s) => s.status === "conflict" && !s.confirmed).length;
    return {
      charTotal: characters.length,
      charConfirmed,
      charConflict,
      sceneTotal: scenes.length,
      sceneConfirmed,
      sceneConflict,
      allConfirmed:
        characters.length > 0 &&
        scenes.length > 0 &&
        charConfirmed === characters.length &&
        sceneConfirmed === scenes.length,
    };
  }, [characters, scenes]);

  return (
    <div className="flex flex-col gap-3 max-w-5xl mx-auto w-full">
      {/* 顶部统计栏 */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1">
            <Users size={11} className="text-muted-foreground" />
            <span>
              {t("novel.entityReview.characterStats", { confirmed: stats.charConfirmed, total: stats.charTotal })}
            </span>
            {stats.charConflict > 0 && (
              <span className="text-destructive flex items-center gap-0.5">
                <AlertTriangle size={10} />
                {t("novel.entityReview.conflict", { count: stats.charConflict })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <MapPin size={11} className="text-muted-foreground" />
            <span>
              {t("novel.entityReview.sceneStats", { confirmed: stats.sceneConfirmed, total: stats.sceneTotal })}
            </span>
            {stats.sceneConflict > 0 && (
              <span className="text-destructive flex items-center gap-0.5">
                <AlertTriangle size={10} />
                {t("novel.entityReview.conflict", { count: stats.sceneConflict })}
              </span>
            )}
          </div>
        </div>
        {stats.allConfirmed && (
          <div className="flex items-center gap-1 text-[11px] text-[var(--primary)]">
            <CheckCircle2 size={12} />
            {t("novel.entityReview.allConfirmed")}
          </div>
        )}
      </div>

      {/* 双列布局 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 左侧：角色列表 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-bold flex items-center gap-1.5">
              <Users size={12} />
              {t("novel.stages.character_manage")}
            </div>
            {/* v5.2：DB 角色库计数 */}
            <div className="text-[10px] text-muted-foreground">
              {t("novel.character.library.count", { count: dbCharacterCount })}
            </div>
          </div>

          {/* v5.2：三种提取模式按钮 + v5.2.2 筛选下拉框 */}
          <div className="flex items-center gap-1 pb-1 flex-wrap">
            <button
              type="button"
              onClick={() => setShowManualDialog(true)}
              disabled={isExtracting || isProcessing}
              className="btn btn-ghost btn-xs flex items-center gap-1"
              title={t("novel.character.extractMode.manualHint")}
            >
              <UserPlus size={11} />
              {t("novel.character.extractMode.manual")}
            </button>
            <button
              type="button"
              onClick={() => setShowSegmentSelector(true)}
              disabled={isExtracting || isProcessing || segments.length === 0}
              className="btn btn-ghost btn-xs flex items-center gap-1"
              title={t("novel.character.extractMode.progressiveHint")}
            >
              <Layers size={11} />
              {t("novel.character.extractMode.progressive")}
            </button>
            <button
              type="button"
              onClick={() => void onFullExtract()}
              disabled={isExtracting || isProcessing || !rawText.trim()}
              className="btn btn-ghost btn-xs flex items-center gap-1"
              title={t("novel.character.extractMode.fullHint")}
            >
              <FileText size={11} />
              {t("novel.character.extractMode.full")}
            </button>
            {/* v5.2.2: 筛选下拉框 */}
            <div className="flex items-center gap-1 ml-auto">
              <Filter size={11} className="text-muted-foreground" />
              <select
                value={characterFilter}
                onChange={(e) => setCharacterFilter(e.target.value as CharacterFilter)}
                className="text-[11px] bg-card border border-border rounded px-1 py-0.5"
                aria-label={t("novel.character.filter.ariaLabel")}
              >
                <option value="all">{t("novel.character.filter.all")}</option>
                <option value="unconfirmed">{t("novel.character.filter.unconfirmed")}</option>
                <option value="confirmed">{t("novel.character.filter.confirmed")}</option>
                {chapterOptions.length > 0 && (
                  <optgroup label={t("novel.character.filter.byChapter")}>
                    {chapterOptions.map((idx) => (
                      <option key={idx} value={`chapter:${idx}`}>
                        {t("novel.character.filter.chapterN", { n: idx })}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* v5.2：提取进度提示 */}
          {(isExtracting || progressHint) && (
            <div className="text-[11px] text-[var(--primary)] flex items-center gap-1 px-1 py-0.5">
              {isExtracting && <Loader2 size={11} className="animate-spin" />}
              {progressHint || t("novel.controls.processing")}
            </div>
          )}

          {/* v5.2.2: 筛选结果计数（仅在筛选非 all 时显示） */}
          {characterFilter !== "all" && (
            <div className="text-[10px] text-muted-foreground px-1">
              {t("novel.character.filter.resultCount", {
                shown: filteredCharacters.length,
                total: characters.length,
              })}
            </div>
          )}

          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {characters.length === 0 ? (
              <EmptyState
                icon={Users}
                title={t("novel.character.library.empty")}
                compact
              />
            ) : filteredCharacters.length === 0 ? (
              <EmptyState
                icon={Filter}
                title={t("novel.character.filter.noResult")}
                compact
              />
            ) : (
              filteredCharacters.map((c) => {
                // v5.2.2: 查找 DB Character 的 traits（外观标签）
                const dbChar = dbCharacters?.find((dc) => dc.name === c.name);
                return (
                  <CharacterExtractCard
                    key={c.tempId}
                    character={c}
                    onEdit={onEditCharacter}
                    onConfirm={onConfirmCharacter}
                    onMatch={onMatchCharacter}
                    // v5.2.1：传递"添加到角色库"handler + DB 角色名列表
                    onAddToLibrary={onAddToLibrary}
                    dbCharacterNames={dbCharacterNames}
                    // v5.2.2：传递外观标签（来自 DB Character 的 traits）
                    appearanceTags={dbChar?.traits}
                    // v5.2.2：传递来源标签（来自 DB Character 的 tags）
                    sourceTags={dbChar?.tags}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* 右侧：场景列表 */}
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-bold flex items-center gap-1.5">
            <MapPin size={12} />
            {t("novel.stages.scene_manage")}
          </div>
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {scenes.length === 0 ? (
              <EmptyState
                icon={MapPin}
                title={t("novel.entityReview.emptyScenes")}
                hint={t("novel.entityReview.emptyScenesHint")}
                compact
              />
            ) : (
              scenes.map((s) => (
                <SceneExtractCard
                  key={s.tempId}
                  scene={s}
                  onEdit={onEditScene}
                  onConfirm={onConfirmScene}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* 处理中提示 */}
      {isProcessing && (
        <div className="text-[11px] text-muted-foreground text-center">
          {t("novel.controls.processing")}
        </div>
      )}

      {/* v5.2：手动预填弹窗 */}
      <ManualCharacterInputDialog
        open={showManualDialog}
        onClose={() => setShowManualDialog(false)}
        onSubmit={(input) => void onManualAdd(input)}
        existingNames={dbCharacterNames}
      />

      {/* v5.2：片段选择弹窗 */}
      <SegmentSelectorDialog
        open={showSegmentSelector}
        onClose={() => setShowSegmentSelector(false)}
        segments={segments}
        onSubmit={(selectedIds) => void onProgressiveExtract(selectedIds)}
      />
    </div>
  );
}
