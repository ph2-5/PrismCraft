import React from "react";
import { cn } from "@/shared/utils/utils";
import { getBeatCharacterIds } from "@/domain/utils";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { t } from "@/shared/constants";
import {
  BeatPreviewMedia,
  BeatCardHeader,
  CharacterSceneChips,
  BeatCardFooter,
  getBeatStatusInfo,
} from "./BeatOverviewCardParts";

interface BeatOverviewCardProps {
  beat: StoryBeat;
  index: number;
  characters: Character[];
  scenes: Scene[];
  onEditClick: (beat: StoryBeat) => void;
  onMoveBeat?: (beatId: string, direction: "up" | "down") => void;
  onDeleteBeat?: (beatId: string) => void;
  totalBeats?: number;
  isSelected?: boolean;
}

export const BeatOverviewCard = React.memo(function BeatOverviewCard({
  beat,
  index,
  characters,
  scenes,
  onEditClick,
  onMoveBeat,
  onDeleteBeat,
  totalBeats = 0,
  isSelected = false,
}: BeatOverviewCardProps) {
  const charIds = getBeatCharacterIds(beat);
  const charNames = charIds
    .map((id: string) => characters.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const sceneName = beat.sceneId
    ? scenes.find((s) => s.id === beat.sceneId)?.name ?? null
    : null;
  const statusInfo = getBeatStatusInfo(beat);

  return (
    <div
      className={cn(
        "card group relative overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-xl hover:shadow-primary/10 border-primary/30 hover:border-primary/50 bg-card2",
        isSelected &&
          "ring-2 ring-primary border-primary shadow-lg shadow-primary/10",
      )}
      onClick={() => onEditClick(beat)}
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-500 via-pink-500 to-purple-500 group-hover:w-2 transition-all duration-300" />

      <div>
        <div className="flex flex-col">
          <div className="relative overflow-hidden h-36">
            <BeatPreviewMedia beat={beat} />
            <BeatCardHeader index={index} beat={beat} statusInfo={statusInfo} />
          </div>

          <div className="p-4 space-y-3">
            <div>
              <h3 className="text-base font-semibold text-purple-100 group-hover:text-purple-400 transition-colors line-clamp-1">
                {beat.title || t("beat.shotNumber", { number: index + 1 })}
              </h3>
              <p className="text-xs text-purple-300/80 mt-1 line-clamp-2">
                {beat.content || beat.description || t("beat.clickToEdit")}
              </p>
            </div>

            <CharacterSceneChips charNames={charNames} sceneName={sceneName} />

            <BeatCardFooter
              beat={beat}
              index={index}
              totalBeats={totalBeats}
              onEditClick={onEditClick}
              onMoveBeat={onMoveBeat}
              onDeleteBeat={onDeleteBeat}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
