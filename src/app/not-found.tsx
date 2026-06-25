import { useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import { t } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName={t("page.notFound")}>
      <div className="coming-soon">
        <div className="coming-soon-icon">404</div>
        <h2 className="coming-soon-title">{t("page.notFound")}</h2>
        <p className="coming-soon-desc">{t("page.notFoundDesc")}</p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => navigate("/")}
        >
          <Home className="w-4 h-4 mr-2" />
          {t("page.backToHome")}
        </button>
      </div>
    </PageErrorBoundary>
  );
}
