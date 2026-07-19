/**
 * Task 2A.16 — 示例项目加载器
 *
 * 显示 3 个示例项目卡片（科幻/古装/现代），用户点击后加载预置数据。
 * 加载后调用 onLoad 回调，父组件将 rawText/segments/characters/scenes 写入 PipelineState。
 *
 * 依赖方向：仅依赖 @/shared/constants（i18n）+ 同模块 services/sample-projects
 */

import { Film, Scroll, Rocket } from "lucide-react";
import { t } from "@/shared/constants";
import { SAMPLE_PROJECTS, type SampleProject } from "../services/sample-projects";

export interface SampleProjectLoaderProps {
  /** 加载示例项目回调 */
  onLoad: (project: SampleProject) => void;
  /** 关闭回调（点击"返回"按钮） */
  onClose: () => void;
}

/** genre → 图标 */
const GENRE_ICON: Record<SampleProject["genre"], typeof Film> = {
  scifi: Rocket,
  period: Scroll,
  modern: Film,
};

/** genre → i18n 键 */
const GENRE_LABEL_KEY: Record<SampleProject["genre"], string> = {
  scifi: "novel.sample.genreScifi",
  period: "novel.sample.genrePeriod",
  modern: "novel.sample.genreModern",
};

export function SampleProjectLoader({ onLoad, onClose }: SampleProjectLoaderProps) {
  return (
    <div className="flex flex-col h-full p-4">
      {/* 顶部标题 */}
      <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
        <div className="flex items-center gap-2">
          <Film size={14} className="text-primary" />
          <h3 className="text-[13px] font-semibold">{t("novel.sample.title")}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost text-[11px] px-2.5 py-1"
        >
          {t("common.back")}
        </button>
      </div>

      {/* 示例项目卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 overflow-y-auto">
        {SAMPLE_PROJECTS.map((project) => {
          const Icon = GENRE_ICON[project.genre];
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => onLoad(project)}
              className="card p-4 flex flex-col gap-2 text-left hover:border-primary/60 transition-all"
            >
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-primary" />
                <span className="text-[13px] font-bold">{project.name}</span>
              </div>
              <span className="text-[9px] badge badge-info px-1.5 py-0.5 self-start">
                {t(GENRE_LABEL_KEY[project.genre])}
              </span>
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4 min-h-[5em]">
                {project.description}
              </p>
              <div className="flex items-center justify-between pt-2 border-t border-border text-[10px] text-muted-foreground">
                <span>{t("novel.sample.segmentCount", { n: project.segments.length })}</span>
                <span>{t("novel.sample.characterCount", { n: project.characters.length })}</span>
                <span>{t("novel.sample.sceneCount", { n: project.scenes.length })}</span>
              </div>
              <div className="text-[10px] text-primary font-medium mt-1">
                {t("novel.sample.load")} →
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
