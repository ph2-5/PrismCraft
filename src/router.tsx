import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "./app/layout";

const Home = lazy(() => import("./app/page"));
const StoryboardPage = lazy(() => import("./app/story/page"));
const BeatDetailPage = lazy(() => import("./app/story/beat/$beatId/page"));
const CharactersPage = lazy(() => import("./app/characters/page"));
const ScenesPage = lazy(() => import("./app/scenes/page"));
const AssetLibraryPage = lazy(() => import("./app/asset-library/page"));
const QuickGeneratePage = lazy(() => import("./app/quick-generate/page"));
const SettingsPage = lazy(() => import("./app/settings/page"));
const VideoTasksPage = lazy(() => import("./app/video-tasks/page"));
const NotFound = lazy(() => import("./app/not-found"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-border" />
    </div>
  );
}

function withSuspense(Component: React.LazyExoticComponent<React.ComponentType>) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: withSuspense(Home) },
      { path: "storyboard", element: withSuspense(StoryboardPage) },
      { path: "storyboard/:storyId", element: withSuspense(StoryboardPage) },
      { path: "storyboard/beat/:beatId", element: withSuspense(BeatDetailPage) },
      { path: "characters", element: withSuspense(CharactersPage) },
      { path: "scenes", element: withSuspense(ScenesPage) },
      { path: "asset-library", element: withSuspense(AssetLibraryPage) },
      { path: "quick-generate", element: withSuspense(QuickGeneratePage) },
      { path: "settings", element: withSuspense(SettingsPage) },
      { path: "video-tasks", element: withSuspense(VideoTasksPage) },
      { path: "story", element: withSuspense(lazy(() => import("./app/coming-soon/StoryPage"))) },
      { path: "agent", element: withSuspense(lazy(() => import("./app/agent/page"))) },
      { path: "composer", element: withSuspense(lazy(() => import("./app/coming-soon/ComposerPage"))) },
      { path: "plugins", element: withSuspense(lazy(() => import("./app/coming-soon/PluginsPage"))) },
      { path: "login", element: withSuspense(lazy(() => import("./app/coming-soon/LoginPage"))) },
      { path: "template-market", element: withSuspense(lazy(() => import("./app/coming-soon/TemplateMarketPage"))) },
      { path: "workflow", element: withSuspense(lazy(() => import("./app/coming-soon/WorkflowPage"))) },
      { path: "workspace", element: withSuspense(lazy(() => import("./app/coming-soon/WorkspacePage"))) },
      { path: "mobile", element: withSuspense(lazy(() => import("./app/coming-soon/MobilePage"))) },
      { path: "*", element: withSuspense(NotFound) },
    ],
  },
]);
