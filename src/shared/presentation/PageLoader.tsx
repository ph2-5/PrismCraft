import { Loader2 } from "lucide-react";

interface PageLoaderProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

export function PageLoader({ size = "md", label, className }: PageLoaderProps) {
  const sizeMap = { sm: 16, md: 24, lg: 32 };
  const px = sizeMap[size];
  return (
    <div className={className} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "2rem" }}>
      <Loader2 style={{ width: px, height: px, animation: "spin 1s linear infinite", color: "var(--primary)" }} />
      {label && <span className="text-muted-foreground" style={{ fontSize: 13 }}>{label}</span>}
    </div>
  );
}
