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
  style,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  // 用 ref 持有最新的 onClose，避免回调引用变化导致 effect 重复注册监听器/重复抢焦点
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === "Escape") {
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    // 打开时聚焦 modal 容器（tabIndex={-1} 让 div 可聚焦）
    modalRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
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
        className="modal"
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
