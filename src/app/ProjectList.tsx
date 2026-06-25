import { Link } from "react-router-dom";
import { t } from "@/shared/constants";
import {
  Bot,
  Palette,
  Layers,
  Zap,
  ArrowRight,
} from "lucide-react";

function FeatureCard({
  icon,
  title,
  description,
  href,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  color: string;
  bgColor: string;
}) {
  return (
    <Link to={href}>
      <div className="card h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer group border-2 border-slate-700/50 bg-slate-800/50 overflow-hidden" style={{ padding: 16 }}>
        <div className={`h-1.5 bg-gradient-to-r ${color}`} />
        <div className={`bg-gradient-to-br ${bgColor} pb-4`}>
          <div
            className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white mb-3 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-lg`}
          >
            {icon}
          </div>
          <div className="text-lg text-slate-100 group-hover:text-white transition-colors">
            {title}
          </div>
        </div>
        <div className="pt-4">
          <div className="text-slate-400 leading-relaxed text-sm">
            {description}
          </div>
          <div className="mt-4 flex items-center text-sm font-semibold text-slate-400 group-hover:text-purple-400 transition-colors">
            <span>{t("home.learnMore")}</span>
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function ProjectList() {
  const features = [
    {
      icon: <Bot className="w-8 h-8" />,
      title: t("home.smartCharacter"),
      description: t("home.smartCharacterDesc"),
      color: "from-purple-500 to-violet-600",
      bgColor: "from-purple-900/30 to-violet-900/30",
      href: "/characters",
    },
    {
      icon: <Palette className="w-8 h-8" />,
      title: t("home.immersiveScene"),
      description: t("home.immersiveSceneDesc"),
      color: "from-blue-500 to-cyan-600",
      bgColor: "from-blue-900/30 to-cyan-900/30",
      href: "/scenes",
    },
    {
      icon: <Layers className="w-8 h-8" />,
      title: t("home.proStorytelling"),
      description: t("home.proStorytellingDesc"),
      color: "from-orange-500 to-red-600",
      bgColor: "from-orange-900/30 to-red-900/30",
      href: "/storyboard",
    },
  ];

  return (
    <section className="px-4 py-12 lg:py-16 bg-slate-900/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-900/30 mb-3">
            <Zap className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-purple-300">
              {t("home.coreFeatures")}
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-4">
            {t("home.workflowTitle")}
          </h2>
          <p className="text-base text-slate-400 max-w-2xl mx-auto">
            {t("home.workflowDesc")}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.href} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
