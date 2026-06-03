import { Link } from "react-router-dom";
import { t } from "@/shared/constants";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
} from "@/shared/ui/card";
import {
  Sparkles,
  Users,
  Image,
  BookOpen,
  Wand2,
  Download,
  Loader2,
  Server,
  Film,
  ArrowRight,
  Layers,
} from "lucide-react";
import type { Character, Scene, Story } from "@/domain/schemas";

interface ApiStatus {
  text?: { provider: string; configured: boolean };
  image?: { provider: string; configured: boolean };
  video?: { provider: string; configured: boolean };
}

interface QuickActionsProps {
  characters: Character[];
  scenes: Scene[];
  stories: Story[];
  dataLoading: boolean;
  apiStatus: ApiStatus;
  onExportAllData: () => void;
  isExportPending: boolean;
}

function StatCard({
  count,
  label,
  color,
  characters: chars,
  scenes: scns,
}: {
  count: number;
  label: string;
  color: string;
  characters?: Character[];
  scenes?: Scene[];
  stories?: Story[];
}) {
  return (
    <Card className="border-2 border-slate-700/50 bg-slate-800/80 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all">
      <CardContent className="pt-6">
        <div
          className={`text-4xl md:text-5xl font-bold bg-gradient-to-r ${color} bg-clip-text text-transparent mb-2`}
        >
          {count}
        </div>
        <p className="text-sm font-semibold text-slate-400 mb-4">{label}</p>
        <div className="flex -space-x-2">
          {chars
            ?.slice(0, 3)
            .map(
              (char) =>
                char.generatedImage && (
                  <img
                    key={char.id}
                    src={char.generatedImage}
                    alt={char.name}
                    className="w-8 h-8 rounded-full border-2 border-slate-800 object-cover"
                  />
                ),
            )}
          {scns
            ?.slice(0, 3)
            .map(
              (scene) =>
                scene.generatedImage && (
                  <img
                    key={scene.id}
                    src={scene.generatedImage}
                    alt={scene.name}
                    className="w-8 h-8 rounded-full border-2 border-slate-800 object-cover"
                  />
                ),
            )}
          {count > 3 && (
            <div
              className={`w-8 h-8 rounded-full bg-gradient-to-r ${color} border-2 border-slate-800 flex items-center justify-center text-white text-xs font-bold`}
            >
              +{count - 3}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ApiStatusBadge({ color, label }: { color: string; label: string }) {
  const colorClasses = {
    blue: "bg-blue-900/50 text-blue-300 border-blue-700/50",
    purple: "bg-purple-900/50 text-purple-300 border-purple-700/50",
    orange: "bg-orange-900/50 text-orange-300 border-orange-700/50",
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold border ${colorClasses[color as keyof typeof colorClasses]}`}
    >
      {label}
    </span>
  );
}

function WorkflowStep({
  step,
  title,
  desc,
  icon,
  index,
}: {
  step: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  index: number;
}) {
  const colors = [
    "from-purple-500 to-purple-600",
    "from-blue-500 to-cyan-600",
    "from-orange-500 to-red-600",
    "from-green-500 to-emerald-600",
  ];

  return (
    <div className="relative z-10 text-center">
      <div
        className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${colors[index]} flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform duration-300`}
      >
        {icon}
      </div>
      <div className="text-xs font-bold text-slate-500 mb-1">{step}</div>
      <h3 className="text-base font-bold text-slate-100 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}

export function QuickActions({
  characters,
  scenes,
  stories,
  dataLoading,
  apiStatus,
  onExportAllData,
  isExportPending,
}: QuickActionsProps) {
  const totalItems = characters.length + scenes.length + stories.length;

  const workflow = [
    {
      step: "01",
      title: t("home.stepCreateChar"),
      desc: t("home.stepCreateCharDesc"),
      icon: <Users className="w-6 h-6" />,
    },
    {
      step: "02",
      title: t("home.stepBuildScene"),
      desc: t("home.stepBuildSceneDesc"),
      icon: <Image className="w-6 h-6" />,
    },
    {
      step: "03",
      title: t("home.stepEditStory"),
      desc: t("home.stepEditStoryDesc"),
      icon: <BookOpen className="w-6 h-6" />,
    },
    {
      step: "04",
      title: t("home.stepGenAnimation"),
      desc: t("home.stepGenAnimationDesc"),
      icon: <Film className="w-6 h-6" />,
    },
  ];

  return (
    <>
      <section className="relative flex flex-col items-center justify-center px-4 py-12 lg:py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900/30 to-slate-900" />
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-10 left-10 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
          <div
            className="absolute bottom-10 right-10 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "1s" }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "2s" }}
          />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/80 backdrop-blur-sm shadow-lg border border-purple-800/50">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-semibold text-purple-300">
                {t("home.aiPlatform")}
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
                <span className="block text-slate-100">{t("home.useAI")}</span>
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400">
                  {t("home.createWorld")}
                </span>
              </h1>
              <p className="max-w-2xl mx-auto text-base md:text-lg text-slate-400 leading-relaxed">
                {t("home.heroDesc")}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link to="/quick-generate">
                <Button
                  size="lg"
                  className="gap-2 px-8 py-6 text-base bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-xl shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300 hover:scale-105 rounded-xl"
                >
                  <Wand2 className="w-5 h-5" />
                  {t("home.quickGenerate")}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/story">
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2 px-8 py-6 text-base border-2 border-slate-700 hover:border-blue-600 hover:bg-blue-900/20 rounded-xl text-slate-200"
                >
                  <Layers className="w-5 h-5" />
                  {t("home.proMode")}
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                className="gap-2 px-8 py-6 text-base border-2 border-slate-700 hover:border-purple-600 hover:bg-purple-900/20 rounded-xl text-slate-200"
                onClick={onExportAllData}
                disabled={isExportPending}
              >
                {isExportPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                {t("home.exportData")}
              </Button>
            </div>
          </div>

          {dataLoading ? (
            <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto pt-4">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="border-2 border-slate-700/50 bg-slate-800/80 backdrop-blur-sm shadow-lg animate-pulse"> {/* key-stable: static skeleton */}
                  <CardContent className="pt-6">
                    <div className="h-10 w-16 bg-slate-700 rounded mb-2" />
                    <div className="h-4 w-12 bg-slate-700 rounded mb-4" />
                    <div className="flex -space-x-2">
                      <div className="w-8 h-8 rounded-full bg-slate-700" />
                      <div className="w-8 h-8 rounded-full bg-slate-700" />
                      <div className="w-8 h-8 rounded-full bg-slate-700" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : totalItems > 0 ? (
            <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto pt-4">
              <StatCard
                count={characters.length}
                label={t("sidebar.characters")}
                color="from-purple-400 to-purple-500"
                characters={characters}
              />
              <StatCard
                count={scenes.length}
                label={t("sidebar.scenes")}
                color="from-blue-400 to-blue-500"
                scenes={scenes}
              />
              <StatCard
                count={stories.length}
                label={t("sidebar.story")}
                color="from-orange-400 to-orange-500"
                stories={stories}
              />
            </div>
          ) : null}

          {(apiStatus.text?.configured ||
            apiStatus.image?.configured ||
            apiStatus.video?.configured) && (
            <div className="flex items-center justify-center pt-2">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/80 backdrop-blur-sm shadow-lg border border-slate-700/50">
                <Server className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-slate-300">
                  {t("home.apiConfigured")}
                </span>
                {apiStatus.text?.configured && (
                  <ApiStatusBadge
                    color="blue"
                    label={t("home.textProvider", { provider: apiStatus.text.provider })}
                  />
                )}
                {apiStatus.image?.configured && (
                  <ApiStatusBadge
                    color="purple"
                    label={t("home.imageProvider", { provider: apiStatus.image.provider })}
                  />
                )}
                {apiStatus.video?.configured && (
                  <ApiStatusBadge
                    color="orange"
                    label={t("home.videoProvider", { provider: apiStatus.video.provider })}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="px-4 py-12 lg:py-16 bg-gradient-to-br from-slate-900 to-purple-900/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-4">
              {t("home.fourSteps")}
            </h2>
            <p className="text-base text-slate-400">
              {t("home.fourStepsDesc")}
            </p>
          </div>

          <div className="relative">
            <div className="hidden md:block absolute top-16 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-800 via-pink-800 to-orange-800 rounded-full" />
            <div className="grid gap-6 md:grid-cols-4">
              {workflow.map((item, index) => (
                <WorkflowStep key={item.step} {...item} index={index} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 lg:py-16 bg-slate-900/50">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 p-8 lg:p-12 text-center text-white">
            <div className="absolute inset-0 bg-black/10" />
            <div className="absolute top-0 left-0 w-full h-full">
              <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute bottom-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 space-y-6">
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold">
                {t("home.ctaTitle")}
              </h2>
              <p className="text-base md:text-lg opacity-90 max-w-2xl mx-auto">
                {t("home.ctaDesc")}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Link to="/story">
                  <Button
                    size="lg"
                    className="gap-2 px-8 py-6 text-base bg-white text-purple-600 hover:bg-white/90 shadow-xl rounded-xl"
                  >
                    <Wand2 className="w-5 h-5" />
                    {t("home.startNow")}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
