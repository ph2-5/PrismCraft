/**
 * 分镜对比主视图（Task 4.4）
 *
 * 功能：
 * - 左侧列表：该分镜的所有生成版本
 * - 勾选 2 个版本 → 分屏对比
 * - 上半部分：视频/关键帧并排（同步播放控制）
 * - 下半部分：提示词 diff + 参数对比表
 * - 选用此版本 / 归档
 */

import { useState, useRef, useMemo } from "react";
import {
  Columns2,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  GitCompare,
  CheckCircle2,
  X,
} from "lucide-react";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type { ShotVersion, DiffLine } from "./types";
import { ComparePanel } from "./ComparePanel";
import { diffText, countDifferences } from "./prompt-diff";

export interface ShotCompareViewProps {
  /** 分镜 ID */
  shotId: string;
  /** 所有版本 */
  versions: ShotVersion[];
  /** 选用某版本（设为正式版本） */
  onSelect: (versionId: string) => void;
  /** 归档某版本 */
  onArchive: (versionId: string) => void;
}

export function ShotCompareView({
  shotId,
  versions,
  onSelect,
  onArchive,
}: ShotCompareViewProps) {
  const [selectedPair, setSelectedPair] = useState<[string, string] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playNonce, setPlayNonce] = useState(0);
  const leftVideoRef = useRef<HTMLVideoElement | null>(null);
  const rightVideoRef = useRef<HTMLVideoElement | null>(null);

  const pair = useMemo(() => {
    if (!selectedPair) return null;
    const left = versions.find((v) => v.versionId === selectedPair[0]);
    const right = versions.find((v) => v.versionId === selectedPair[1]);
    if (!left || !right) return null;
    return { left, right };
  }, [selectedPair, versions]);

  const diff: DiffLine[] = useMemo(() => {
    if (!pair) return [];
    return diffText(pair.left.prompt, pair.right.prompt);
  }, [pair]);

  const diffStats = useMemo(() => countDifferences(diff), [diff]);

  /** 切换版本选择（最多 2 个） */
  const toggleSelect = (versionId: string) => {
    if (!selectedPair) {
      setSelectedPair([versionId, ""]);
      return;
    }
    const [a, b] = selectedPair;
    if (a === versionId) {
      // 取消 a，b 升级为 a
      setSelectedPair(b ? [b, ""] : null);
    } else if (b === versionId) {
      setSelectedPair([a, ""]);
    } else if (!a) {
      setSelectedPair([versionId, b]);
    } else if (!b) {
      setSelectedPair([a, versionId]);
    } else {
      // 已满 2 个，替换第二个
      setSelectedPair([a, versionId]);
    }
  };

  const startCompare = () => {
    if (selectedPair && selectedPair[0] && selectedPair[1]) {
      setPlaying(false);
      setPlayNonce((n) => n + 1);
    }
  };

  const togglePlay = () => {
    setPlaying((p) => !p);
    setPlayNonce((n) => n + 1);
  };

  const seekBoth = (delta: number) => {
    const el = leftVideoRef.current;
    if (!el) return;
    const newTime = Math.max(0, el.currentTime + delta);
    setPlaying(false);
    setPlayNonce((n) => n + 1);
    // 通过 playSignal.time 同步
    if (leftVideoRef.current) leftVideoRef.current.currentTime = newTime;
    if (rightVideoRef.current) rightVideoRef.current.currentTime = newTime;
  };

  const canCompare = selectedPair != null && selectedPair[0] !== "" && selectedPair[1] !== "";

  return (
    <div className="flex flex-col h-full gap-2">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
        <span className="text-xs font-semibold flex items-center gap-1">
          <GitCompare size={12} /> 分镜对比视图
          <span className="text-[10px] text-muted-foreground ml-1">（{shotId}）</span>
        </span>
        {selectedPair && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => { setSelectedPair(null); setPlaying(false); }}
          >
            <X size={12} /> 清除选择
          </button>
        )}
      </div>

      <div className="flex-1 flex gap-2 min-h-0">
        {/* 左侧版本列表 */}
        <div className="w-[200px] shrink-0 border border-border rounded-md bg-card flex flex-col min-h-0">
          <div className="px-2 py-1.5 border-b border-border text-[10px] font-semibold text-muted-foreground">
            版本列表（{versions.length}）
          </div>
          <div className="flex-1 overflow-auto p-1.5 space-y-1">
            {versions.length === 0 ? (
              <EmptyState icon={Columns2} title="无版本" description="生成分镜后会出现版本" />
            ) : (
              versions.map((v, idx) => {
                const isSelected = selectedPair != null && (
                  selectedPair[0] === v.versionId || selectedPair[1] === v.versionId
                );
                const isArchived = v.isArchived;
                return (
                  <button
                    key={v.versionId}
                    className={`w-full text-left p-1.5 rounded border text-[10px] transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card2 hover:border-primary"
                    } ${isArchived ? "opacity-50" : ""}`}
                    onClick={() => toggleSelect(v.versionId)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{v.label ?? `v${idx + 1}`}</span>
                      {isSelected && <CheckCircle2 size={10} className="text-primary shrink-0" />}
                    </div>
                    <div className="text-muted-foreground truncate">
                      {v.type === "video" ? "视频" : "关键帧"} · {v.parameters.model ?? "未知模型"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="px-2 py-1.5 border-t border-border">
            <button
              className="btn btn-primary btn-xs w-full"
              onClick={startCompare}
              disabled={!canCompare}
            >
              <Columns2 size={12} /> 开始对比
            </button>
          </div>
        </div>

        {/* 右侧对比区 */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {!pair ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={GitCompare}
                title="选择 2 个版本开始对比"
                description="从左侧勾选 2 个版本，点击「开始对比」查看差异"
              />
            </div>
          ) : (
            <>
              {/* 播放控制条 */}
              <div className="flex items-center gap-1.5 px-2 py-1 border border-border rounded-md bg-card">
                <button className="btn btn-ghost btn-xs" onClick={() => seekBoth(-2)} title="后退 2 秒">
                  <SkipBack size={12} />
                </button>
                <button className="btn btn-ghost btn-xs" onClick={togglePlay} title={playing ? "暂停" : "播放"}>
                  {playing ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <button className="btn btn-ghost btn-xs" onClick={() => seekBoth(2)} title="前进 2 秒">
                  <SkipForward size={12} />
                </button>
                <span className="text-[10px] text-muted-foreground ml-2">
                  同步播放（两个视频同时播放/暂停/跳转）
                </span>
              </div>

              {/* 上半：并排媒体 */}
              <div className="flex gap-2 h-[45%] min-h-0">
                <div className="flex-1 min-w-0">
                  <ComparePanel
                    side="left"
                    version={pair.left}
                    isSelected={false}
                    onSelect={() => onSelect(pair.left.versionId)}
                    onArchive={() => onArchive(pair.left.versionId)}
                    videoRef={leftVideoRef}
                    playSignal={{ playing, nonce: playNonce }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <ComparePanel
                    side="right"
                    version={pair.right}
                    isSelected={false}
                    onSelect={() => onSelect(pair.right.versionId)}
                    onArchive={() => onArchive(pair.right.versionId)}
                    videoRef={rightVideoRef}
                    playSignal={{ playing, nonce: playNonce }}
                  />
                </div>
              </div>

              {/* 下半：提示词 diff */}
              <div className="flex-1 min-h-0 border border-border rounded-md bg-card flex flex-col">
                <div className="px-3 py-1.5 border-b border-border text-[10px] font-semibold text-muted-foreground flex items-center justify-between">
                  <span>提示词差异</span>
                  <span>
                    <span className="text-green-500">+{diffStats.added}</span>{" "}
                    <span className="text-red-500">-{diffStats.removed}</span>{" "}
                    <span className="text-muted-foreground">={diffStats.unchanged}</span>
                  </span>
                </div>
                <div className="flex-1 overflow-auto p-2 font-mono text-[10px] leading-relaxed">
                  {diff.map((line, idx) => (
                    <div
                      key={idx}
                      className={`px-1 ${
                        line.type === "left"
                          ? "bg-red-500/10 text-red-500"
                          : line.type === "right"
                            ? "bg-green-500/10 text-green-500"
                            : "text-muted-foreground"
                      }`}
                    >
                      <span className="inline-block w-8 text-muted-foreground text-right mr-2">
                        {line.leftLine ?? line.rightLine ?? ""}
                      </span>
                      <span className="inline-block w-4 mr-1">
                        {line.type === "left" ? "-" : line.type === "right" ? "+" : " "}
                      </span>
                      {line.text}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
