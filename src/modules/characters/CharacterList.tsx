import { memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { characterService } from "@/modules/character";
import { CharacterListItem } from "@/modules/character";
import { BatchOperations } from "@/modules/asset";
import { errorLogger } from "@/shared/error-logger";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { usePagination } from "@/shared/hooks/use-pagination";
import type { Character } from "@/domain/schemas";
import { Users, Plus, ChevronDown } from "lucide-react";
import { t } from "@/shared/constants/messages";
import { EmptyState } from "@/shared/presentation/EmptyState";

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
  const { error: showError } = useToastHelpers();
  const { visibleItems, hasMore, loadMore } = usePagination<Character>(characters, {
    pageSize: 20,
  });

  return (
    <div className="w-full md:w-[300px] md:shrink-0 border-b border-border md:border-b-0 md:border-r flex flex-col overflow-y-auto p-3 gap-1.5">
      {characters.length > 0 && (
        <div className="flex items-center justify-end pb-1">
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
                  // R47: 批量保存失败必须告知用户，避免用户以为保存成功导致数据丢失感
                  errorLogger.error("[CharacterList] batch save failed", e);
                  showError(t("character.batchSaveFailed"), mapUserFacingError(e));
                }
              }
            }}
          />
        </div>
      )}
      {charactersLoading ? (
        Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full skeleton-shimmer shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="h-3 w-3/4 skeleton-shimmer rounded" />
                <div className="h-2.5 w-1/2 skeleton-shimmer rounded" />
              </div>
            </div>
          </div>
        ))
      ) : characters.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("character.emptyList")}
          description={t("character.emptyListHint")}
          action={
            <button
              onClick={onCreateNew}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors bg-[rgba(var(--primary-rgb),0.1)] text-[var(--primary)]"
            >
              <Plus className="h-4 w-4" />
              {t("character.createNew")}
            </button>
          }
        />
      ) : (
        <>
          {visibleItems.map((char) => (
            <div key={char.id} data-char-id={char.id}>
              <CharacterListItem
                character={char}
                onClick={() => onSelectCharacter(char)}
                onDelete={onDeleteCharacter}
              />
            </div>
          ))}
          {hasMore && (
            <button
              onClick={loadMore}
              className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md transition-colors border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              {t("common.loadMore")}
            </button>
          )}
        </>
      )}
    </div>
  );
});
