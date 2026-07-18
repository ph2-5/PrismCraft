/**
 * Task 2A.7 — 未完成项目恢复对话框
 *
 * 挂载时若 DB 中存在 novel_projects 记录（未完成导入），由 StoryPipelineShell
 * 渲染本组件显示恢复对话框。用户可以：
 * - 点击"继续编辑"恢复指定项目（onRecover）
 * - 点击"开始新项目"忽略所有恢复项（onDismiss）
 * - 点击"删除"移除单个未完成项目（onDelete）
 *
 * 不依赖 infrastructure：所有数据通过 props 注入。
 */

import { useMemo } from "react";
import { FileText, RotateCcw, Trash2, X, Clock } from "lucide-react";
import { t } from "@/shared/constants";
import type { NovelProject, PipelineStage } from "../domain/types";

export interface NovelProjectListProps {
  projects: NovelProject[];
  onRecover: (id: string) => void;
  onDismiss: () => void;
  onDelete: (id: string) => void;
}

/** 用户可见的阶段中文标签（合并 structure_analysis/pacing_planning 到内容导入） */
const STAGE_LABEL_KEY: Partial<Record<PipelineStage, string>> = {
  project_init: "novel.stages.project_init",
  content_import: "novel.stages.content_import",
  structure_analysis: "novel.stages.structure_analysis",
  pacing_planning: "novel.stages.pacing_planning",
  character_manage: "novel.stages.character_manage",
  scene_manage: "novel.stages.scene_manage",
  review: "novel.projectList.stageReview",
  storyboard: "novel.projectList.stageStoryboard",
  generation: "novel.stages.generation",
  done: "novel.projectList.stageDone",
};

function formatTime(ts: number): string {
  const date = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  // 1 分钟内
  if (diff < 60_000) return t("novel.projectList.justNow");
  // 1 小时内
  if (diff < 3_600_000) return t("novel.projectList.minutesAgo", { count: Math.floor(diff / 60_000) });
  // 24 小时内
  if (diff < 86_400_000) return t("novel.projectList.hoursAgo", { count: Math.floor(diff / 3_600_000) });
  // 超过 24 小时显示日期
  return t("novel.projectList.dateFormat", {
    month: date.getMonth() + 1,
    day: date.getDate(),
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  });
}

export function NovelProjectList({
  projects,
  onRecover,
  onDismiss,
  onDelete,
}: NovelProjectListProps) {
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projects],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="novel-project-list-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div className="card w-full max-w-lg max-h-[80vh] flex flex-col mx-4">
        {/* 头部 */}
        <div className="flex items-start justify-between gap-2 p-4 border-b border-border">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[rgba(var(--primary-rgb),0.1)] flex items-center justify-center shrink-0">
              <RotateCcw size={15} className="text-[var(--primary)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="novel-project-list-title"
                className="text-[14px] font-bold leading-tight"
              >
                {t("novel.project.recoveryTitle")}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("novel.project.recoveryDesc")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("novel.projectList.close")}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 -m-1 rounded"
          >
            <X size={15} />
          </button>
        </div>

        {/* 项目列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[100px]">
          {sortedProjects.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[11px] text-muted-foreground py-8">
              {t("novel.project.empty")}
            </div>
          ) : (
            sortedProjects.map((project) => (
              <div
                key={project.id}
                className="rounded-md border border-border bg-card hover:border-[var(--primary-hover)] transition-colors p-3 group"
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded bg-[rgba(var(--primary-rgb),0.06)] flex items-center justify-center shrink-0">
                    <FileText size={13} className="text-[var(--primary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold truncate">
                      {project.title || t("novel.projectList.untitledProject")}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-0.5">
                        <Clock size={10} />
                        {t("novel.project.lastModified", {
                          time: formatTime(project.updatedAt),
                        })}
                      </span>
                      <span className="text-border">·</span>
                      <span>
                        {t("novel.project.stage", {
                          stage: STAGE_LABEL_KEY[project.state.stage]
                            ? t(STAGE_LABEL_KEY[project.state.stage] as string)
                            : project.state.stage,
                        })}
                      </span>
                      <span className="text-border">·</span>
                      <span>
                        {t("novel.projectList.segmentCount", { count: project.state.segments.length })} ·{" "}
                        {t("novel.projectList.characterCount", { count: project.state.characters.length })} ·{" "}
                        {t("novel.projectList.sceneCount", { count: project.state.scenes.length })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => onDelete(project.id)}
                    aria-label={t("novel.project.delete")}
                    className="btn btn-ghost text-[11px] px-2 py-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={11} className="mr-1" />
                    {t("novel.project.delete")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRecover(project.id)}
                    className="btn btn-primary text-[11px] px-3 py-1"
                  >
                    <RotateCcw size={11} className="mr-1" />
                    {t("novel.project.continue")}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end p-3 border-t border-border">
          <button
            type="button"
            onClick={onDismiss}
            className="btn btn-outline text-[12px] px-3 py-1.5"
          >
            {t("novel.project.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
