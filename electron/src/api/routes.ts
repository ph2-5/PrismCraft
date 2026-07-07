import type { Route } from "./types";
import { coreRoutes } from "./route-groups/core-routes";
import { dbRoutes } from "./route-groups/db-routes";
import { downloadRoutes } from "./route-groups/download-routes";
import { fileRoutes } from "./route-groups/file-routes";
import { generationRoutes } from "./route-groups/generation-routes";
import { pluginRoutes } from "./route-groups/plugin-routes";
import { shotRoutes } from "./route-groups/shot-routes";
import { storyboardRoutes } from "./route-groups/storyboard-routes";

export const routes: Record<string, Route> = {
  ...coreRoutes,
  ...dbRoutes,
  ...downloadRoutes,
  ...fileRoutes,
  ...generationRoutes,
  ...pluginRoutes,
  ...shotRoutes,
  ...storyboardRoutes,
};
