/**
 * Task 2A.5 — 提取的场景卡片
 *
 * 显示 ExtractedScene 的关键信息，根据 status 高亮：
 * - new: 新提取（蓝色 badge）
 * - matched: 已匹配现有场景（绿色 badge）
 * - conflict: 匹配冲突（红色 badge + 边框）
 *
 * 操作：
 * - onEdit: 编辑场景信息
 * - onConfirm: 确认场景
 */

import { Edit, Check, MapPin } from "lucide-react";
import { t } from "@/shared/constants";
import type { ExtractedScene } from "../domain/types";

export interface SceneExtractCardProps {
  scene: ExtractedScene;
  onEdit: (s: ExtractedScene) => void;
  onConfirm: (id: string) => void;
}

const STATUS_LABEL_KEY: Record<ExtractedScene["status"], string> = {
  new: "novel.sceneExtract.statusNew",
  matched: "novel.sceneExtract.statusMatched",
  conflict: "novel.sceneExtract.statusConflict",
};

const STATUS_BADGE: Record<ExtractedScene["status"], string> = {
  new: "badge-info",
  matched: "badge-success",
  conflict: "badge-error",
};

export function SceneExtractCard({ scene, onEdit, onConfirm }: SceneExtractCardProps) {
  const isConflict = scene.status === "conflict";
  const isConfirmed = scene.confirmed;

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
          <MapPin size={14} className="text-[var(--primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          {/* 标题行 */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-bold truncate">{scene.name}</div>
            <div className="flex items-center gap-1 shrink-0">
              <span className={`badge ${STATUS_BADGE[scene.status]} text-[9px] px-1.5 py-0.5`}>
                {t(STATUS_LABEL_KEY[scene.status])}
              </span>
              {isConfirmed && (
                <span className="badge badge-success text-[9px] px-1.5 py-0.5">
                  <Check size={9} className="mr-0.5" />{t("novel.sceneExtract.confirmed")}
                </span>
              )}
            </div>
          </div>

          {/* 详细信息 */}
          <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
            {scene.type && <div>{t("novel.sceneExtract.type", { value: scene.type })}</div>}
            {scene.location && <div>{t("novel.sceneExtract.location", { value: scene.location })}</div>}
            {scene.timeOfDay && <div>{t("novel.sceneExtract.timeOfDay", { value: scene.timeOfDay })}</div>}
            {scene.atmosphere && <div>{t("novel.sceneExtract.atmosphere", { value: scene.atmosphere })}</div>}
            {scene.description && (
              <div className="line-clamp-2">{scene.description}</div>
            )}
          </div>

          {/* 匹配置信度 */}
          {scene.matchConfidence !== undefined && (
            <div className="text-[10px] text-muted-foreground mt-1.5">
              {t("novel.sceneExtract.matchConfidence", { percent: Math.round(scene.matchConfidence * 100) })}
            </div>
          )}

          {/* 操作按钮 */}
          {!isConfirmed && (
            <div className="flex items-center gap-1 mt-2">
              <button
                type="button"
                onClick={() => onEdit(scene)}
                className="btn btn-ghost text-[11px] px-2 py-1 flex items-center gap-1"
                aria-label={t("novel.sceneExtract.editAriaLabel")}
              >
                <Edit size={10} />
                {t("novel.sceneExtract.edit")}
              </button>
              <button
                type="button"
                onClick={() => onConfirm(scene.tempId)}
                className="btn btn-ghost text-[11px] px-2 py-1 flex items-center gap-1 text-[var(--primary)]"
                aria-label={t("novel.sceneExtract.confirmAriaLabel")}
              >
                <Check size={10} />
                {t("novel.sceneExtract.confirm")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
