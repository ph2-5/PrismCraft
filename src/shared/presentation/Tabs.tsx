import { useRef, type ReactNode } from "react";
import { cn } from "@/shared/utils/utils";

export interface TabItem {
  id: string;
  label: string;
  /** 可选：tab 前缀图标 */
  icon?: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * 可访问的 Tab 组件。
 * - 容器 role="tablist"，使用预览页 .top-tabs 类
 * - 每个 tab role="tab" + aria-selected，使用 .top-tab 类
 * - roving tabindex：active tab = 0，其余 = -1
 * - 键盘导航：ArrowLeft/ArrowRight/Home/End（自动激活模式）
 */
export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = (index: number) => {
    const count = tabs.length;
    if (count === 0) return;
    const safeIndex = ((index % count) + count) % count;
    const el = tabRefs.current[safeIndex];
    el?.focus();
    const tab = tabs[safeIndex];
    if (tab) onChange(tab.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const count = tabs.length;
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusTab(0);
        break;
      case "End":
        e.preventDefault();
        focusTab(count - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div role="tablist" className={cn("top-tabs", className)}>
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={cn("top-tab", isActive && "active")}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
