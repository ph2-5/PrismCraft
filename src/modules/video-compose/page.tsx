import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { VideoComposePanel } from "./presentation/VideoComposePanel";

export default function VideoComposePage() {
  return (
    <PageErrorBoundary pageName="视频片段合成">
      <VideoComposePanel />
    </PageErrorBoundary>
  );
}
