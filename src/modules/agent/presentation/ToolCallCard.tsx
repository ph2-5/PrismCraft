/**
 * 工具调用卡片 - 展示工具执行状态和结果
 */

"use client";

import type { ToolExecution } from "../domain/types";
import { CheckCircle2, Loader2, XCircle, Wrench } from "lucide-react";
import { t } from "@/shared/constants";

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
        <div className="mt-2 max-h-40 overflow-auto rounded bg-background/50 p-2 font-mono text-[10px]">
          {formatResult(result.data)}
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

function formatResult(data: unknown): string {
  if (data === null || data === undefined) return t("agent.noData");
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}
