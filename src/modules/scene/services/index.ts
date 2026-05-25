import type { Result } from "@/domain/types";
import { err, fromAsyncThrowable, NotFoundError, ValidationError } from "@/domain/types";
import type { Scene, CreateSceneInput, UpdateSceneInput } from "@/domain/schemas";
import { createSceneInputSchema, updateSceneInputSchema } from "@/domain/schemas";
import { container } from "@/infrastructure/di";
import { DomainEvents } from "@/shared/event-types";

export const sceneService = {
  async getAll(): Promise<Result<Scene[]>> {
    return fromAsyncThrowable(() => container.sceneStorage.getScenes());
  },

  async getById(id: string): Promise<Result<Scene>> {
    return fromAsyncThrowable(async () => {
      const result = await container.sceneStorage.getSceneById(id);
      if (!result) throw new NotFoundError("Scene", id);
      return result;
    });
  },

  async create(input: CreateSceneInput): Promise<Result<Scene>> {
    const parsed = createSceneInputSchema.safeParse(input);
    if (!parsed.success) {
      return err(new ValidationError(parsed.error.message));
    }

    const id = `scene_${crypto.randomUUID()}`;
    return fromAsyncThrowable(async () => {
      await container.sceneStorage.createScene({ ...parsed.data, id });
      const created = { ...parsed.data, id } as Scene;
      container.eventBus.emit(DomainEvents.SCENE_CREATED, { id, sceneName: created.name });
      return created;
    });
  },

  async update(id: string, input: UpdateSceneInput): Promise<Result<void>> {
    const parsed = updateSceneInputSchema.safeParse({ ...input, id });
    if (!parsed.success) {
      return err(new ValidationError(parsed.error.message));
    }

    return fromAsyncThrowable(async () => {
      const existing = await container.sceneStorage.getSceneById(id);
      if (!existing) throw new NotFoundError("Scene", id);
      await container.sceneStorage.updateScene(id, parsed.data);
      container.eventBus.emit(DomainEvents.SCENE_UPDATED, { id, sceneName: existing.name });
    });
  },

  async delete(id: string): Promise<Result<void>> {
    return fromAsyncThrowable(async () => {
      const existing = await container.sceneStorage.getSceneById(id);
      if (!existing) throw new NotFoundError("Scene", id);
      await container.sceneStorage.deleteScene(id);
      container.eventBus.emit(DomainEvents.SCENE_DELETED, { id, sceneName: existing.name });
    });
  },

  async count(): Promise<Result<number>> {
    return fromAsyncThrowable(async () => {
      const scenes = await container.sceneStorage.getScenes();
      return scenes.length;
    });
  },
};
