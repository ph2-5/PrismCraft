import { useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import { t } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName={t("page.notFound")}>
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 space-y-4">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <h2 className="text-xl font-semibold">{t("page.notFound")}</h2>
        <p className="text-muted-foreground text-center max-w-md">
          {t("page.notFoundDesc")}
        </p>
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
