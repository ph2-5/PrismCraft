/**
 * Task 2A.5 — Step 4-5: 角色/场景审查面板
 *
 * 左右双列表布局：
 * - 左侧：角色列表（CharacterExtractCard[]）
 * - 右侧：场景列表（SceneExtractCard[]）
 *
 * 冲突实体在卡片层高亮（CharacterExtractCard/SceneExtractCard 内部处理）。
 * 顶部显示统计：总数 / 已确认 / 冲突。
 * 底部显示"全部确认"按钮（所有实体已 confirmed 时可继续）。
 */

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Users, MapPin } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type { ExtractedCharacter, ExtractedScene } from "../domain/types";
import { CharacterExtractCard } from "./CharacterExtractCard";
import { SceneExtractCard } from "./SceneExtractCard";

export interface EntityReviewPanelProps {
  characters: ExtractedCharacter[];
  scenes: ExtractedScene[];
  onConfirmCharacter: (id: string) => void;
  onConfirmScene: (id: string) => void;
  onEditCharacter: (c: ExtractedCharacter) => void;
  onEditScene: (s: ExtractedScene) => void;
  onMatchCharacter: (id: string, existingId: string) => void;
  isProcessing: boolean;
}

export function EntityReviewPanel({
  characters,
  scenes,
  onConfirmCharacter,
  onConfirmScene,
  onEditCharacter,
  onEditScene,
  onMatchCharacter,
  isProcessing,
}: EntityReviewPanelProps) {
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
          <div className="text-[12px] font-bold flex items-center gap-1.5">
            <Users size={12} />
            {t("novel.stages.character_manage")}
          </div>
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {characters.length === 0 ? (
              <EmptyState
                icon={Users}
                title={t("novel.entityReview.emptyCharacters")}
                hint={t("novel.entityReview.emptyCharactersHint")}
                compact
              />
            ) : (
              characters.map((c) => (
                <CharacterExtractCard
                  key={c.tempId}
                  character={c}
                  onEdit={onEditCharacter}
                  onConfirm={onConfirmCharacter}
                  onMatch={onMatchCharacter}
                />
              ))
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
    </div>
  );
}
