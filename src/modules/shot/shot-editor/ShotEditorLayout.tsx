import { memo, type ReactNode } from "react";

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

/**
 * 分镜编辑器三栏布局容器：
 *
 * ┌──────────────────────────────────────────┐
 * │ header（可选）                            │
 * ├──────────┬──────────┬───────────────────┤
 * │ prompt   │ element  │ preview           │
 * │ (flex:1) │ (300px)  │ (220px)           │
 * ├──────────┴──────────┴───────────────────┤
 * │ timeline（固定高度，水平滚动）            │
 * └──────────────────────────────────────────┘
 *
 * 三栏使用 flex 布局，最小窗口 1024×768 不溢出：
 * - 左栏 flex: 1, min-width: 280px
 * - 中栏 width: 300px, flex-shrink: 0
 * - 右栏 width: 220px, flex-shrink: 0
 *
 * 当视口宽度不足时，三栏会出现水平滚动条而非压缩。
 */
export const ShotEditorLayout = memo(function ShotEditorLayout({
  promptColumn,
  elementBindingColumn,
  previewColumn,
  timeline,
  header,
}: ShotEditorLayoutProps) {
  return (
    <div className="h-full flex flex-col" role="region" aria-label="Shot editor">
      {header && <div className="flex-shrink-0">{header}</div>}

      {/* 三栏区域 */}
      <div
        className="flex-1 min-h-0 flex"
        style={{
          padding: 12,
          gap: 12,
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        {/* 左栏：提示词编辑 */}
        <section
          aria-label="Prompt editor column"
          className="flex-1 flex flex-col min-w-[280px] max-w-[600px]"
          style={{ overflowY: "auto" }}
        >
          {promptColumn}
        </section>

        {/* 中栏：元素绑定 */}
        <section
          aria-label="Element binding column"
          className="flex-shrink-0 flex flex-col"
          style={{ width: 300, overflowY: "auto" }}
        >
          {elementBindingColumn}
        </section>

        {/* 右栏：预览 */}
        <section
          aria-label="Preview column"
          className="flex-shrink-0 flex flex-col"
          style={{ width: 220, overflowY: "auto" }}
        >
          {previewColumn}
        </section>
      </div>

      {/* 底部时间轴 */}
      <div className="flex-shrink-0">{timeline}</div>
    </div>
  );
});
