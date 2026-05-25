import { cn } from "@/shared/utils/utils";
import { cva, type VariantProps } from "class-variance-authority";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary",
        success: "bg-emerald-500/10 text-emerald-400",
        warning: "bg-amber-500/10 text-amber-400",
        error: "bg-red-500/10 text-red-400",
        info: "bg-blue-500/10 text-blue-400",
        pending: "bg-yellow-500/10 text-yellow-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({
  children,
  variant,
  className,
}: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ variant }), className)}>
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          variant === "success" && "bg-emerald-400",
          variant === "warning" && "bg-amber-400",
          variant === "error" && "bg-red-400",
          variant === "info" && "bg-blue-400",
          variant === "pending" && "bg-yellow-400 animate-pulse",
          (!variant || variant === "default") && "bg-primary",
        )}
      />
      {children}
    </span>
  );
}
