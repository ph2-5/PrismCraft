/**
 * Task 2A.22: PartialEditPanel — 局部重绘主面板
 *
 * 组合：
 *   - VideoMaskCanvas（视频 + 标记画布）
 *   - MaskToolbar（工具栏：画笔/橡皮/矩形/多边形 + 撤销/重做/清空/反选）
 *   - EditPromptInput（重绘指令输入框 + 提交按钮）
 *   - EditHistoryList（该原视频的重绘历史）
 *
 * 通过 usePartialEdit hook 管理所有状态，组件本身是无状态视图层。
 *
 * 使用方式：
 *   <Modal open={...} onClose={...}>
 *     <PartialEditPanel
 *       sourceVideoAssetId="gen-asset-xxx"
 *       sourceVideoUrl="file:///path/to/video.mp4"
 *       storyId={beat.storyId}
 *       beatId={beat.id}
 *       onClose={handleClose}
 *     />
 *   </Modal>
 *
 * 或直接作为面板嵌入：
 *   <PartialEditPanel ... />
 */

import { useCallback, useEffect, useState } from "react";
import { X, AlertTriangle, Film } from "lucide-react";
import { t } from "@/shared/constants";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { Modal } from "@/shared/presentation/Modal";
import { usePartialEdit } from "./use-partial-edit";
import { VideoMaskCanvas } from "./VideoMaskCanvas";
import { MaskToolbar } from "./MaskToolbar";
import { EditPromptInput } from "./EditPromptInput";
import { EditHistoryList } from "./EditHistoryList";

export interface PartialEditPanelProps {
  /** 原视频 Asset ID */
  sourceVideoAssetId: string;
  /** 原视频 URL（用于 VideoMaskCanvas 显示） */
  sourceVideoUrl: string;
  /** 视频宽度（默认 1280，影响 mask 编码分辨率） */
  videoWidth?: number;
  /** 视频高度（默认 720） */
  videoHeight?: number;
  /** 可选：关联 storyId */
  storyId?: string;
  /** 可选：关联 beatId */
  beatId?: string;
  /** 可选：指定 providerId */
  providerId?: string;
  /** 可选：指定 modelId */
  modelId?: string;
  /** 可选：视频时长（秒） */
  duration?: number;
  /** 关闭回调（在 Modal 模式下使用） */
  onClose?: () => void;
  /** 是否以 Modal 形式打开（默认 true） */
  modal?: boolean;
  /** Modal 模式下的 open 状态 */
  open?: boolean;
}

export function PartialEditPanel({
  sourceVideoAssetId,
  sourceVideoUrl,
  videoWidth = 1280,
  videoHeight = 720,
  storyId,
  beatId,
  providerId,
  modelId,
  duration,
  onClose,
  modal = true,
  open = true,
}: PartialEditPanelProps) {
  const partialEdit = usePartialEdit({
    sourceVideoAssetId,
    storyId,
    beatId,
    providerId,
    modelId,
    duration,
  });

  // 预览模式：原视频 vs 重绘后视频
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const previewAsset = partialEdit.selectedHistoryAsset;
  const effectiveVideoUrl = previewAsset
    ? resolveMediaUrl(previewAsset.localPath, previewAsset.url) ?? sourceVideoUrl
    : sourceVideoUrl;

  // 切换预览 Asset 时同步清空 mask（避免在重绘后的视频上标记历史 mask）
  useEffect(() => {
    if (previewAssetId !== (previewAsset?.id ?? null)) {
      setPreviewAssetId(previewAsset?.id ?? null);
      // 选择历史项时仅切换预览，不重置 mask（用户可能想继续编辑原视频）
    }
  }, [previewAsset, previewAssetId]);

  const handleSelectHistoryAsset = useCallback((asset: typeof previewAsset) => {
    partialEdit.setSelectedHistoryAsset(asset);
  }, [partialEdit]);

  const handleClose = useCallback(() => {
    // 简单实现：直接关闭。复杂场景可加入"未保存提示"
    if (partialEdit.isGenerating) {
      // 生成中不允许关闭
      return;
    }
    partialEdit.reset();
    onClose?.();
  }, [partialEdit, onClose]);

  const panelContent = (
    <PanelContent
      sourceVideoAssetId={sourceVideoAssetId}
      sourceVideoUrl={effectiveVideoUrl}
      videoWidth={videoWidth}
      videoHeight={videoHeight}
      partialEdit={partialEdit}
      onSelectHistoryAsset={handleSelectHistoryAsset}
      onClose={modal ? handleClose : undefined}
      isPreviewingHistory={!!previewAsset}
    />
  );

  if (!modal) {
    return panelContent;
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      ariaLabel={t("video.partialEditTitle")}
      closeOnOverlayClick={!partialEdit.isGenerating}
      closeOnEscape={!partialEdit.isGenerating}
      className="partial-edit-modal"
      style={{
        maxWidth: "90vw",
        width: "min(1200px, 90vw)",
        maxHeight: "90vh",
        height: "min(800px, 90vh)",
        display: "flex",
        flexDirection: "column",
        padding: 0,
        gap: 0,
      }}
    >
      {panelContent}
    </Modal>
  );
}

// ─── 内部组件：实际面板内容 ──────────────────────────────────────────────────

interface PanelContentProps {
  sourceVideoAssetId: string;
  sourceVideoUrl: string;
  videoWidth: number;
  videoHeight: number;
  partialEdit: ReturnType<typeof usePartialEdit>;
  onSelectHistoryAsset: (asset: ReturnType<typeof usePartialEdit>["selectedHistoryAsset"]) => void;
  onClose?: () => void;
  isPreviewingHistory: boolean;
}

function PanelContent({
  sourceVideoAssetId,
  sourceVideoUrl,
  videoWidth,
  videoHeight,
  partialEdit,
  onSelectHistoryAsset,
  onClose,
  isPreviewingHistory,
}: PanelContentProps) {
  const {
    mask,
    handleMaskChange,
    activeTool,
    setActiveTool,
    brushSize,
    setBrushSize,
    canUndo,
    canRedo,
    undo,
    redo,
    clear,
    toggleInverseMode,
    editPrompt,
    setEditPrompt,
    handleVideoTimeUpdate,
    isGenerating,
    error,
    startPartialEdit,
    selectedHistoryAsset,
    historyRefreshTrigger,
  } = partialEdit;

  const maskShapesCount = mask.shapes.length;
  const canSubmit = maskShapesCount > 0 && editPrompt.trim().length > 0 && !isGenerating;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    void startPartialEdit();
  }, [canSubmit, startPartialEdit]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Film size={16} style={{ color: "var(--primary)" }} aria-hidden="true" />
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
            {t("video.partialEditTitle")}
          </h3>
          <span
            className="badge badge-info"
            style={{ fontSize: 10, padding: "2px 6px" }}
          >
            {t("video.partialEditDescription")}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={onClose}
            disabled={isGenerating}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ─── Body ────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: 12,
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* 左侧：视频 + 标记 + 工具栏 + 输入框 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            flex: 1,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          {/* 历史预览提示（如果在查看历史） */}
          {isPreviewingHistory && selectedHistoryAsset && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                background: "var(--muted)",
                borderRadius: 6,
                fontSize: 11,
                color: "var(--muted-fg)",
                flexShrink: 0,
              }}
            >
              <Film size={12} aria-hidden="true" />
              <span>
                {t("video.partialEditHistoryItem", {
                  index: 0,
                  time: new Date(selectedHistoryAsset.createdAt).toLocaleString(),
                })}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => onSelectHistoryAsset(null)}
                style={{ marginLeft: "auto", fontSize: 10 }}
              >
                {t("video.partialEditCompareOriginal")}
              </button>
            </div>
          )}

          {/* 视频画布 */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--card2)",
              borderRadius: 8,
              overflow: "hidden",
              padding: 8,
            }}
          >
            <VideoMaskCanvas
              videoUrl={sourceVideoUrl}
              mask={mask}
              onMaskChange={handleMaskChange}
              activeTool={activeTool}
              brushSize={brushSize}
              width={videoWidth}
              height={videoHeight}
              disabled={isGenerating || isPreviewingHistory}
              onTimeUpdate={handleVideoTimeUpdate}
            />
          </div>

          {/* 工具栏 */}
          <MaskToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onClear={clear}
            inverse={mask.inverse ?? false}
            onInverseToggle={toggleInverseMode}
            disabled={isGenerating || isPreviewingHistory}
          />

          {/* 错误提示 */}
          {error && (
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
                padding: "8px 10px",
                background: "var(--destructive-bg, rgba(255, 50, 50, 0.1))",
                border: "1px solid var(--destructive)",
                borderRadius: 6,
                fontSize: 11,
                color: "var(--destructive)",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <span style={{ flex: 1, wordBreak: "break-word" }}>{error.message}</span>
            </div>
          )}

          {/* 指令输入 + 提交按钮 */}
          <EditPromptInput
            value={editPrompt}
            onChange={setEditPrompt}
            onSubmit={handleSubmit}
            disabled={isGenerating || isPreviewingHistory || maskShapesCount === 0}
            isGenerating={isGenerating}
          />

          {/* 状态提示 */}
          {maskShapesCount === 0 && !isPreviewingHistory && (
            <div
              style={{
                fontSize: 11,
                color: "var(--muted-fg)",
                textAlign: "center",
                flexShrink: 0,
              }}
            >
              {t("video.partialEditMaskEmpty")}
            </div>
          )}
        </div>

        {/* 右侧：重绘历史 */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflowY: "auto",
          }}
        >
          <EditHistoryList
            sourceVideoAssetId={sourceVideoAssetId}
            onSelectAsset={onSelectHistoryAsset}
            selectedAssetId={selectedHistoryAsset?.id}
            refreshTrigger={historyRefreshTrigger}
          />
        </div>
      </div>
    </div>
  );
}
