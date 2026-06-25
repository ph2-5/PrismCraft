import { ComingSoon } from "@/shared/presentation/ComingSoon";
import { t } from "@/shared/constants/messages";

export default function WorkspacePage() {
  return <ComingSoon icon="👥" title={t("sidebar.workspace")} descriptionKey="comingSoon.agentDesc" />;
}
