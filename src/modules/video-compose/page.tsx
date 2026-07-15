import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { t } from "@/shared/constants";
import { VideoComposePanel } from "./presentation/VideoComposePanel";

export default function VideoComposePage() {
  return (
    <PageErrorBoundary pageName={t("compose.title")}>
      <VideoComposePanel />
    </PageErrorBoundary>
  );
}
