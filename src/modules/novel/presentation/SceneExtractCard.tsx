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
import type { ExtractedScene } from "../domain/types";

export interface SceneExtractCardProps {
  scene: ExtractedScene;
  onEdit: (s: ExtractedScene) => void;
  onConfirm: (id: string) => void;
}

const STATUS_LABEL: Record<ExtractedScene["status"], string> = {
  new: "新场景",
  matched: "已匹配",
  conflict: "冲突",
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
                {STATUS_LABEL[scene.status]}
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
            {scene.type && <div>类型：{scene.type}</div>}
            {scene.location && <div>地点：{scene.location}</div>}
            {scene.timeOfDay && <div>时间：{scene.timeOfDay}</div>}
            {scene.atmosphere && <div>氛围：{scene.atmosphere}</div>}
            {scene.description && (
              <div className="line-clamp-2">{scene.description}</div>
            )}
          </div>

          {/* 匹配置信度 */}
          {scene.matchConfidence !== undefined && (
            <div className="text-[10px] text-muted-foreground mt-1.5">
              匹配置信度：{Math.round(scene.matchConfidence * 100)}%
            </div>
          )}

          {/* 操作按钮 */}
          {!isConfirmed && (
            <div className="flex items-center gap-1 mt-2">
              <button
                type="button"
                onClick={() => onEdit(scene)}
                className="btn btn-ghost text-[11px] px-2 py-1 flex items-center gap-1"
                aria-label="编辑场景"
              >
                <Edit size={10} />
                编辑
              </button>
              <button
                type="button"
                onClick={() => onConfirm(scene.tempId)}
                className="btn btn-ghost text-[11px] px-2 py-1 flex items-center gap-1 text-[var(--primary)]"
                aria-label="确认场景"
              >
                <Check size={10} />
                确认
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
