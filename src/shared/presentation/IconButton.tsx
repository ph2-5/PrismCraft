import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonVariant = "ghost" | "primary" | "outline";

const VARIANT_CLASS: Record<IconButtonVariant, string> = {
  ghost: "btn btn-ghost",
  primary: "btn btn-primary",
  outline: "btn btn-outline",
};

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 必填：无障碍标签（屏幕阅读器读取） */
  "aria-label": string;
  /** 可选：变体样式，默认 'ghost' */
  variant?: IconButtonVariant;
  /** 子元素：通常是 lucide-react 图标 */
  children: ReactNode;
}

export function IconButton({
  "aria-label": ariaLabel,
  variant = "ghost",
  type = "button",
  className = "",
  children,
  ...rest
}: IconButtonProps) {
  const focusVisibleRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const combinedClassName = className
    ? `${VARIANT_CLASS[variant]} ${focusVisibleRing} ${className}`
    : `${VARIANT_CLASS[variant]} ${focusVisibleRing}`;
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      className={combinedClassName}
      {...rest}
    >
      {children}
    </button>
  );
}
