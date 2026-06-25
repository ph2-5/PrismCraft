import { ComingSoon } from "@/shared/presentation/ComingSoon";
import { t } from "@/shared/constants/messages";

export default function TemplateMarketPage() {
  return <ComingSoon icon="🛒" title={t("sidebar.templateMarket")} descriptionKey="comingSoon.agentDesc" />;
}
