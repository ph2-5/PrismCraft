import { useState, useEffect, useRef } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Plus, ChevronDown, Trash2, Save } from "lucide-react";
import { DEFAULT_STORY, genres, tones } from "@/modules/story";
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
        <Button
          variant="outline"
          size="sm"
          className="gap-2 min-w-[160px] justify-between"
          onClick={() => setShowProjectDropdown(!showProjectDropdown)}
        >
          <span className="truncate">
            {story.currentStory.title || t("beat.unnamedProject")}
          </span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        </Button>
        {showProjectDropdown && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
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
              {t("beat.createBeat")}
            </button>
            {story.stories.length > 0 && (
              <div className="border-t border-border my-1" />
            )}
            {story.stories.map((s) => (
              <div
                key={s.id}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between group ${
                  s.id === story.currentStory.id ? "bg-muted" : ""
                }`}
                onClick={() => {
                  setShowProjectDropdown(false);
                  onSwitchStory(s);
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
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

      <Input
        placeholder={t("story.titlePlaceholder")}
        value={story.currentStory.title ?? ""}
        onChange={(e) =>
          story.setCurrentStory((prev) => ({
            ...prev,
            title: e.target.value,
          }))
        }
        className="max-w-[200px] h-8 text-sm"
        aria-label={t("story.titlePlaceholder")}
      />

      <Input
        placeholder={t("story.descPlaceholder")}
        value={story.currentStory.description ?? ""}
        onChange={(e) =>
          story.setCurrentStory((prev) => ({
            ...prev,
            description: e.target.value,
          }))
        }
        className="max-w-[240px] h-8 text-sm flex-1"
        aria-label={t("story.descPlaceholder")}
      />

      <Select
        value={story.currentStory.genre ?? ""}
        onValueChange={(value) =>
          story.setCurrentStory((prev) => ({
            ...prev,
            genre: value || undefined,
          }))
        }
      >
        <SelectTrigger className="w-24 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {genres.map((genre) => (
            <SelectItem key={genre.value} value={genre.value}>
              {genre.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={story.currentStory.tone ?? ""}
        onValueChange={(value) =>
          story.setCurrentStory((prev) => ({
            ...prev,
            tone: value || undefined,
          }))
        }
      >
        <SelectTrigger className="w-24 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {tones.map((tone) => (
            <SelectItem key={tone.value} value={tone.value}>
              {tone.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex-1" />

      <SaveStatusIndicator
        status={story.hasUnsavedChanges ? "unsaved" : story.saveStatus}
        errorMessage={story.saveError}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={story.handleSave}
        disabled={story.saveStatus === "saving"}
        className="gap-1.5 h-8"
      >
        <Save className="w-3.5 h-3.5" />
        {t("common.save")}
      </Button>
    </>
  );
}
