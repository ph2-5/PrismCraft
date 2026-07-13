import { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
  // 可选：是否允许点击 overlay 关闭（默认 true）
  closeOnOverlayClick?: boolean;
  // 可选：是否允许 Escape 关闭（默认 true）
  closeOnEscape?: boolean;
  // 可选：应用到 modal 容器的额外 className（用于覆盖 maxWidth 等）
  className?: string;
  // 可选：应用到 modal 容器的内联样式（用于保留各 modal 的自定义 maxWidth/maxHeight 等）
  style?: React.CSSProperties;
}

export function Modal({
  open,
  onClose,
  children,
  ariaLabel,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className,
  style,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  // 用 ref 持有最新的 onClose，避免回调引用变化导致 effect 重复注册监听器/重复抢焦点
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    // 记录打开前的焦点元素，关闭后恢复
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") {
        const container = modalRef.current;
        if (!container) return;
        // 查询 modal 内所有可聚焦元素（排除 disabled 和 tabindex=-1）
        const focusable = container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          // 无可聚焦元素时，阻止 Tab 跳出 modal，保持焦点在容器
          e.preventDefault();
          modalRef.current?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          // Shift+Tab：在第一个元素时聚焦最后一个（循环）
          if (document.activeElement === first || document.activeElement === container) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          // Tab：在最后一个元素时聚焦第一个（循环）
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    // 打开时聚焦 modal 容器（tabIndex={-1} 让 div 可聚焦）
    modalRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      // 关闭后恢复焦点到打开前的元素
      previouslyFocused?.focus?.();
    };
  }, [open, closeOnEscape]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (closeOnOverlayClick) onClose();
      }}
    >
      <div
        ref={modalRef}
        className={className ? `modal ${className}` : "modal"}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        data-modal-container
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
