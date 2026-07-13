import type { Story, CreateStoryInput, UpdateStoryInput } from "@/domain/schemas";
import { storyService } from "../services/story-service";
import { createCrudHooks } from "@/shared/hooks/create-crud-hooks";

const crud = createCrudHooks<Story, CreateStoryInput, UpdateStoryInput>({
  entityName: "stories",
  service: storyService,
});

export const useStories = crud.useList;
export const useStory = crud.useOne;
export const useStoryCount = crud.useCount;
export const useCreateStory = crud.useCreate;
export const useUpdateStory = crud.useUpdate;
export const useDeleteStory = crud.useDelete;
