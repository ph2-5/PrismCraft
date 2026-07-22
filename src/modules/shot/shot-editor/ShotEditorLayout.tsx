import { memo, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { preferencesStorage } from "@/shared/utils/preferences";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants/messages";
import { cn } from "@/shared/utils/utils";

interface ShotEditorLayoutProps {
  /** 三栏内容：左栏（提示词编辑） */
  promptColumn: ReactNode;
  /** 三栏内容：中栏（元素绑定） */
  elementBindingColumn: ReactNode;
  /** 三栏内容：右栏（预览） */
  previewColumn: ReactNode;
  /** 底部时间轴 */
  timeline: ReactNode;
  /** 顶部导航条（可选，例如 BeatNavigation） */
  header?: ReactNode;
}

const STORAGE_KEY = "shot-editor-layout";
const DEFAULT_ELEMENT_WIDTH = 300;
const DEFAULT_PREVIEW_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const COLLAPSED_WIDTH = 36;

interface LayoutState {
  elementWidth: number;
  previewWidth: number;
  promptCollapsed: boolean;
  elementCollapsed: boolean;
  previewCollapsed: boolean;
}

const DEFAULT_STATE: LayoutState = {
  elementWidth: DEFAULT_ELEMENT_WIDTH,
  previewWidth: DEFAULT_PREVIEW_WIDTH,
  promptCollapsed: false,
  elementCollapsed: false,
  previewCollapsed: false,
};

function loadState(): LayoutState {
  try {
    return preferencesStorage.get(STORAGE_KEY, DEFAULT_STATE);
  } catch {
    errorLogger.warn("[ShotEditorLayout] Failed to load layout state");
    return DEFAULT_STATE;
  }
}

/** 管理三栏布局的宽度、折叠状态和拖拽 resize 逻辑 */
function useShotEditorLayoutState() {
  const [state, setState] = useState<LayoutState>(loadState);
  const [dragging, setDragging] = useState<"element" | "preview" | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    try {
      preferencesStorage.set(STORAGE_KEY, state);
    } catch {
      errorLogger.warn("[ShotEditorLayout] Failed to save layout state");
    }
  }, [state]);

  const handleResizeStart = useCallback(
    (target: "element" | "preview") => (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(target);
      startXRef.current = e.clientX;
      startWidthRef.current = target === "element" ? state.elementWidth : state.previewWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [state.elementWidth, state.previewWidth],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidthRef.current + delta));
      setState((prev) =>
        dragging === "element"
          ? { ...prev, elementWidth: newWidth }
          : { ...prev, previewWidth: newWidth },
      );
    };
    const handleMouseUp = () => {
      setDragging(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  const togglePrompt = useCallback(() => {
    setState((prev) => ({ ...prev, promptCollapsed: !prev.promptCollapsed }));
  }, []);
  const toggleElement = useCallback(() => {
    setState((prev) => ({ ...prev, elementCollapsed: !prev.elementCollapsed }));
  }, []);
  const togglePreview = useCallback(() => {
    setState((prev) => ({ ...prev, previewCollapsed: !prev.previewCollapsed }));
  }, []);

  const flexColumn = state.promptCollapsed
    ? (state.elementCollapsed ? "preview" : "element")
    : "prompt";
  const showHandle1 = !state.promptCollapsed && !state.elementCollapsed;
  const showHandle2 = !state.elementCollapsed && !state.previewCollapsed;

  return {
    state, dragging, handleResizeStart,
    togglePrompt, toggleElement, togglePreview,
    flexColumn, showHandle1, showHandle2,
  };
}

/** 折叠状态的栏（窄条 + 展开按钮） */
function CollapsedPanel({
  side, onExpand, expandLabel, icon,
}: {
  side: "left" | "right";
  onExpand: () => void;
  expandLabel: string;
  icon: "left" | "right";
}) {
  return (
    <section
      className={cn(
        "flex-shrink-0 flex flex-col items-center pt-2",
        side === "left" ? "border-r border-border" : "border-l border-border",
      )}
      style={{ width: COLLAPSED_WIDTH }}
    >
      <button
        onClick={onExpand}
        className="p-1 text-muted-foreground hover:text-fg"
        title={expandLabel}
        aria-label={expandLabel}
      >
        {icon === "right" ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </section>
  );
}

/** 展开状态的栏（内容 + 折叠按钮） */
function ExpandedPanel({
  isFlex, width, onCollapse, collapseLabel, collapseIcon, children, ariaLabel, minWidth,
}: {
  isFlex: boolean;
  width: number | undefined;
  onCollapse: () => void;
  collapseLabel: string;
  collapseIcon: "left" | "right";
  children: ReactNode;
  ariaLabel: string;
  minWidth?: string;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        isFlex ? "flex-1" : "flex-shrink-0",
        "flex flex-col relative",
        minWidth,
      )}
      style={{ width, overflowY: "auto" }}
    >
      <button
        onClick={onCollapse}
        className="absolute top-0 right-0 z-10 p-1 text-muted-foreground hover:text-fg opacity-50 hover:opacity-100"
        title={collapseLabel}
        aria-label={collapseLabel}
      >
        {collapseIcon === "left" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
      {children}
    </section>
  );
}

/**
 * 分镜编辑器三栏布局容器（支持拖拽 resize 和折叠）：
 *
 * ┌──────────────────────────────────────────┐
 * │ header（可选）                            │
 * ├──────────────────┬──────────┬───────────┤
 * │ prompt           │ element  │ preview   │
 * │ (flex:1)         │ (300px)  │ (280px)   │
 * ├──────────────────┴──────────┴───────────┤
 * │ timeline（固定高度，水平滚动）            │
 * └──────────────────────────────────────────┘
 *
 * - 中栏和右栏宽度可拖拽调整（200-600px）
 * - 三栏均可折叠为 36px 窄条
 * - 折叠左栏时中栏自动变为 flex:1 占满剩余空间
 * - 布局状态持久化到 preferencesStorage
 */
export const ShotEditorLayout = memo(function ShotEditorLayout({
  promptColumn, elementBindingColumn, previewColumn, timeline, header,
}: ShotEditorLayoutProps) {
  const {
    state, dragging, handleResizeStart,
    togglePrompt, toggleElement, togglePreview,
    flexColumn, showHandle1, showHandle2,
  } = useShotEditorLayoutState();

  return (
    <div className="h-full flex flex-col" role="region" aria-label="Shot editor">
      {header && <div className="flex-shrink-0">{header}</div>}

      <div
        className="flex-1 min-h-0 flex"
        style={{ padding: 12, gap: 0, overflowX: "auto", overflowY: "hidden" }}
      >
        {/* 左栏：提示词编辑 */}
        {state.promptCollapsed ? (
          <CollapsedPanel
            side="left"
            onExpand={togglePrompt}
            expandLabel={t("shotEditor.expandPrompt")}
            icon="right"
          />
        ) : (
          <ExpandedPanel
            isFlex={flexColumn === "prompt"}
            width={undefined}
            onCollapse={togglePrompt}
            collapseLabel={t("shotEditor.collapsePrompt")}
            collapseIcon="left"
            ariaLabel="Prompt editor column"
            minWidth="min-w-[280px]"
          >
            {promptColumn}
          </ExpandedPanel>
        )}

        {/* resize handle 1：左栏和中栏之间（调整中栏宽度） */}
        {showHandle1 && (
          <div
            className={cn("resize-handle", dragging === "element" && "is-dragging")}
            onMouseDown={handleResizeStart("element")}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("shotEditor.resizePromptElement")}
          />
        )}

        {/* 中栏：元素绑定 */}
        {state.elementCollapsed ? (
          <CollapsedPanel
            side="left"
            onExpand={toggleElement}
            expandLabel={t("shotEditor.expandElement")}
            icon="right"
          />
        ) : (
          <ExpandedPanel
            isFlex={flexColumn === "element"}
            width={flexColumn === "element" ? undefined : state.elementWidth}
            onCollapse={toggleElement}
            collapseLabel={t("shotEditor.collapseElement")}
            collapseIcon="left"
            ariaLabel="Element binding column"
          >
            {elementBindingColumn}
          </ExpandedPanel>
        )}

        {/* resize handle 2：中栏和右栏之间（调整右栏宽度） */}
        {showHandle2 && (
          <div
            className={cn("resize-handle", dragging === "preview" && "is-dragging")}
            onMouseDown={handleResizeStart("preview")}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("shotEditor.resizeElementPreview")}
          />
        )}

        {/* 右栏：预览 */}
        {state.previewCollapsed ? (
          <CollapsedPanel
            side="right"
            onExpand={togglePreview}
            expandLabel={t("shotEditor.expandPreview")}
            icon="left"
          />
        ) : (
          <ExpandedPanel
            isFlex={flexColumn === "preview"}
            width={flexColumn === "preview" ? undefined : state.previewWidth}
            onCollapse={togglePreview}
            collapseLabel={t("shotEditor.collapsePreview")}
            collapseIcon="right"
            ariaLabel="Preview column"
          >
            {previewColumn}
          </ExpandedPanel>
        )}
      </div>

      <div className="flex-shrink-0">{timeline}</div>
    </div>
  );
});
