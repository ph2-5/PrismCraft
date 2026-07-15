/**
 * 视频合成面板（Task 4.3）
 *
 * 功能：
 * - 左栏：可用片段列表（已完成的视频任务）+ 添加本地文件按钮
 * - 中栏：已选片段列表（拖拽排序）+ 转场配置 + 合成按钮
 * - 右栏：合成结果预览
 *
 * 拖拽排序：HTML5 drag-and-drop（dragstart/dragover/drop）
 */

import { useEffect, type DragEvent } from "react";
import {
  Film,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  Play,
  GripVertical,
  FileVideo,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { EmptyState } from "@/shared/presentation/EmptyState";
import { useVideoCompose } from "../hooks/use-video-compose";
import { TRANSITION_OPTIONS } from "../services/video-composer";

export function VideoComposePanel() {
  const vm = useVideoCompose();
  const dragIdRef = { current: "" };

  // 初始加载可用片段
  useEffect(() => {
    void vm.loadAvailable();
     
  }, []);

  const handleDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>, toId: string) => {
    e.preventDefault();
    const fromId = dragIdRef.current;
    if (fromId && fromId !== toId) {
      vm.reorderSegments(fromId, toId);
    }
    dragIdRef.current = "";
  };

  return (
    <div className="fade-in flex flex-col h-full gap-3 p-3">
      {/* 顶部标题栏 */}
      <div className="top-tabs justify-between">
        <span className="font-semibold text-sm flex items-center gap-1.5">
          <Film size={14} /> 视频片段合成
        </span>
        <div className="toolbar">
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => void vm.loadAvailable()}
            disabled={vm.isLoadingAvailable}
          >
            {vm.isLoadingAvailable ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            刷新片段库
          </button>
        </div>
      </div>

      {/* ffmpeg 不可用警告 */}
      {!vm.ffmpegAvailable && (
        <div className="alert alert-warning text-xs">
          <AlertCircle size={14} />
          <span>FFmpeg 不可用，请先在「设置」中配置 FFmpeg 路径</span>
        </div>
      )}

      {/* 错误提示 */}
      {vm.error && (
        <div className="alert alert-error text-xs">
          <AlertCircle size={14} />
          <span>{vm.error}</span>
          <button className="btn btn-ghost btn-xs ml-auto" onClick={vm.clearResult}>关闭</button>
        </div>
      )}

      {/* 三栏布局 */}
      <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
        {/* 左栏：可用片段库 */}
        <div className="col-span-3 border border-border rounded-md bg-card flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground flex items-center justify-between">
            <span>可用片段</span>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => void vm.addLocalFiles()}
              title="添加本地视频文件"
            >
              <FileVideo size={12} /> 本地
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1.5">
            {vm.isLoadingAvailable && vm.availableSegments.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin mr-1" /> 加载中...
              </div>
            ) : vm.availableSegments.length === 0 ? (
              <EmptyState
                icon={FileVideo}
                title="暂无可用片段"
                description="生成视频后，已完成的任务会显示在这里"
              />
            ) : (
              vm.availableSegments.map((seg) => {
                const added = vm.segments.some((s) => s.id === seg.id);
                return (
                  <div
                    key={seg.id}
                    className="p-2 rounded border border-border bg-card2 text-xs hover:border-primary transition-colors"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="flex-1 truncate" title={seg.label}>{seg.label}</span>
                      <button
                        className="btn btn-ghost btn-xs shrink-0"
                        onClick={() => vm.addSegment(seg)}
                        disabled={added}
                        title={added ? "已添加" : "添加到合成列表"}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate" title={seg.path}>
                      {seg.path}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 中栏：合成列表（拖拽排序） */}
        <div className="col-span-5 border border-border rounded-md bg-card flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground flex items-center justify-between">
            <span>合成列表（拖拽排序）</span>
            <span className="text-[10px] text-muted-foreground">{vm.segments.length} 个片段</span>
          </div>

          {/* 转场配置 */}
          <div className="px-3 py-2 border-b border-border flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">转场：</span>
            <select
              className="select select-xs w-[140px]"
              value={vm.transition}
              onChange={(e) => vm.setTransition(e.target.value)}
            >
              {TRANSITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {vm.transition !== "none" && vm.transition !== "cut" && (
              <>
                <span className="text-xs text-muted-foreground">时长：</span>
                <input
                  type="number"
                  className="input input-xs w-[70px]"
                  min={0.1}
                  max={3}
                  step={0.1}
                  value={vm.transitionDuration}
                  onChange={(e) => vm.setTransitionDuration(Number(e.target.value))}
                />
                <span className="text-[10px] text-muted-foreground">秒</span>
              </>
            )}
          </div>

          <div className="flex-1 overflow-auto p-2 space-y-1.5">
            {vm.segments.length === 0 ? (
              <EmptyState
                icon={Film}
                title="合成列表为空"
                description="从左侧添加至少 2 个片段，然后点击合成"
              />
            ) : (
              vm.segments.map((seg, idx) => (
                <div
                  key={seg.id}
                  className="p-2 rounded border border-border bg-card2 text-xs flex items-center gap-2 cursor-move hover:border-primary transition-colors"
                  draggable
                  onDragStart={(e) => handleDragStart(e, seg.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, seg.id)}
                >
                  <GripVertical size={12} className="text-muted-foreground shrink-0" />
                  <span className="badge badge-muted shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate" title={seg.label}>{seg.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate" title={seg.path}>
                      {seg.path}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => vm.moveSegment(idx, idx - 1)}
                      disabled={idx === 0}
                      title="上移"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => vm.moveSegment(idx, idx + 1)}
                      disabled={idx === vm.segments.length - 1}
                      title="下移"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => vm.removeSegment(seg.id)}
                      title="移除"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 底部操作 */}
          <div className="px-3 py-2 border-t border-border flex items-center gap-2">
            <button
              className="btn btn-primary btn-sm flex-1"
              onClick={() => void vm.compose()}
              disabled={vm.isComposing || vm.segments.length < 2 || !vm.ffmpegAvailable}
            >
              {vm.isComposing ? (
                <><Loader2 size={14} className="animate-spin" /> 合成中...</>
              ) : (
                <><Sparkles size={14} /> 合成视频</>
              )}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={vm.clearSegments}
              disabled={vm.segments.length === 0 || vm.isComposing}
            >
              <Trash2 size={14} /> 清空
            </button>
          </div>
        </div>

        {/* 右栏：合成结果 */}
        <div className="col-span-4 border border-border rounded-md bg-card flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground">
            合成结果
          </div>
          <div className="flex-1 overflow-auto p-3">
            {!vm.composeResult ? (
              <EmptyState
                icon={Play}
                title="尚未合成"
                description="选择片段并点击「合成视频」按钮"
              />
            ) : !vm.composeResult.success ? (
              <div className="alert alert-error text-xs">
                <AlertCircle size={14} />
                <div>
                  <div className="font-semibold">合成失败</div>
                  <div className="text-[10px] opacity-80">{vm.composeResult.error}</div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="alert alert-success text-xs">
                  <CheckCircle2 size={14} />
                  <span>合成成功！</span>
                </div>
                {vm.composeResult.outputPath && (
                  <>
                    <video
                      src={`file:///${vm.composeResult.outputPath.replace(/\\/g, "/")}`}
                      controls
                      className="w-full rounded border border-border bg-black"
                      style={{ maxHeight: "300px" }}
                    />
                    <div className="text-[10px] text-muted-foreground break-all">
                      输出路径：{vm.composeResult.outputPath}
                    </div>
                    {vm.composeResult.metadata && (
                      <div className="text-[10px] text-muted-foreground">
                        片段数：{String(vm.composeResult.metadata.videoCount ?? "?")}
                        {vm.composeResult.metadata.totalDuration != null && (
                          <> · 总时长：{Number(vm.composeResult.metadata.totalDuration).toFixed(1)}s</>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
