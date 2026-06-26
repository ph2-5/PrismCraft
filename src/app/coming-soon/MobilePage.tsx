import { ComingSoon } from "@/shared/presentation/ComingSoon";
import { t } from "@/shared/constants/messages";

export default function MobilePage() {
  return <ComingSoon icon="📱" title={t("sidebar.mobile")} descriptionKey="comingSoon.mobileDesc" />;
}
