/**
 * 故事库卡片和列表视图组件
 *
 * 从 page.tsx 提取，降低主文件行数（max-lines 700）。
 * 包含：StoryCard（网格视图）+ StoryList（列表视图）+ 共享辅助函数。
 */
import {
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
  Film,
  Users,
  Building2,
  BookOpen,
  RotateCcw,
  X,
} from "lucide-react";
import { t } from "@/shared/constants";
import type { Story, StoryStatus } from "@/domain/schemas";
import { cn } from "@/shared/utils/utils";

// ── 常量 ──────────────────────────────────────────────────────────────────

const STATUS_BADGE_CLASS: Record<StoryStatus, string> = {
  draft: "badge-muted",
  in_progress: "badge-info",
  completed: "badge-success",
  archived: "badge-warning",
  abandoned: "badge-muted",
};

// ── 辅助函数 ──────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  const oneDay = 24 * 60 * 60 * 1000;
  if (diff < oneDay && d.getDate() === new Date(now).getDate()) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("zh-CN");
}

function computeProgress(story: Story): { completed: number; total: number } {
  const beats = story.beats ?? [];
  const total = beats.length;
  const completed = beats.filter((b) => Boolean(b.videoGen?.videoUrl)).length;
  return { completed, total };
}

// ── 共享 Props 类型 ─────────────────────────────────────────────────────────

interface StoryItemActions {
  onOpen: (story: Story) => void;
  onDuplicate: (story: Story) => void;
  onStatusChange: (story: Story, status: StoryStatus) => void;
  onDelete: (story: Story) => void;
}

// ── 故事卡片（网格视图）───────────────────────────────────────────────────

export function StoryCard({
  story,
  onOpen,
  onDuplicate,
  onStatusChange,
  onDelete,
}: StoryItemActions & { story: Story }) {
  const { completed, total } = computeProgress(story);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const charCount = story.characters?.length ?? 0;
  const sceneCount = story.scenes?.length ?? 0;
  const isArchived = story.status === "archived";
  const isAbandoned = story.status === "abandoned";

  return (
    <div className="card p-4 flex flex-col gap-3 transition-all hover:-translate-y-0.5">
      <div className="flex items-start gap-2">
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onOpen(story)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(story);
            }
          }}
        >
          <div className="text-sm font-bold truncate">{story.title || t("story.unnamed")}</div>
          <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
            {story.description || t("story.noDescription")}
          </div>
        </div>
        <span className={cn("badge text-[9px] shrink-0", STATUS_BADGE_CLASS[story.status])}>
          {t(`story.status.${story.status}`)}
        </span>
      </div>

      <div className="flex gap-3 text-[11px] text-muted-foreground">
        <span title={t("stories.characters")}>
          <Users className="inline-block" size={12} /> {charCount}
        </span>
        <span title={t("stories.scenes")}>
          <Building2 className="inline-block" size={12} /> {sceneCount}
        </span>
        <span title={t("stories.beats")}>
          <Film className="inline-block" size={12} /> {total}
        </span>
      </div>

      {total > 0 && (
        <div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{t("stories.progress")}</span>
            <span>{t("stories.progressLabel", { completed, total })}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="text-[10px] text-muted-foreground">
        {t("stories.lastUpdated", { time: formatTime(story.updatedAt) })}
      </div>

      <div className="flex items-center gap-1 pt-1 border-t border-border">
        <button
          className="btn btn-outline btn-sm flex-1"
          onClick={() => onOpen(story)}
          title={t("stories.open")}
        >
          <BookOpen size={12} className="inline-block mr-1" />
          {t("stories.open")}
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => onDuplicate(story)}
          title={t("story.duplicate")}
          aria-label={t("story.duplicate")}
        >
          <Copy size={12} />
        </button>
        {isArchived ? (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => onStatusChange(story, "in_progress")}
            title={t("stories.restore")}
            aria-label={t("stories.restore")}
          >
            <ArchiveRestore size={12} />
          </button>
        ) : (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => onStatusChange(story, "archived")}
            title={t("stories.archive")}
            aria-label={t("stories.archive")}
            disabled={isAbandoned}
          >
            <Archive size={12} />
          </button>
        )}
        {isAbandoned ? (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => onStatusChange(story, "in_progress")}
            title={t("stories.restore")}
            aria-label={t("stories.restore")}
          >
            <RotateCcw size={12} />
          </button>
        ) : (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => onStatusChange(story, "abandoned")}
            title={t("stories.abandon")}
            aria-label={t("stories.abandon")}
            disabled={isArchived}
          >
            <X size={12} />
          </button>
        )}
        <button
          className="btn btn-outline btn-sm text-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => onDelete(story)}
          title={t("stories.delete")}
          aria-label={t("stories.delete")}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── 故事列表（列表视图）────────────────────────────────────────────────────

export function StoryList({
  stories,
  ...actions
}: { stories: Story[] } & StoryItemActions) {
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[2fr_1fr_80px_80px_100px_180px] gap-2 px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-border">
        <span>{t("story.titlePlaceholder")}</span>
        <span>{t("story.statusLabel")}</span>
        <span>{t("stories.characters")}</span>
        <span>{t("stories.scenes")}</span>
        <span>{t("stories.beats")}</span>
        <span className="text-right">{t("stories.open")}</span>
      </div>
      {stories.map((story) => {
        const { total } = computeProgress(story);
        const charCount = story.characters?.length ?? 0;
        const sceneCount = story.scenes?.length ?? 0;
        const isArchived = story.status === "archived";
        const isAbandoned = story.status === "abandoned";
        return (
          <div
            key={story.id}
            className="grid grid-cols-[2fr_1fr_80px_80px_100px_180px] gap-2 px-3 py-2 items-center text-sm rounded hover:bg-muted/50 transition-colors group"
          >
            <div
              className="cursor-pointer min-w-0"
              onClick={() => actions.onOpen(story)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  actions.onOpen(story);
                }
              }}
            >
              <div className="font-medium truncate">{story.title || t("story.unnamed")}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {story.description || t("story.noDescription")}
              </div>
            </div>
            <span className={cn("badge text-[9px]", STATUS_BADGE_CLASS[story.status])}>
              {t(`story.status.${story.status}`)}
            </span>
            <span className="text-xs text-muted-foreground">
              <Users className="inline-block" size={11} /> {charCount}
            </span>
            <span className="text-xs text-muted-foreground">
              <Building2 className="inline-block" size={11} /> {sceneCount}
            </span>
            <span className="text-xs text-muted-foreground">
              <Film className="inline-block" size={11} /> {total}
            </span>
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="btn btn-outline btn-sm" onClick={() => actions.onOpen(story)} title={t("stories.open")}>
                <BookOpen size={12} />
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => actions.onDuplicate(story)} title={t("story.duplicate")}>
                <Copy size={12} />
              </button>
              {isArchived ? (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => actions.onStatusChange(story, "in_progress")}
                  title={t("stories.restore")}
                >
                  <ArchiveRestore size={12} />
                </button>
              ) : (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => actions.onStatusChange(story, "archived")}
                  title={t("stories.archive")}
                  disabled={isAbandoned}
                >
                  <Archive size={12} />
                </button>
              )}
              <button
                className="btn btn-outline btn-sm text-destructive"
                onClick={() => actions.onDelete(story)}
                title={t("stories.delete")}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
