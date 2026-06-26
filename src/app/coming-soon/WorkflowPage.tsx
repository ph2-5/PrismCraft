import { ComingSoon } from "@/shared/presentation/ComingSoon";
import { t } from "@/shared/constants/messages";

export default function WorkflowPage() {
  return <ComingSoon icon="🔗" title={t("sidebar.workflow")} descriptionKey="comingSoon.workflowDesc" />;
}
