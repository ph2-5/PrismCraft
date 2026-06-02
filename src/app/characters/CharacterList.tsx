import { memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { characterService } from "@/modules/character";
import { CharacterListItem } from "@/modules/character";
import { BatchOperations } from "@/modules/asset";
import { errorLogger } from "@/shared/error-logger";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { LoadingState } from "@/shared/ui/loading-state";
import type { Character } from "@/domain/schemas";
import { Plus, Users } from "lucide-react";
import { t } from "@/shared/constants/messages";

interface CharacterListProps {
  characters: Character[];
  charactersLoading: boolean;
  onSelectCharacter: (char: Character) => void;
  onDeleteCharacter: (e: React.MouseEvent) => void;
  onCreateNew: () => void;
}

export const CharacterList = memo(function CharacterList({
  characters,
  charactersLoading,
  onSelectCharacter,
  onDeleteCharacter,
  onCreateNew,
}: CharacterListProps) {
  const queryClient = useQueryClient();

  return (
    <div className="w-[280px] shrink-0 flex flex-col border border-border rounded-lg bg-card overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold">{t("sidebar.characters")}</span>
            <span className="text-xs text-muted-foreground">
              {characters.length}
            </span>
          </div>
          {characters.length > 0 && (
            <BatchOperations
              type="character"
              items={characters}
              onComplete={(results) => {
                errorLogger.info(t("batch.generateComplete"), results);
              }}
              onSave={async (itemId, imageUrl, _variantIndex) => {
                const item = characters.find((c) => c.id === itemId);
                if (item) {
                  const updated = {
                    ...item,
                    refImagePath: imageUrl,
                    generatedImage: imageUrl,
                  };
                  try {
                    const result = await characterService.update(itemId, updated);
                    if (!result.ok) throw result.error;
                    queryClient.invalidateQueries({
                      queryKey: ["characters"],
                    });
                  } catch (e) {
                    errorLogger.warn(
                      t("character.batchSaveFailed"),
                      e instanceof Error ? e.message : e,
                    );
                  }
                }
              }}
            />
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 h-7 text-xs"
          onClick={onCreateNew}
        >
          <Plus className="w-3 h-3" />
          {t("character.createNew")}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {charactersLoading ? (
          <LoadingState message={t("character.loadingList")} />
        ) : characters.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("character.emptyList")}
            description={t("character.emptyListHint")}
          />
        ) : (
          characters.map((char) => (
            <div key={char.id} data-char-id={char.id}>
              <CharacterListItem
                character={char}
                onClick={() => onSelectCharacter(char)}
                onDelete={onDeleteCharacter}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
});
