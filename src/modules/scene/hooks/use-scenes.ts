import type { Scene, CreateSceneInput, UpdateSceneInput } from "@/domain/schemas";
import { sceneService } from "../services";
import { deleteSceneWithRefs } from "@/modules/persistence";
import { createCrudHooks } from "@/shared/hooks/create-crud-hooks";

const crud = createCrudHooks<Scene, CreateSceneInput, UpdateSceneInput>({
  entityName: "scenes",
  service: sceneService,
  deleteFn: deleteSceneWithRefs,
});

export const useScenes = crud.useList;
export const useScene = crud.useOne;
export const useSceneCount = crud.useCount;
export const useCreateScene = crud.useCreate;
export const useUpdateScene = crud.useUpdate;
export const useDeleteScene = crud.useDelete;
