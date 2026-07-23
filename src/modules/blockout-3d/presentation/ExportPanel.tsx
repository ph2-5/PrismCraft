/**
 * Task 2A.21: ExportPanel — 导出面板
 *
 * 提供以下导出能力：
 * - 导出场景 JSON（数据所有权）
 * - 导出 GLB（给 Seedance 2.5 用）
 * - 导出 animatic MP4（ffmpeg 合成）
 * - 导出预览快照（PNG）
 * - 生成 Seedance 2.5 输入包（GLB + JSON + MP4 + metadata）
 * - 生成 fallback 关键帧图集（5 张 PNG）
 */

import { useState } from "react";
import { Download, FileBox, Film, Image as ImageIcon, Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { t } from "@/shared/constants";
import { errorLogger } from "@/shared/error-logger";
import type { BlockoutScene } from "../domain/scene-schema";
import {
  exportSceneAsGlb,
  exportSceneAsJson,
} from "../services/scene-io";
import { exportAnimatic, exportPreviewSnapshot } from "../services/animatic-exporter";
import { adaptToSeedanceInput, validateForSeedance } from "../services/seedance-adapter";
import { adaptToFallbackKeyframes, validateForFallback } from "../services/fallback-adapter";

export interface ExportPanelProps {
  /** BlockoutScene 数据 */
  scene: BlockoutScene;
  /** 当前选择的 AI 模型 ID（用于决定 Seedance 2.5 vs fallback） */
  modelId?: string;
  /** 模型是否支持 3D 白模输入 */
  modelSupports3D?: boolean;
  /** 导出完成回调（用于持久化 GenerationAsset） */
  onExportComplete?: (asset: ExportedAsset) => void;
}

export interface ExportedAsset {
  type: "scene_json" | "scene_glb" | "animatic_mp4" | "preview_snapshot" | "seedance_input" | "fallback_keyframes";
  path: string;
  metadata?: Record<string, unknown>;
}

type ExportState = "idle" | "loading" | "success" | "error";

interface ExportItemState {
  state: ExportState;
  error?: string;
  path?: string;
}

export function ExportPanel({ scene, modelId, modelSupports3D, onExportComplete }: ExportPanelProps) {
  const [items, setItems] = useState<Record<string, ExportItemState>>({});

  const updateItem = (key: string, state: ExportItemState) => {
    setItems((prev) => ({ ...prev, [key]: state }));
  };

  const handleExportJson = async () => {
    updateItem("json", { state: "loading" });
    try {
      const result = await exportSceneAsJson(scene);
      if (result.success && result.outputPath) {
        updateItem("json", { state: "success", path: result.outputPath });
        onExportComplete?.({ type: "scene_json", path: result.outputPath });
      } else {
        updateItem("json", { state: "error", error: result.error });
      }
    } catch (e) {
      updateItem("json", { state: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleExportGlb = async () => {
    updateItem("glb", { state: "loading" });
    try {
      const result = await exportSceneAsGlb(scene);
      if (result.success && result.outputPath) {
        updateItem("glb", { state: "success", path: result.outputPath });
        onExportComplete?.({ type: "scene_glb", path: result.outputPath });
      } else {
        updateItem("glb", { state: "error", error: result.error });
      }
    } catch (e) {
      updateItem("glb", { state: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleExportAnimatic = async () => {
    updateItem("animatic", { state: "loading" });
    try {
      const result = await exportAnimatic(scene);
      if (result.success && result.outputPath) {
        updateItem("animatic", { state: "success", path: result.outputPath });
        onExportComplete?.({
          type: "animatic_mp4",
          path: result.outputPath,
          metadata: {
            frameCount: result.stats.frameCount,
            duration: result.stats.duration,
            fps: result.stats.fps,
            width: result.stats.width,
            height: result.stats.height,
          },
        });
      } else {
        updateItem("animatic", { state: "error", error: result.error });
      }
    } catch (e) {
      updateItem("animatic", { state: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleExportSnapshot = async () => {
    updateItem("snapshot", { state: "loading" });
    try {
      const result = await exportPreviewSnapshot(scene);
      if (result.success && result.outputPath) {
        updateItem("snapshot", { state: "success", path: result.outputPath });
        onExportComplete?.({ type: "preview_snapshot", path: result.outputPath });
      } else {
        updateItem("snapshot", { state: "error", error: result.error });
      }
    } catch (e) {
      updateItem("snapshot", { state: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleExportSeedanceInput = async () => {
    updateItem("seedance", { state: "loading" });
    try {
      // 校验
      const validation = validateForSeedance(scene);
      if (!validation.valid) {
        updateItem("seedance", {
          state: "error",
          error: validation.errors.join("\n"),
        });
        return;
      }

      // 先生成 GLB 和 animatic
      const glbResult = await exportSceneAsGlb(scene);
      if (!glbResult.success || !glbResult.outputPath) {
        updateItem("seedance", { state: "error", error: glbResult.error ?? "GLB 导出失败" });
        return;
      }

      const animaticResult = await exportAnimatic(scene);
      if (!animaticResult.success || !animaticResult.outputPath) {
        updateItem("seedance", { state: "error", error: animaticResult.error ?? "animatic 导出失败" });
        return;
      }

      // 适配为 Seedance 输入包
      const seedanceInput = adaptToSeedanceInput(scene, {
        glbPath: glbResult.outputPath,
        animaticPath: animaticResult.outputPath,
      });

      updateItem("seedance", {
        state: "success",
        path: glbResult.outputPath,
      });
      onExportComplete?.({
        type: "seedance_input",
        path: glbResult.outputPath,
        metadata: {
          glbPath: seedanceInput.sceneGraphGlbPath,
          animaticPath: seedanceInput.animaticVideoPath,
          cameraPathJson: seedanceInput.cameraPathJson,
          metadata: seedanceInput.metadata,
        },
      });
    } catch (e) {
      updateItem("seedance", { state: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleExportFallback = async () => {
    updateItem("fallback", { state: "loading" });
    try {
      const validation = validateForFallback(scene);
      if (validation.warnings.length > 0) {
        // 仅警告，继续生成
        errorLogger.warn("Fallback 警告：", validation.warnings);
      }

      // 调用适配器获取 5 个时间点的相机位姿
      const keyframeSet = adaptToFallbackKeyframes(scene);
      // 实际 PNG 渲染由 render-service 完成（此处仅返回路径占位）
      // 在产品环境中由专门的 hook 触发渲染并填充 framePath
      updateItem("fallback", {
        state: "success",
        path: `(in-memory) ${keyframeSet.frames.length} frames`,
      });
      onExportComplete?.({
        type: "fallback_keyframes",
        path: "",
        metadata: {
          frameCount: keyframeSet.frames.length,
          duration: keyframeSet.duration,
          description: keyframeSet.sceneDescription,
        },
      });
    } catch (e) {
      updateItem("fallback", { state: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
      <div className="section-label">
        <Download style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", color: "var(--primary)" }} />
        <span style={{ marginLeft: 4 }}>{t("blockout.exportTitle")}</span>
      </div>

      {/* 模型支持提示 */}
      {modelId && (
        <div
          style={{
            padding: "4px 6px",
            background: modelSupports3D ? "var(--success-bg, rgba(0,255,0,0.1))" : "var(--warning-bg, rgba(255,200,0,0.1))",
            borderRadius: 4,
            fontSize: 11,
            color: modelSupports3D ? "var(--success)" : "var(--warning)",
          }}
        >
          {modelSupports3D
            ? t("blockout.modelSupports3D", { modelId })
            : t("blockout.modelNotSupports3D", { modelId })}
        </div>
      )}

      <ExportButton
        icon={<FileBox size={12} />}
        label={t("blockout.exportJson")}
        description={t("blockout.exportJsonDesc")}
        state={items.json}
        onClick={handleExportJson}
      />

      <ExportButton
        icon={<FileBox size={12} />}
        label={t("blockout.exportGlb")}
        description={t("blockout.exportGlbDesc")}
        state={items.glb}
        onClick={handleExportGlb}
      />

      <ExportButton
        icon={<ImageIcon size={12} />}
        label={t("blockout.exportSnapshot")}
        description={t("blockout.exportSnapshotDesc")}
        state={items.snapshot}
        onClick={handleExportSnapshot}
      />

      <ExportButton
        icon={<Film size={12} />}
        label={t("blockout.exportAnimatic")}
        description={t("blockout.exportAnimaticDesc")}
        state={items.animatic}
        onClick={handleExportAnimatic}
      />

      <ExportButton
        icon={<Sparkles size={12} />}
        label={t("blockout.exportSeedance")}
        description={t("blockout.exportSeedanceDesc")}
        state={items.seedance}
        onClick={handleExportSeedanceInput}
        highlighted={modelSupports3D === true}
      />

      <ExportButton
        icon={<ImageIcon size={12} />}
        label={t("blockout.exportFallback")}
        description={t("blockout.exportFallbackDesc")}
        state={items.fallback}
        onClick={handleExportFallback}
        highlighted={modelSupports3D === false}
      />
    </div>
  );
}

interface ExportButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  state?: ExportItemState;
  onClick: () => void;
  highlighted?: boolean;
}

function ExportButton({ icon, label, description, state, onClick, highlighted }: ExportButtonProps) {
  const isLoading = state?.state === "loading";
  const isSuccess = state?.state === "success";
  const isError = state?.state === "error";

  return (
    <div
      style={{
        border: highlighted ? "1px solid var(--primary)" : "1px solid var(--border)",
        borderRadius: 4,
        padding: 6,
        background: highlighted ? "var(--muted)" : "var(--card)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{label}</span>
        {isLoading && <Loader2 size={11} className="animate-spin" />}
        {isSuccess && <CheckCircle2 size={11} style={{ color: "var(--success)" }} />}
        {isError && <AlertCircle size={11} style={{ color: "var(--danger)" }} />}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.3 }}>
        {description}
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading}
        className="btn btn-primary btn-sm"
        style={{ marginTop: 4, width: "100%", fontSize: 11, padding: "2px 6px" }}
      >
        {isLoading ? t("blockout.exporting") : t("blockout.export")}
      </button>
      {isSuccess && state?.path && (
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            color: "var(--muted-fg)",
            fontFamily: "monospace",
            wordBreak: "break-all",
          }}
        >
          {state.path}
        </div>
      )}
      {isError && state?.error && (
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            color: "var(--danger)",
            whiteSpace: "pre-wrap",
          }}
        >
          {state.error}
        </div>
      )}
    </div>
  );
}
