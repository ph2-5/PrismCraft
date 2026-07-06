import { useState } from "react";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { useAssetLibraryPage } from "./hooks/useAssetLibraryPage";
import { AssetLibraryContent } from "./AssetLibraryContent";

export default function AssetLibraryPage() {
  const hookResult = useAssetLibraryPage();
  const [showUploadArea, setShowUploadArea] = useState(false);

  return (
    <PageErrorBoundary>
      <AssetLibraryContent
        hookResult={hookResult}
        showUploadArea={showUploadArea}
        setShowUploadArea={setShowUploadArea}
      />
    </PageErrorBoundary>
  );
}
