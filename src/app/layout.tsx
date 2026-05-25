import type { Metadata } from "next";
import "./globals.css";
import { SidebarWithSearch } from "./SidebarWithSearch";
import { OnboardingGuide } from "@/shared/presentation/onboarding";
import { ToastProvider } from "@/shared/presentation/Toast";
import { NetworkStatusAlert } from "@/shared/presentation/NetworkStatusAlert";
import { ConfigCheckBanner } from "@/modules/prompt";
import { PerformanceMonitorPanel } from "@/shared/presentation/PerformanceMonitorPanel";
import { MigrationInitializer } from "./MigrationInitializer";
import { VideoTaskManagerInitializer } from "@/modules/video";
import { BeforeUnloadGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { QueryProvider } from "@/presentation/providers/query-provider";
import { ThemeProvider } from "@/shared/presentation/ThemeProvider";
import { ClientProviders } from "./ClientProviders";

export const metadata: Metadata = {
  title: "AI Animation Studio Personal - 智能动画创作平台",
  description: "一站式AI动画制作平台，创造角色、设计场景、编织故事",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased dark">
      <body className="h-full flex bg-background">
        <ClientProviders>
          <QueryProvider>
          <ThemeProvider>
          <MigrationInitializer />
          <VideoTaskManagerInitializer />
          <BeforeUnloadGuard />
          <ToastProvider>
            <NetworkStatusAlert />
            <SidebarWithSearch />
            <main
              className="flex-1 h-full overflow-y-auto transition-[margin-left] duration-200"
              style={{ marginLeft: "var(--sidebar-width, 220px)" }}
            >
              <ConfigCheckBanner />
              <div className="p-6">{children}</div>
            </main>
          </ToastProvider>
          <OnboardingGuide />
          <PerformanceMonitorPanel />
          </ThemeProvider>
          </QueryProvider>
        </ClientProviders>
      </body>
    </html>
  );
}
