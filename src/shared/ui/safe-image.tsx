interface SafeImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
}

export function SafeImage({
  src,
  alt = "",
  className,
  width,
  height,
  fill,
}: SafeImageProps) {
  if (!src) return null;

  if (fill) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width || 100}
      height={height || 100}
      className={className}
      loading="lazy"
    />
  );
}
