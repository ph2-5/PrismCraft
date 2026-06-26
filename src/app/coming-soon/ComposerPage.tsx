import { ComingSoon } from "@/shared/presentation/ComingSoon";
import { t } from "@/shared/constants";

export default function ComposerPage() {
  return <ComingSoon icon="🖼" title={t("sidebar.composer")} descriptionKey="comingSoon.composerDesc" />;
}
