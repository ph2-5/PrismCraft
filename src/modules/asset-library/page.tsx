import { useState } from "react";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { useAssetLibraryPage } from "./hooks/use-asset-library-page";
import { AssetLibraryContent } from "./AssetLibraryContent";

export default function AssetLibraryPage() {
  const hookResult = useAssetLibraryPage();
  const [showUploadArea, setShowUploadArea] = useState(true);

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
