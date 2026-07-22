import { t } from "@/shared/constants";

interface ComingSoonProps {
  icon: string;
  title: string;
  descriptionKey:
    | "comingSoon.loginDesc"
    | "comingSoon.templateMarketDesc"
    | "comingSoon.workflowDesc"
    | "comingSoon.workspaceDesc"
    | "comingSoon.mobileDesc";
}

export function ComingSoon({ icon, title, descriptionKey }: ComingSoonProps) {
  return (
    <div className="coming-soon fade-in">
      <div className="coming-soon-icon">{icon}</div>
      <div className="coming-soon-title">{title}</div>
      <div className="coming-soon-desc">{t(descriptionKey)}</div>
    </div>
  );
}
