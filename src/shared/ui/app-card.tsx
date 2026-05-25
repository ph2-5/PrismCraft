import { cn } from "@/shared/utils/utils";
import { Card } from "./card";

interface AppCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function AppCard({ children, className, hover = false }: AppCardProps) {
  return (
    <Card
      className={cn(
        "bg-card border-border shadow-sm",
        hover && "hover:border-primary/30 transition-colors duration-200",
        className,
      )}
    >
      {children}
    </Card>
  );
}
