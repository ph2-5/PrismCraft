/**
 * Task 2A.4 — NovelImportPage 主页面
 *
 * 管理 PipelineState，按 stage 渲染子步骤：
 * - project_init: 显示 ImportStep（文本粘贴）
 * - content_import: rawText 为空 → ImportStep；有 rawText → SegmentList
 * - character_manage 及之后: 占位（Task 2A.5 实现）
 * - done: 调用 onComplete
 *
 * Stage 转换通过 Task 2A.3 的 transition() 函数实现。
 * 实际分段逻辑（调用 segmentNovelTextTool）在后续 Task 中接入。
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { t } from "@/shared/constants";
import type { PipelineState, PipelineConfig, NovelSegment } from "../domain/types";
import {
  getStagesForMode,
  transition,
  canTransition,
  getAutoGates,
} from "../import/services/pipeline-machine";
import { PipelineProgress } from "./PipelineProgress";
import { PipelineControls } from "./PipelineControls";
import { ImportStep } from "./ImportStep";
import { SegmentList } from "./SegmentList";

export interface NovelImportPageProps {
  onComplete: () => void;
  /** 可选：初始配置（默认 semi + professional） */
  initialConfig?: Partial<PipelineConfig>;
}

/** 默认 PipelineConfig */
function makeDefaultConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  const base: PipelineConfig = {
    mode: "semi",
    aiAssistLevel: "professional",
    projectName: "",
    style: "",
    format: "novel",
    aiModel: "",
    autoCreateEntities: false,
    gates: {
      confirmSegments: true,
      confirmEntities: true,
      confirmShots: true,
      confirmPrompts: true,
    },
  };
  // 合并 overrides，gates 单独处理避免浅合并丢失内层字段
  const { gates: overrideGates, ...restOverrides } = overrides;
  return {
    ...base,
    ...restOverrides,
    gates: overrideGates ? { ...base.gates, ...overrideGates } : base.gates,
  };
}

/** 初始 PipelineState */
function makeInitialState(config: PipelineConfig): PipelineState {
  return {
    stage: "project_init",
    step: 1,
    config,
    rawText: "",
    segments: [],
    currentSegmentIndex: 0,
    characters: [],
    scenes: [],
    characterImportance: {},
    prompts: [],
    generationResults: [],
  };
}

export function NovelImportPage({ onComplete, initialConfig }: NovelImportPageProps) {
  const [state, setState] = useState<PipelineState>(() =>
    makeInitialState(makeDefaultConfig(initialConfig ?? {})),
  );
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // 根据当前模式计算阶段子集（用于进度条显示）
  const stagesForMode = useMemo(() => getStagesForMode(state.config.aiAssistLevel), [state.config.aiAssistLevel]);

  // === Handlers ===

  /** 处理导入文本：更新 rawText，触发分段（占位：暂用简单分段） */
  const handleImport = useCallback((text: string) => {
    setState((prev) => {
      // 从 project_init 转换到 content_import
      const next = canTransition(prev.stage, "content_import")
        ? transition(prev, "content_import")
        : prev;
      return { ...next, rawText: text };
    });
    // TODO: Task 2A.5 接入 segmentNovelTextTool 实际分段
    // 当前用简单分段占位（按段落分隔）
    const placeholderSegments: NovelSegment[] = text
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0)
      .slice(0, 20)
      .map((para, i) => ({
        id: `seg-${i + 1}`,
        title: `段落 ${i + 1}`,
        summary: para.slice(0, 80) + (para.length > 80 ? "..." : ""),
        startChar: 0,
        endChar: para.length,
        estimatedDuration: Math.max(3, Math.min(15, Math.round(para.length / 50))),
        keyEvents: [],
        text: para,
      }));
    setState((prev) => ({ ...prev, segments: placeholderSegments }));
    // 默认全选
    setSelectedSegmentIds(placeholderSegments.map((s) => s.id));
  }, []);

  /** 切换段落选中 */
  const handleToggle = useCallback((id: string) => {
    setSelectedSegmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  /** 全选/取消全选 */
  const handleSelectAll = useCallback(() => {
    setSelectedSegmentIds((prev) => {
      const allIds = state.segments.map((s) => s.id);
      const allSelected = allIds.length > 0 && prev.length === allIds.length;
      return allSelected ? [] : allIds;
    });
  }, [state.segments]);

  /** 判断是否可以前进到下一阶段 */
  const canProceed = useCallback((): boolean => {
    if (isProcessing) return false;
    switch (state.stage) {
      case "project_init":
        // 需要先导入文本
        return state.rawText.trim().length > 0;
      case "content_import":
        // 需要至少选中一个段落
        return selectedSegmentIds.length > 0;
      case "done":
        return false;
      default:
        // character_manage 及之后阶段由 Task 2A.5 实现
        return false;
    }
  }, [state, selectedSegmentIds, isProcessing]);

  /** 下一步：触发 stage 转换 */
  const handleNext = useCallback(() => {
    if (!canProceed()) return;
    setState((prev) => {
      switch (prev.stage) {
        case "project_init":
          // 已经在 ImportStep 导入文本后，state 已切换到 content_import
          // 此情况通常不会触发，但保留兜底
          return canTransition(prev.stage, "content_import")
            ? transition(prev, "content_import")
            : prev;
        case "content_import":
          // 前进到 character_manage（Part 2 实现 UI）
          return canTransition(prev.stage, "character_manage")
            ? transition(prev, "character_manage")
            : prev;
        default:
          // 其他 stage 的前进由 Task 2A.5+ 实现
          return prev;
      }
    });
  }, [canProceed, state.stage]);

  /** 自动执行：跳过所有可选 gates，直接推进到 done */
  const handleAutoRun = useCallback(() => {
    if (isProcessing) return;
    setIsProcessing(true);
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, mode: "auto", gates: getAutoGates({ ...prev.config, mode: "auto" }) },
    }));
    // 实际自动执行逻辑在 Task 2A.5+ 实现
    // 当前只更新 config，UI 显示 autoRun 已激活
    window.setTimeout(() => setIsProcessing(false), 500);
  }, [isProcessing]);

  // === done 阶段调用 onComplete ===
  useEffect(() => {
    if (state.stage === "done") {
      onComplete();
    }
  }, [state.stage, onComplete]);

  // === 渲染 ===

  const showImportStep = state.stage === "project_init" || (state.stage === "content_import" && state.rawText.length === 0);
  const showSegmentList = state.stage === "content_import" && state.rawText.length > 0;
  const isDone = state.stage === "done";

  return (
    <div className="flex flex-col h-full">
      <PipelineProgress stage={state.stage} stages={stagesForMode} />
      <div className="flex-1 overflow-y-auto p-6">
        {isDone ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-base font-bold mb-1">{t("novel.controls.complete")}</div>
          </div>
        ) : showImportStep ? (
          <ImportStep onImport={handleImport} />
        ) : showSegmentList ? (
          <SegmentList
            segments={state.segments}
            selectedIds={selectedSegmentIds}
            onToggle={handleToggle}
            onSelectAll={handleSelectAll}
          />
        ) : (
          // character_manage 及之后阶段：Task 2A.5 实现
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <div className="text-[12px]">
              {t(`novel.stages.${state.stage}` as Parameters<typeof t>[0])}
              — 此阶段 UI 由 Task 2A.5 实现
            </div>
          </div>
        )}
      </div>
      <PipelineControls
        canProceed={canProceed()}
        isProcessing={isProcessing}
        onNext={handleNext}
        onAutoRun={handleAutoRun}
        mode={state.config.mode}
      />
    </div>
  );
}
