/**
 * Phase 7 节点化工作流 — 路由页面（/workflow）
 */
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { t } from "@/shared/constants";
import { WorkflowEditor } from "./presentation/WorkflowEditor";

export default function WorkflowPage() {
  return (
    <PageErrorBoundary pageName={t("workflow.title")}>
      <div className="fade-in flex flex-col h-full min-h-0">
        <WorkflowEditor />
      </div>
    </PageErrorBoundary>
  );
}
