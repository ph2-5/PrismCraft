/**
 * Task 2A.5 — 单个分镜卡片
 *
 * 显示 ShotBreakdown 的关键信息：
 * - 序号 + 镜头类型 + 时长
 * - 描述 + 动作
 * - 角色 + 场景引用
 * - 提示词预览（en/zh）
 *
 * 操作：onEdit 进入编辑模式
 */

import { Edit, Clock, Clapperboard, Users, MapPin } from "lucide-react";
import { t } from "@/shared/constants";
import type { ShotBreakdown } from "../domain/types";

export interface ShotCardProps {
  shot: ShotBreakdown;
  onEdit: (shot: ShotBreakdown) => void;
}

const STATUS_BADGE: Record<ShotBreakdown["status"], string> = {
  draft: "badge-info",
  edited: "badge-warning",
  final: "badge-success",
};

const STATUS_LABEL: Record<ShotBreakdown["status"], string> = {
  draft: "草稿",
  edited: "已编辑",
  final: "定稿",
};

export function ShotCard({ shot, onEdit }: ShotCardProps) {
  return (
    <div className="card p-3 hover:border-[var(--primary-hover)] transition-all">
      {/* 头部：序号 + 类型 + 状态 + 时长 */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-bold text-muted-foreground">
            #{shot.sequence}
          </div>
          {shot.shotType && (
            <span className="badge badge-info text-[9px] px-1.5 py-0.5 flex items-center gap-0.5">
              <Clapperboard size={9} />
              {shot.shotType}
            </span>
          )}
          <span className={`badge ${STATUS_BADGE[shot.status]} text-[9px] px-1.5 py-0.5`}>
            {STATUS_LABEL[shot.status]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock size={10} />
            {t("novel.segments.duration", { n: Math.round(shot.estimatedDuration) })}
          </div>
          <button
            type="button"
            onClick={() => onEdit(shot)}
            className="btn btn-ghost text-[11px] px-2 py-1 flex items-center gap-1"
            aria-label="编辑分镜"
          >
            <Edit size={10} />
            编辑
          </button>
        </div>
      </div>

      {/* 描述 */}
      {shot.description && (
        <div className="text-[12px] mb-1.5 line-clamp-2">{shot.description}</div>
      )}

      {/* 动作 */}
      {shot.action && (
        <div className="text-[11px] text-muted-foreground mb-1.5">
          <span className="opacity-70">动作：</span>
          {shot.action}
        </div>
      )}

      {/* 镜头参数 */}
      {(shot.cameraAngle || shot.cameraMovement) && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1.5">
          {shot.cameraAngle && <span>角度：{shot.cameraAngle}</span>}
          {shot.cameraMovement && <span>运镜：{shot.cameraMovement}</span>}
        </div>
      )}

      {/* 角色和场景引用 */}
      {(shot.characters.length > 0 || shot.sceneId) && (
        <div className="flex items-center gap-2 text-[10px] mb-1.5">
          {shot.characters.length > 0 && (
            <div className="flex items-center gap-1">
              <Users size={10} className="text-muted-foreground" />
              <div className="flex flex-wrap gap-0.5">
                {shot.characters.map((c, i) => (
                  <span key={i} className="badge badge-info text-[9px] px-1 py-0">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {shot.sceneId && (
            <div className="flex items-center gap-1">
              <MapPin size={10} className="text-muted-foreground" />
              <span className="badge badge-info text-[9px] px-1 py-0">
                场景 {shot.sceneId.slice(0, 6)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 提示词预览 */}
      {shot.prompt && (
        <div className="mt-2 pt-2 border-t border-border">
          {shot.prompt.zh && (
            <div className="text-[11px] mb-1">
              <span className="text-muted-foreground opacity-70">中文：</span>
              {shot.prompt.zh}
            </div>
          )}
          {shot.prompt.en && (
            <div className="text-[10px] text-muted-foreground font-mono line-clamp-2">
              <span className="opacity-70">EN：</span>
              {shot.prompt.en}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
