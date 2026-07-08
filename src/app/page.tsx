import {
  Film,
  BookOpen,
  Zap,
  FolderOpen,
  Image as ImageIcon,
  Users,
  Building2,
  Package,
  Plus,
} from "lucide-react";
import { t, APP_VERSION } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { useHomePage } from "./hooks/useHomePage";

function HomeSkeleton() {
  return (
    <div className="flex flex-col space-y-6">
      <div className="h-24 skeleton-shimmer rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 skeleton-shimmer rounded-lg" />
        ))}
      </div>
      <div className="h-64 skeleton-shimmer rounded-lg" />
    </div>
  );
}

export default function Home() {
  const {
    characters,
    scenes,
    stories,
    dataLoading,
    navigate,
  } = useHomePage();

  if (dataLoading) {
    return (
      <PageErrorBoundary pageName={t("page.home")}>
        <HomeSkeleton />
      </PageErrorBoundary>
    );
  }

  return (
    <PageErrorBoundary pageName={t("page.home")}>
      <div className="fade-in flex flex-col h-full overflow-y-auto">
        {/* 品牌英雄区 */}
        <div
          className="text-center py-12 px-6 border-b border-border"
          style={{ background: "linear-gradient(180deg, rgba(var(--primary-rgb), 0.06) 0%, transparent 100%)" }}
        >
          <div className="inline-flex items-center gap-3 mb-2">
            <div
              className="w-12 h-12 rounded-[14px] flex items-center justify-center text-2xl"
              style={{
                background: "linear-gradient(135deg, var(--primary), var(--chart-2))",
                boxShadow: "0 4px 20px rgba(var(--primary-rgb), 0.3)",
              }}
            >
              <Film size={24} />
            </div>
            <span
              className="text-[26px] font-extrabold"
              style={{
                background: "linear-gradient(135deg, var(--primary-hover), var(--chart-4))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              PrismCraft
            </span>
            <span className="badge badge-info text-[10px] align-super">{APP_VERSION}</span>
          </div>
          <div className="text-sm text-muted-foreground mb-1.5">{t("home.brandSlogan")}</div>
          <div className="text-[11px] text-muted-foreground opacity-60">{t("home.brandSub")}</div>
        </div>

        {/* 三工作流卡片 */}
        <div className="grid grid-cols-3 gap-4 p-6 border-b border-border">
          {/* 故事模式 */}
          <div
            className="card p-5 cursor-pointer relative overflow-hidden transition-all hover:-translate-y-0.5"
            style={{ border: `2px solid rgba(var(--primary-rgb), 0.15)` }}
            onClick={() => navigate("/story")}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(var(--primary-rgb), 0.4)";
              e.currentTarget.style.boxShadow = "0 8px 30px rgba(var(--primary-rgb), 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(var(--primary-rgb), 0.15)";
              e.currentTarget.style.boxShadow = "";
            }}
          >
            <div
              className="absolute -top-5 -right-5 w-20 h-20 rounded-full"
              style={{ background: "rgba(var(--primary-rgb), 0.06)" }}
            />
            <div className="text-[32px] mb-3 relative"><BookOpen size={32} /></div>
            <div className="text-[15px] font-bold mb-1 relative">{t("home.storyMode")}</div>
            <div className="text-[11px] text-muted-foreground leading-relaxed mb-3 relative">
              {t("home.storyModeDesc")}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] relative" style={{ color: "var(--primary-hover)" }}>
              <span>{t("home.storyModeCta")}</span>
              <span className="text-sm">→</span>
            </div>
            <div className="flex gap-1 mt-2.5 relative">
              <span className="badge badge-info text-[9px]">{t("home.importNovel")}</span>
              <span className="badge badge-info text-[9px]">{t("home.aiSplit")}</span>
              <span className="badge badge-info text-[9px]">{t("home.batchGenerate")}</span>
            </div>
          </div>

          {/* 分镜模式 */}
          <div
            className="card p-5 cursor-pointer relative overflow-hidden transition-all hover:-translate-y-0.5"
            style={{ border: `2px solid rgba(var(--warning-rgb), 0.15)` }}
            onClick={() => navigate("/storyboard")}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(var(--warning-rgb), 0.4)";
              e.currentTarget.style.boxShadow = "0 8px 30px rgba(var(--warning-rgb), 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(var(--warning-rgb), 0.15)";
              e.currentTarget.style.boxShadow = "";
            }}
          >
            <div
              className="absolute -top-5 -right-5 w-20 h-20 rounded-full"
              style={{ background: "rgba(var(--warning-rgb), 0.06)" }}
            />
            <div className="text-[32px] mb-3 relative"><Film size={32} /></div>
            <div className="text-[15px] font-bold mb-1 relative">{t("home.storyboardMode")}</div>
            <div className="text-[11px] text-muted-foreground leading-relaxed mb-3 relative">
              {t("home.storyboardModeDesc")}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] relative" style={{ color: "var(--warning)" }}>
              <span>{t("home.storyboardModeCta")}</span>
              <span className="text-sm">→</span>
            </div>
            <div className="flex gap-1 mt-2.5 relative">
              <span className="badge text-[9px]" style={{ background: "rgba(var(--warning-rgb), 0.12)", color: "var(--warning)" }}>{t("home.elementBinding")}</span>
              <span className="badge text-[9px]" style={{ background: "rgba(var(--warning-rgb), 0.12)", color: "var(--warning)" }}>{t("home.promptEdit")}</span>
              <span className="badge text-[9px]" style={{ background: "rgba(var(--warning-rgb), 0.12)", color: "var(--warning)" }}>{t("home.shotByShot")}</span>
            </div>
          </div>

          {/* 快速生成 */}
          <div
            className="card p-5 cursor-pointer relative overflow-hidden transition-all hover:-translate-y-0.5"
            style={{ border: `2px solid rgba(var(--success-rgb), 0.15)` }}
            onClick={() => navigate("/quick-generate")}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(var(--success-rgb), 0.4)";
              e.currentTarget.style.boxShadow = "0 8px 30px rgba(var(--success-rgb), 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(var(--success-rgb), 0.15)";
              e.currentTarget.style.boxShadow = "";
            }}
          >
            <div
              className="absolute -top-5 -right-5 w-20 h-20 rounded-full"
              style={{ background: "rgba(var(--success-rgb), 0.06)" }}
            />
            <div className="text-[32px] mb-3 relative"><Zap size={32} /></div>
            <div className="text-[15px] font-bold mb-1 relative">{t("home.quickMode")}</div>
            <div className="text-[11px] text-muted-foreground leading-relaxed mb-3 relative">
              {t("home.quickModeDesc")}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] relative" style={{ color: "var(--success)" }}>
              <span>{t("home.quickModeCta")}</span>
              <span className="text-sm">→</span>
            </div>
            <div className="flex gap-1 mt-2.5 relative">
              <span className="badge badge-success text-[9px]">{t("home.textToImage")}</span>
              <span className="badge badge-success text-[9px]">{t("home.textToVideo")}</span>
              <span className="badge badge-success text-[9px]">{t("home.referenceImage")}</span>
            </div>
          </div>
        </div>

        {/* 最近项目 */}
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[15px] font-bold"><FolderOpen className="inline-block" size={16} /> {t("home.recentProjects")}</div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate("/storyboard")}
            >
              + {t("home.newProject")}
            </button>
          </div>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {stories.slice(0, 6).map((story) => {
              const charCount = story.characters?.length ?? 0;
              const sceneCount = story.scenes?.length ?? 0;
              const beats = story.beats ?? [];
              const beatCount = beats.length;
              const assetCount = story.elementIds?.length ?? 0;
              const completedBeats = beats.filter((b) => Boolean(b.videoGen?.videoUrl)).length;
              const statusBadgeClass =
                beatCount === 0
                  ? "badge-warning"
                  : completedBeats === beatCount
                    ? "badge-success"
                    : "badge-info";
              return (
                <div
                  key={story.id}
                  className="card p-4 cursor-pointer transition-all hover:-translate-y-0.5"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--primary)";
                    e.currentTarget.style.boxShadow = "0 4px 16px rgba(var(--primary-rgb), 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.boxShadow = "";
                  }}
                  onClick={() => navigate(`/storyboard/${story.id}`)}
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <div
                      className="w-10 h-10 rounded-[10px] flex items-center justify-center text-lg shrink-0"
                      style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-hover))" }}
                    >
                      <ImageIcon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{story.title || t("story.unnamed")}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{story.description || ""}</div>
                    </div>
                    <span className={`badge ${statusBadgeClass} text-[9px]`}>{t("home.inProgress")}</span>
                  </div>
                  <div className="flex gap-3.5 text-[11px] text-muted-foreground mb-2">
                    <span><Users className="inline-block" size={12} /> {charCount}</span>
                    <span><Building2 className="inline-block" size={12} /> {sceneCount}</span>
                    <span><Film className="inline-block" size={12} /> {beatCount}</span>
                    <span><Package className="inline-block" size={12} /> {assetCount}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {story.updatedAt ? new Date(story.updatedAt).toLocaleDateString("zh-CN") : ""}
                  </div>
                </div>
              );
            })}
            {stories.length === 0 && (
              <div
                className="card p-4 flex items-center justify-center flex-col gap-2 transition-all"
                style={{ border: "2px dashed var(--border)", minHeight: "130px" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--primary)";
                  e.currentTarget.style.background = "rgba(var(--primary-rgb), 0.03)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.background = "";
                }}
                onClick={() => navigate("/storyboard")}
              >
                <div className="text-3xl opacity-40"><Plus size={32} /></div>
                <div className="text-[13px] text-muted-foreground">{t("home.newProject")}</div>
              </div>
            )}
          </div>

          {/* 快速入口 */}
          <div className="mt-6 border-t border-border pt-5">
            <div className="text-sm font-bold mb-3"><Zap className="inline-block" size={14} /> {t("home.quickEntry")}</div>
            <div className="grid grid-cols-4 gap-2.5">
              <QuickEntryCard icon="" title={t("home.characterManage")} subtitle={`${characters.length} ${t("home.characters")}`} onClick={() => navigate("/characters")} />
              <QuickEntryCard icon="" title={t("home.sceneManage")} subtitle={`${scenes.length} ${t("home.scenes")}`} onClick={() => navigate("/scenes")} />
              <QuickEntryCard icon="" title={t("home.assetLibrary")} subtitle={t("home.assetManage")} onClick={() => navigate("/asset-library")} />
              <QuickEntryCard icon="" title={t("home.videoTasks")} subtitle={t("home.taskManage")} onClick={() => navigate("/video-tasks")} />
            </div>
          </div>
        </div>
      </div>
    </PageErrorBoundary>
  );
}

function QuickEntryCard({ icon, title, subtitle, onClick }: { icon: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <div
      className="card p-3.5 text-center cursor-pointer transition-all"
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      onClick={onClick}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs font-semibold">{title}</div>
      <div className="text-[10px] text-muted-foreground">{subtitle}</div>
    </div>
  );
}
