import {
  heightSuggestions,
  buildSuggestions,
} from "@/modules/character";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Badge } from "@/shared/ui/badge";
import { TabsContent } from "@/shared/ui/tabs";
import { resolveImageUrl } from "@/shared/utils/image-url";
import type { Character, CharacterOutfit } from "@/domain/schemas";
import {
  Plus,
  Wand2,
  Trash2,
  Loader2,
  Shirt,
} from "lucide-react";
import { t } from "@/shared/constants/messages";

interface CharacterAppearanceSectionProps {
  currentCharacter: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  isGenerating: boolean;
  onAddOutfit: () => void;
  onEditOutfit: (outfit: CharacterOutfit) => void;
  onDeleteOutfit: (id: string) => void;
  onSetDefaultOutfit: (id: string) => void;
  onGenerateOutfitImage: (outfit: CharacterOutfit) => void;
}

export function CharacterAppearanceSection({
  currentCharacter,
  setCurrentCharacter,
  isGenerating,
  onAddOutfit,
  onEditOutfit,
  onDeleteOutfit,
  onSetDefaultOutfit,
  onGenerateOutfitImage,
}: CharacterAppearanceSectionProps) {
  return (
    <>
      <TabsContent value="appearance" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="hairColor">{t("character.hairColor")}</Label>
            <Input
              id="hairColor"
              placeholder={t("character.hairColorPlaceholder")}
              value={currentCharacter.appearance.hairColor}
              onChange={(e) =>
                setCurrentCharacter({
                  ...currentCharacter,
                  appearance: {
                    ...currentCharacter.appearance,
                    hairColor: e.target.value,
                  },
                }, true)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hairStyle">{t("character.hairStyle")}</Label>
            <Input
              id="hairStyle"
              placeholder={t("character.hairStylePlaceholder")}
              value={currentCharacter.appearance.hairStyle}
              onChange={(e) =>
                setCurrentCharacter({
                  ...currentCharacter,
                  appearance: {
                    ...currentCharacter.appearance,
                    hairStyle: e.target.value,
                  },
                }, true)
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="eyeColor">{t("character.eyeColor")}</Label>
            <Input
              id="eyeColor"
              placeholder={t("character.eyeColorPlaceholder")}
              value={currentCharacter.appearance.eyeColor}
              onChange={(e) =>
                setCurrentCharacter({
                  ...currentCharacter,
                  appearance: {
                    ...currentCharacter.appearance,
                    eyeColor: e.target.value,
                  },
                }, true)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="height">{t("character.height")}</Label>
            <Input
              id="height"
              list="height-suggestions"
              placeholder={t("character.heightPlaceholder")}
              value={currentCharacter.appearance.height}
              onChange={(e) =>
                setCurrentCharacter({
                  ...currentCharacter,
                  appearance: {
                    ...currentCharacter.appearance,
                    height: e.target.value,
                  },
                }, true)
              }
            />
            <datalist id="height-suggestions">
              {heightSuggestions.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="build">{t("character.build")}</Label>
          <Input
            id="build"
            list="build-suggestions"
            placeholder={t("character.buildPlaceholder")}
            value={currentCharacter.appearance.build}
            onChange={(e) =>
                setCurrentCharacter({
                  ...currentCharacter,
                  appearance: {
                    ...currentCharacter.appearance,
                    build: e.target.value,
                  },
                }, true)
              }
          />
          <datalist id="build-suggestions">
            {buildSuggestions.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>

        <div className="space-y-2">
          <Label htmlFor="clothing">{t("character.clothing")}</Label>
          <Textarea
            id="clothing"
            placeholder={t("character.clothingPlaceholder")}
            rows={3}
            value={currentCharacter.appearance.clothing}
            onChange={(e) =>
              setCurrentCharacter({
                ...currentCharacter,
                appearance: {
                  ...currentCharacter.appearance,
                  clothing: e.target.value,
                },
              }, true)
            }
          />
        </div>
      </TabsContent>

      <TabsContent value="outfits" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">{t("character.outfitBranch")}</Label>
            <p className="text-sm text-muted-foreground">
              {t("character.outfitBranchDesc")}
            </p>
          </div>
          <Button
            onClick={onAddOutfit}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            {t("character.addOutfit")}
          </Button>
        </div>

        {currentCharacter.outfits &&
          currentCharacter.outfits.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentCharacter.outfits.map((outfit) => (
                <Card
                  key={outfit.id}
                  className={`border ${outfit.isDefault ? "border-amber-500/50 bg-amber-950/20" : "border-slate-700"}`}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">
                            {outfit.name}
                          </h4>
                          {outfit.isDefault && (
                            <Badge
                              variant="outline"
                              className="text-amber-400 border-amber-400"
                            >
                              {t("character.defaultOutfit")}
                            </Badge>
                          )}
                        </div>
                        {outfit.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {outfit.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditOutfit(outfit)}
                        >
                          {t("character.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() =>
                            onDeleteOutfit(outfit.id)
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm">
                        <span className="text-muted-foreground">
                          {t("character.outfitClothing")}
                        </span>
                        {outfit.clothing}
                      </p>
                      {outfit.accessories &&
                        outfit.accessories.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {outfit.accessories.map((acc) => (
                              <Badge
                                key={acc}
                                variant="secondary"
                                className="text-xs"
                              >
                                {acc}
                              </Badge>
                            ))}
                          </div>
                        )}
                    </div>

                    {outfit.imageUrl && (
                      <div className="aspect-square max-w-[120px] rounded-lg overflow-hidden border border-slate-700">
                        <img
                          src={resolveImageUrl(outfit.imageUrl)}
                          alt={outfit.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={() =>
                          onGenerateOutfitImage(outfit)
                        }
                        disabled={isGenerating}
                      >
                        {isGenerating ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3" />
                        )}
                        {t("character.generateImage")}
                      </Button>
                      {!outfit.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            onSetDefaultOutfit(outfit.id)
                          }
                        >
                          {t("character.setDefault")}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

        {(!currentCharacter.outfits ||
          currentCharacter.outfits.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              <Shirt className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t("character.noOutfits")}</p>
              <p className="text-sm">{t("character.noOutfitsHint")}</p>
            </div>
          )}
      </TabsContent>
    </>
  );
}
