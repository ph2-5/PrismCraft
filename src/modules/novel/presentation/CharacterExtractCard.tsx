/**
 * Task 2A.5 — 提取的角色卡片
 *
 * 显示 ExtractedCharacter 的关键信息，根据 status 高亮：
 * - new: 新提取（蓝色 badge）
 * - matched: 已匹配现有角色（绿色 badge）
 * - conflict: 匹配冲突（红色 badge + 边框）
 *
 * 操作：
 * - onEdit: 编辑角色信息
 * - onConfirm: 确认角色（标记 confirmed=true）
 * - onMatch: 手动匹配到现有角色
 * - onAddToLibrary: 添加到 DB 角色库（v5.2.1 新增）
 *
 * v5.2.1：根据 dbCharacterNames 判断角色是否已在 DB 中：
 * - 已在 DB 中：隐藏"添加到角色库"按钮，显示"已在角色库"标记
 * - 不在 DB 中：显示"添加到角色库"按钮
 */

import { Edit, Check, Link2, User, BookPlus, Tag, Sparkles } from "lucide-react";
import { t } from "@/shared/constants";
import type { ExtractedCharacter } from "../domain/types";

export interface CharacterExtractCardProps {
  character: ExtractedCharacter;
  onEdit: (c: ExtractedCharacter) => void;
  onConfirm: (id: string) => void;
  onMatch: (id: string, existingId: string) => void;
  /** v5.2.1：添加到 DB 角色库 */
  onAddToLibrary?: (c: ExtractedCharacter) => Promise<void>;
  /** v5.2.1：DB 角色名列表（判断是否已在库中） */
  dbCharacterNames?: string[];
  /** v5.2.2: 外观标签（来自 DB Character 的 traits） */
  appearanceTags?: string[];
  /** v5.2.2: 来源标签（来自 DB Character 的 tags，格式如 "chapter:1"） */
  sourceTags?: string[];
}

const STATUS_LABEL_KEY: Record<ExtractedCharacter["status"], string> = {
  new: "novel.characterExtract.statusNew",
  matched: "novel.characterExtract.statusMatched",
  conflict: "novel.characterExtract.statusConflict",
};

const STATUS_BADGE: Record<ExtractedCharacter["status"], string> = {
  new: "badge-info",
  matched: "badge-success",
  conflict: "badge-error",
};

/** v5.2.2: 从 sourceTags（DB Character.tags）提取章节序号列表 */
function extractChapterIndicesFromTags(tags: string[] | undefined): number[] {
  if (!tags) return [];
  const indices: number[] = [];
  for (const tag of tags) {
    const match = /^chapter:(\d+)$/.exec(tag);
    if (match) indices.push(Number(match[1]));
  }
  return indices;
}

/** v5.2.2: 合并来源章节序号（DB tags + ExtractedCharacter.chapterIndices），去重并排序 */
function mergeChapterIndices(
  sourceTags: string[] | undefined,
  character: ExtractedCharacter,
): number[] {
  const indices = new Set<number>();
  for (const idx of extractChapterIndicesFromTags(sourceTags)) indices.add(idx);
  if (character.chapterIndices) {
    for (const idx of character.chapterIndices) indices.add(idx);
  }
  return Array.from(indices).sort((a, b) => a - b);
}

/** v5.2.2: 合并外观标签（DB traits + ExtractedCharacter.appearanceTags），去重 */
function mergeAppearanceTags(
  dbTraits: string[] | undefined,
  character: ExtractedCharacter,
): string[] {
  const tags = new Set<string>();
  if (dbTraits) {
    for (const tag of dbTraits) tags.add(tag);
  }
  if (character.appearanceTags) {
    for (const tag of character.appearanceTags) tags.add(tag);
  }
  return Array.from(tags);
}

export function CharacterExtractCard({
  character,
  onEdit,
  onConfirm,
  onMatch,
  onAddToLibrary,
  dbCharacterNames,
  appearanceTags,
  sourceTags,
}: CharacterExtractCardProps) {
  const isConflict = character.status === "conflict";
  const isConfirmed = character.confirmed;
  // v5.2.1：判断角色是否已在 DB 角色库中
  const isInLibrary = dbCharacterNames
    ? dbCharacterNames.includes(character.name.trim())
    : false;

  // v5.2.2: 合并来源章节序号 + 外观标签
  const chapterIndices = mergeChapterIndices(sourceTags, character);
  const allAppearanceTags = mergeAppearanceTags(appearanceTags, character);

  return (
    <div
      className={[
        "card p-3 transition-all",
        isConflict ? "border-destructive ring-1 ring-destructive/40" : "",
        isConfirmed ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 w-7 h-7 rounded-full bg-[rgba(var(--primary-rgb),0.1)] flex items-center justify-center shrink-0">
          <User size={14} className="text-[var(--primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          {/* 标题行：名称 + 状态 badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-bold truncate">{character.name}</div>
            <div className="flex items-center gap-1 shrink-0">
              <span className={`badge ${STATUS_BADGE[character.status]} text-[9px] px-1.5 py-0.5`}>
                {t(STATUS_LABEL_KEY[character.status])}
              </span>
              {isConfirmed && (
                <span className="badge badge-success text-[9px] px-1.5 py-0.5">
                  <Check size={9} className="mr-0.5" />{t("novel.characterExtract.confirmed")}
                </span>
              )}
              {/* v5.2.1：已在角色库标记 */}
              {isInLibrary && (
                <span className="badge badge-success text-[9px] px-1.5 py-0.5">
                  <Check size={9} className="mr-0.5" />{t("novel.characterExtract.inLibrary")}
                </span>
              )}
            </div>
          </div>

          {/* 详细信息 */}
          <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
            {character.gender && <div>{t("novel.characterExtract.gender", { value: character.gender })}</div>}
            {character.age !== undefined && <div>{t("novel.characterExtract.age", { value: character.age })}</div>}
            {character.description && (
              <div className="line-clamp-2">{character.description}</div>
            )}
            {character.appearance.clothing && <div>{t("novel.characterExtract.clothing", { value: character.appearance.clothing })}</div>}
            {character.firstAppearance && (
              <div className="text-[10px] opacity-70">{t("novel.characterExtract.firstAppearance", { value: character.firstAppearance })}</div>
            )}
          </div>

          {/* 匹配置信度（如果有） */}
          {character.matchConfidence !== undefined && (
            <div className="text-[10px] text-muted-foreground mt-1.5">
              {t("novel.characterExtract.matchConfidence", { percent: Math.round(character.matchConfidence * 100) })}
            </div>
          )}

          {/* v5.2.2: 章节来源标签 */}
          {chapterIndices.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              <Tag size={9} className="text-muted-foreground shrink-0" />
              {chapterIndices.map((idx) => (
                <span
                  key={idx}
                  className="badge badge-info text-[9px] px-1 py-0"
                  title={t("novel.characterExtract.chapterTagHint", { n: idx })}
                >
                  {t("novel.characterExtract.chapterTag", { n: idx })}
                </span>
              ))}
            </div>
          )}

          {/* v5.2.2: 外观标签（appearance tags） */}
          {allAppearanceTags.length > 0 && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <Sparkles size={9} className="text-[var(--primary)] shrink-0" />
              {allAppearanceTags.map((tag) => (
                <span
                  key={tag}
                  className="badge badge-success text-[9px] px-1 py-0"
                  title={t("novel.characterExtract.appearanceTagHint")}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 操作按钮 */}
          {!isConfirmed && (
            <div className="flex items-center gap-1 mt-2">
              <button
                type="button"
                onClick={() => onEdit(character)}
                className="btn btn-ghost text-[11px] px-2 py-1 flex items-center gap-1"
                aria-label={t("novel.characterExtract.editAriaLabel")}
              >
                <Edit size={10} />
                {t("novel.characterExtract.edit")}
              </button>
              <button
                type="button"
                onClick={() => onConfirm(character.tempId)}
                className="btn btn-ghost text-[11px] px-2 py-1 flex items-center gap-1 text-[var(--primary)]"
                aria-label={t("novel.characterExtract.confirmAriaLabel")}
              >
                <Check size={10} />
                {t("novel.characterExtract.confirm")}
              </button>
              {isConflict && (
                <button
                  type="button"
                  onClick={() => onMatch(character.tempId, "")}
                  className="btn btn-ghost text-[11px] px-2 py-1 flex items-center gap-1"
                  aria-label={t("novel.characterExtract.match")}
                >
                  <Link2 size={10} />
                  {t("novel.characterExtract.match")}
                </button>
              )}
              {/* v5.2.1：添加到角色库按钮（仅在不在库中时显示） */}
              {onAddToLibrary && !isInLibrary && (
                <button
                  type="button"
                  onClick={() => void onAddToLibrary(character)}
                  className="btn btn-ghost text-[11px] px-2 py-1 flex items-center gap-1 text-[var(--primary)]"
                  aria-label={t("novel.characterExtract.addToLibraryAriaLabel")}
                  title={t("novel.character.addToLibrary.tooltip")}
                >
                  <BookPlus size={10} />
                  {t("novel.characterExtract.addToLibrary")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
