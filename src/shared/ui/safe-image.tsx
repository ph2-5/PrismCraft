const DEFAULT_IMAGE_SIZE = 100;

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
      width={width ?? DEFAULT_IMAGE_SIZE}
      height={height ?? DEFAULT_IMAGE_SIZE}
      className={className}
      loading="lazy"
    />
  );
}
