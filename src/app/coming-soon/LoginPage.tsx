import { ComingSoon } from "@/shared/presentation/ComingSoon";
import { t } from "@/shared/constants/messages";

export default function LoginPage() {
  return <ComingSoon icon="🔑" title={t("sidebar.login")} descriptionKey="comingSoon.agentDesc" />;
}
