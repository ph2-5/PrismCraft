/**
 * 工具调用卡片 - 展示工具执行状态和结果
 *
 * 高频工具定制渲染器：
 * - generate_*_image → 图片预览
 * - text_to_speech → 音频播放器
 * - transcribe_audio → 转写文本
 * - analyze_image → 分析结果
 * - create_character / create_scene → 精简卡片
 * - search_assets / list_characters / list_scenes → 列表
 * - 其他工具 → JSON.stringify fallback
 */

"use client";

import type { ToolExecution } from "../domain/types";
import { CheckCircle2, Loader2, XCircle, Wrench, Image as ImageIcon, AudioWaveform as AudioIcon, User as UserIcon, Map as MapIcon, Search as SearchIcon } from "lucide-react";
import { t } from "@/shared/constants";
import { resolveImageUrl } from "@/shared/utils/image-url";

interface ToolCallCardProps {
  execution: ToolExecution;
}

export function ToolCallCard({ execution }: ToolCallCardProps) {
  const { toolCall, status, result, progress } = execution;
  const toolName = toolCall.function.name;
  const displayName = toolName.replace(/_/g, " ");

  let args: Record<string, unknown> = {};
  try {
    args = toolCall.function.arguments
      ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
      : {};
  } catch {
    // ignore
  }

  return (
    <div className="my-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
      <div className="flex items-center gap-2 font-medium">
        <Wrench className="h-3.5 w-3.5 text-primary" />
        <span className="capitalize">{displayName}</span>
        {status === "running" && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-primary" />}
        {status === "done" && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-green-500" />}
        {status === "error" && <XCircle className="ml-auto h-3.5 w-3.5 text-destructive" />}
      </div>

      {Object.keys(args).length > 0 && (
        <div className="mt-2 text-muted-foreground">
          {Object.entries(args).map(([k, v]) => (
            <div key={k} className="flex gap-1">
              <span className="font-mono text-foreground/70">{k}:</span>
              <span className="truncate">
                {typeof v === "string" ? v : JSON.stringify(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      {progress && status === "running" && (
        <div className="mt-1 text-muted-foreground italic">{progress}</div>
      )}

      {result && status === "done" && (
        <div className="mt-2 max-h-60 overflow-auto rounded bg-background/50 p-2">
          {renderToolResult(toolName, result.data)}
        </div>
      )}

      {result && status === "error" && (
        <div className="mt-2 rounded bg-destructive/10 p-2 text-destructive">
          {result.error}
        </div>
      )}
    </div>
  );
}

// ============= 工具结果渲染分发 =============

function renderToolResult(toolName: string, data: unknown): React.ReactNode {
  if (data === null || data === undefined) {
    return <span className="text-muted-foreground">{t("agent.noData")}</span>;
  }
  if (typeof data === "string") {
    return <span className="whitespace-pre-wrap break-all">{data}</span>;
  }
  if (typeof data !== "object") {
    return <span>{String(data)}</span>;
  }

  const d = data as Record<string, unknown>;

  // 图片生成类 → 图片预览
  if (
    (toolName === "generate_character_image" ||
      toolName === "generate_scene_image" ||
      toolName === "generate_prop_image") &&
    typeof d.imageUrl === "string"
  ) {
    return <ImageResult data={d} />;
  }

  // TTS → 音频播放器
  if (toolName === "text_to_speech" && typeof d.audioUrl === "string") {
    return <AudioResult data={d} />;
  }

  // STT → 转写文本
  if (toolName === "transcribe_audio" && typeof d.text === "string") {
    return <TranscriptResult data={d} />;
  }

  // 图片分析 → 分析结果
  if (toolName === "analyze_image" && typeof d.analysis === "string") {
    return (
      <div className="space-y-1">
        {typeof d.analyzed === "string" && (
          <div className="text-muted-foreground">已分析：{d.analyzed}</div>
        )}
        <div className="whitespace-pre-wrap break-words text-foreground/90">{d.analysis}</div>
      </div>
    );
  }

  // 创建角色 → 角色卡片
  if (toolName === "create_character") {
    return <CharacterCard data={d} />;
  }

  // 创建场景 → 场景卡片
  if (toolName === "create_scene") {
    return <SceneCard data={d} />;
  }

  // 搜索/列表 → 结果列表
  if (
    toolName === "search_assets" ||
    toolName === "list_characters" ||
    toolName === "list_scenes"
  ) {
    return <ListResult data={d} toolName={toolName} />;
  }

  // 通用 fallback：JSON 格式化
  return (
    <pre className="font-mono text-[10px] whitespace-pre-wrap break-all">
      {safeStringify(data)}
    </pre>
  );
}

// ============= 定制渲染组件 =============

/** 图片生成结果 */
function ImageResult({ data }: { data: Record<string, unknown> }) {
  const imageUrl = resolveImageUrl(data.imageUrl as string);
  return (
    <div className="space-y-1.5">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt="生成结果"
          className="max-h-48 rounded border border-border object-contain"
          loading="lazy"
        />
      ) : (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" />
          <span>无图片预览</span>
        </div>
      )}
      {typeof data.prompt === "string" && data.prompt && (
        <div className="text-muted-foreground italic truncate" title={data.prompt}>
          提示词：{data.prompt}
        </div>
      )}
      {"updated" in data && (
        <div className={data.updated ? "text-green-600" : "text-warning"}>
          {data.updated ? "已更新到资产" : "资产更新失败（图片 URL 仍可用）"}
        </div>
      )}
      {typeof data.name === "string" && (
        <div className="text-muted-foreground">名称：{data.name}</div>
      )}
      {typeof data.characterId === "string" && (
        <div className="text-muted-foreground font-mono text-[10px]">角色 ID：{data.characterId}</div>
      )}
      {typeof data.sceneId === "string" && (
        <div className="text-muted-foreground font-mono text-[10px]">场景 ID：{data.sceneId}</div>
      )}
    </div>
  );
}

/** 音频播放结果（TTS） */
function AudioResult({ data }: { data: Record<string, unknown> }) {
  const audioUrl = resolveAudioUrl(data.audioUrl as string);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-primary">
        <AudioIcon className="h-3.5 w-3.5" />
        <span className="font-medium">语音合成结果</span>
      </div>
      <audio src={audioUrl} controls className="w-full h-8" />
      {typeof data.duration === "number" && (
        <div className="text-muted-foreground">时长：{data.duration.toFixed(1)}秒</div>
      )}
      <div className="text-muted-foreground font-mono text-[10px] truncate" title={audioUrl}>
        {audioUrl}
      </div>
    </div>
  );
}

/** 转写结果（STT） */
function TranscriptResult({ data }: { data: Record<string, unknown> }) {
  const segments = Array.isArray(data.segments) ? data.segments : [];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-primary">
        <AudioIcon className="h-3.5 w-3.5" />
        <span className="font-medium">识别结果</span>
        {segments.length > 0 && (
          <span className="text-muted-foreground">（{segments.length} 段）</span>
        )}
      </div>
      <div className="whitespace-pre-wrap break-words text-foreground/90">
        {data.text as string}
      </div>
      {segments.length > 0 && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer text-[10px]">查看分段</summary>
          <div className="mt-1 space-y-0.5 font-mono text-[10px]">
            {segments.slice(0, 20).map((seg, i) => {
              const s = seg as { start?: number; end?: number; text?: string };
              return (
                <div key={i} className="flex gap-2">
                  <span className="text-primary">
                    [{s.start?.toFixed(1)}-{s.end?.toFixed(1)}]
                  </span>
                  <span>{s.text}</span>
                </div>
              );
            })}
            {segments.length > 20 && <div>... 共 {segments.length} 段</div>}
          </div>
        </details>
      )}
    </div>
  );
}

/** 角色卡片 */
function CharacterCard({ data }: { data: Record<string, unknown> }) {
  const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-primary font-medium">
        <UserIcon className="h-3.5 w-3.5" />
        <span>角色已创建</span>
      </div>
      <div className="font-medium text-foreground">{String(data.name ?? "")}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
        {typeof data.style === "string" && data.style && <span>风格：{data.style}</span>}
        {typeof data.gender === "string" && data.gender && <span>性别：{data.gender}</span>}
        {typeof data.age !== "undefined" && <span>年龄：{String(data.age)}</span>}
      </div>
      {typeof data.description === "string" && data.description && (
        <div className="text-foreground/80 line-clamp-2">{data.description}</div>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, i) => (
            <span key={i} className="badge badge-muted text-[10px]">{tag}</span>
          ))}
        </div>
      )}
      {typeof data.id === "string" && (
        <div className="text-muted-foreground font-mono text-[10px]">ID：{data.id}</div>
      )}
    </div>
  );
}

/** 场景卡片 */
function SceneCard({ data }: { data: Record<string, unknown> }) {
  const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-primary font-medium">
        <MapIcon className="h-3.5 w-3.5" />
        <span>场景已创建</span>
      </div>
      <div className="font-medium text-foreground">{String(data.name ?? "")}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
        {typeof data.type === "string" && data.type && <span>类型：{data.type}</span>}
        {typeof data.timeOfDay === "string" && data.timeOfDay && <span>时间：{data.timeOfDay}</span>}
        {typeof data.weather === "string" && data.weather && <span>天气：{data.weather}</span>}
        {typeof data.mood === "string" && data.mood && <span>情绪：{data.mood}</span>}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, i) => (
            <span key={i} className="badge badge-muted text-[10px]">{tag}</span>
          ))}
        </div>
      )}
      {typeof data.id === "string" && (
        <div className="text-muted-foreground font-mono text-[10px]">ID：{data.id}</div>
      )}
    </div>
  );
}

/** 搜索/列表结果 */
function ListResult({
  data,
  toolName,
}: {
  data: Record<string, unknown>;
  toolName: string;
}) {
  const characters = Array.isArray(data.characters) ? (data.characters as Array<Record<string, unknown>>) : [];
  const scenes = Array.isArray(data.scenes) ? (data.scenes as Array<Record<string, unknown>>) : [];
  const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
  const total =
    typeof data.total === "number"
      ? data.total
      : characters.length + scenes.length + items.length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-primary font-medium">
        <SearchIcon className="h-3.5 w-3.5" />
        <span>
          {toolName === "search_assets" ? "搜索结果" : "列表"}
          <span className="text-muted-foreground font-normal">（共 {total} 项）</span>
        </span>
      </div>

      {characters.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-muted-foreground font-medium">角色（{characters.length}）</div>
          {characters.map((c, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-background/40 px-1.5 py-0.5">
              <UserIcon className="h-3 w-3 text-primary shrink-0" />
              <span className="truncate">{String(c.name ?? "")}</span>
              {typeof c.style === "string" && c.style && (
                <span className="text-muted-foreground truncate">/ {c.style}</span>
              )}
              {typeof c.id === "string" && (
                <span className="text-muted-foreground font-mono text-[10px] ml-auto shrink-0">{c.id}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {scenes.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-muted-foreground font-medium">场景（{scenes.length}）</div>
          {scenes.map((s, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-background/40 px-1.5 py-0.5">
              <MapIcon className="h-3 w-3 text-primary shrink-0" />
              <span className="truncate">{String(s.name ?? "")}</span>
              {typeof s.type === "string" && s.type && (
                <span className="text-muted-foreground truncate">/ {s.type}</span>
              )}
              {typeof s.id === "string" && (
                <span className="text-muted-foreground font-mono text-[10px] ml-auto shrink-0">{s.id}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-0.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-background/40 px-1.5 py-0.5">
              <span className="truncate">{String(item.name ?? item.id ?? i)}</span>
              {typeof item.style === "string" && item.style && (
                <span className="text-muted-foreground truncate">/ {item.style}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {total === 0 && (
        <div className="text-muted-foreground italic">无匹配结果</div>
      )}
    </div>
  );
}

// ============= 辅助函数 =============

/** 将 local:// 协议转换为浏览器可用的 file:/// 协议 */
function resolveAudioUrl(url: string): string {
  if (url.startsWith("local://")) {
    const path = url.slice("local://".length);
    return `file:///${path}`;
  }
  return url;
}

/** 安全 JSON 序列化（fallback） */
function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}
