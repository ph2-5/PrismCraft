/**
 * Agent 设置表单（无外层容器和关闭按钮）
 *
 * 从 AgentSettingsPanel 抽取的核心表单部分，供：
 * - AgentSettingsPanel（原下拉面板，保留向后兼容）
 * - AgentSettingsPage（独立设置页）
 * 共用。
 */

"use client";

import type { AgentSettings } from "../hooks/use-agent";
import type { AgentPersona } from "../domain/prompts";
import { t } from "@/shared/constants";
import { ModelSelector } from "@/modules/prompt";
import { Check } from "lucide-react";
import { FfmpegConfigSection, SearchConfigSection, SearchTestSection } from "./AgentSettingsSections";

interface AgentSettingsFormProps {
  settings: AgentSettings;
  onUpdate: (partial: Partial<AgentSettings>) => void;
}

const PERSONAS: Array<{ key: AgentPersona; labelKey: string; descKey: string }> = [
  { key: "default", labelKey: "agent.persona.default", descKey: "agent.persona.defaultDesc" },
  { key: "creative", labelKey: "agent.persona.creative", descKey: "agent.persona.creativeDesc" },
  { key: "technical", labelKey: "agent.persona.technical", descKey: "agent.persona.technicalDesc" },
];

export function AgentSettingsForm({ settings, onUpdate }: AgentSettingsFormProps) {
  return (
    <>
      {/* 人格切换 */}
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          {t("agent.persona")}
        </div>
        <div className="space-y-1">
          {PERSONAS.map((p) => (
            <button
              key={p.key}
              onClick={() => onUpdate({ persona: p.key })}
              className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                settings.persona === p.key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted"
              }`}
            >
              <div>
                <div className="font-medium">{t(p.labelKey)}</div>
                <div className="text-[10px] text-muted-foreground">{t(p.descKey)}</div>
              </div>
              {settings.persona === p.key && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          ))}
        </div>
      </div>

      {/* AI 模型选择 */}
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          {t("agent.model")}
        </div>
        <ModelSelector
          capability="text"
          value={settings.textModel ?? null}
          onChange={(selection) => onUpdate({ textModel: selection })}
          compact
        />
        <div className="mt-1 text-[10px] text-muted-foreground">
          {t("agent.modelHint")}
        </div>
      </div>

      {/* 最大循环次数 */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {t("agent.maxIterations")}
          </span>
          <span className="font-mono text-xs">{settings.maxIterations}</span>
        </div>
        <input
          type="range"
          min={1}
          max={30}
          step={1}
          value={settings.maxIterations}
          onChange={(e) => onUpdate({ maxIterations: Number(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* 温度 */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {t("agent.temperature")}
          </span>
          <span className="font-mono text-xs">{settings.temperature.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={settings.temperature}
          onChange={(e) => onUpdate({ temperature: Number(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* ffmpeg 配置 */}
      <FfmpegConfigSection />

      {/* 搜索配置 */}
      <SearchConfigSection />

      {/* 搜索配置测试（RAG 检索） */}
      <SearchTestSection />
    </>
  );
}
