import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import type { Scene } from "@/domain/schemas";
import { t } from "@/shared/constants";

interface BeatHeaderProps {
  beatTitle: string;
  index: number;
  totalBeats: number;
  selectedScene: Scene | undefined;
  onClose: () => void;
  onPrevBeat: () => void;
  onNextBeat: () => void;
}

export function BeatHeader({
  beatTitle,
  index,
  totalBeats,
  selectedScene,
  onClose,
  onPrevBeat,
  onNextBeat,
}: BeatHeaderProps) {
  return (
    <div className="border-b border-border px-5 py-3 flex flex-row items-center justify-between bg-muted/30 shrink-0">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="hover:bg-muted text-muted-foreground hover:text-foreground h-8 w-8"
          aria-label={t("aria.close")}
        >
          <X className="w-4 h-4" />
        </Button>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
          {index + 1}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            {beatTitle || t("beat.shotNumber", { number: index + 1 })}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            {selectedScene && (
              <Badge variant="secondary" className="text-[10px] h-4">
                {selectedScene.name}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {index + 1} / {totalBeats}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrevBeat}
          disabled={index === 0}
          className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8"
          aria-label={t("aria.prevBeat")}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNextBeat}
          disabled={index === totalBeats - 1}
          className="text-muted-foreground hover:text-foreground hover:bg-muted"
          aria-label={t("aria.nextBeat")}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
