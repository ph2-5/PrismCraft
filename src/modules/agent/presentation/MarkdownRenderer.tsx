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

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Check, Copy } from "lucide-react";
import { t, COPY_RESET_DELAY_MS } from "@/shared/constants";
import { errorLogger } from "@/shared/error-logger";

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
    } catch (err) {
      errorLogger.warn("[MarkdownRenderer] 复制代码失败", err);
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
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return <div className={className}>{blocks}</div>;
}

// ============= 块级解析辅助函数 =============

type ParseResult = { block: React.ReactNode | null; nextI: number };

/** 解析代码块 */
function parseCodeBlock(lines: string[], i: number, key: number): ParseResult {
  const lang = lines[i]!.trimStart().slice(3).trim();
  const codeLines: string[] = [];
  let idx = i + 1;
  while (idx < lines.length && !lines[idx]?.trimStart().startsWith("```")) {
    codeLines.push(lines[idx] ?? "");
    idx++;
  }
  idx++; // 跳过结束的 ```
  return {
    block: <CodeBlock key={`code-${key}`} code={codeLines.join("\n")} lang={lang} />,
    nextI: idx,
  };
}

/** 根据标题级别获取 className */
function headingClassName(level: number): string {
  if (level === 1) return "text-base font-bold mt-3 mb-1";
  if (level === 2) return "text-sm font-bold mt-2 mb-1";
  return "text-sm font-semibold mt-2 mb-0.5";
}

/** 解析标题 */
function parseHeading(line: string, key: number): ParseResult | null {
  const match = line.match(/^(#{1,3})\s+(.*)$/);
  if (!match || !match[1] || !match[2]) return null;
  const level = match[1].length;
  return {
    block: (
      <div key={`h-${key}`} className={headingClassName(level)}>
        {renderInline(match[2], `h-${key}`)}
      </div>
    ),
    nextI: -1, // nextI 由调用方处理（标题只占一行）
  };
}

/** 收集连续匹配的列表项 */
function collectListItems(lines: string[], i: number, regex: RegExp): { items: string[]; nextI: number } {
  const items: string[] = [];
  let idx = i;
  while (idx < lines.length && regex.test(lines[idx] || "")) {
    items.push(lines[idx]!.replace(regex, ""));
    idx++;
  }
  return { items, nextI: idx };
}

/** 解析无序列表 */
function parseUnorderedList(lines: string[], i: number, key: number): ParseResult | null {
  const regex = /^\s*[-*]\s+/;
  if (!regex.test(lines[i] || "")) return null;
  const { items, nextI } = collectListItems(lines, i, regex);
  return {
    block: (
      <ul key={`ul-${key}`} className="my-1 ml-4 list-disc space-y-0.5">
        {items.map((item, idx) => (
          <li key={idx} className="text-sm">
            {renderInline(item, `ul-${key}-${idx}`)}
          </li>
        ))}
      </ul>
    ),
    nextI,
  };
}

/** 解析有序列表 */
function parseOrderedList(lines: string[], i: number, key: number): ParseResult | null {
  const regex = /^\s*\d+\.\s+/;
  if (!regex.test(lines[i] || "")) return null;
  const { items, nextI } = collectListItems(lines, i, regex);
  return {
    block: (
      <ol key={`ol-${key}`} className="my-1 ml-4 list-decimal space-y-0.5">
        {items.map((item, idx) => (
          <li key={idx} className="text-sm">
            {renderInline(item, `ol-${key}-${idx}`)}
          </li>
        ))}
      </ol>
    ),
    nextI,
  };
}

/** 判断行是否为块级边界（代码块/标题/列表/空行） */
function isBlockBoundary(line: string | undefined): boolean {
  if (!line) return true;
  if (line.trim() === "") return true;
  if (line.trimStart().startsWith("```")) return true;
  if (/^(#{1,3})\s+/.test(line)) return true;
  if (/^\s*[-*]\s+/.test(line)) return true;
  if (/^\s*\d+\.\s+/.test(line)) return true;
  return false;
}

/** 解析普通段落（连续非边界行合并） */
function parseParagraph(lines: string[], i: number, key: number): ParseResult {
  const paraLines: string[] = [];
  let idx = i;
  while (idx < lines.length && !isBlockBoundary(lines[idx])) {
    paraLines.push(lines[idx]!);
    idx++;
  }
  return {
    block: (
      <p key={`p-${key}`} className="text-sm leading-relaxed">
        {renderInline(paraLines.join(" "), `p-${key}`)}
      </p>
    ),
    nextI: idx,
  };
}

/** 将 Markdown 文本解析为 React 节点数组（可被 useMemo 缓存） */
function parseMarkdown(content: string): React.ReactNode[] {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (line?.trimStart().startsWith("```")) {
      const result = parseCodeBlock(lines, i, key++);
      blocks.push(result.block!);
      i = result.nextI;
      continue;
    }

    // 标题
    const heading = parseHeading(line ?? "", key++);
    if (heading) {
      blocks.push(heading.block!);
      i++;
      continue;
    }

    // 无序列表
    const ul = parseUnorderedList(lines, i, key++);
    if (ul) {
      blocks.push(ul.block!);
      i = ul.nextI;
      continue;
    }

    // 有序列表
    const ol = parseOrderedList(lines, i, key++);
    if (ol) {
      blocks.push(ol.block!);
      i = ol.nextI;
      continue;
    }

    // 空行
    if (line?.trim() === "") {
      i++;
      continue;
    }

    // 普通段落
    const para = parseParagraph(lines, i, key++);
    blocks.push(para.block!);
    i = para.nextI;
  }

  return blocks;
}
