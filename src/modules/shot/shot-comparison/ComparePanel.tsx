/**
 * 单侧对比面板（Task 4.4）
 *
 * 显示单个版本的视频/关键帧 + 参数表
 */

import { useRef, useEffect } from "react";
import { CheckCircle2, Archive, Video, Image as ImageIcon } from "lucide-react";
import type { ShotVersion } from "./types";

export interface ComparePanelProps {
  /** 左侧或右侧 */
  side: "left" | "right";
  /** 版本数据 */
  version: ShotVersion;
  /** 是否为当前选中版本 */
  isSelected: boolean;
  /** 选中此版本 */
  onSelect: () => void;
  /** 归档此版本 */
  onArchive: () => void;
  /** 同步播放 ref（由父组件控制同步） */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  /** 同步播放控制信号 */
  playSignal?: { playing: boolean; time?: number; nonce: number };
}

export function ComparePanel({
  side,
  version,
  isSelected,
  onSelect,
  onArchive,
  videoRef,
  playSignal,
}: ComparePanelProps) {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef ?? internalVideoRef;

  // 同步播放控制
  useEffect(() => {
    const el = ref.current;
    if (!el || !playSignal) return;
    if (playSignal.playing) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
     
  }, [playSignal?.nonce, playSignal?.playing]);

  useEffect(() => {
    const el = ref.current;
    if (!el || playSignal?.time == null) return;
    // 避免微小差异导致跳帧，只在差异 >0.3s 时同步
    if (Math.abs(el.currentTime - playSignal.time) > 0.3) {
      el.currentTime = playSignal.time;
    }
     
  }, [playSignal?.nonce]);

  const isVideo = version.type === "video";
  const borderColor = side === "left" ? "border-l-4 border-l-blue-500" : "border-r-4 border-r-green-500";

  return (
    <div className={`flex flex-col h-full border border-border rounded-md bg-card ${borderColor} ${isSelected ? "ring-2 ring-primary" : ""}`}>
      {/* 标题栏 */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold flex items-center gap-1">
          {isVideo ? <Video size={12} /> : <ImageIcon size={12} />}
          {version.label ?? `版本 ${version.versionId.slice(0, 6)}`}
          {isSelected && <CheckCircle2 size={12} className="text-primary" />}
        </span>
        <span className="text-[10px] text-muted-foreground">{side === "left" ? "左侧" : "右侧"}</span>
      </div>

      {/* 媒体预览 */}
      <div className="flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden">
        {isVideo ? (
          <video
            ref={ref}
            src={version.url}
            className="max-w-full max-h-full"
            controls={false}
            playsInline
          />
        ) : (
          <img
            src={version.url}
            alt={version.label ?? "关键帧"}
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>

      {/* 参数表 */}
      <div className="px-3 py-2 border-t border-border text-[10px] space-y-0.5">
        <ParamRow label="模型" value={version.parameters.model} />
        <ParamRow label="时长" value={version.parameters.duration != null ? `${version.parameters.duration}s` : undefined} />
        <ParamRow label="分辨率" value={version.parameters.resolution} />
        <ParamRow label="风格" value={version.parameters.style} />
        <ParamRow label="Provider" value={version.parameters.providerId} />
      </div>

      {/* 操作按钮 */}
      <div className="px-3 py-2 border-t border-border flex items-center gap-1.5">
        <button
          className={`btn btn-xs flex-1 ${isSelected ? "btn-primary" : "btn-ghost"}`}
          onClick={onSelect}
          disabled={isSelected}
        >
          <CheckCircle2 size={12} /> {isSelected ? "已选用" : "选用此版本"}
        </button>
        <button
          className="btn btn-ghost btn-xs"
          onClick={onArchive}
          disabled={isSelected}
          title="归档为备选"
        >
          <Archive size={12} /> 归档
        </button>
      </div>
    </div>
  );
}

function ParamRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground truncate ml-2" title={value ?? ""}>
        {value ?? "—"}
      </span>
    </div>
  );
}
