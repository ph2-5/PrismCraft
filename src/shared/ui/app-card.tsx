import { cn } from "@/shared/utils/utils";

interface AppCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function AppCard({ children, className, hover = false }: AppCardProps) {
  return (
    <div
      className={cn("card", hover && "transition-colors duration-200", className)}
    >
      {children}
    </div>
  );
}
