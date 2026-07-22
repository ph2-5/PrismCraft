/**
 * Agent 设置面板（下拉式，保留向后兼容）
 *
 * P1-4 重构：核心表单内容已抽取到 AgentSettingsForm + AgentSettingsSections，
 * 此处仅作为 AgentPage 头部的下拉面板容器，复用 AgentSettingsForm。
 *
 * 独立设置页见 AgentSettingsPage（路由 /agent/settings）。
 */

"use client";

import { useEffect } from "react";
import type { AgentSettings } from "../hooks/use-agent";
import type { AgentPersona } from "../domain/prompts";
import { AGENT_PERSONAS } from "../domain/prompts";
import { t } from "@/shared/constants";
import { X } from "lucide-react";
import { AgentSettingsForm } from "./AgentSettingsForm";

interface AgentSettingsPanelProps {
  settings: AgentSettings;
  onUpdate: (partial: Partial<AgentSettings>) => void;
  onClose: () => void;
}

export function AgentSettingsPanel({ settings, onUpdate, onClose }: AgentSettingsPanelProps) {
  // a11y：Escape 关闭面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="absolute right-0 top-full z-50 mt-1 max-h-[80vh] w-[calc(100vw-2rem)] max-w-96 overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("agent.settings")}</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("aria.close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 复用 AgentSettingsForm（与独立设置页保持一致） */}
      <div className="space-y-3">
        <AgentSettingsForm settings={settings} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

/** 获取当前人格的 system prompt（供外部使用） */
export function getPersonaPrompt(persona: AgentPersona): string | undefined {
  if (persona === "default") return undefined;
  return AGENT_PERSONAS[persona];
}
