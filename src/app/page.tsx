"use client";

import Link from "next/link";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  Zap,
  Layers,
  Palette,
  Bot,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  useCharacters,
} from "@/modules/character";
import {
  useScenes,
} from "@/modules/scene";
import {
  useStories,
} from "@/modules/story";
import {
  useDownloadExport,
} from "@/modules/asset";
import type { Character, Scene, Story } from "@/domain/schemas";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { checkConfigStatus } from "@/shared/api-config";

interface ApiStatus {
  text?: { provider: string; configured: boolean };
  image?: { provider: string; configured: boolean };
  video?: { provider: string; configured: boolean };
}

export default function Home() {
  const { data: characters = [] } = useCharacters();
  const { data: scenes = [] } = useScenes();
  const { data: stories = [] } = useStories();
  const downloadExportMutation = useDownloadExport();
  const [apiStatus, setApiStatus] = useState<ApiStatus>({});

  useEffect(() => {
    let cancelled = false;
    const checkApiStatus = async () => {
      try {
        const status = await checkConfigStatus();
        if (!cancelled && status) {
          const mapped: ApiStatus = {};
          if (status.text?.configured) mapped.text = { provider: status.text.provider, configured: true };
          if (status.image?.configured) mapped.image = { provider: status.image.provider, configured: true };
          if (status.video?.configured) mapped.video = { provider: status.video.provider, configured: true };
          setApiStatus(mapped);
        }
      } catch (error) {
        errorLogger.debug("[App] 检查 API 状态失败:", error instanceof Error ? error.message : error);
      }
    };
    checkApiStatus();
    return () => { cancelled = true; };
  }, []);

  const { error: showError } = useToastHelpers();

  const exportAllData = async () => {
    try {
      await downloadExportMutation.mutateAsync();
    } catch (err) {
      errorLogger.error("导出失败:", err);
      showError("导出失败", "数据导出过程中出现错误，请重试");
    }
  };

  const features = [
    {
      icon: <Bot className="w-8 h-8" />,
      title: "智能角色创造",
      description:
        "AI辅助设计独特的动画角色，自定义外貌、性格、服装风格。支持多种艺术风格和细节定制。",
      color: "from-purple-500 to-violet-600",
      bgColor: "from-purple-900/30 to-violet-900/30",
      href: "/characters",
    },
    {
      icon: <Palette className="w-8 h-8" />,
      title: "沉浸式场景设计",
      description:
        "从室内到室外，从现实到幻想，构建引人入胜的故事背景。AI帮你实现视觉构想，营造完美氛围。",
      color: "from-blue-500 to-cyan-600",
      bgColor: "from-blue-900/30 to-cyan-900/30",
      href: "/scenes",
    },
    {
      icon: <Layers className="w-8 h-8" />,
      title: "专业故事编排",
      description:
        "规划故事脉络，设置情节转折，编排角色互动。AI生成连贯的动画叙事，让每个故事都精彩纷呈。",
      color: "from-orange-500 to-red-600",
      bgColor: "from-orange-900/30 to-red-900/30",
      href: "/story",
    },
  ];

  const workflow = [
    {
      step: "01",
      title: "创建角色",
      desc: "设计动画主角，定义外观和性格",
      icon: <Users className="w-6 h-6" />,
    },
    {
      step: "02",
      title: "搭建场景",
      desc: "构建故事环境，营造视觉氛围",
      icon: <Image className="w-6 h-6" />,
    },
    {
      step: "03",
      title: "编排故事",
      desc: "规划情节对话，设计角色互动",
      icon: <BookOpen className="w-6 h-6" />,
    },
    {
      step: "04",
      title: "生成动画",
      desc: "AI生成作品，一键导出分享",
      icon: <Film className="w-6 h-6" />,
    },
  ];

  const totalItems = characters.length + scenes.length + stories.length;

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
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
                AI驱动的动画创作平台
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
                <span className="block text-slate-100">用AI</span>
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400">
                  创造你的动画世界
                </span>
              </h1>
              <p className="max-w-2xl mx-auto text-base md:text-lg text-slate-400 leading-relaxed">
                从角色设计到场景构建，再到故事编排，AI Animation Studio
                让动画创作变得简单而强大。无需专业技能，释放你的创意潜能。
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link href="/quick-generate">
                <Button
                  size="lg"
                  className="gap-2 px-8 py-6 text-base bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-xl shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300 hover:scale-105 rounded-xl"
                >
                  <Wand2 className="w-5 h-5" />
                  快速生成视频
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/story">
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2 px-8 py-6 text-base border-2 border-slate-700 hover:border-blue-600 hover:bg-blue-900/20 rounded-xl text-slate-200"
                >
                  <Layers className="w-5 h-5" />
                  专业创作模式
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                className="gap-2 px-8 py-6 text-base border-2 border-slate-700 hover:border-purple-600 hover:bg-purple-900/20 rounded-xl text-slate-200"
                onClick={exportAllData}
                disabled={downloadExportMutation.isPending}
              >
                {downloadExportMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                导出数据
              </Button>
            </div>
          </div>

          {totalItems > 0 && (
            <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto pt-4">
              <StatCard
                count={characters.length}
                label="角色"
                color="from-purple-400 to-purple-500"
                characters={characters}
              />
              <StatCard
                count={scenes.length}
                label="场景"
                color="from-blue-400 to-blue-500"
                scenes={scenes}
              />
              <StatCard
                count={stories.length}
                label="故事"
                color="from-orange-400 to-orange-500"
                stories={stories}
              />
            </div>
          )}

          {(apiStatus.text?.configured ||
            apiStatus.image?.configured ||
            apiStatus.video?.configured) && (
            <div className="flex items-center justify-center pt-2">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/80 backdrop-blur-sm shadow-lg border border-slate-700/50">
                <Server className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-slate-300">
                  API已配置:
                </span>
                {apiStatus.text?.configured && (
                  <ApiStatusBadge
                    color="blue"
                    label={`文本: ${apiStatus.text.provider}`}
                  />
                )}
                {apiStatus.image?.configured && (
                  <ApiStatusBadge
                    color="purple"
                    label={`图片: ${apiStatus.image.provider}`}
                  />
                )}
                {apiStatus.video?.configured && (
                  <ApiStatusBadge
                    color="orange"
                    label={`视频: ${apiStatus.video.provider}`}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 py-12 lg:py-16 bg-slate-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-900/30 mb-3">
              <Zap className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-semibold text-purple-300">
                核心功能
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-4">
              完整的AI动画制作工作流
            </h2>
            <p className="text-base text-slate-400 max-w-2xl mx-auto">
              从创意构思到最终成品，一站式解决你的动画创作需求
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature, index) => (
              <FeatureCard key={index} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="px-4 py-12 lg:py-16 bg-gradient-to-br from-slate-900 to-purple-900/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-4">
              四步完成创作
            </h2>
            <p className="text-base text-slate-400">
              简单直观的创作流程，让你的想法快速变成动画
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

      {/* CTA Section */}
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
                准备好开始你的动画创作之旅了吗？
              </h2>
              <p className="text-base md:text-lg opacity-90 max-w-2xl mx-auto">
                无论你是专业动画师还是初学者，AI Animation Studio
                都能帮助你将创意变为现实
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Link href="/story">
                  <Button
                    size="lg"
                    className="gap-2 px-8 py-6 text-base bg-white text-purple-600 hover:bg-white/90 shadow-xl rounded-xl"
                  >
                    <Wand2 className="w-5 h-5" />
                    立即开始创作
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

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
    <Link href={href}>
      <Card className="h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer group border-2 border-slate-700/50 bg-slate-800/50 overflow-hidden">
        <div className={`h-1.5 bg-gradient-to-r ${color}`} />
        <CardHeader className={`bg-gradient-to-br ${bgColor} pb-4`}>
          <div
            className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white mb-3 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-lg`}
          >
            {icon}
          </div>
          <CardTitle className="text-lg text-slate-100 group-hover:text-white transition-colors">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <CardDescription className="text-slate-400 leading-relaxed text-sm">
            {description}
          </CardDescription>
          <div className="mt-4 flex items-center text-sm font-semibold text-slate-400 group-hover:text-purple-400 transition-colors">
            <span>了解更多</span>
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </div>
        </CardContent>
      </Card>
    </Link>
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

function StatCard({
  count,
  label,
  color,
  characters,
  scenes,
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
          {characters
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
          {scenes
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
