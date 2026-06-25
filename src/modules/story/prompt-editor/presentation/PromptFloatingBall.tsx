import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, Sparkles, Check, RotateCcw } from "lucide-react";
import { generatePromptWithAI } from "../services";
import type { PromptEditorContext } from "../services";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { t } from "@/shared/constants";
import { IconButton } from "@/shared/presentation/IconButton";

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

const CONTEXT_SHORT: Record<PromptEditorContext, string> = {
  keyframe: t("prompt.keyframeShort"),
  firstFrame: t("prompt.firstFrameShort"),
  lastFrame: t("prompt.lastFrameShort"),
  video: t("prompt.videoShort"),
};

interface ChatMessage {
  id: string;
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
          id: crypto.randomUUID(),
          role: "assistant",
          content: t("prompt.assistantGreeting", { context: CONTEXT_SHORT[context], hint: contextHint }),
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
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: userMessage }]);
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
          id: crypto.randomUUID(),
          role: "assistant",
          content: t("prompt.generatedPreview"),
          previewPrompt: generatedPrompt,
        },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: t("prompt.generateFailedRetry", { error: result.error?.message || t("common.unknown") }),
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
        { id: crypto.randomUUID(), role: "assistant", content: t("prompt.promptApplied") },
      ]);
    }
  }, [editingPrompt, context, onPromptGenerated]);

  const handleDiscardPrompt = useCallback(() => {
    setPendingPrompt(null);
    setEditingPrompt("");
    setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: t("prompt.promptDiscarded") },
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
        title={`AI ${t("prompt.assistantTitle", { context: CONTEXT_SHORT[context] })}`}
        aria-label={t("aria.openPromptAssistant")}
      >
        <Sparkles className="w-5 h-5" />
      </button>

      {isOpen && (
        <div
          className="fixed z-50 w-80 bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ right: 24, bottom: 88, maxHeight: "min(480px, calc(100vh - 120px))" }}
          role="dialog"
          aria-modal="true"
          aria-label={t("prompt.assistantTitle", { context: CONTEXT_SHORT[context] })}
          tabIndex={-1}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">
                {t("prompt.assistantTitle", { context: CONTEXT_SHORT[context] })}
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t("aria.close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
            {messages.map((msg) => (
              <div
                key={msg.id}
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
                {t("prompt.generatingShort")}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {pendingPrompt && (
            <div className="border-t border-border p-3 space-y-2 bg-primary/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-primary font-medium">
                  {t("prompt.preEditPrompt")}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                    onClick={handleDiscardPrompt}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    {t("prompt.discard")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm h-6 px-2 text-[10px] text-primary"
                    onClick={handleConfirmPrompt}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    {t("prompt.confirmApply")}
                  </button>
                </div>
              </div>
              <textarea
                className="textarea resize-none text-xs font-mono min-h-[60px] border-primary/30"
                value={editingPrompt}
                onChange={(e) => setEditingPrompt(e.target.value)}
                rows={3}
              />
            </div>
          )}

          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <textarea
                className="textarea resize-none text-xs min-h-[36px] flex-1"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("prompt.describeEffect")}
                rows={1}
                disabled={isGenerating}
              />
              <IconButton
                variant="primary"
                className="btn-sm h-9 w-9 p-0 shrink-0"
                onClick={handleSend}
                disabled={isGenerating || !input.trim()}
                aria-label={t("aria.sendPrompt")}
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </IconButton>
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
  parts.push(t("prompt.currentBeat", { title: beat.title || t("template.unnamed") }));
  if (beat.content || beat.description) {
    parts.push(t("prompt.beatContent", { content: beat.content || beat.description }));
  }

  if (context === "firstFrame" || context === "lastFrame") {
    parts.push(
      context === "firstFrame"
        ? t("prompt.firstFrameHint")
        : t("prompt.lastFrameHint"),
    );
    if (keyframeImageUrl) {
      parts.push(t("prompt.hasPreviewRef"));
    }
  } else if (context === "video") {
    parts.push(t("prompt.videoHint"));
  } else {
    parts.push(t("prompt.keyframeHint"));
  }

  return parts.join("\n");
}
