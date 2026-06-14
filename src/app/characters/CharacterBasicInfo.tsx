import {
  personalitySuggestions,
  styleSuggestions,
  genderSuggestions,
} from "@/modules/character";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Badge } from "@/shared/ui/badge";
import { TabsContent } from "@/shared/ui/tabs";
import type { Character } from "@/domain/schemas";
import { X } from "lucide-react";
import { t } from "@/shared/constants/messages";

interface CharacterBasicInfoProps {
  currentCharacter: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  customTrait: string;
  setCustomTrait: (v: string) => void;
  addTrait: (trait: string) => void;
  removeTrait: (trait: string) => void;
}

export function CharacterBasicInfo({
  currentCharacter,
  setCurrentCharacter,
  customTrait,
  setCustomTrait,
  addTrait,
  removeTrait,
}: CharacterBasicInfoProps) {
  return (
    <>
      <TabsContent value="basic" className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("character.name")}</Label>
          <Input
            id="name"
            data-testid="character-name-input"
            placeholder={t("character.namePlaceholder")}
            value={currentCharacter.name}
            onChange={(e) =>
              setCurrentCharacter({
                ...currentCharacter,
                name: e.target.value,
              }, true)
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("character.gender")}</Label>
            <div className="flex flex-wrap gap-2">
              {genderSuggestions.map((g) => (
                <Button
                  key={g}
                  type="button"
                  variant={currentCharacter.gender === g ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setCurrentCharacter({
                      ...currentCharacter,
                      gender: currentCharacter.gender === g ? "" : g,
                    }, true)
                  }
                >
                  {g}
                </Button>
              ))}
              <Input
                className="w-20 h-8 text-xs"
                placeholder={t("character.custom")}
                value={genderSuggestions.includes(currentCharacter.gender) ? "" : currentCharacter.gender}
                onChange={(e) =>
                  setCurrentCharacter({
                    ...currentCharacter,
                    gender: e.target.value,
                  }, true)
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="age">{t("character.age")}</Label>
            <Input
              id="age"
              type="number"
              placeholder={t("character.agePlaceholder")}
              value={currentCharacter.age ?? ""}
              onChange={(e) => {
                const val = e.target.value.trim();
                const parsed =
                  val === ""
                    ? undefined
                    : Math.max(0, parseInt(val) || 0);
                setCurrentCharacter({
                  ...currentCharacter,
                  age: parsed,
                }, true);
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="style">{t("character.style")}</Label>
          <div className="flex gap-2">
            <Input
              id="style"
              list="style-suggestions"
              placeholder={t("character.stylePlaceholder")}
              value={currentCharacter.style}
              onChange={(e) =>
                setCurrentCharacter({
                  ...currentCharacter,
                  style: e.target.value,
                }, true)
              }
              className="flex-1"
            />
          </div>
          <datalist id="style-suggestions">
            {styleSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-1 mt-2">
            {styleSuggestions.slice(0, 10).map((style) => (
              <Badge
                key={style}
                variant={
                  currentCharacter.style === style
                    ? "default"
                    : "outline"
                }
                className="cursor-pointer text-xs"
                onClick={() =>
                  setCurrentCharacter({
                    ...currentCharacter,
                    style,
                  }, true)
                }
              >
                {style}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground self-center">
              {t("character.moreStyles")}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{t("character.description")}</Label>
          <Textarea
            id="description"
            placeholder={t("character.descriptionPlaceholder")}
            rows={4}
            value={currentCharacter.description}
            onChange={(e) =>
              setCurrentCharacter({
                ...currentCharacter,
                description: e.target.value,
              }, true)
            }
          />
        </div>
      </TabsContent>

      <TabsContent value="personality" className="space-y-4">
        <div className="space-y-2">
          <Label>{t("character.addPersonality")}</Label>
          <div className="flex gap-2">
            <Input
              list="trait-suggestions"
              placeholder={t("character.personalityPlaceholder")}
              value={customTrait}
              onChange={(e) => setCustomTrait(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTrait(customTrait);
                }
              }}
              className="flex-1"
            />
            <Button onClick={() => addTrait(customTrait)}>
              {t("character.add")}
            </Button>
          </div>
          <datalist id="trait-suggestions">
            {personalitySuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>

        {currentCharacter.personality.length > 0 && (
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm font-medium mb-3">
              {t("character.addedTraits")}
            </p>
            <div className="flex flex-wrap gap-2">
              {currentCharacter.personality.map((trait) => (
                <Badge
                  key={trait}
                  className="cursor-pointer px-3 py-1 gap-1"
                  onClick={() => removeTrait(trait)}
                >
                  {trait}
                  <X className="w-3 h-3" />
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-muted-foreground">
            {t("character.quickReference")}
          </Label>
          <div className="flex flex-wrap gap-1">
            {personalitySuggestions.map((trait) => (
              <Badge
                key={trait}
                variant={
                  currentCharacter.personality.includes(trait)
                    ? "default"
                    : "outline"
                }
                className="cursor-pointer px-2 py-1 text-xs opacity-70 hover:opacity-100"
                onClick={() => {
                  if (!currentCharacter.personality.includes(trait)) {
                    setCurrentCharacter({
                      ...currentCharacter,
                      personality: [
                        ...currentCharacter.personality,
                        trait,
                      ],
                    }, true);
                  }
                }}
              >
                {trait}
              </Badge>
            ))}
          </div>
        </div>
      </TabsContent>
    </>
  );
}
