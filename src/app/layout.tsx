import "./globals.css";
import { lazy, Suspense } from "react";
import { SidebarWithSearch } from "./SidebarWithSearch";
import { ToastProvider } from "@/shared/presentation/Toast";
import { NetworkStatusAlert } from "@/shared/presentation/NetworkStatusAlert";
import { UpdateNotification } from "@/shared/presentation/UpdateNotification";
import { BeforeUnloadGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { GlobalKeyboardActions } from "@/shared/presentation/GlobalKeyboardActions";
import { QueryProvider } from "@/presentation/providers/query-provider";
import { ThemeProvider } from "@/shared/presentation/ThemeProvider";
import { ClientProviders } from "./ClientProviders";
import { TitleBar } from "@/shared/presentation/TitleBar";
import { isElectron } from "@/shared/utils/platform";
import { t } from "@/shared/constants/messages";
import { Outlet } from "react-router-dom";

// Lazy-loaded side-effect and non-critical components to reduce first-screen bundle
const MigrationInitializer = lazy(() =>
  import("./MigrationInitializer").then((m) => ({ default: m.MigrationInitializer }))
);
const VideoTaskManagerInitializer = lazy(() =>
  import("@/modules/video/task-management/presentation/VideoTaskManagerInitializer").then((m) => ({
    default: m.VideoTaskManagerInitializer,
  }))
);
const OnboardingGuide = lazy(() =>
  import("@/shared/presentation/onboarding").then((m) => ({ default: m.OnboardingGuide }))
);
const PerformanceMonitorPanel = lazy(() =>
  import("@/shared/presentation/PerformanceMonitorPanel").then((m) => ({
    default: m.PerformanceMonitorPanel,
  }))
);

export function RootLayout() {
  const electron = isElectron();
  return (
    <ClientProviders>
      <QueryProvider>
        <ThemeProvider>
          <Suspense fallback={null}>
            <MigrationInitializer />
          </Suspense>
          <Suspense fallback={null}>
            <VideoTaskManagerInitializer />
          </Suspense>
          <BeforeUnloadGuard />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded"
          >
            {t("common.skipToMainContent")}
          </a>
          <TitleBar />
          <ToastProvider>
            <GlobalKeyboardActions />
            <NetworkStatusAlert />
            <UpdateNotification />
            <SidebarWithSearch />
            <main
              id="main-content"
              className={`flex-1 h-full overflow-hidden transition-[margin-left] duration-200 ml-[var(--sidebar-width,220px)] bg-[var(--bg-subtle-gradient)]${electron ? " pt-9" : ""}`}
            >
              <Outlet />
            </main>
          </ToastProvider>
          <Suspense fallback={null}>
            <OnboardingGuide />
          </Suspense>
          {/* 性能监视面板仅在开发环境显示，避免生产环境遮挡右下角按钮（如"保存角色"） */}
          {import.meta.env.DEV && (
            <Suspense fallback={null}>
              <PerformanceMonitorPanel />
            </Suspense>
          )}
        </ThemeProvider>
      </QueryProvider>
    </ClientProviders>
  );
}
