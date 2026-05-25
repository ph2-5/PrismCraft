"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, Sparkles, Check, RotateCcw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { generatePromptWithAI } from "../services";
import type { PromptEditorContext } from "../services";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";

interface PromptFloatingBallProps {
  beat: StoryBeat;
  context: PromptEditorContext;
  keyframeImageUrl?: string;
  onPromptGenerated: (context: PromptEditorContext, prompt: string) => void;
  providerId?: string;
  modelId?: string;
  characters?: Character[];
  scenes?: Scene[];
}

const CONTEXT_LABELS: Record<PromptEditorContext, string> = {
  keyframe: "预览图",
  firstFrame: "首帧",
  lastFrame: "尾帧",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  previewPrompt?: string;
}

export function PromptFloatingBall({
  beat,
  context,
  keyframeImageUrl,
  onPromptGenerated,
  providerId,
  modelId,
  characters,
  scenes,
}: PromptFloatingBallProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingPrompt]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isOpen) return;
      setIsDragging(true);
      const rect = ballRef.current?.getBoundingClientRect();
      if (rect) {
        dragOffset.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }
    },
    [isOpen],
  );

  const handleOpen = useCallback(() => {
    if (isDragging) return;
    setIsOpen(true);
    if (messages.length === 0) {
      const contextHint = getContextHint(context, beat, keyframeImageUrl);
      setMessages([
        {
          role: "assistant",
          content: `你好！我是提示词助手，正在为「${CONTEXT_LABELS[context]}」生成提示词。\n\n${contextHint}\n\n请告诉我你想要什么样的画面效果，我来帮你生成专业的提示词。`,
        },
      ]);
    }
  }, [isDragging, messages.length, context, beat, keyframeImageUrl]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isGenerating) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsGenerating(true);

    const result = await generatePromptWithAI(
      {
        context,
        beat,
        keyframeImageUrl,
        userMessage,
        characters,
        scenes,
      },
      { providerId, modelId },
    );

    setIsGenerating(false);

    if (result.ok) {
      const generatedPrompt = result.value.prompt;
      setPendingPrompt(generatedPrompt);
      setEditingPrompt(generatedPrompt);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "已生成提示词，请查看并编辑后确认应用：",
          previewPrompt: generatedPrompt,
        },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `生成失败：${result.error?.message || "未知错误"}。请重试或修改你的要求。`,
        },
      ]);
    }
  }, [input, isGenerating, context, beat, keyframeImageUrl, providerId, modelId, characters, scenes]);

  const handleConfirmPrompt = useCallback(() => {
    if (editingPrompt) {
      onPromptGenerated(context, editingPrompt);
      setPendingPrompt(null);
      setEditingPrompt("");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "提示词已应用！如需修改，请继续对话。" },
      ]);
    }
  }, [editingPrompt, context, onPromptGenerated]);

  const handleDiscardPrompt = useCallback(() => {
    setPendingPrompt(null);
    setEditingPrompt("");
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "已丢弃提示词。请继续对话或提出新要求。" },
    ]);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const ballStyle = position.x || position.y
    ? { position: "fixed" as const, left: position.x, top: position.y }
    : { position: "fixed" as const, right: 24, bottom: 24 };

  return (
    <>
      <button
        ref={ballRef}
        onMouseDown={handleMouseDown}
        onClick={handleOpen}
        className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center z-50 cursor-pointer"
        style={ballStyle}
        title={`AI 提示词助手 - ${CONTEXT_LABELS[context]}`}
      >
        <Sparkles className="w-5 h-5" />
      </button>

      {isOpen && (
        <div
          className="fixed z-50 w-80 bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ right: 24, bottom: 88, maxHeight: "min(480px, calc(100vh - 120px))" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">
                {CONTEXT_LABELS[context]}提示词助手
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-xs whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary/10 text-foreground rounded-lg px-3 py-2 ml-6"
                    : "bg-muted text-foreground rounded-lg px-3 py-2 mr-2"
                }`}
              >
                {msg.content}
              </div>
            ))}
            {isGenerating && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-3">
                <Loader2 className="w-3 h-3 animate-spin" />
                正在生成...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {pendingPrompt && (
            <div className="border-t border-border p-3 space-y-2 bg-primary/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-primary font-medium">
                  预编辑提示词
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDiscardPrompt}
                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    丢弃
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleConfirmPrompt}
                    className="h-6 px-2 text-[10px] text-primary"
                  >
                    <Check className="w-3 h-3 mr-1" />
                    确认应用
                  </Button>
                </div>
              </div>
              <Textarea
                value={editingPrompt}
                onChange={(e) => setEditingPrompt(e.target.value)}
                className="resize-none text-xs font-mono min-h-[60px] border-primary/30"
                rows={3}
              />
            </div>
          )}

          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="描述你想要的画面效果..."
                className="resize-none text-xs min-h-[36px] flex-1"
                rows={1}
                disabled={isGenerating}
              />
              <Button
                size="sm"
                onClick={handleSend}
                disabled={isGenerating || !input.trim()}
                className="h-9 w-9 p-0 shrink-0"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getContextHint(
  context: PromptEditorContext,
  beat: StoryBeat,
  keyframeImageUrl?: string,
): string {
  const parts: string[] = [];
  parts.push(`当前分镜：「${beat.title || "未命名"}」`);
  if (beat.content || beat.description) {
    parts.push(`内容：${beat.content || beat.description}`);
  }

  if (context === "firstFrame" || context === "lastFrame") {
    parts.push(
      context === "firstFrame"
        ? "需要生成视频起始画面的提示词（动作开始前）"
        : "需要生成视频结束画面的提示词（动作完成后）",
    );
    if (keyframeImageUrl) {
      parts.push("已有预览图作为参考，首尾帧应与预览图风格一致");
    }
  } else {
    parts.push("需要生成分镜预览图的提示词");
  }

  return parts.join("\n");
}
