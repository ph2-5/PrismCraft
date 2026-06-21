import type { Character, CreateCharacterInput, UpdateCharacterInput } from "@/domain/schemas";
import { characterService } from "../services";
import { deleteCharacterWithRefs } from "@/modules/persistence";
import { createCrudHooks } from "@/shared/hooks/create-crud-hooks";

const crud = createCrudHooks<Character, CreateCharacterInput, UpdateCharacterInput>({
  entityName: "characters",
  service: characterService,
  deleteFn: deleteCharacterWithRefs,
});

export const useCharacters = crud.useList;
export const useCharacter = crud.useOne;
export const useCharacterCount = crud.useCount;
export const useCreateCharacter = crud.useCreate;
export const useUpdateCharacter = crud.useUpdate;
export const useDeleteCharacter = crud.useDelete;
