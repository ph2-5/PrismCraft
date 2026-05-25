import type { Result } from "@/domain/types";
import { err, fromAsyncThrowable, NotFoundError, ValidationError } from "@/domain/types";
import type { Character, CreateCharacterInput, UpdateCharacterInput } from "@/domain/schemas";
import { createCharacterInputSchema, updateCharacterInputSchema } from "@/domain/schemas";
import { container } from "@/infrastructure/di";
import { DomainEvents } from "@/shared/event-types";
import { normalizeGender } from "@/shared/utils/utils";

export const characterService = {
  async getAll(): Promise<Result<Character[]>> {
    return fromAsyncThrowable(() => container.characterStorage.getCharacters());
  },

  async getById(id: string): Promise<Result<Character>> {
    return fromAsyncThrowable(async () => {
      const result = await container.characterStorage.getCharacterById(id);
      if (!result) throw new NotFoundError("Character", id);
      return result;
    });
  },

  async create(input: CreateCharacterInput): Promise<Result<Character>> {
    const parsed = createCharacterInputSchema.safeParse(input);
    if (!parsed.success) {
      return err(new ValidationError(parsed.error.message));
    }

    const id = `char_${crypto.randomUUID()}`;
    const dataWithNormalizedGender = {
      ...parsed.data,
      gender: normalizeGender(parsed.data.gender),
    };
    return fromAsyncThrowable(async () => {
      await container.characterStorage.createCharacter({ ...dataWithNormalizedGender, id });
      const created = { ...dataWithNormalizedGender, id } as Character;
      container.eventBus.emit(DomainEvents.CHARACTER_CREATED, { id, characterName: created.name });
      return created;
    });
  },

  async update(id: string, input: UpdateCharacterInput): Promise<Result<void>> {
    const parsed = updateCharacterInputSchema.safeParse({ ...input, id });
    if (!parsed.success) {
      return err(new ValidationError(parsed.error.message));
    }

    return fromAsyncThrowable(async () => {
      const existing = await container.characterStorage.getCharacterById(id);
      if (!existing) throw new NotFoundError("Character", id);
      const dataWithNormalizedGender = {
        ...parsed.data,
        ...(parsed.data.gender !== undefined && { gender: normalizeGender(parsed.data.gender) }),
      };
      await container.characterStorage.updateCharacter(id, dataWithNormalizedGender);
      container.eventBus.emit(DomainEvents.CHARACTER_UPDATED, { id, characterName: existing.name });
    });
  },

  async delete(id: string): Promise<Result<void>> {
    return fromAsyncThrowable(async () => {
      const existing = await container.characterStorage.getCharacterById(id);
      if (!existing) throw new NotFoundError("Character", id);
      await container.characterStorage.deleteCharacter(id);
      container.eventBus.emit(DomainEvents.CHARACTER_DELETED, { id, characterName: existing.name });
    });
  },

  async count(): Promise<Result<number>> {
    return fromAsyncThrowable(async () => {
      const characters = await container.characterStorage.getCharacters();
      return characters.length;
    });
  },
};
