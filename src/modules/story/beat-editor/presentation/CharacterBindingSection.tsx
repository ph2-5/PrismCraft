import { Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/ui/select";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { t } from "@/shared/constants";
import type { Character } from "@/domain/schemas";

interface CharacterBindingSectionProps {
  characters: Character[];
  availableCharacters: Character[];
  onAddFromCharacter: (character: Character, outfitId?: string) => void;
}

export function CharacterBindingSection({
  characters,
  availableCharacters,
  onAddFromCharacter,
}: CharacterBindingSectionProps) {
  return (
    <Select
      onValueChange={(value) => {
        const val = typeof value === "string" ? value : String(value ?? "");
        if (!val) return;
        const [charId, outfitId] = val.split("|");
        const char = characters.find((c) => c.id === charId);
        if (char) onAddFromCharacter(char, outfitId || undefined);
      }}
      disabled={availableCharacters.length === 0}
    >
      <SelectTrigger className="flex-1 bg-slate-800 border-slate-700">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <span>
            {availableCharacters.length > 0
              ? t("element.addCharacter")
              : t("element.noAvailableCharacters")}
          </span>
        </div>
      </SelectTrigger>
      {availableCharacters.length > 0 && (
        <SelectContent className="bg-slate-800 border-slate-700">
          {availableCharacters.map((char) => (
            <div key={char.id}>
              <SelectItem value={char.id}>
                <div className="flex items-center gap-2">
                  {char.generatedImage && (
                    <img
                      src={resolveImageUrl(char.generatedImage) || ""}
                      alt={char.name}
                      className="w-6 h-6 rounded object-cover"
                    />
                  )}
                  <span>
                    {char.name}
                    {t("element.defaultOutfit")}
                  </span>
                </div>
              </SelectItem>
              {char.outfits?.map((outfit) => (
                <SelectItem
                  key={`${char.id}|${outfit.id}`}
                  value={`${char.id}|${outfit.id}`}
                >
                  <div className="flex items-center gap-2 pl-6">
                    {outfit.imageUrl && (
                      <img
                        src={resolveImageUrl(outfit.imageUrl) || ""}
                        alt={outfit.name}
                        className="w-6 h-6 rounded object-cover"
                      />
                    )}
                    <span>
                      {char.name} - {outfit.name}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      )}
    </Select>
  );
}
