import { memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { characterService } from "@/modules/character";
import { CharacterListItem } from "@/modules/character";
import { BatchOperations } from "@/modules/asset";
import { errorLogger } from "@/shared/error-logger";
import type { Character } from "@/domain/schemas";
import { Users, Loader2 } from "lucide-react";
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
  onCreateNew: _onCreateNew,
}: CharacterListProps) {
  const queryClient = useQueryClient();

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
                  errorLogger.warn(
                    t("character.batchSaveFailed"),
                    e instanceof Error ? e.message : e,
                  );
                }
              }
            }}
          />
        </div>
      )}
      {charactersLoading ? (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "32px" }}>
          <Loader2 className="animate-spin" size={24} style={{ color: "var(--muted-fg)" }} />
          <div style={{ fontSize: 12, marginTop: 12, color: "var(--muted-fg)" }}>{t("character.loadingList")}</div>
        </div>
      ) : characters.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted-fg)" }}>
          <div style={{ fontSize: 32, marginBottom: 8, display: "flex", justifyContent: "center" }}>
            <Users style={{ width: 32, height: 32 }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t("character.emptyList")}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{t("character.emptyListHint")}</div>
        </div>
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
