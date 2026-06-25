import "./globals.css";
import { SidebarWithSearch } from "./SidebarWithSearch";
import { OnboardingGuide } from "@/shared/presentation/onboarding";
import { ToastProvider } from "@/shared/presentation/Toast";
import { NetworkStatusAlert } from "@/shared/presentation/NetworkStatusAlert";
import { PerformanceMonitorPanel } from "@/shared/presentation/PerformanceMonitorPanel";
import { MigrationInitializer } from "./MigrationInitializer";
import { VideoTaskManagerInitializer } from "@/modules/video";
import { BeforeUnloadGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { QueryProvider } from "@/presentation/providers/query-provider";
import { ThemeProvider } from "@/shared/presentation/ThemeProvider";
import { ClientProviders } from "./ClientProviders";
import { TitleBar } from "@/shared/presentation/TitleBar";
import { isElectron } from "@/shared/utils/platform";
import { Outlet } from "react-router-dom";

export function RootLayout() {
  const electron = isElectron();
  return (
    <ClientProviders>
      <QueryProvider>
        <ThemeProvider>
          <MigrationInitializer />
          <VideoTaskManagerInitializer />
          <BeforeUnloadGuard />
          <TitleBar />
          <ToastProvider>
            <NetworkStatusAlert />
            <SidebarWithSearch />
            <main
              className={`flex-1 h-full overflow-hidden transition-[margin-left] duration-200${electron ? " pt-9" : ""}`}
              style={{ marginLeft: "var(--sidebar-width, 220px)" }}
            >
              <Outlet />
            </main>
          </ToastProvider>
          <OnboardingGuide />
          <PerformanceMonitorPanel />
        </ThemeProvider>
      </QueryProvider>
    </ClientProviders>
  );
}
