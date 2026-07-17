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
 */

import { Edit, Check, Link2, User } from "lucide-react";
import type { ExtractedCharacter } from "../domain/types";

export interface CharacterExtractCardProps {
  character: ExtractedCharacter;
  onEdit: (c: ExtractedCharacter) => void;
  onConfirm: (id: string) => void;
  onMatch: (id: string, existingId: string) => void;
}

const STATUS_LABEL: Record<ExtractedCharacter["status"], string> = {
  new: "新角色",
  matched: "已匹配",
  conflict: "冲突",
};

const STATUS_BADGE: Record<ExtractedCharacter["status"], string> = {
  new: "badge-info",
  matched: "badge-success",
  conflict: "badge-error",
};

export function CharacterExtractCard({
  character,
  onEdit,
  onConfirm,
  onMatch,
}: CharacterExtractCardProps) {
  const isConflict = character.status === "conflict";
  const isConfirmed = character.confirmed;

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
                {STATUS_LABEL[character.status]}
              </span>
              {isConfirmed && (
                <span className="badge badge-success text-[9px] px-1.5 py-0.5">
                  <Check size={9} className="mr-0.5" />已确认
                </span>
              )}
            </div>
          </div>

          {/* 详细信息 */}
          <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
            {character.gender && <div>性别：{character.gender}</div>}
            {character.age !== undefined && <div>年龄：{character.age}</div>}
            {character.description && (
              <div className="line-clamp-2">{character.description}</div>
            )}
            {character.appearance.clothing && <div>服装：{character.appearance.clothing}</div>}
            {character.firstAppearance && (
              <div className="text-[10px] opacity-70">首次出现：{character.firstAppearance}</div>
            )}
          </div>

          {/* 匹配置信度（如果有） */}
          {character.matchConfidence !== undefined && (
            <div className="text-[10px] text-muted-foreground mt-1.5">
              匹配置信度：{Math.round(character.matchConfidence * 100)}%
            </div>
          )}

          {/* 操作按钮 */}
          {!isConfirmed && (
            <div className="flex items-center gap-1 mt-2">
              <button
                type="button"
                onClick={() => onEdit(character)}
                className="btn btn-ghost text-[11px] px-2 py-1 flex items-center gap-1"
                aria-label="编辑角色"
              >
                <Edit size={10} />
                编辑
              </button>
              <button
                type="button"
                onClick={() => onConfirm(character.tempId)}
                className="btn btn-ghost text-[11px] px-2 py-1 flex items-center gap-1 text-[var(--primary)]"
                aria-label="确认角色"
              >
                <Check size={10} />
                确认
              </button>
              {isConflict && (
                <button
                  type="button"
                  onClick={() => onMatch(character.tempId, "")}
                  className="btn btn-ghost text-[11px] px-2 py-1 flex items-center gap-1"
                  aria-label="手动匹配"
                >
                  <Link2 size={10} />
                  手动匹配
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
