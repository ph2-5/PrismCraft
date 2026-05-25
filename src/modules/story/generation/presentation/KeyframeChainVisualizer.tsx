"use client";

import { useMemo } from "react";
import { Link, Image, CheckCircle } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import type { StoryBeat } from "@/domain/schemas";

interface KeyframeChainVisualizerProps {
  beats: StoryBeat[];
}

export function KeyframeChainVisualizer({
  beats,
}: KeyframeChainVisualizerProps) {
  const chainStatus = useMemo(() => {
    const status = beats.map((beat, index) => {
      const hasKeyframe = !!beat.keyframe?.imageUrl;
      const hasFramePair = !!beat.framePair?.firstFrame?.imageUrl;
      const hasVideo = !!beat.videoGen?.videoUrl;
      const prevBeat = index > 0 ? beats[index - 1] : null;
      const isLinked =
        hasKeyframe &&
        prevBeat?.keyframe?.imageUrl &&
        beat.keyframe?.referencedPrevKeyframe === prevBeat.id;

      return {
        beat,
        index,
        hasKeyframe,
        hasFramePair,
        hasVideo,
        isLinked,
        isFirst: index === 0,
      };
    });

    const validChain = status.every((s, i) => {
      if (i === 0) return s.hasKeyframe;
      return s.hasKeyframe && s.isLinked;
    });

    return { status, validChain };
  }, [beats]);

  if (beats.length === 0) return null;

  return (
    <div className="bg-slate-800/50 border border-purple-700/30 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-purple-100 flex items-center gap-2">
          <Link className="w-4 h-4 text-purple-400" />
          预览图链式传承
        </h4>
        <Badge
          className={
            chainStatus.validChain ? "bg-green-600/50" : "bg-amber-600/50"
          }
        >
          {chainStatus.validChain ? "链式完整" : "链式中断"}
        </Badge>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {chainStatus.status.map((item, index) => (
          <div key={item.beat.id} className="flex items-center gap-1 shrink-0">
            {/* 连接线 */}
            {!item.isFirst && (
              <div
                className={`w-6 h-0.5 ${
                  item.isLinked
                    ? "bg-blue-500"
                    : item.hasKeyframe
                      ? "bg-purple-500/30"
                      : "bg-slate-600"
                }`}
              />
            )}

            {/* 节点 */}
            <div
              className={`relative w-10 h-10 rounded-lg flex items-center justify-center border-2 ${
                item.hasKeyframe
                  ? item.isLinked || item.isFirst
                    ? "border-blue-500 bg-blue-500/20"
                    : "border-purple-500 bg-purple-500/20"
                  : "border-slate-600 bg-slate-700/50"
              }`}
              title={`分镜 ${index + 1}${
                item.hasKeyframe
                  ? item.isLinked
                    ? " (已链接)"
                    : item.isFirst
                      ? " (首分镜)"
                      : " (未链接)"
                  : " (无预览图)"
              }`}
            >
              {item.hasKeyframe ? (
                <>
                  {item.beat.keyframe?.imageUrl ? (
                    <img
                      src={item.beat.keyframe.imageUrl}
                      alt={`分镜 ${index + 1}`}
                      className="w-full h-full object-cover rounded-md"
                    />
                  ) : (
                    <Image className="w-4 h-4 text-purple-400" />
                  )}
                  {/* 状态指示器 */}
                  <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {item.hasVideo ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 bg-slate-900 rounded-full" />
                    ) : item.hasFramePair ? (
                      <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-slate-900" />
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-amber-500 border-2 border-slate-900" />
                    )}
                  </div>
                </>
              ) : (
                <span className="text-xs text-slate-400">{index + 1}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-purple-400">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-500 border border-slate-900" />
          <span>已链接</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-amber-500 border border-slate-900" />
          <span>仅预览图</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500 border border-slate-900" />
          <span>已完成视频</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-blue-500" />
          <span>链式参考</span>
        </div>
      </div>
    </div>
  );
}
