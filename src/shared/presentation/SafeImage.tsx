import { useState, useCallback } from "react";

const DEFAULT_IMAGE_SIZE = 100;

interface SafeImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  fallback?: React.ReactNode;
}

function ImagePlaceholder({ width, height, fill, className, alt }: {
  width?: number; height?: number; fill?: boolean; className?: string; alt?: string;
}) {
  if (fill) {
    return (
      <div
        className={className}
        style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--muted)" }}
        role="img"
        aria-label={alt}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted-fg)" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </div>
    );
  }
  return (
    <div
      className={className}
      style={{ width: width ?? DEFAULT_IMAGE_SIZE, height: height ?? DEFAULT_IMAGE_SIZE, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--muted)", borderRadius: 4 }}
      role="img"
      aria-label={alt}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted-fg)" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    </div>
  );
}

export function SafeImage({
  src,
  alt = "",
  className,
  width,
  height,
  fill,
  fallback,
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  if (!src || hasError) {
    if (fallback) return <>{fallback}</>;
    return <ImagePlaceholder width={width} height={height} fill={fill} className={className} alt={alt} />;
  }

  if (fill) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        onError={handleError}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width ?? DEFAULT_IMAGE_SIZE}
      height={height ?? DEFAULT_IMAGE_SIZE}
      className={className}
      loading="lazy"
      onError={handleError}
    />
  );
}
