import { ComingSoon } from "@/shared/presentation/ComingSoon";
import { t } from "@/shared/constants";

export default function AgentPage() {
  return <ComingSoon icon="🤖" title={t("sidebar.agent")} descriptionKey="comingSoon.agentDesc" />;
}
