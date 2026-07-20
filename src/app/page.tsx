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
import type { ReactNode, KeyboardEvent } from "react";
import { t, APP_VERSION } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { ApiKeyAlert } from "@/shared/presentation/onboarding";
import { useHomePage } from "./hooks/use-home-page";

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
        <div className="home-hero-bg text-center py-12 px-6 border-b border-border">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="home-brand-icon w-12 h-12 rounded-[14px] flex items-center justify-center text-2xl">
              <Film size={24} />
            </div>
            <span className="home-brand-title text-[26px] font-extrabold">
              PrismCraft
            </span>
            <span className="badge badge-info text-[10px] align-super">{APP_VERSION}</span>
          </div>
          <div className="text-sm text-muted-foreground mb-1.5">{t("home.brandSlogan")}</div>
          <div className="text-[11px] text-muted-foreground opacity-60">{t("home.brandSub")}</div>
        </div>

        {/* API Key 未配置警告 */}
        <ApiKeyAlert />

        {/* 三工作流卡片 */}
        <div className="grid grid-cols-3 gap-4 p-6 border-b border-border">
          <WorkflowCard
            cardClass="card home-card-primary"
            iconBg="rgba(var(--primary-rgb),0.06)"
            icon={<BookOpen size={32} />}
            title={t("home.storyMode")}
            desc={t("home.storyModeDesc")}
            ctaText={t("home.storyModeCta")}
            ctaColor="text-[var(--primary-hover)]"
            badges={[
              { text: t("home.importNovel"), cls: "badge-info" },
              { text: t("home.aiSplit"), cls: "badge-info" },
              { text: t("home.batchGenerate"), cls: "badge-info" },
            ]}
            onClick={() => navigate("/story")}
            ariaLabel={t("home.storyMode")}
          />

          <WorkflowCard
            cardClass="card home-card-warning"
            iconBg="rgba(var(--warning-rgb),0.06)"
            icon={<Film size={32} />}
            title={t("home.storyboardMode")}
            desc={t("home.storyboardModeDesc")}
            ctaText={t("home.storyboardModeCta")}
            ctaColor="text-warning"
            badges={[
              { text: t("home.elementBinding"), cls: "badge-warning" },
              { text: t("home.promptEdit"), cls: "badge-warning" },
              { text: t("home.shotByShot"), cls: "badge-warning" },
            ]}
            onClick={() => navigate("/storyboard")}
            ariaLabel={t("home.storyboardMode")}
          />

          <WorkflowCard
            cardClass="card home-card-success"
            iconBg="rgba(var(--success-rgb),0.06)"
            icon={<Zap size={32} />}
            title={t("home.quickMode")}
            desc={t("home.quickModeDesc")}
            ctaText={t("home.quickModeCta")}
            ctaColor="text-success"
            badges={[
              { text: t("home.textToImage"), cls: "badge-success" },
              { text: t("home.textToVideo"), cls: "badge-success" },
              { text: t("home.referenceImage"), cls: "badge-success" },
            ]}
            onClick={() => navigate("/quick-generate")}
            ariaLabel={t("home.quickMode")}
          />
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
          <div className="grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
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
                  className="card home-project-card p-4 cursor-pointer transition-all hover:-translate-y-0.5"
                  onClick={() => navigate(`/storyboard/${story.id}`)}
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="home-story-icon w-10 h-10 rounded-[10px] flex items-center justify-center text-lg shrink-0">
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
                    {story.updatedAt ? new Date(story.updatedAt).toLocaleDateString() : ""}
                  </div>
                </div>
              );
            })}
            {stories.length === 0 && (
              <div
                className="card home-empty-card p-4 flex items-center justify-center flex-col gap-2 transition-all"
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
      className="card home-quick-entry p-3.5 text-center cursor-pointer transition-all"
      onClick={onClick}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs font-semibold">{title}</div>
      <div className="text-[10px] text-muted-foreground">{subtitle}</div>
    </div>
  );
}

interface WorkflowCardProps {
  cardClass: string;
  iconBg: string;
  icon: ReactNode;
  title: string;
  desc: string;
  ctaText: string;
  ctaColor: string;
  badges: { text: string; cls: string }[];
  onClick: () => void;
  ariaLabel: string;
}

function WorkflowCard({ cardClass, iconBg, icon, title, desc, ctaText, ctaColor, badges, onClick, ariaLabel }: WorkflowCardProps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };
  return (
    <div
      className={`${cardClass} p-5 cursor-pointer relative overflow-hidden transition-all hover:-translate-y-0.5`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full" style={{ background: iconBg }} />
      <div className="text-[32px] mb-3 relative">{icon}</div>
      <div className="text-[15px] font-bold mb-1 relative">{title}</div>
      <div className="text-[11px] text-muted-foreground leading-relaxed mb-3 relative">{desc}</div>
      <div className={`flex items-center gap-1.5 text-[11px] relative ${ctaColor}`}>
        <span>{ctaText}</span>
        <span className="text-sm">→</span>
      </div>
      <div className="flex gap-1 mt-2.5 relative">
        {badges.map((b, i) => (
          <span key={i} className={`badge ${b.cls} text-[9px]`}>{b.text}</span>
        ))}
      </div>
    </div>
  );
}
