import { memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { characterService } from "@/modules/character";
import { CharacterListItem } from "@/modules/character";
import { BatchOperations } from "@/modules/asset";
import { errorLogger } from "@/shared/error-logger";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import type { Character } from "@/domain/schemas";
import { Users, Plus } from "lucide-react";
import { t } from "@/shared/constants/messages";
import { PageLoader } from "@/shared/presentation/PageLoader";
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

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        overflowY: "auto",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {characters.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingBottom: 4,
          }}
        >
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
        <PageLoader size="md" label={t("character.loadingList")} />
      ) : characters.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("character.emptyList")}
          description={t("character.emptyListHint")}
          action={
            <button
              onClick={onCreateNew}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
              style={{
                background: "rgba(var(--primary-rgb), 0.1)",
                color: "var(--primary)",
              }}
            >
              <Plus className="h-4 w-4" />
              {t("character.createNew")}
            </button>
          }
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
  );
});
