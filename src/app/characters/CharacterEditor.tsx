import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { GitBranch } from "lucide-react";
import { t } from "@/shared/constants/messages";
import type { Character, CharacterOutfit } from "@/domain/schemas";
import { CharacterBasicInfo } from "./CharacterBasicInfo";
import { CharacterAppearanceSection } from "./CharacterAppearanceSection";

interface CharacterEditorProps {
  currentCharacter: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  customTrait: string;
  setCustomTrait: (v: string) => void;
  addTrait: (trait: string) => void;
  removeTrait: (trait: string) => void;
  isGenerating: boolean;
  onAddOutfit: () => void;
  onEditOutfit: (outfit: CharacterOutfit) => void;
  onDeleteOutfit: (id: string) => void;
  onSetDefaultOutfit: (id: string) => void;
  onGenerateOutfitImage: (outfit: CharacterOutfit) => void;
}

export function CharacterEditor({
  currentCharacter,
  setCurrentCharacter,
  customTrait,
  setCustomTrait,
  addTrait,
  removeTrait,
  isGenerating,
  onAddOutfit,
  onEditOutfit,
  onDeleteOutfit,
  onSetDefaultOutfit,
  onGenerateOutfitImage,
}: CharacterEditorProps) {
  return (
    <Tabs defaultValue="basic" className="space-y-6">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="basic">{t("character.tabBasic")}</TabsTrigger>
        <TabsTrigger value="appearance">{t("character.tabAppearance")}</TabsTrigger>
        <TabsTrigger value="outfits" className="gap-1">
          <GitBranch className="w-3 h-3" />
          {t("character.tabOutfits")}
        </TabsTrigger>
        <TabsTrigger value="personality">{t("character.tabPersonality")}</TabsTrigger>
      </TabsList>

      <CharacterBasicInfo
        currentCharacter={currentCharacter}
        setCurrentCharacter={setCurrentCharacter}
        customTrait={customTrait}
        setCustomTrait={setCustomTrait}
        addTrait={addTrait}
        removeTrait={removeTrait}
      />

      <CharacterAppearanceSection
        currentCharacter={currentCharacter}
        setCurrentCharacter={setCurrentCharacter}
        isGenerating={isGenerating}
        onAddOutfit={onAddOutfit}
        onEditOutfit={onEditOutfit}
        onDeleteOutfit={onDeleteOutfit}
        onSetDefaultOutfit={onSetDefaultOutfit}
        onGenerateOutfitImage={onGenerateOutfitImage}
      />
    </Tabs>
  );
}
