/**
 * 轻量级 Markdown 渲染器
 *
 * 支持的语法：
 * - 代码块（```lang ... ```）
 * - 行内代码（`code`）
 * - 粗体（**text**）
 * - 标题（# ## ###）
 * - 无序列表（- / *）
 * - 有序列表（1. 2.）
 * - 段落
 *
 * 不引入 react-markdown 等外部依赖，保持项目轻量。
 * 设计为"够用即可"——不追求完整 CommonMark 规范。
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Check, Copy } from "lucide-react";
import { t, COPY_RESET_DELAY_MS } from "@/shared/constants";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/** 代码块组件（带复制按钮） */
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), COPY_RESET_DELAY_MS);
    } catch {
      // 剪贴板不可用时静默失败
    }
  }, [code]);

  return (
    <div className="group relative my-2 overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1">
        <span className="text-[10px] font-mono text-muted-foreground">
          {lang || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          title={t("agent.copyMessage")}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              {t("agent.copied")}
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              {t("agent.copyMessage")}
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

/** 行内代码 */
function InlineCode({ code }: { code: string }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
      {code}
    </code>
  );
}

/** 渲染行内格式（粗体 + 行内代码） */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // 匹配 `code` 或 **bold**
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<InlineCode key={`${keyPrefix}-code-${i}`} code={token.slice(1, -1)} />);
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-bold-${i}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    lastIndex = match.index + token.length;
    i++;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (line?.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]?.trimStart().startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      i++; // 跳过结束的 ```
      blocks.push(
        <CodeBlock key={`code-${key++}`} code={codeLines.join("\n")} lang={lang} />,
      );
      continue;
    }

    // 标题
    const headingMatch = line?.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const cls =
        level === 1
          ? "text-base font-bold mt-3 mb-1"
          : level === 2
            ? "text-sm font-bold mt-2 mb-1"
            : "text-sm font-semibold mt-2 mb-0.5";
      blocks.push(
        <div key={`h-${key++}`} className={cls}>
          {renderInline(text, `h-${key}`)}
        </div>,
      );
      i++;
      continue;
    }

    // 无序列表
    if (line?.match(/^\s*[-*]\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i]?.match(/^\s*[-*]\s+/)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`ul-${key++}`} className="my-1 ml-4 list-disc space-y-0.5">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm">
              {renderInline(item, `ul-${key}-${idx}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // 有序列表
    if (line?.match(/^\s*\d+\.\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i]?.match(/^\s*\d+\.\s+/)) {
        items.push(lines[i]!.replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={`ol-${key++}`} className="my-1 ml-4 list-decimal space-y-0.5">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm">
              {renderInline(item, `ol-${key}-${idx}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // 空行
    if (line?.trim() === "") {
      i++;
      continue;
    }

    // 普通段落（连续非空行合并）
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]?.trim() !== "" &&
      !lines[i]?.trimStart().startsWith("```") &&
      !lines[i]?.match(/^(#{1,3})\s+/) &&
      !lines[i]?.match(/^\s*[-*]\s+/) &&
      !lines[i]?.match(/^\s*\d+\.\s+/)
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(
        <p key={`p-${key++}`} className="text-sm leading-relaxed">
          {renderInline(paraLines.join(" "), `p-${key}`)}
        </p>,
      );
    }
  }

  return <div className={className}>{blocks}</div>;
}
