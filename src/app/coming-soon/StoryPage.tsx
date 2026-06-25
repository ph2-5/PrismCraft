import { ComingSoon } from "@/shared/presentation/ComingSoon";
import { t } from "@/shared/constants";

export default function StoryPage() {
  return <ComingSoon icon="📖" title={t("sidebar.story")} descriptionKey="comingSoon.agentDesc" />;
}
