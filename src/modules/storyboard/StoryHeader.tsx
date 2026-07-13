import { useState, useEffect, useRef } from "react";
import { Plus, ChevronDown, Trash2, Save } from "lucide-react";
import { DEFAULT_STORY, genres, tones } from "@/modules/storyboard";
import { t } from "@/shared/constants";
import { confirm } from "@/shared/utils/confirm";
import { SaveStatusIndicator } from "@/shared/presentation/SaveStatusIndicator";
import { type useStory } from "./StoryProvider";

type StoryValue = ReturnType<typeof useStory>;

interface StoryHeaderProps {
  story: StoryValue;
  onSwitchStory: (s: StoryValue["stories"][number]) => void;
}

export function StoryHeader({ story, onSwitchStory }: StoryHeaderProps) {
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowProjectDropdown(false);
      }
    };
    if (showProjectDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showProjectDropdown]);

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          className="btn btn-outline btn-sm gap-2 min-w-[160px] justify-between"
          onClick={() => setShowProjectDropdown(!showProjectDropdown)}
        >
          <span className="truncate">
            {story.currentStory.title || t("beat.unnamedProject")}
          </span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        </button>
        {showProjectDropdown && (
          <div
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setShowProjectDropdown(false);
              }
            }}
            className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto"
          >
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
              onClick={async () => {
                if (story.hasUnsavedChanges && story.beats.length > 0) {
                  const confirmed = await confirm(
                    t("beat.unsavedCreateConfirm"),
                    t("beat.unsavedChanges"),
                  );
                  if (!confirmed) return;
                }
                story.setCurrentStory(DEFAULT_STORY, true);
                story.setBeats([]);
                setShowProjectDropdown(false);
              }}
            >
              <Plus className="w-4 h-4 text-primary" />
              {t("story.newProject")}
            </button>
            {story.stories.length > 0 && (
              <div className="border-t border-border my-1" />
            )}
            {story.stories.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setShowProjectDropdown(false);
                    onSwitchStory(s);
                  }
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between group ${
                  s.id === story.currentStory.id ? "bg-muted" : ""
                }`}
                onClick={() => {
                  setShowProjectDropdown(false);
                  onSwitchStory(s);
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="story-project-avatar w-6 h-6 rounded flex items-center justify-center text-xs font-bold shrink-0">
                    {(s.title || "?").charAt(0)}
                  </div>
                  <span className="truncate">
                    {s.title || t("beat.unnamedProject")}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {t("story.beatCount", { count: (s.beats || []).length })}
                  </span>
                </div>
                <button
                  type="button"
                  className="p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    story.handleDeleteStory(s.id);
                  }}
                  aria-label={t("aria.deleteStory")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <input
        data-testid="story-title-input"
        placeholder={t("story.titlePlaceholder")}
        value={story.currentStory.title ?? ""}
        onChange={(e) =>
          story.setCurrentStory((prev) => ({
            ...prev,
            title: e.target.value,
          }))
        }
        className="input max-w-[200px] h-8 !text-xs !px-2.5 !py-1.5"
        aria-label={t("story.titlePlaceholder")}
      />

      <input
        data-testid="story-description-input"
        placeholder={t("story.descPlaceholder")}
        value={story.currentStory.description ?? ""}
        onChange={(e) =>
          story.setCurrentStory((prev) => ({
            ...prev,
            description: e.target.value,
          }))
        }
        className="input max-w-[240px] h-8 !text-xs !px-2.5 !py-1.5 flex-1"
        aria-label={t("story.descPlaceholder")}
      />

      <select
        className="select w-24 h-8 text-xs"
        aria-label="题材"
        value={story.currentStory.genre ?? ""}
        onChange={(e) =>
          story.setCurrentStory((prev) => ({
            ...prev,
            genre: e.target.value || undefined,
          }))
        }
      >
        {genres.map((genre) => (
          <option key={genre.value} value={genre.value}>
            {genre.label}
          </option>
        ))}
      </select>

      <select
        className="select w-24 h-8 text-xs"
        aria-label={t("aria.tone")}
        value={story.currentStory.tone ?? ""}
        onChange={(e) =>
          story.setCurrentStory((prev) => ({
            ...prev,
            tone: e.target.value || undefined,
          }))
        }
      >
        {tones.map((tone) => (
          <option key={tone.value} value={tone.value}>
            {tone.label}
          </option>
        ))}
      </select>

      <div className="flex-1" />

      <SaveStatusIndicator
        status={story.hasUnsavedChanges ? "unsaved" : story.saveStatus}
        errorMessage={story.saveError}
      />
      <button
        type="button"
        className="btn btn-outline btn-sm gap-1.5 h-8"
        onClick={story.handleSave}
        disabled={story.saveStatus === "saving" || !(story.currentStory.title ?? "").trim()}
        title={
          story.saveStatus !== "saving" && !(story.currentStory.title ?? "").trim()
            ? t("hint.saveStory")
            : undefined
        }
      >
        <Save className="w-3.5 h-3.5" />
        {t("common.save")}
      </button>
    </>
  );
}
