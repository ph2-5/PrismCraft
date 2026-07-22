/**
 * Agent 设置独立页面
 *
 * 将原 AgentSettingsPanel 的下拉面板内容拆分为独立页面：
 * - 人格切换
 * - AI 模型选择
 * - 最大循环次数 / 温度
 * - ffmpeg 路径配置
 * - 搜索配置 + 测试
 *
 * 设置项通过 useAgent().settings / updateSettings 管理；
 * ffmpeg 与搜索配置通过 getConfig/setConfig 持久化到主进程配置。
 */

"use client";

import { useCallback } from "react";
import { ArrowLeft, Bot } from "lucide-react";
import { useAgent } from "../hooks/use-agent";
import { AgentSettingsForm } from "./AgentSettingsForm";
import { t } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";

export function AgentSettingsPage() {
  const { settings, updateSettings } = useAgent();
  const { guardedPush } = useNavigationGuard();

  const handleBack = useCallback(() => {
    void guardedPush("/agent");
  }, [guardedPush]);

  return (
    <PageErrorBoundary pageName={t("agent.settingsPage")}>
      <div className="fade-in flex flex-col h-full">
        {/* 顶部标题栏 */}
        <div className="top-tabs justify-between">
          <span className="font-semibold text-sm flex items-center gap-2">
            <Bot size={14} />
            {t("agent.settingsPage")}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-xs gap-1"
            onClick={handleBack}
            title={t("agent.backToAgent")}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("agent.backToAgent")}
          </button>
        </div>

        {/* 内容区：居中卡片 */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-2xl mx-auto">
            <div className="mb-4">
              <h1 className="text-lg font-semibold">{t("agent.settingsPage")}</h1>
              <p className="text-xs text-muted-foreground mt-1">
                {t("agent.settingsPageDesc")}
              </p>
            </div>
            <div className="card !p-4 space-y-4">
              <AgentSettingsForm settings={settings} onUpdate={updateSettings} />
            </div>
          </div>
        </div>
      </div>
    </PageErrorBoundary>
  );
}
